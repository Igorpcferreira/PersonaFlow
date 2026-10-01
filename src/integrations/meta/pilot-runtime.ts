import { z } from 'zod';
import type { IntentInput } from '../../modules/delivery/ledger';
import type { NormalizedInbound } from '../../modules/inbox/ingestion';
import type { CanonicalEvent } from './webhook';
import { validateMetaPilot } from './pilot-policy';

export const META_PILOT_APPROVED_TEXT = 'Oi! Vi seu pedido de prévia. Me manda o @ do seu negócio ou algumas fotos para eu entender o que você faz? Eu continuo por aqui depois.';
export const META_CAMPAIGN_WHATSAPP_URL = (() => {
  const url = new URL('https://somoskyber.com.br/fale');
  url.searchParams.set('origem', 'instagram-reels-previa');
  url.searchParams.set('text', 'Olá! Vim pelo Reels da Kyber e quero uma prévia grátis do meu site. Vou enviar as informações e os materiais do meu negócio.');
  return url.toString();
})();
export const META_CAMPAIGN_APPROVED_TEXT = `Oi! Vi seu pedido de prévia. Para começar, toque no link e envie o @ do seu negócio ou algumas fotos pelo WhatsApp. Você falará diretamente com a Kyber:\n${META_CAMPAIGN_WHATSAPP_URL}`;
export const META_CAMPAIGN_PUBLIC_REPLY_TEXT = 'Te mandei uma mensagem no direct para continuar seu pedido de prévia.';
export const META_CAMPAIGN_PUBLIC_REPLY_TEXTS = [
  META_CAMPAIGN_PUBLIC_REPLY_TEXT,
  'Te enviei o link para pedir sua prévia no direct.',
  'Seu próximo passo para a prévia está na mensagem que te mandei no direct.',
] as const;

/** Stable thirds: replay of a comment never picks a different public answer. */
export function publicReplyForComment(externalId: string): string | null {
  const match = /^comment:([1-9]\d*)$/.exec(externalId);
  return match ? META_CAMPAIGN_PUBLIC_REPLY_TEXTS[Number(BigInt(match[1]) % 3n)] : null;
}

const configSchema = z.object({
  META_INSTAGRAM_PILOT_ACCOUNT_ID: z.uuid(),
  META_INSTAGRAM_PILOT_PROFESSIONAL_ID: z.string().regex(/^\d+$/),
  META_INSTAGRAM_PILOT_REEL_ID: z.string().regex(/^\d+$/),
  META_INSTAGRAM_TEST_COMMENT_ID: z.string().regex(/^[1-9]\d*$/),
  META_WEBHOOK_APP_ALIAS: z.string().regex(/^[a-z0-9-]{1,50}$/),
});

const futureReelConfigSchema = z.object({
  PERSONAFLOW_MODE: z.literal('production'),
  PERSONAFLOW_SEND_MODE: z.literal('meta-campaign-private-reply'),
  META_INSTAGRAM_PILOT_ACCOUNT_ID: z.uuid(),
  META_INSTAGRAM_PILOT_PROFESSIONAL_ID: z.string().regex(/^\d+$/),
  META_INSTAGRAM_APPROVED_REEL_ID: z.string().regex(/^[1-9]\d*$/),
  META_WEBHOOK_APP_ALIAS: z.string().regex(/^[a-z0-9-]{1,50}$/),
});

type PlannedIntent = Pick<IntentInput, 'source' | 'effect' | 'body'>;

export type ApprovedFutureMetaPilot = Readonly<{
  accountId: string;
  professionalId: string;
  reelId: string;
  webhookAlias: string;
  keyword: 'prévia';
  approvedText: typeof META_CAMPAIGN_APPROVED_TEXT;
}>;

/**
 * Reads the separately authorized campaign selection. This can never match
 * the one-comment test Reel, so the campaign cannot widen that test by accident.
 */
export function readApprovedFutureMetaPilot(env: Record<string, string | undefined>): ApprovedFutureMetaPilot | null {
  const parsed = futureReelConfigSchema.safeParse(env);
  if (!parsed.success) return null;
  const config = parsed.data;
  if (config.META_INSTAGRAM_APPROVED_REEL_ID === env.META_INSTAGRAM_PILOT_REEL_ID) return null;
  return {
    accountId: config.META_INSTAGRAM_PILOT_ACCOUNT_ID,
    professionalId: config.META_INSTAGRAM_PILOT_PROFESSIONAL_ID,
    reelId: config.META_INSTAGRAM_APPROVED_REEL_ID,
    webhookAlias: config.META_WEBHOOK_APP_ALIAS,
    keyword: 'prévia',
    approvedText: META_CAMPAIGN_APPROVED_TEXT,
  };
}

