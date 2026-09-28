import { z } from 'zod';
import type { PgBoss } from 'pg-boss';
import type { Database } from '../../shared/db';
import { RequestRejected } from '../../shared/operator-context';
import { handleWebhookPost } from './ingestion';
import { signSyntheticWebhook, type WebhookApp } from './webhook';

export const simulationInput = z.object({ kind: z.enum(['comment', 'message', 'story', 'echo', 'postback']),
  text: z.string().max(2000).nullable().optional(), mediaId: z.string().max(200).optional(),
  externalId: z.uuid(), buttonPayload: z.string().min(1).max(1000).optional(),
}).strict();
export async function simulateInbound(db: Database, boss: PgBoss, app: WebhookApp, accountId: string, input: unknown) {
  const parsed = simulationInput.safeParse(input);
  if (!parsed.success) throw new RequestRejected(400);
  const value = parsed.data;
  const account = await db.instagramAccount.findUniqueOrThrow({ where: { id: accountId }, select: { professionalId: true } });
  const now = Date.now();
  const actor = 'synthetic-visitor';
  const batch = { object: 'instagram', entry: [{ id: account.professionalId, time: Math.floor(now / 1000),
    ...(value.kind === 'comment' ? { changes: [{ field: 'comments', value: { id: value.externalId, from: { id: actor },
      text: value.text ?? '', media: { id: value.mediaId ?? 'synthetic-reel-1' } } }] } : { messaging: [{
      sender: { id: value.kind === 'echo' ? account.professionalId : actor }, recipient: { id: value.kind === 'echo' ? actor : account.professionalId }, timestamp: now,
      ...(value.kind === 'postback' ? { postback: { mid: value.externalId, payload: value.buttonPayload ?? 'synthetic-continue' } } : { message: {
        mid: value.externalId, ...(value.text !== null && value.text !== undefined ? { text: value.text } : {}),
        ...(value.kind === 'echo' ? { is_echo: true } : {}), ...(value.kind === 'story' ? { reply_to: { story: { id: 'synthetic-story' } } } : {}),
      } }),
    }] }),
  }] };
  const bytes = Buffer.from(JSON.stringify(batch));
  const response = await handleWebhookPost(new Request('http://127.0.0.1/api/local-webhook', { method: 'POST', body: bytes,
    headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': signSyntheticWebhook(app, bytes) } }), db, boss, app);
  return { response, externalId: value.externalId };
}
