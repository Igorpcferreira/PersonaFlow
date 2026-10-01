import { z } from 'zod';
import type { PgBoss } from 'pg-boss';
import type { Database } from '../shared/db';
import { TokenVault } from '../modules/accounts/token-vault';
import { DELIVERY_QUEUE, META_PILOT_DELIVERY_QUEUE, simulationOutcomes } from '../modules/delivery/ledger';
import { executeIntent, type MetaPilotTransport } from '../modules/delivery/executor';
import { FakeTransport, type SyntheticTransport } from '../integrations/meta/fake-transport';

const jobSchema = z.object({ accountId: z.uuid(), intentId: z.uuid() }).strict();
async function outcomeTransport(db: Database, accountId: string, intentId: string) {
  const intent = await db.deliveryIntent.findUniqueOrThrow({ where: { accountId_id: { accountId, id: intentId } }, select: { simulationOutcome: true } });
  return new FakeTransport(db, z.enum(simulationOutcomes).parse(intent.simulationOutcome));
}
export async function sweepDeliveryAccount(db: Database, vault: TokenVault, transport: SyntheticTransport | MetaPilotTransport | undefined, accountId: string, now?: Date) {
  if (!z.uuid().safeParse(accountId).success) throw new Error('Conta de manutenção inválida.');
  const scanAt = now ?? new Date();
  const due = { OR: [
    { status: 'pending', OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: scanAt } }] },
    { status: 'sending', reservedUntil: { lte: scanAt } },
  ] };
  if (transport?.kind === 'meta') {
    const selectedComment = `comment:${transport.commentId}`;
    // A public-delivery mode must be implemented as its own worker and authorization contract.
    // While this narrow private-reply pilot is active, accumulated non-selected private replies are terminally refused.
    await db.deliveryIntent.updateMany({ where: { accountId, source: 'automatic', effect: 'private_reply', status: 'pending', OR: [
      { event: { is: null } }, { event: { is: { externalId: { not: selectedComment } } } },
    ] }, data: { status: 'blocked', reason: 'pilot_policy_denied', nextAttemptAt: null } });
  }
  const intents = await db.deliveryIntent.findMany({ where: transport?.kind === 'meta'
    ? { accountId, ...due, source: 'automatic', effect: 'private_reply', event: { is: { externalId: `comment:${transport.commentId}` } } }
    : { accountId, ...due }, orderBy: { createdAt: 'asc' }, take: 20, select: { id: true } });
  for (const intent of intents) await executeIntent(db, vault, transport ?? await outcomeTransport(db, accountId, intent.id), { accountId, intentId: intent.id }, { now });
  await db.workerHeartbeat.upsert({ where: { accountId_kind: { accountId, kind: 'delivery' } },
    create: { accountId, kind: 'delivery', seenAt: new Date() }, update: { seenAt: new Date() } });
}
export async function startSyntheticDeliveryWorker(db: Database, boss: PgBoss, vault: TokenVault) {
  await boss.createQueue(DELIVERY_QUEUE);
  await boss.work(DELIVERY_QUEUE, { pollingIntervalSeconds: 0.5 }, async (jobs) => {
    for (const job of jobs) {
      const context = jobSchema.parse(job.data);
      await executeIntent(db, vault, await outcomeTransport(db, context.accountId, context.intentId), context);
    }
  });
  let stopped = false;
  let active: Promise<void> | undefined;
  const tick = () => {
    if (stopped || active) return;
    active = (async () => {
      const accounts = await db.instagramAccount.findMany({ select: { id: true }, orderBy: { id: 'asc' } });
      for (const account of accounts) {
        try { await sweepDeliveryAccount(db, vault, undefined, account.id); }
        catch { console.error(JSON.stringify({ accountId: account.id, code: 'local_delivery_maintenance_failed' })); }
      }
    })().catch(() => { console.error(JSON.stringify({ accountId: null, code: 'local_delivery_scan_failed' })); })
      .finally(() => { active = undefined; });
  };
  const interval = setInterval(tick, 1000);
  tick();
  return async () => { stopped = true; clearInterval(interval); await active; };
}

/** Production worker is deliberately limited to the one configured account and private reply. */
export async function startMetaPilotDeliveryWorker(db: Database, boss: PgBoss, vault: TokenVault, transport: MetaPilotTransport) {
  if (process.env.PERSONAFLOW_MODE !== 'production' || process.env.PERSONAFLOW_SEND_MODE !== 'meta-private-reply')
    throw new Error('Envio Meta não habilitado.');
  await boss.createQueue(META_PILOT_DELIVERY_QUEUE);
  await boss.work(META_PILOT_DELIVERY_QUEUE, { pollingIntervalSeconds: 0.5 }, async (jobs) => {
    for (const job of jobs) {
      const context = jobSchema.parse(job.data);
      if (context.accountId !== transport.accountId) throw new Error('Job fora da conta piloto.');
      await executeIntent(db, vault, transport, context);
    }
  });
  let stopped = false;
  let active: Promise<void> | undefined;
  const tick = () => {
    if (stopped || active) return;
    active = sweepDeliveryAccount(db, vault, transport, transport.accountId)
      .catch(() => { console.error(JSON.stringify({ code: 'meta_pilot_delivery_scan_failed' })); })
      .finally(() => { active = undefined; });
  };
  const interval = setInterval(tick, 5_000);
  tick();
  return async () => { stopped = true; clearInterval(interval); await active; };
}

/** Crash recovery never performs a provider request, including when delivery is disabled. */
export async function recoverExpiredMetaReservations(db: Database, accountId: string, now = new Date()) {
  if (!z.uuid().safeParse(accountId).success) throw new Error('Conta inválida.');
  const expired = await db.deliveryIntent.findMany({ where: { accountId, status: 'sending', reservedUntil: { lte: now } },
    select: { id: true }, take: 20 });
  for (const item of expired) await db.$transaction(async (tx) => {
    const current = await tx.deliveryIntent.findUniqueOrThrow({ where: { accountId_id: { accountId, id: item.id } } });
    if (current.status !== 'sending' || !current.reservedUntil || current.reservedUntil > now) return;
    await tx.deliveryAttempt.updateMany({ where: { accountId, intentId: item.id, status: 'started' },
      data: { status: 'unknown', endedAt: now } });
    await tx.deliveryIntent.update({ where: { accountId_id: { accountId, id: item.id } },
      data: { status: 'unknown', reason: 'worker_interrupted', reservedUntil: null } });
  });
  return expired.length;
}

export function startMetaPilotRecovery(db: Database, accountId: string) {
  let active: Promise<unknown> | undefined;
  let stopped = false;
  const tick = () => {
    if (stopped || active) return;
    active = recoverExpiredMetaReservations(db, accountId)
      .catch(() => { console.error(JSON.stringify({ code: 'meta_pilot_recovery_failed' })); })
      .finally(() => { active = undefined; });
  };
  const interval = setInterval(tick, 5_000);
  tick();
  return async () => { stopped = true; clearInterval(interval); await active; };
}
