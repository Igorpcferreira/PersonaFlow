import type { Prisma } from '../../generated/prisma/client';
import { z } from 'zod';
import type { PgBoss } from 'pg-boss';
import type { NormalizedInbound } from '../inbox/ingestion';
import { createIntentInTransaction, DAY } from '../delivery/ledger';
import { readSyntheticFollow, sequencePayload } from './sequence-profile';
import { recipeConfig, readyRecipe, type RecipeConfig } from './recipe';

export async function startSequence(tx: Prisma.TransactionClient, boss: PgBoss, context: NormalizedInbound,
  rule: { id: string; revision: number }, config: RecipeConfig) {
  const { account, event, conversation } = context;
  const run = await tx.sequenceRun.upsert({ where: { accountId_commentEventId: { accountId: account.id, commentEventId: event.id } },
    create: { accountId: account.id, commentEventId: event.id, conversationId: conversation.id, automationId: rule.id, automationRevision: rule.revision,
      connectionGeneration: account.connectionGeneration, controlVersion: conversation.controlVersion, followRequired: config.followRequired }, update: {} });
  const origin = { accountId: account.id, conversationId: conversation.id, eventId: event.id, automationId: rule.id, source: 'automatic' as const, sequenceRunId: run.id };
  await createIntentInTransaction(tx, boss, { ...origin, effect: 'private_reply', body: { text: config.introduction } });
  await createIntentInTransaction(tx, boss, { ...origin, effect: 'button', body: { text: config.buttonTitle, button: { title: config.buttonTitle, payload: sequencePayload(run.id) } } });
}

export async function continueSequence(tx: Prisma.TransactionClient, boss: PgBoss, context: NormalizedInbound) {
  const { account, event, conversation, contact, payload, eligible } = context;
  const match = /^sequence:([a-f0-9-]{36})(:consent)?$/.exec(payload.buttonPayload ?? '');
  if (!match || !z.uuid().safeParse(match[1]).success || event.kind !== 'postback' || !eligible || event.occurredAt.getTime() + DAY <= Date.now()) return;
  const run = await tx.sequenceRun.findUnique({ where: { accountId_id: { accountId: account.id, id: match[1] } }, include: { automation: true, intents: true } });
  if (!run || run.conversationId !== conversation.id || account.pausedAt || contact.suppressedAt ||
      account.connectionGeneration !== run.connectionGeneration || event.generation !== run.connectionGeneration ||
      conversation.control !== 'automatic' || conversation.controlVersion !== run.controlVersion ||
      run.automation.status !== 'active' || run.automation.revision !== run.automationRevision) return;
  const parsed = recipeConfig.safeParse(run.automation.config);
  if (!parsed.success || !readyRecipe(parsed.data) || !parsed.data.buttonEnabled || parsed.data.followRequired !== run.followRequired) return;
  // Nenhuma consulta/reenvio depois de existir intenção de link, inclusive unknown/blocked.
  if (run.intents.some((intent) => intent.effect === 'link') || !['private_reply', 'button'].every((effect) => run.intents.some((intent) => intent.effect === effect && intent.status === 'accepted'))) return;
  const consent = Boolean(match[2]);
  await tx.sequenceRun.update({ where: { accountId_id: { accountId: account.id, id: run.id } }, data: {
    lastEligibleEventId: event.id, consentedAt: consent ? new Date(Math.min(event.occurredAt.getTime(), event.receivedAt.getTime())) : null,
    state: run.followRequired && !consent ? 'consent_required' : 'waiting',
  } });
  const origin = { accountId: account.id, conversationId: conversation.id, eventId: event.id, automationId: run.automationId,
    source: 'automatic' as const, sequenceRunId: run.id };
  if (run.followRequired) {
    if (!consent) return;
    const follow = await readSyntheticFollow(tx, account.id, run.id, event.id);
    if (!follow.allowed || follow.state !== 'true') {
      await tx.sequenceRun.update({ where: { accountId_id: { accountId: account.id, id: run.id } }, data: { state: follow.state === 'false' ? 'follow_false' : 'follow_unknown' } });
      if (follow.allowed && follow.state === 'false') await createIntentInTransaction(tx, boss, { ...origin, effect: 'automatic_dm', body: { text: parsed.data.followPrompt } });
      return;
    }
  }
  await createIntentInTransaction(tx, boss, { ...origin, anchorEventId: run.commentEventId, effect: 'link',
    body: { text: `${parsed.data.finalMessage}\n${parsed.data.link}`, link: parsed.data.link } });
  await tx.sequenceRun.update({ where: { accountId_id: { accountId: account.id, id: run.id } }, data: { state: 'link_pending' } });
}
