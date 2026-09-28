import { z } from 'zod';
import type { PgBoss } from 'pg-boss';
import type { Database } from '../../shared/db';
import { RequestRejected } from '../../shared/operator-context';
import { lockAccount } from '../../shared/account-lock';
import { simulateInbound } from '../../integrations/meta/simulation';
import type { WebhookApp } from '../../integrations/meta/webhook';
import { sequencePayload } from './sequence-profile';
import type { SequenceView } from './sequence-contract';
import { LOCAL_META_SCOPES } from '../../integrations/meta/oauth-contract';

const actionSchema = z.union([
  z.object({ action: z.literal('profile'), runId: z.uuid(), state: z.enum(['true', 'false', 'unknown', 'error']) }).strict(),
  z.object({ action: z.literal('interact'), runId: z.uuid(), consent: z.boolean(), clientRequestId: z.uuid() }).strict(),
]);
export async function listSequences(db: Database, accountId: string): Promise<SequenceView[]> {
  if (!z.uuid().safeParse(accountId).success) throw new RequestRejected(404);
  const runs = await db.sequenceRun.findMany({ where: { accountId }, orderBy: { createdAt: 'desc' }, take: 50, include: {
    account: { include: { credential: { select: { generation: true, expiresAt: true, revokedAt: true, scopes: true } } } },
    automation: true, conversation: { include: { contact: { include: { syntheticProfile: true } } } },
    intents: { select: { effect: true, status: true } },
  } });
  return runs.map((run) => {
    const status = (effect: string) => run.intents.find((intent) => intent.effect === effect)?.status ?? null;
    const linkStatus = status('link');
    const profile = run.conversation.contact.syntheticProfile;
    const profileFixture = profile?.simulateError ? 'error' : profile?.follows === 'true' ? 'true' : profile?.follows === 'false' ? 'false' : 'unknown';
    const current = !run.account.pausedAt && run.connectionGeneration === run.account.connectionGeneration &&
      Boolean(run.account.credential?.expiresAt && run.account.credential.expiresAt > new Date() && !run.account.credential.revokedAt &&
        run.account.credential.generation === run.connectionGeneration && LOCAL_META_SCOPES.every((scope) => run.account.credential!.scopes.includes(scope))) &&
      run.automation.status === 'active' && run.automation.revision === run.automationRevision && run.conversation.control === 'automatic' &&
      run.controlVersion === run.conversation.controlVersion && !run.conversation.contact.suppressedAt;
    return { id: run.id, accountId, conversationId: run.conversationId, automationName: run.automation.name, followRequired: run.followRequired,
      state: linkStatus ? `link_${linkStatus}` : current ? run.state : 'unavailable', followState: run.followState, profileChecks: run.profileChecks, profileFixture,
      canInteract: current && !linkStatus && status('private_reply') === 'accepted' && status('button') === 'accepted',
      introductionStatus: status('private_reply'), buttonStatus: status('button'), linkStatus };
  });
}
export async function sequenceAction(db: Database, boss: PgBoss, app: WebhookApp, accountId: string, input: unknown) {
  const parsed = actionSchema.safeParse(input);
  if (!parsed.success || app.kind !== 'synthetic' || !z.uuid().safeParse(accountId).success) throw new RequestRejected(400);
  const value = parsed.data;
  if (value.action === 'profile') {
    await db.$transaction(async (tx) => {
      await lockAccount(tx, accountId);
      const run = await tx.sequenceRun.findUnique({ where: { accountId_id: { accountId, id: value.runId } }, include: { conversation: true } });
      if (!run) throw new RequestRejected(404);
      const data = { follows: value.state === 'error' ? 'unknown' : value.state, simulateError: value.state === 'error' };
      await tx.syntheticProfile.upsert({ where: { accountId_contactId: { accountId, contactId: run.conversation.contactId } },
        create: { accountId, contactId: run.conversation.contactId, ...data }, update: data });
    });
    return Response.json({ simulation: true, action: 'profile', changedWindow: false }, { headers: { 'Cache-Control': 'no-store' } });
  }
  const run = await db.sequenceRun.findUnique({ where: { accountId_id: { accountId, id: value.runId } }, include: { conversation: { include: { contact: true } } } });
  if (!run) throw new RequestRejected(404);
  if (run.conversation.contact.igScopedUserId !== 'synthetic-visitor') throw new RequestRejected(409, 'Esta fixture só simula interações do visitante fictício da interface.');
  return (await simulateInbound(db, boss, app, accountId, { kind: 'postback', externalId: value.clientRequestId,
    buttonPayload: sequencePayload(run.id, value.consent) })).response;
}
