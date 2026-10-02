import type { Prisma } from '../../generated/prisma/client';
import type { PgBoss } from 'pg-boss';
import type { NormalizedInbound } from '../inbox/ingestion';
import { createIntentInTransaction } from '../delivery/ledger';
import { allowsMetaPilotDecision, isApprovedFutureMetaPilotRecipe, isMetaPilotProduction, publicReplyForComment, readApprovedFutureMetaPilot } from '../../integrations/meta/pilot-runtime';
import { LOCAL_RECIPE_CAPABILITIES, matchingTerm, readyRecipe, recipeConfig, textReply } from './recipe';
import { continueSequence, startSequence } from './sequence';

export async function decideAutomation(tx: Prisma.TransactionClient, boss: PgBoss, context: NormalizedInbound) {
  const { account, event, contact, conversation, payload, eligible } = context;
  // Em produção, o piloto não tem sequência nem gatilhos de DM/story. Tudo fora do
  // comentário aprovado é descartado antes de criar uma intenção.
  if (isMetaPilotProduction(process.env) && event.kind !== 'comment') return;
  if (event.kind === 'postback') { await continueSequence(tx, boss, context); return; }
  if (!['comment', 'message', 'story'].includes(event.kind) || (event.kind !== 'comment' && !eligible) || event.generation !== account.connectionGeneration || payload.echo || !payload.text?.trim() ||
      account.pausedAt || contact.suppressedAt || conversation.control !== 'automatic') return;
  const rules = await tx.automation.findMany({ where: { accountId: account.id, trigger: event.kind, mediaId: event.kind === 'comment' ? payload.mediaId : null, status: 'active' }, orderBy: { id: 'asc' } });
  for (const rule of rules) {
    const result = recipeConfig.safeParse(rule.config);
    if (!result.success || !readyRecipe(result.data, event.kind) || !matchingTerm(payload.text, result.data.terms)) continue;
    const config = result.data;
    if (readApprovedFutureMetaPilot(process.env) && !isApprovedFutureMetaPilotRecipe(config)) return;
    if (event.kind !== 'comment') {
      await createIntentInTransaction(tx, boss, { accountId: account.id, conversationId: conversation.id, eventId: event.id,
        automationId: rule.id, source: 'automatic', effect: 'automatic_dm', body: { text: textReply(config), ...(config.link ? { link: config.link } : {}) } });
      return;
    }
    if ((config.buttonEnabled && !LOCAL_RECIPE_CAPABILITIES.button) || (config.followRequired && !LOCAL_RECIPE_CAPABILITIES.follow) ||
      (config.publicReplyEnabled && !LOCAL_RECIPE_CAPABILITIES.publicReply)) continue;
    const planned: Array<Pick<import('../delivery/ledger').IntentInput, 'source' | 'effect' | 'body'>> = config.buttonEnabled
      ? [{ source: 'automatic' as const, effect: 'private_reply' as const, body: { text: config.introduction },
        }, { source: 'automatic' as const, effect: 'button' as const, body: { text: config.buttonTitle,
          button: { title: config.buttonTitle, payload: 'sequence' } } }]
      : [{ source: 'automatic' as const, effect: 'private_reply' as const,
        body: { text: textReply(config), ...(config.link ? { link: config.link } : {}) } }];
    const publicText = readApprovedFutureMetaPilot(process.env) ? publicReplyForComment(event.externalId) : config.publicReply;
    if (config.publicReplyEnabled && !publicText) return;
    if (config.publicReplyEnabled) planned.push({ source: 'automatic', effect: 'public_reply', body: { text: publicText! } });
    if (!allowsMetaPilotDecision(process.env, context, planned)) return;
    if (config.buttonEnabled) await startSequence(tx, boss, context, rule, config);
    else await createIntentInTransaction(tx, boss, { accountId: account.id, conversationId: conversation.id, eventId: event.id,
      automationId: rule.id, source: 'automatic', effect: 'private_reply', body: planned[0].body });
    if (config.publicReplyEnabled) await createIntentInTransaction(tx, boss, { accountId: account.id, conversationId: conversation.id, eventId: event.id,
      automationId: rule.id, source: 'automatic', effect: 'public_reply', body: { text: publicText! } });
    // Uma intenção por efeito/comentário, mesmo diante de registros conflitantes fora da API.
    return;
  }
}
