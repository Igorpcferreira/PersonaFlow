import { z } from 'zod';
import type { Database } from '../../shared/db';
import { RequestRejected } from '../../shared/operator-context';
import { lockAccount } from '../../shared/account-lock';
import { INBOUND_QUEUE } from '../../jobs/queue';
import { DELIVERY_QUEUE, DAY } from '../delivery/ledger';
import { setAccountPause } from '../inbox/control';
import { FakeOAuthProvider, LOCAL_META_SCOPES } from '../../integrations/meta/oauth-contract';
import { WEBHOOK_FIELDS, type WebhookApp } from '../../integrations/meta/webhook';
import { createOAuthState, completeOAuth, refreshConnection, revokeConnection } from './connections';
import { subscribeSyntheticAccount } from './subscription';
import { TokenVault } from './token-vault';
import type { AccountDiagnostics } from './diagnostic-contract';

const actionSchema = z.union([z.object({ action: z.enum(['pause', 'resume', 'expire', 'revoke', 'reconnect', 'refresh']) }).strict(),
  z.object({ action: z.literal('limit'), quota: z.number().int().min(1).max(30) }).strict()]);
const age = (now: Date, date: Date | null | undefined) => date ? Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000)) : null;
export async function accountDiagnostics(db: Database, vault: TokenVault, accountId: string, now = new Date()): Promise<AccountDiagnostics> {
  if (!z.uuid().safeParse(accountId).success) throw new RequestRejected(404);
  return db.$transaction(async (tx) => {
    const account = await tx.instagramAccount.findUnique({ where: { id: accountId }, include: { credential: true, limit: true, heartbeats: true } });
    if (!account) throw new RequestRejected(404);
    const inbound = await tx.inboundEvent.aggregate({ where: { accountId, processedAt: null }, _count: true, _min: { receivedAt: true } });
    const pending = await tx.deliveryIntent.aggregate({ where: { accountId, status: 'pending' }, _count: true, _min: { createdAt: true } });
    const groups = await tx.deliveryIntent.groupBy({ by: ['status'], where: { accountId }, _count: true });
    const count = (status: string) => groups.find((group) => group.status === status)?._count ?? 0;
    const uncertain = await tx.deliveryIntent.findMany({ where: { accountId, status: 'unknown' }, orderBy: { createdAt: 'desc' }, take: 5,
      select: { id: true, conversationId: true, createdAt: true } });
    const jobs = await tx.$queryRaw<{ name: string; state: string; count: number; oldest: Date }[]>`
      SELECT name, state::text, COUNT(*)::integer AS count, MIN(created_on) AS oldest FROM pgboss.job
      WHERE data->>'accountId' = ${accountId} AND name IN (${INBOUND_QUEUE}, ${DELIVERY_QUEUE})
      AND state IN ('created', 'retry', 'active', 'failed') GROUP BY name, state ORDER BY name, state`;
    const credential = account.credential;
    let status: AccountDiagnostics['connection']['status'] = 'unavailable';
    if (credential?.revokedAt) status = 'revoked';
    else if (credential?.expiresAt && credential.expiresAt <= now) status = 'expired';
    else if (credential && credential.expiresAt && credential.generation === account.connectionGeneration && LOCAL_META_SCOPES.every((scope) => credential.scopes.includes(scope))) {
      try { vault.decrypt(accountId, credential.generation, credential.keyVersion, credential.ciphertext); status = 'connected'; } catch { /* Somente estado sanitizado. */ }
    }
    const seenAt = account.heartbeats.find((heartbeat) => heartbeat.kind === 'delivery')?.seenAt ?? null;
    const limit = account.limit;
    const freshWindow = !limit || limit.windowStartedAt.getTime() + 60_000 <= now.getTime();
    return { accountId, checkedAt: now.toISOString(), paused: Boolean(account.pausedAt),
      connection: { status, generation: account.connectionGeneration, expiresAt: credential?.expiresAt?.toISOString() ?? null,
        refreshEligible: status === 'connected' && Boolean(credential?.issuedAt && credential.issuedAt.getTime() + DAY <= now.getTime() && (!credential.refreshLeasedUntil || credential.refreshLeasedUntil <= now)),
        subscriptionCurrent: status === 'connected' && account.webhookAppAlias === 'simulation' && account.webhookGeneration === account.connectionGeneration && WEBHOOK_FIELDS.every((field) => account.webhookFields.includes(field)) },
      worker: { state: !seenAt ? 'absent' : (age(now, seenAt) ?? 0) < 30 ? 'active' : 'stale', seenAt: seenAt?.toISOString() ?? null },
      queue: { unprocessed: inbound._count, oldestInboundAgeSeconds: age(now, inbound._min.receivedAt), pending: pending._count, sending: count('sending'),
        oldestPendingAgeSeconds: age(now, pending._min.createdAt), jobs: jobs.map((job) => ({ name: job.name, state: job.state, count: job.count, oldestAgeSeconds: age(now, job.oldest) })) },
      limit: { quota: limit?.quota ?? 30, used: freshWindow ? 0 : limit!.used,
        resetsAt: new Date(freshWindow ? now.getTime() + 60_000 : limit!.windowStartedAt.getTime() + 60_000).toISOString(),
        cooldownUntil: limit?.cooldownUntil && limit.cooldownUntil > now ? limit.cooldownUntil.toISOString() : null },
      results: { unknown: count('unknown'), rejected: count('rejected'), blocked: count('blocked'), uncertain: uncertain.map((intent) => ({ ...intent, createdAt: intent.createdAt.toISOString() })) },
    };
  });
}

