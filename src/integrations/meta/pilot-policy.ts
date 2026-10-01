import type { IntentInput } from '../../modules/delivery/ledger';
import { matchingTerm } from '../../modules/automations/recipe';
import type { CanonicalEvent } from './webhook';

export interface MetaPilotConfig {
  /** BigInt preserves Meta IDs that exceed JavaScript's safe Number range. */
  readonly professionalId: number | bigint;
  readonly mediaId: string;
  readonly keyword: 'prévia';
  readonly acceptUnaccented?: boolean;
  readonly approvedText: string;
}

export interface MetaPilotContext {
  readonly account: Pick<CanonicalEvent, 'professionalId'>;
  readonly event: Pick<CanonicalEvent, 'professionalId' | 'kind' | 'mediaId' | 'text' | 'echo'>;
  readonly intent: Pick<IntentInput, 'source' | 'effect' | 'body'>;
}

export type MetaPilotRefusal =
  | 'invalid_configuration'
  | 'professional_account_mismatch'
  | 'reel_mismatch'
  | 'not_an_eligible_comment'
  | 'keyword_not_found'
  | 'echo_event'
  | 'manual_intent'
  | 'effect_not_private_reply'
  | 'body_not_approved'
  | 'body_has_button'
  | 'body_has_link';

export type MetaPilotDecision = { readonly allowed: true } | { readonly allowed: false; readonly reason: MetaPilotRefusal };

const deny = (reason: MetaPilotRefusal): MetaPilotDecision => ({ allowed: false, reason });

function validConfig(config: MetaPilotConfig) {
  const validProfessionalId = typeof config.professionalId === 'bigint'
    ? config.professionalId > 0n
    : Number.isSafeInteger(config.professionalId) && config.professionalId > 0;
  return validProfessionalId && config.mediaId.trim().length > 0 &&
    config.keyword === 'prévia' && config.approvedText.length > 0;
}

/**
 * Decides whether one intent is the narrowly approved Kyber Instagram pilot reply.
 * It has no transport, persistence, or configuration side effects.
 */
export function validateMetaPilot(config: MetaPilotConfig, context: MetaPilotContext): MetaPilotDecision {
  if (!validConfig(config)) return deny('invalid_configuration');
  const professionalId = String(config.professionalId);
  if (context.account.professionalId !== professionalId || context.event.professionalId !== professionalId) return deny('professional_account_mismatch');
  if (context.event.mediaId !== config.mediaId) return deny('reel_mismatch');
  if (context.event.kind !== 'comment' || context.event.text === null) return deny('not_an_eligible_comment');
  if (!matchingTerm(context.event.text, config.acceptUnaccented ? ['prévia', 'previa'] : [config.keyword])) return deny('keyword_not_found');
  if (context.event.echo) return deny('echo_event');
  if (context.intent.source !== 'automatic') return deny('manual_intent');
  if (context.intent.effect !== 'private_reply') return deny('effect_not_private_reply');
  if (context.intent.body.text !== config.approvedText) return deny('body_not_approved');
  if (context.intent.body.button !== undefined) return deny('body_has_button');
  if (context.intent.body.link !== undefined) return deny('body_has_link');
  return { allowed: true };
}
