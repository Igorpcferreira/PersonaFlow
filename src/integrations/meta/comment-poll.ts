import type { PgBoss } from 'pg-boss';
import { z } from 'zod';
import type { Database } from '../../shared/db';
import { matchingTerm } from '../../modules/automations/recipe';
import { persistWebhookBatch } from './ingestion';
import type { CanonicalEvent, WebhookApp } from './webhook';

const metaId = z.string().regex(/^[1-9]\d*$/);
const pageSchema = z.object({
  data: z.array(z.object({
    id: metaId,
    text: z.string().max(20_000),
    timestamp: z.string().datetime({ offset: true }),
    from: z.object({ id: metaId }),
  }).strict()).max(100),
  paging: z.object({ cursors: z.object({ after: z.string().min(1).max(1024) }).strict().optional() }).strict().optional(),
}).strict();

export type MetaCommentPollConfig = {
  readonly graphVersion: string;
  readonly professionalId: string;
  readonly reelId: string;
  readonly accessToken: string;
};

type EligibleComment = { readonly id: string; readonly occurredAt: Date; readonly actorId: string; readonly text: string };
export type SafePolledComment = { readonly commentId: string; readonly occurredAt: string };
export type MetaCommentPollResult = {
  readonly comments: readonly SafePolledComment[];
  readonly eligible: readonly EligibleComment[];
  readonly ignored: number;
};

function validateConfig(config: MetaCommentPollConfig) {
  if (!/^v[1-9]\d*\.\d+$/.test(config.graphVersion) || !metaId.safeParse(config.professionalId).success ||
      !metaId.safeParse(config.reelId).success || !config.accessToken.trim()) throw new Error('Consulta de comentários indisponível; configuração omitida.');
}

function endpoint(config: MetaCommentPollConfig, after?: string) {
  const url = new URL(`https://graph.instagram.com/${config.graphVersion}/${config.reelId}/comments`);
  url.searchParams.set('fields', 'id,text,timestamp,from');
  url.searchParams.set('limit', '100');
  if (after) url.searchParams.set('after', after);
  return url;
}

/**
 * Reads only one configured Reel. Bodies and actors are retained only long enough to decide
 * whether the approved keyword applies; callers receive IDs and timestamps only.
 */
export async function pollEligibleMetaComments(config: MetaCommentPollConfig, request: typeof fetch = fetch): Promise<MetaCommentPollResult> {
  validateConfig(config);
  const eligible: EligibleComment[] = [];
  let ignored = 0;
  let after: string | undefined;
  for (let page = 0; page < 5; page += 1) {
    const response = await request(endpoint(config, after), {
      headers: { authorization: `Bearer ${config.accessToken}` }, signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Consulta de comentários recusada pela Meta (HTTP ${response.status}).`);
    const parsed = pageSchema.safeParse(await response.json());
    if (!parsed.success) throw new Error('Formato da resposta Meta inesperado (comments).');
    for (const item of parsed.data.data) {
      const occurredAt = new Date(item.timestamp);
      if (!Number.isFinite(occurredAt.getTime()) || occurredAt.getTime() > Date.now() + 300_000 || !matchingTerm(item.text, ['prévia'])) {
        ignored += 1;
        continue;
      }
      eligible.push({ id: item.id, occurredAt, actorId: item.from.id, text: item.text });
    }
    after = parsed.data.paging?.cursors?.after;
    if (!after) break;
  }
  return { comments: eligible.map((item) => ({ commentId: item.id, occurredAt: item.occurredAt.toISOString() })), eligible, ignored };
}

/** Persists only comments that passed the pilot keyword, account, and configured Reel boundaries. */
export async function ingestPolledMetaComments(db: Database, boss: PgBoss, app: WebhookApp,
  config: Pick<MetaCommentPollConfig, 'professionalId' | 'reelId'>, comments: readonly EligibleComment[]) {
  if (app.kind !== 'meta' || app.pilotProfessionalId !== config.professionalId || !metaId.safeParse(config.reelId).success)
    throw new Error('Ingestão de comentários recusada pela configuração do piloto.');
  const events: CanonicalEvent[] = comments.map((item) => ({
    professionalId: config.professionalId, externalId: `comment:${item.id}`, kind: 'comment', field: 'comments',
    occurredAt: item.occurredAt, actorId: item.actorId, text: item.text, mediaId: config.reelId, echo: false, buttonPayload: null,
  }));
  return persistWebhookBatch(db, boss, app, events);
}
