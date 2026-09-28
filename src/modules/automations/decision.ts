import type { Prisma } from '../../generated/prisma/client';
import type { PgBoss } from 'pg-boss';
import type { NormalizedInbound } from '../inbox/ingestion';
import { createIntentInTransaction } from '../delivery/ledger';
import { LOCAL_RECIPE_CAPABILITIES, matchingTerm, readyRecipe, recipeConfig } from './recipe';

export async function decideAutomation(tx: Prisma.TransactionClient, boss: PgBoss, context: NormalizedInbound) {
  const { account, event, contact, conversation, payload } = context;
  if (event.kind !== 'comment' || event.generation !== account.connectionGeneration || payload.echo || !payload.text?.trim() ||
      account.pausedAt || contact.suppressedAt || conversation.control !== 'automatic') return;
  const rules = await tx.automation.findMany({ where: { accountId: account.id, trigger: 'comment', mediaId: payload.mediaId, status: 'active' }, orderBy: { id: 'asc' } });
  for (const rule of rules) {
    const result = recipeConfig.safeParse(rule.config);
    if (!result.success || !readyRecipe(result.data) || !matchingTerm(payload.text, result.data.terms)) continue;
    const config = result.data;
    if (config.buttonEnabled || config.followRequired || (config.publicReplyEnabled && !LOCAL_RECIPE_CAPABILITIES.publicReply)) continue;
    await createIntentInTransaction(tx, boss, { accountId: account.id, conversationId: conversation.id, eventId: event.id,
      automationId: rule.id, source: 'automatic', effect: 'private_reply',
      body: { text: `${config.introduction}\n${config.finalMessage}\n${config.link}`, link: config.link } });
    if (config.publicReplyEnabled) await createIntentInTransaction(tx, boss, { accountId: account.id, conversationId: conversation.id, eventId: event.id,
      automationId: rule.id, source: 'automatic', effect: 'public_reply', body: { text: config.publicReply } });
    // Uma intenção privada por comentário, mesmo diante de registros conflitantes fora da API.
    return;
  }
}