export async function diagnosticAction(db: Database, vault: TokenVault, app: WebhookApp, accountId: string, sessionId: string, value: unknown) {
  const parsed = actionSchema.safeParse(value);
  if (app.kind !== 'synthetic' || !z.uuid().safeParse(accountId).success || !parsed.success) throw new RequestRejected(400);
  const account = await db.instagramAccount.findUnique({ where: { id: accountId }, select: { professionalId: true, appScopedId: true } });
  if (!account) throw new RequestRejected(404);
  const action = parsed.data;
  if (action.action === 'pause' || action.action === 'resume') await setAccountPause(db, accountId, action.action === 'pause');
  else if (action.action === 'limit') await db.$transaction(async (tx) => {
    await lockAccount(tx, accountId);
    await tx.accountLimit.upsert({ where: { accountId }, create: { accountId, quota: action.quota }, update: { quota: action.quota } });
  });
  else if (action.action === 'reconnect') {
    const state = await createOAuthState(db, accountId, sessionId);
    await completeOAuth(db, vault, new FakeOAuthProvider(account.professionalId, account.appScopedId ?? `synthetic-app-${accountId}`),
      { accountId, sessionId, state, code: 'synthetic-reconnect' });
    await subscribeSyntheticAccount(db, accountId, app);
  } else if (action.action === 'refresh') {
    const current = await accountDiagnostics(db, vault, accountId);
    if (!current.connection.refreshEligible) throw new RequestRejected(409, 'A renovação fictícia exige token válido emitido há pelo menos 24 horas.');
    await refreshConnection(db, vault, new FakeOAuthProvider(account.professionalId, account.appScopedId ?? `synthetic-app-${accountId}`), accountId);
  } else if (action.action === 'revoke') await revokeConnection(db, accountId);
  else await db.$transaction(async (tx) => {
    await lockAccount(tx, accountId);
    const changed = await tx.accountCredential.updateMany({ where: { accountId }, data: { expiresAt: new Date(Date.now() - 1) } });
    if (!changed.count) throw new RequestRejected(409, 'Esta conta não tem conexão fictícia para expirar.');
    await tx.deliveryIntent.updateMany({ where: { accountId, status: 'pending' }, data: { status: 'canceled', reason: 'connection_changed' } });
  });
  return { action: action.action, inFlight: await db.deliveryIntent.count({ where: { accountId, status: 'sending' } }) };
}
