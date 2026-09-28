import { z } from 'zod';
import type { PgBoss } from 'pg-boss';
import type { Prisma } from '../../generated/prisma/client';
import type { Database } from '../../shared/db';
import { lockAccount } from '../../shared/account-lock';
import { lockConversation } from '../inbox/control';

export const DELIVERY_QUEUE = 'delivery-intent';
export const DAY = 24 * 60 * 60_000;
export const effects = ['private_reply', 'public_reply', 'button', 'automatic_dm', 'link', 'manual'] as const;
export const deliveryBody = z.object({ text: z.string().min(1).max(2000),
  button: z.object({ title: z.string().min(1).max(80), payload: z.string().min(1).max(1000) }).optional(),
  link: z.url().max(2000).refine((value) => ['http:', 'https:'].includes(new URL(value).protocol)).optional(),
}).strict();
const input = z.object({ accountId: z.uuid(), conversationId: z.uuid(), eventId: z.uuid().optional(), anchorEventId: z.uuid().optional(),
  automationId: z.uuid().optional(), source: z.enum(['manual', 'automatic']), effect: z.enum(effects),
  clientRequestId: z.uuid().optional(), body: deliveryBody });
export type IntentInput = z.infer<typeof input>;

async function enqueue(tx: Prisma.TransactionClient, boss: PgBoss, accountId: string, intentId: string) {
  const jobId = await boss.send(DELIVERY_QUEUE, { accountId, intentId }, { retryLimit: 2, retryDelay: 1,
    db: { executeSql: async (sql: string, values: unknown[]) => ({ rows: await tx.$queryRawUnsafe<Record<string, unknown>[]>(sql, ...values) }) } });
  if (!jobId) throw new Error('Intenção sem job persistido.');
}
export async function createIntent(db: Database, boss: PgBoss, value: IntentInput) {
  const parsed = input.safeParse(value);
  if (!parsed.success) throw new Error('Intenção inválida; conteúdo omitido.');
  const data = parsed.data;
  return db.$transaction(async (tx) => {
    await lockAccount(tx, data.accountId);
    await lockConversation(tx, data.accountId, data.conversationId);
    const account = await tx.instagramAccount.findUniqueOrThrow({ where: { id: data.accountId } });
    const conversation = await tx.conversation.findUniqueOrThrow({ where: { accountId_id: { accountId: data.accountId, id: data.conversationId } }, include: { contact: true } });
    const event = data.eventId ? await tx.inboundEvent.findUniqueOrThrow({ where: { accountId_id: { accountId: data.accountId, id: data.eventId } } }) : null;
    const anchor = data.anchorEventId ? await tx.inboundEvent.findUniqueOrThrow({ where: { accountId_id: { accountId: data.accountId, id: data.anchorEventId } } }) : event;
    const automation = data.automationId ? await tx.automation.findUniqueOrThrow({ where: { accountId_id: { accountId: data.accountId, id: data.automationId } } }) : null;
    if (data.source === 'manual' ? data.effect !== 'manual' || !data.clientRequestId : !automation || !event || data.effect === 'manual') throw new Error('Origem da intenção inválida.');
    if (data.source === 'manual' && conversation.control !== 'manual') throw new Error('Assuma a conversa antes de enviar.');
    for (const origin of [event, anchor]) if (origin) {
      const payload = origin.payload as { actorId?: unknown; echo?: unknown } | null;
      if (!payload || payload.actorId !== conversation.contact.igScopedUserId || payload.actorId === account.professionalId || payload.echo !== false) throw new Error('Evento não pertence ao interlocutor elegível.');
    }
    if (['private_reply', 'public_reply'].includes(data.effect) && event?.kind !== 'comment') throw new Error('Efeito exige comentário elegível.');
    if (data.effect === 'link' && (event?.kind !== 'postback' && event?.kind !== 'message')) throw new Error('Link exige interação elegível.');
    const base = data.source === 'manual' ? conversation.lastEligibleInboundAt : event!.occurredAt;
    const commentEffect = event?.kind === 'comment' && ['private_reply', 'public_reply', 'button'].includes(data.effect);
    const deadline = new Date((base?.getTime() ?? 0) + (commentEffect ? 7 * DAY : DAY));
    const key = data.source === 'manual' ? `manual:${data.clientRequestId}` : `${(data.effect === 'link' ? anchor! : event!).externalId}:${data.effect}`;
    const created = await tx.deliveryIntent.createMany({ data: [{ accountId: data.accountId, conversationId: data.conversationId,
      eventId: event?.id, automationId: automation?.id, automationRevision: automation?.revision,
      controlVersion: conversation.controlVersion, connectionGeneration: account.connectionGeneration,
      source: data.source, effect: data.effect, idempotencyKey: key, body: data.body, deadline }], skipDuplicates: true });
    const intent = await tx.deliveryIntent.findUniqueOrThrow({ where: { accountId_idempotencyKey: { accountId: data.accountId, idempotencyKey: key } } });
    if (created.count) await enqueue(tx, boss, data.accountId, intent.id);
    return intent;
  });
}
