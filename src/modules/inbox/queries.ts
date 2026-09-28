import { z } from 'zod';
import type { Database } from '../../shared/db';
import { RequestRejected } from '../../shared/operator-context';

export async function listConversations(db: Database, accountId: string, cursor?: string) {
  if (cursor && !z.uuid().safeParse(cursor).success) throw new RequestRejected(400);
  const pivot = cursor ? await db.conversation.findUnique({ where: { accountId_id: { accountId, id: cursor } } }) : null;
  if (cursor && !pivot) throw new RequestRejected(404);
  const conversations = await db.conversation.findMany({ where: { accountId, ...(pivot ? { OR: [
    { lastActivityAt: { lt: pivot.lastActivityAt } }, { lastActivityAt: pivot.lastActivityAt, id: { lt: pivot.id } },
  ] } : {}) }, orderBy: [{ lastActivityAt: 'desc' }, { id: 'desc' }], take: 31,
  select: { id: true, accountId: true, control: true, status: true, lastActivityAt: true, lastEligibleInboundAt: true,
    contact: { select: { igScopedUserId: true, suppressedAt: true } },
    messages: { take: 1, orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }], select: { body: true, kind: true } } } });
  const items = conversations.slice(0, 30);
  return { conversations: items, nextCursor: conversations.length > 30 ? items.at(-1)!.id : null, partialHistory: true };
}
export async function conversationThread(db: Database, accountId: string, conversationId: string, cursor?: string) {
  if (!z.uuid().safeParse(conversationId).success || (cursor && !z.uuid().safeParse(cursor).success)) throw new RequestRejected(400);
  const conversation = await db.conversation.findUnique({ where: { accountId_id: { accountId, id: conversationId } },
    select: { id: true, accountId: true, control: true, controlVersion: true, status: true, note: true, lastEligibleInboundAt: true,
      contact: { select: { igScopedUserId: true, suppressedAt: true } } } });
  if (!conversation) throw new RequestRejected(404);
  const pivot = cursor ? await db.message.findFirst({ where: { accountId, conversationId, id: cursor } }) : null;
  if (cursor && !pivot) throw new RequestRejected(404);
  const messages = await db.message.findMany({ where: { accountId, conversationId, ...(pivot ? { OR: [
    { occurredAt: { lt: pivot.occurredAt } }, { occurredAt: pivot.occurredAt, id: { lt: pivot.id } },
  ] } : {}) }, orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }], take: 51,
  select: { id: true, accountId: true, body: true, direction: true, kind: true, echo: true, occurredAt: true } });
  const items = messages.slice(0, 50);
  const intents = await db.deliveryIntent.findMany({ where: { accountId, conversationId }, orderBy: { createdAt: 'desc' }, take: 100,
    select: { id: true, accountId: true, body: true, effect: true, source: true, status: true, reason: true, createdAt: true } });
  const windowOpen = Boolean(conversation.lastEligibleInboundAt && conversation.lastEligibleInboundAt.getTime() + 24 * 60 * 60_000 > Date.now());
  return { conversation, windowOpen, messages: items.toReversed(), intents: intents.toReversed(), nextCursor: messages.length > 50 ? items.at(-1)!.id : null, partialHistory: true };
}
