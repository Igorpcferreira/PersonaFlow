import { z } from 'zod';
import type { Database } from '../../shared/db';
import { lockAccount } from '../../shared/account-lock';
import { LOCAL_META_SCOPES } from '../../integrations/meta/oauth-contract';
import { BeforeSendFailure, type SyntheticTransport } from '../../integrations/meta/fake-transport';
import { TokenVault } from '../accounts/token-vault';
import { lockConversation } from '../inbox/control';
import { DAY, deliveryBody } from './ledger';
import { readSyntheticFollow } from '../automations/sequence-profile';
import { sendMetaPrivateReply, type MetaPrivateReplyOptions } from '../../integrations/meta/private-reply';
import { sendMetaPublicReply } from '../../integrations/meta/public-reply';
import { isApprovedFutureMetaPilotRecipe, META_CAMPAIGN_APPROVED_TEXT, META_PILOT_APPROVED_TEXT, metaPilotTestCommentExternalId, publicReplyForComment, readApprovedFutureMetaPilot } from '../../integrations/meta/pilot-runtime';
import { validateMetaPilot } from '../../integrations/meta/pilot-policy';
import { recipeConfig, readyRecipe } from '../automations/recipe';

const contextSchema = z.object({ accountId: z.uuid(), intentId: z.uuid() }).strict();
type ExecutionOptions = { now?: Date; leaseMs?: number; timeoutMs?: number };
type MetaTransportBase = { readonly kind: 'meta'; readonly graphVersion: string; readonly accountId: string;
  readonly professionalId: string; readonly reelId: string; readonly commentId: string; readonly webhookAlias: string;
  readonly options?: MetaPrivateReplyOptions };
export type MetaPilotTransport = Omit<MetaTransportBase, 'commentId'> &
  ({ readonly scope: 'test-comment'; readonly commentId: string } | { readonly scope: 'campaign' });
const metaTransportSchema = z.object({ kind: z.literal('meta'), graphVersion: z.string().regex(/^v[1-9]\d*\.\d+$/),
  accountId: z.uuid(), professionalId: z.string().regex(/^[1-9]\d*$/), reelId: z.string().regex(/^[1-9]\d*$/),
  commentId: z.string().regex(/^[1-9]\d*$/).optional(), scope: z.enum(['test-comment', 'campaign']),
  webhookAlias: z.string().regex(/^[a-z0-9-]{1,50}$/) });

