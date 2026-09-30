import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

export const MAX_WEBHOOK_BYTES = 1024 * 1024;
export const WEBHOOK_FIELDS = ['comments', 'messages', 'messaging_postbacks'] as const;
export type WebhookField = typeof WEBHOOK_FIELDS[number];
export type WebhookApp =
  | { readonly kind: 'synthetic'; alias: string; secret: string; verifyToken: string }
  | { readonly kind: 'meta'; alias: string; secret: string; verifyToken: string; pilotProfessionalId: string };
export interface CanonicalEvent {
  professionalId: string; externalId: string; kind: 'comment' | 'message' | 'story' | 'postback';
  field: WebhookField; occurredAt: Date; actorId: string; text: string | null;
  mediaId: string | null; echo: boolean; buttonPayload: string | null;
}
const id = z.string().min(1).max(200);
const timestamp = z.number().int().nonnegative().max(8_640_000_000_000_000);
const person = z.object({ id });
const comment = z.object({ id, from: person, media: z.object({ id }), text: z.string().max(20_000) });
const message = z.object({ mid: id, text: z.string().max(20_000).optional(), is_echo: z.boolean().optional(),
  attachments: z.array(z.object({ type: z.string().max(100) })).max(100).optional(),
  reply_to: z.object({ story: z.object({ id }).optional() }).optional(),
  quick_reply: z.object({ payload: z.string().min(1).max(1000) }).optional(),
});
const messaging = z.object({ sender: person, recipient: person, timestamp,
  message: message.optional(), postback: z.object({ mid: id, payload: z.string().min(1).max(1000) }).optional(),
});
const envelope = z.object({ object: z.literal('instagram'), entry: z.array(z.object({ id, time: timestamp,
  changes: z.array(z.object({ field: z.string().min(1).max(100), value: z.unknown() })).max(100).optional(),
  messaging: z.array(z.unknown()).max(100).optional(),
})).min(1).max(100) });

export class InvalidWebhook extends Error { constructor() { super('Webhook inválido; corpo e assinatura omitidos.'); } }
function validateApp(app: WebhookApp) {
  if ((app.kind !== 'synthetic' && app.kind !== 'meta') || !/^[a-z0-9-]{1,50}$/.test(app.alias) || app.secret.length < 32 || app.verifyToken.length < 32 ||
      (app.kind === 'meta' && !/^\d+$/.test(app.pilotProfessionalId))) throw new InvalidWebhook();
}
export function signSyntheticWebhook(app: WebhookApp, bytes: Uint8Array) {
  validateApp(app);
  if (app.kind !== 'synthetic') throw new InvalidWebhook();
  return `sha256=${createHmac('sha256', app.secret).update(bytes).digest('hex')}`;
}
export function parseSignedWebhook(app: WebhookApp, bytes: Uint8Array, signature: string | null, now = new Date()) {
  validateApp(app);
  if (!bytes.length || bytes.length > MAX_WEBHOOK_BYTES || !signature || !/^sha256=[a-f0-9]{64}$/.test(signature)) throw new InvalidWebhook();
  const actual = Buffer.from(signature.slice(7), 'hex');
  const expected = createHmac('sha256', app.secret).update(bytes).digest();
  if (!timingSafeEqual(actual, expected)) throw new InvalidWebhook();
  const events: CanonicalEvent[] = [];
  let ignored = 0;
  try {
    const data = envelope.parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
    let items = 0;
    const date = (value: number, seconds: boolean) => {
      const result = new Date(value * (seconds ? 1000 : 1));
      if (!Number.isFinite(result.getTime()) || result.getTime() > now.getTime() + 300_000) throw new InvalidWebhook();
      return result;
    };
    for (const entry of data.entry) {
      const occurredAt = date(entry.time, true);
      for (const change of entry.changes ?? []) {
        if (++items > 1000) throw new InvalidWebhook();
        if (change.field !== 'comments') { ignored += 1; continue; }
        const value = comment.parse(change.value);
        events.push({ professionalId: entry.id, externalId: `comment:${value.id}`, kind: 'comment', field: 'comments',
          occurredAt, actorId: value.from.id, text: value.text, mediaId: value.media.id, echo: false, buttonPayload: null });
      }
      for (const raw of entry.messaging ?? []) {
        if (++items > 1000) throw new InvalidWebhook();
        const item = messaging.parse(raw);
        if (!item.message && !item.postback) { ignored += 1; continue; }
        if (item.message && item.postback) throw new InvalidWebhook();
        const echo = item.message?.is_echo ?? false;
        if ((echo ? item.sender.id : item.recipient.id) !== entry.id) throw new InvalidWebhook();
        if (!echo && item.sender.id === entry.id) throw new InvalidWebhook();
        const msg = item.message;
        const kind = item.postback ? 'postback' : msg?.reply_to?.story ? 'story' : 'message';
        events.push({ professionalId: entry.id, externalId: `${item.postback ? 'postback' : 'message'}:${(msg?.mid ?? item.postback!.mid)}`,
          kind, field: item.postback ? 'messaging_postbacks' : 'messages', occurredAt: date(item.timestamp, false),
          actorId: echo ? item.recipient.id : item.sender.id, text: msg?.text ?? null,
          mediaId: msg?.reply_to?.story?.id ?? null, echo, buttonPayload: item.postback?.payload ?? msg?.quick_reply?.payload ?? null });
      }
    }
    return { events, ignored };
  } catch { throw new InvalidWebhook(); }
}

export async function readWebhookBytes(request: Request) {
  const length = request.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_WEBHOOK_BYTES)) throw new InvalidWebhook();
  if (!request.body || request.headers.get('content-encoding')) throw new InvalidWebhook();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_WEBHOOK_BYTES) { await reader.cancel(); throw new InvalidWebhook(); }
      chunks.push(value);
    }
    return Buffer.concat(chunks, size);
  } finally { reader.releaseLock(); }
}

export function verifyWebhookChallenge(app: WebhookApp, request: Request) {
  validateApp(app);
  const url = new URL(request.url);
  const candidate = Buffer.from(url.searchParams.get('hub.verify_token') ?? '');
  const expected = Buffer.from(app.verifyToken);
  const challenge = url.searchParams.get('hub.challenge') ?? '';
  if (url.searchParams.get('hub.mode') !== 'subscribe' || candidate.length !== expected.length ||
      !timingSafeEqual(candidate, expected) || !/^\d{1,100}$/.test(challenge)) throw new InvalidWebhook();
  return new Response(challenge, { headers: { 'Cache-Control': 'no-store' } });
}