export function isApprovedFutureMetaPilotRecipe(config: {
  terms: string[];
  introduction: string;
  publicReplyEnabled: boolean;
  publicReply: string;
  buttonEnabled: boolean;
  followRequired: boolean;
  finalMessage: string;
  link: string;
}) {
  return config.terms.length === 2 && config.terms.includes('prévia') && config.terms.includes('previa') &&
    (config.introduction === META_PILOT_APPROVED_TEXT || config.introduction === META_CAMPAIGN_APPROVED_TEXT) &&
    (!config.publicReplyEnabled || config.publicReply === META_CAMPAIGN_PUBLIC_REPLY_TEXT) &&
    !config.buttonEnabled && !config.followRequired && !config.finalMessage && !config.link;
}

/** Production may create an automation intent only for the one approved Kyber pilot. */
export function isMetaPilotProduction(env: Record<string, string | undefined>) {
  return env.PERSONAFLOW_MODE === 'production';
}

/**
 * The private-reply pilot is authorized by one concrete comment, never by a Reel alone.
 * The campaign may additionally acknowledge a DM publicly, after Meta accepts it.
 */
export function metaPilotTestCommentExternalId(env: Record<string, string | undefined>) {
  const commentId = z.string().regex(/^[1-9]\d*$/).safeParse(env.META_INSTAGRAM_TEST_COMMENT_ID);
  return commentId.success ? `comment:${commentId.data}` : null;
}

export function allowsMetaPilotDecision(env: Record<string, string | undefined>, context: NormalizedInbound,
  planned: readonly PlannedIntent[]) {
  if (!isMetaPilotProduction(env)) return true;
  const campaign = readApprovedFutureMetaPilot(env);
  if (campaign) {
    if ((planned.length !== 1 && planned.length !== 2) || context.account.id !== campaign.accountId ||
        context.account.professionalId !== campaign.professionalId ||
        context.account.webhookAppAlias !== campaign.webhookAlias) return false;
    const privateAllowed = validateMetaPilot({ professionalId: BigInt(campaign.professionalId), mediaId: campaign.reelId,
      keyword: campaign.keyword, acceptUnaccented: true, approvedText: campaign.approvedText }, {
      account: { professionalId: context.account.professionalId },
      event: { professionalId: context.account.professionalId, kind: context.event.kind as CanonicalEvent['kind'], mediaId: context.payload.mediaId,
        text: context.payload.text, echo: context.payload.echo }, intent: planned[0],
    }).allowed;
    return privateAllowed && (planned.length === 1 || (planned[1].source === 'automatic' &&
      planned[1].effect === 'public_reply' && planned[1].body.text === publicReplyForComment(context.event.externalId) &&
      planned[1].body.button === undefined && planned[1].body.link === undefined));
  }
  const parsed = configSchema.safeParse(env);
  if (!parsed.success || planned.length !== 1) return false;
  const config = parsed.data;
  if (context.account.id !== config.META_INSTAGRAM_PILOT_ACCOUNT_ID ||
      context.account.professionalId !== config.META_INSTAGRAM_PILOT_PROFESSIONAL_ID ||
      context.account.webhookAppAlias !== config.META_WEBHOOK_APP_ALIAS ||
      context.event.externalId !== `comment:${config.META_INSTAGRAM_TEST_COMMENT_ID}`) return false;
  return validateMetaPilot({ professionalId: BigInt(config.META_INSTAGRAM_PILOT_PROFESSIONAL_ID),
    mediaId: config.META_INSTAGRAM_PILOT_REEL_ID, keyword: 'prévia', approvedText: META_PILOT_APPROVED_TEXT }, {
    account: { professionalId: context.account.professionalId },
    event: { professionalId: context.account.professionalId, kind: context.event.kind as CanonicalEvent['kind'], mediaId: context.payload.mediaId,
      text: context.payload.text, echo: context.payload.echo },
    intent: planned[0],
  }).allowed;
}
