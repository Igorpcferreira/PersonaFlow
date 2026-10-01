import { z } from 'zod';
import type { IntentInput } from '../../modules/delivery/ledger';
import type { NormalizedInbound } from '../../modules/inbox/ingestion';
import type { CanonicalEvent } from './webhook';
import { validateMetaPilot } from './pilot-policy';

export const META_PILOT_APPROVED_TEXT = 'Oi! Vi seu pedido de prévia. Me manda o @ do seu negócio ou algumas fotos para eu entender o que você faz? Eu continuo por aqui depois.';

const configSchema = z.object({
  META_INSTAGRAM_PILOT_ACCOUNT_ID: z.uuid(),
  META_INSTAGRAM_PILOT_PROFESSIONAL_ID: z.string().regex(/^\d+$/),
  META_INSTAGRAM_PILOT_REEL_ID: z.string().regex(/^\d+$/),
  META_INSTAGRAM_TEST_COMMENT_ID: z.string().regex(/^[1-9]\d*$/),
  META_WEBHOOK_APP_ALIAS: z.string().regex(/^[a-z0-9-]{1,50}$/),
});

type PlannedIntent = Pick<IntentInput, 'source' | 'effect' | 'body'>;

/** Production may create an automation intent only for the one approved Kyber pilot. */
export function isMetaPilotProduction(env: Record<string, string | undefined>) {
  return env.PERSONAFLOW_MODE === 'production';
}

/**
 * The private-reply pilot is authorized by one concrete comment, never by a Reel alone.
 * Public replies deliberately have no runtime authorization path while this pilot is active.
 */
export function metaPilotTestCommentExternalId(env: Record<string, string | undefined>) {
  const commentId = z.string().regex(/^[1-9]\d*$/).safeParse(env.META_INSTAGRAM_TEST_COMMENT_ID);
  return commentId.success ? `comment:${commentId.data}` : null;
}

export function allowsMetaPilotDecision(env: Record<string, string | undefined>, context: NormalizedInbound,
  planned: readonly PlannedIntent[]) {
  if (!isMetaPilotProduction(env)) return true;
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
