import type { Prisma } from '../../generated/prisma/client';
import type { PgBoss } from 'pg-boss';
import type { NormalizedInbound } from '../inbox/ingestion';
import { createIntentInTransaction } from '../delivery/ledger';
import { LOCAL_RECIPE_CAPABILITIES, matchingTerm, readyRecipe, recipeConfig, textReply } from './recipe';
import { continueSequence, startSequence } from './sequence';

export async function decideAutomation(tx: Prisma.TransactionClient, boss: PgBoss, context: NormalizedInbound) {
  const { account, event, contact, conversation, payload, eligible } = context;
  if (event.kind === 'postback') { await continueSequence(tx, boss, context); return; }
  if (!['comment', 'message', 'story'].includes(event.kind) || (event.kind !== 'comment' && !eligible) || event.generation !== account.connectionGeneration || payload.echo || !payload.text?.trim() ||
      account.pausedAt || contact.suppressedAt || conversation.control !== 'automatic') return;
  const rules = await tx.automation.findMany({ where: { accountId: account.id, trigger: event.kind, mediaId: event.kind === 'comment' ? payload.mediaId : null, status: 'active' }, orderBy: { id: 'asc' } });
  for (const rule of rules) {
    const result = recipeConfig.safeParse(rule.config);
    if (!result.success || !readyRecipe(result.data, event.kind) || !matchingTerm(payload.text, result.data.terms)) continue;
    const config = result.data;
    if (event.kind !== 'comment') {
      await createIntentInTransaction(tx, boss, { accountId: account.id, conversationId: conversation.id, eventId: event.id,
        automationId: rule.id, source: 'automatic', effect: 'automatic_dm', body: { text: textReply(config), ...(config.link ? { link: config.link } : {}) } });
      return;
    }
    if ((config.buttonEnabled && !LOCAL_RECIPE_CAPABILITIES.button) || (config.followRequired && !LOCAL_RECIPE_CAPABILITIES.follow) ||
      (config.publicReplyEnabled && !LOCAL_RECIPE_CAPABILITIES.publicReply)) continue;
    if (config.buttonEnabled) await startSequence(tx, boss, context, rule, config);
    else await createIntentInTransaction(tx, boss, { accountId: account.id, conversationId: conversation.id, eventId: event.id,
      automationId: rule.id, source: 'automatic', effect: 'private_reply',
      body: { text: textReply(config), ...(config.link ? { link: config.link } : {}) } });
    if (config.publicReplyEnabled) await createIntentInTransaction(tx, boss, { accountId: account.id, conversationId: conversation.id, eventId: event.id,
      automationId: rule.id, source: 'automatic', effect: 'public_reply', body: { text: config.publicReply } });
    // Uma intenção por efeito/comentário, mesmo diante de registros conflitantes fora da API.
    return;
  }
}
