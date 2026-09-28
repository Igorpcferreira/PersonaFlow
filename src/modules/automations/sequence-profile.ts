import type { Prisma } from '../../generated/prisma/client';
import { DAY } from '../delivery/ledger';
import { recipeConfig } from './recipe';
import { LOCAL_META_SCOPES } from '../../integrations/meta/oauth-contract';

export type FollowState = 'true' | 'false' | 'unknown';
export function sequencePayload(runId: string, consent = false) { return `sequence:${runId}${consent ? ':consent' : ''}`; }
// Leitura exclusivamente de fixture local. Nem o postback nem o cliente fornecem a verdade do perfil.
export async function readSyntheticFollow(tx: Prisma.TransactionClient, accountId: string, runId: string, eventId: string, now = new Date()) {
  const run = await tx.sequenceRun.findUnique({ where: { accountId_id: { accountId, id: runId } }, include: {
    account: { include: { credential: true } }, automation: true, conversation: { include: { contact: true } }, lastEligibleEvent: true,
  } });
  const event = run?.lastEligibleEvent;
  const payload = event?.payload as { actorId?: string; echo?: boolean; buttonPayload?: string } | null;
  const config = recipeConfig.safeParse(run?.automation.config);
  if (!run || !run.followRequired || !config.success || !config.data.followRequired || !config.data.buttonEnabled ||
      run.account.pausedAt || run.account.connectionGeneration !== run.connectionGeneration ||
      !run.account.credential?.expiresAt || run.account.credential.expiresAt <= now || run.account.credential.revokedAt ||
      run.account.credential.generation !== run.connectionGeneration || LOCAL_META_SCOPES.some((scope) => !run.account.credential!.scopes.includes(scope)) ||
      run.automation.status !== 'active' || run.automation.revision !== run.automationRevision ||
      run.conversation.control !== 'automatic' || run.conversation.controlVersion !== run.controlVersion || run.conversation.contact.suppressedAt ||
      !run.consentedAt || run.consentedAt.getTime() + DAY <= now.getTime() || run.lastEligibleEventId !== eventId ||
      !event || event.kind !== 'postback' || event.generation !== run.connectionGeneration || event.occurredAt.getTime() + DAY <= now.getTime() ||
      payload?.echo !== false || payload.actorId !== run.conversation.contact.igScopedUserId || payload.buttonPayload !== sequencePayload(runId, true)) {
    return { allowed: false, state: 'unknown' as FollowState };
  }
  const profile = await tx.syntheticProfile.findUnique({ where: { accountId_contactId: { accountId, contactId: run.conversation.contactId } } });
  const state: FollowState = profile?.simulateError ? 'unknown' : profile?.follows === 'true' ? 'true' : profile?.follows === 'false' ? 'false' : 'unknown';
  await tx.sequenceRun.update({ where: { accountId_id: { accountId, id: runId } }, data: { profileChecks: { increment: 1 }, followState: state } });
  return { allowed: true, state };
}