function metaPilotTransportEnabled(transport: MetaPilotTransport, context: { accountId: string }) {
  if (process.env.PERSONAFLOW_MODE !== 'production' || context.accountId !== transport.accountId || !metaTransportSchema.safeParse(transport).success ||
      process.env.META_INSTAGRAM_PILOT_ACCOUNT_ID !== transport.accountId || process.env.META_INSTAGRAM_PILOT_PROFESSIONAL_ID !== transport.professionalId ||
      process.env.META_WEBHOOK_APP_ALIAS !== transport.webhookAlias || process.env.META_INSTAGRAM_GRAPH_VERSION !== transport.graphVersion) return false;
  if (transport.scope === 'test-comment') return process.env.PERSONAFLOW_SEND_MODE === 'meta-private-reply' &&
    process.env.META_INSTAGRAM_PILOT_REEL_ID === transport.reelId && metaPilotTestCommentExternalId(process.env) === `comment:${transport.commentId}`;
  const campaign = readApprovedFutureMetaPilot(process.env);
  return campaign !== null && campaign.accountId === transport.accountId && campaign.professionalId === transport.professionalId &&
    campaign.reelId === transport.reelId && campaign.webhookAlias === transport.webhookAlias;
}
export async function executeIntent(db: Database, vault: TokenVault, transport: SyntheticTransport | MetaPilotTransport,
  context: { accountId: string; intentId: string }, options: ExecutionOptions = {}) {
  if (!contextSchema.safeParse(context).success || (transport.kind === 'meta' && !metaPilotTransportEnabled(transport, context))) throw new Error('Executor recusado.');
  let now = options.now ?? new Date();
  const reserved = await db.$transaction(async (tx) => {
    await lockAccount(tx, context.accountId);
    const intent = await tx.deliveryIntent.findUniqueOrThrow({ where: { accountId_id: { accountId: context.accountId, id: context.intentId } } });
    await lockConversation(tx, context.accountId, intent.conversationId);
    now = options.now ?? new Date();
    if (intent.status === 'sending' && intent.reservedUntil && intent.reservedUntil <= now) {
      await tx.deliveryAttempt.updateMany({ where: { accountId: context.accountId, intentId: intent.id, status: 'started' }, data: { status: 'unknown', endedAt: now } });
      await tx.deliveryIntent.update({ where: { accountId_id: { accountId: context.accountId, id: intent.id } }, data: { status: 'unknown', reason: 'worker_interrupted' } });
      return null;
    }
    if (intent.status !== 'pending' || (intent.nextAttemptAt && intent.nextAttemptAt > now)) return null;
    if (transport.kind === 'meta' && intent.effect === 'public_reply') {
      const privateIntent = await tx.deliveryIntent.findFirst({ where: { accountId: context.accountId,
        eventId: intent.eventId, automationId: intent.automationId, effect: 'private_reply', source: 'automatic' } });
      if (privateIntent?.status === 'pending' || privateIntent?.status === 'sending') return null;
      if (privateIntent?.status !== 'accepted') {
        await tx.deliveryIntent.update({ where: { accountId_id: { accountId: context.accountId, id: intent.id } },
          data: { status: 'blocked', reason: 'private_reply_not_accepted', nextAttemptAt: null } });
        return null;
      }
    }
    const account = await tx.instagramAccount.findUniqueOrThrow({ where: { id: context.accountId }, include: { credential: true } });
    const conversation = await tx.conversation.findUniqueOrThrow({ where: { accountId_id: { accountId: context.accountId, id: intent.conversationId } }, include: { contact: true } });
    const automation = intent.automationId ? await tx.automation.findUnique({ where: { accountId_id: { accountId: context.accountId, id: intent.automationId } } }) : null;
    const event = intent.eventId ? await tx.inboundEvent.findUnique({ where: { accountId_id: { accountId: context.accountId, id: intent.eventId } } }) : null;
    const credential = account.credential;
    let reason: string | null = null;
    let followRunId: string | null = null;
    if (intent.deadline <= now) reason = 'deadline_expired';
    else if (account.pausedAt) reason = 'account_paused';
    else if (!credential || credential.revokedAt || !credential.expiresAt || credential.expiresAt <= now ||
      credential.generation !== intent.connectionGeneration || account.connectionGeneration !== intent.connectionGeneration ||
      LOCAL_META_SCOPES.some((scope) => !credential.scopes.includes(scope))) reason = 'connection_unavailable';
    else if (intent.source === 'automatic' && (conversation.control !== 'automatic' || conversation.controlVersion !== intent.controlVersion)) reason = 'manual_control';
    else if (intent.source === 'manual' && (conversation.control !== 'manual' || conversation.controlVersion !== intent.controlVersion)) reason = 'control_changed';
    else if (intent.source === 'automatic' && conversation.contact.suppressedAt) reason = 'contact_suppressed';
    else if (intent.source === 'automatic' && (!automation || automation.status !== 'active' || automation.revision !== intent.automationRevision)) reason = 'automation_changed';
    else if (event && (event.generation !== intent.connectionGeneration || (event.payload as { echo?: boolean } | null)?.echo !== false)) reason = 'event_ineligible';
    const commentEffect = event?.kind === 'comment' && ['private_reply', 'public_reply', 'button'].includes(intent.effect);
    if (!reason && !commentEffect && (!conversation.lastEligibleInboundAt || conversation.lastEligibleInboundAt.getTime() + DAY <= now.getTime())) reason = 'window_closed';
    if (!reason && intent.sequenceRunId) {
      const run = await tx.sequenceRun.findUnique({ where: { accountId_id: { accountId: context.accountId, id: intent.sequenceRunId } } });
      if (!run || run.conversationId !== intent.conversationId || run.automationId !== intent.automationId || run.automationRevision !== intent.automationRevision ||
          run.connectionGeneration !== intent.connectionGeneration || run.controlVersion !== intent.controlVersion) reason = 'sequence_changed';
      else if (intent.effect === 'automatic_dm' && (run.lastEligibleEventId !== intent.eventId || run.state !== 'follow_false')) reason = 'sequence_changed';
      else if (intent.effect === 'link') {
        if (run.lastEligibleEventId !== intent.eventId) reason = 'sequence_changed';
        else if (run.followRequired) followRunId = run.id;
      }
    }
    const body = deliveryBody.safeParse(intent.body);
    if (!reason && !body.success) reason = 'payload_invalid';
    if (!reason && transport.kind === 'meta') {
      const approvedPrivateText = transport.scope === 'campaign' ? META_CAMPAIGN_APPROVED_TEXT : META_PILOT_APPROVED_TEXT;
      const payload = event?.payload as { text?: unknown; mediaId?: unknown; echo?: unknown } | null;
      const isCampaignPublic = transport.scope === 'campaign' && intent.effect === 'public_reply';
      const approved = event && payload && validateMetaPilot({ professionalId: BigInt(transport.professionalId),
        mediaId: transport.reelId, keyword: 'prévia', acceptUnaccented: transport.scope === 'campaign', approvedText: approvedPrivateText }, {
        account: { professionalId: account.professionalId },
        event: { professionalId: account.professionalId, kind: event.kind as 'comment',
          mediaId: typeof payload.mediaId === 'string' ? payload.mediaId : null,
          text: typeof payload.text === 'string' ? payload.text : null, echo: payload.echo === true },
        intent: { source: intent.source as 'automatic', effect: 'private_reply', body: isCampaignPublic ? { text: approvedPrivateText } : body.data! },
      }).allowed;
      const recipe = automation ? recipeConfig.safeParse(automation.config) : null;
      const selectedComment = transport.scope === 'test-comment' && event?.externalId === `comment:${transport.commentId}`;
      if (account.id !== transport.accountId || account.professionalId !== transport.professionalId ||
          account.webhookAppAlias !== transport.webhookAlias || intent.source !== 'automatic' ||
          (intent.effect !== 'private_reply' && !isCampaignPublic) || !event?.externalId.match(/^comment:[1-9]\d*$/) ||
          (transport.scope === 'test-comment' && !selectedComment) ||
          automation?.mediaId !== transport.reelId || !approved || !recipe?.success ||
          !readyRecipe(recipe.data, 'comment') || recipe.data.buttonEnabled ||
          recipe.data.followRequired || recipe.data.link ||
          (transport.scope === 'test-comment' && recipe.data.publicReplyEnabled) ||
          (isCampaignPublic && (!recipe.data.publicReplyEnabled || body.data?.text !== publicReplyForComment(event.externalId))) ||
          (transport.scope === 'test-comment' && (recipe.data.terms.length !== 1 || recipe.data.terms[0] !== 'prévia')) ||
          recipe.data.introduction !== approvedPrivateText ||
          recipe.data.finalMessage || (transport.scope === 'campaign' && !isApprovedFutureMetaPilotRecipe(recipe.data))) reason = 'pilot_policy_denied';
    }
    let accessToken: string | null = null;
    if (!reason) {
      try { accessToken = vault.decrypt(context.accountId, credential!.generation, credential!.keyVersion, credential!.ciphertext); }
      catch { reason = 'connection_unavailable'; }
    }
    if (reason) {
      await tx.deliveryIntent.update({ where: { accountId_id: { accountId: context.accountId, id: intent.id } },
        data: { status: reason === 'deadline_expired' ? 'expired' : 'blocked', reason } });
      return null;
    }
    const limit = await tx.accountLimit.upsert({ where: { accountId: context.accountId }, create: { accountId: context.accountId, windowStartedAt: now }, update: {} });
    const newWindow = limit.windowStartedAt.getTime() + 60_000 <= now.getTime();
    const used = newWindow ? 0 : limit.used;
    if ((limit.cooldownUntil && limit.cooldownUntil > now) || used >= limit.quota) {
      await tx.deliveryIntent.update({ where: { accountId_id: { accountId: context.accountId, id: intent.id } },
        data: { reason: 'account_limit', nextAttemptAt: limit.cooldownUntil && limit.cooldownUntil > now ? limit.cooldownUntil : new Date(limit.windowStartedAt.getTime() + 60_000) } });
      return null;
    }
    // Leitura de perfil só quando token/payload/janela/limite permitem reservar o envio.
    // Manutenção de uma intenção limitada não vira polling do perfil.
    if (followRunId) {
      const follow = await readSyntheticFollow(tx, context.accountId, followRunId, intent.eventId!, now);
      if (!follow.allowed || follow.state !== 'true') {
        await tx.deliveryIntent.update({ where: { accountId_id: { accountId: context.accountId, id: intent.id } },
          data: { status: 'blocked', reason: 'follow_unverified', nextAttemptAt: null } });
        return null;
      }
    }
    await tx.accountLimit.update({ where: { accountId: context.accountId }, data: { used: used + 1, ...(newWindow ? { windowStartedAt: now } : {}) } });
    const number = await tx.deliveryAttempt.count({ where: { accountId: context.accountId, intentId: intent.id } }) + 1;
    const attempt = await tx.deliveryAttempt.create({ data: { accountId: context.accountId, intentId: intent.id, number, startedAt: now } });
    await tx.deliveryIntent.update({ where: { accountId_id: { accountId: context.accountId, id: intent.id } },
      data: { status: 'sending', reservedUntil: new Date(now.getTime() + (options.leaseMs ?? 30_000)), reason: null, nextAttemptAt: null } });
    return { intent, attempt, body: body.data!, accessToken, commentExternalId: event?.externalId.slice('comment:'.length) ?? '' };
  });
  if (reserved) {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let status: 'accepted' | 'rejected' | 'unknown' | 'pending' | 'blocked' = 'unknown';
    let acceptedId: string | null = null;
    let reason = 'ambiguous_result';
    let rateLimited = false;
    try {
      if (transport.kind === 'meta') {
        // Recheck immediately before HTTP so a changed or removed gate cannot use an existing reservation.
        if (!metaPilotTransportEnabled(transport, context) ||
            (transport.scope === 'test-comment' && reserved.commentExternalId !== transport.commentId)) {
          status = 'blocked'; reason = 'pilot_policy_denied';
        } else {
          const result = await (reserved.intent.effect === 'public_reply' ? sendMetaPublicReply : sendMetaPrivateReply)({ graphVersion: transport.graphVersion,
            professionalId: transport.professionalId, accessToken: reserved.accessToken!,
            approvedText: reserved.intent.effect === 'public_reply' ? publicReplyForComment(`comment:${reserved.commentExternalId}`) ?? '' :
              transport.scope === 'campaign' ? META_CAMPAIGN_APPROVED_TEXT : META_PILOT_APPROVED_TEXT }, { professionalId: transport.professionalId,
            commentExternalId: reserved.commentExternalId, text: reserved.body.text }, {
              ...transport.options,
              ...(transport.scope === 'campaign' && reserved.intent.effect === 'private_reply' &&
                process.env.META_INSTAGRAM_BUTTON_TEST_COMMENT_ID === reserved.commentExternalId
                ? { button: { title: 'Pedir minha prévia', url: 'https://somoskyber.com.br/suaprevia' } } : {}),
            });
          status = result.kind === 'accepted' ? 'accepted' : result.kind === 'ambiguous' ? 'unknown' :
            result.kind === 'rejected' ? 'rejected' : 'blocked';
          acceptedId = result.kind === 'accepted' ? result.messageId : null;
          reason = result.kind === 'accepted' ? 'meta_api_accepted' : result.kind === 'rejected' ? 'meta_rejected' :
            result.kind === 'confirmed_before_send' ? 'meta_preflight_failed' : 'meta_result_ambiguous';
        }
      } else {
        const result = await Promise.race([
          transport.send({ ...context, attemptId: reserved.attempt.id, effect: reserved.intent.effect, body: reserved.body, signal: controller.signal }),
          new Promise<never>((_, reject) => { timer = setTimeout(() => { reject(new Error('Prazo fictício excedido.')); controller.abort(); }, options.timeoutMs ?? 5000); }),
        ]);
        status = result.kind;
        if (result.kind === 'accepted') { acceptedId = result.id; reason = 'synthetic_accepted'; }
        else reason = 'synthetic_rejected';
      }
    } catch (error) {
      if (transport.kind === 'synthetic' && error instanceof BeforeSendFailure) {
        status = reserved.attempt.number < 3 ? 'pending' : 'rejected';
        rateLimited = error.rateLimited;
        reason = rateLimited ? 'confirmed_rate_limit' : 'confirmed_before_send';
      }
    } finally { if (timer) clearTimeout(timer); }
    await db.$transaction(async (tx) => {
      await lockAccount(tx, context.accountId);
      const intent = await tx.deliveryIntent.findUniqueOrThrow({ where: { accountId_id: { accountId: context.accountId, id: context.intentId } } });
      const attempt = await tx.deliveryAttempt.findUniqueOrThrow({ where: { accountId_id: { accountId: context.accountId, id: reserved.attempt.id } } });
      if (intent.status !== 'sending' || attempt.status !== 'started') return;
      const delayUntil = new Date(now.getTime() + 1000 * 2 ** reserved.attempt.number);
      await tx.deliveryAttempt.update({ where: { accountId_id: { accountId: context.accountId, id: attempt.id } }, data: {
        status: status === 'pending' ? 'before_send_failure' : status, endedAt: new Date(),
      } });
      await tx.deliveryIntent.update({ where: { accountId_id: { accountId: context.accountId, id: intent.id } }, data: {
        status, acceptedId, reason, reservedUntil: null, nextAttemptAt: status === 'pending' ? delayUntil : null,
      } });
      if (rateLimited) await tx.accountLimit.update({ where: { accountId: context.accountId }, data: { cooldownUntil: delayUntil } });
      if (status === 'accepted') await tx.conversation.update({ where: { accountId_id: { accountId: context.accountId, id: intent.conversationId } }, data: { lastActivityAt: new Date() } });
    });
  }
  return db.deliveryIntent.findUniqueOrThrow({ where: { accountId_id: { accountId: context.accountId, id: context.intentId } } });
}
