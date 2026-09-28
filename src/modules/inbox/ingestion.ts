import { z } from 'zod';
import type { Prisma, InstagramAccount, Conversation, Contact, InboundEvent } from '../../generated/prisma/client';
import type { Database } from '../../shared/db';
import { lockAccount } from '../../shared/account-lock';
import { isStopCommand } from '../automations/recipe';

const jobSchema = z.object({ accountId: z.uuid(), eventId: z.uuid() }).strict();
const eventPayload = z.object({ actorId: z.string().min(1).max(200), text: z.string().max(20_000).nullable(),
  mediaId: z.string().nullable(), echo: z.boolean(), buttonPayload: z.string().nullable() }).strict();

export type NormalizedInbound = { account: InstagramAccount; event: InboundEvent; conversation: Conversation; contact: Contact;
  payload: z.infer<typeof eventPayload>; eligible: boolean };
export async function processInboxEvent(db: Database, data: unknown,
  decide?: (tx: Prisma.TransactionClient, context: NormalizedInbound) => Promise<void>) {
  const parsed = jobSchema.safeParse(data);
  if (!parsed.success) throw new Error('Evento sem contexto válido.');
  const { accountId, eventId } = parsed.data;
  return db.$transaction(async (tx) => {
    await lockAccount(tx, accountId);
    const event = await tx.inboundEvent.findUniqueOrThrow({ where: { accountId_id: { accountId, id: eventId } } });
    if (event.processedAt) return null;
    if (event.kind === 'foundation') {
      await tx.inboundEvent.update({ where: { accountId_id: { accountId, id: eventId } }, data: { processedAt: new Date() } });
      return null;
    }
    const payload = eventPayload.parse(event.payload);
    const account = await tx.instagramAccount.findUniqueOrThrow({ where: { id: accountId } });
    if (payload.actorId === account.professionalId) {
      await tx.inboundEvent.update({ where: { accountId_id: { accountId, id: eventId } }, data: { processedAt: new Date() } });
      return null;
    }
    let contact = await tx.contact.upsert({ where: { accountId_igScopedUserId: { accountId, igScopedUserId: payload.actorId } },
      create: { accountId, igScopedUserId: payload.actorId }, update: {} });
    const occurredAt = new Date(Math.min(event.occurredAt.getTime(), event.receivedAt.getTime()));
    const conversation = await tx.conversation.upsert({ where: { accountId_contactId: { accountId, contactId: contact.id } },
      create: { accountId, contactId: contact.id, lastActivityAt: occurredAt }, update: {} });
    const eligible = event.generation === account.connectionGeneration && !payload.echo && ['message', 'story', 'postback'].includes(event.kind) &&
      (Boolean(payload.text?.trim()) || event.kind === 'postback');
    // Opt-out vale mesmo durante pausa/controle manual, somente para entrada textual atual do contato.
    if (eligible && ['message', 'story'].includes(event.kind) && isStopCommand(payload.text!)) {
      if (!contact.suppressedAt) contact = await tx.contact.update({ where: { accountId_id: { accountId, id: contact.id } }, data: { suppressedAt: occurredAt } });
      await tx.deliveryIntent.updateMany({ where: { accountId, conversationId: conversation.id, source: 'automatic', status: 'pending' },
        data: { status: 'canceled', reason: 'contact_suppressed' } });
    }
    const updatedConversation = await tx.conversation.update({ where: { accountId_id: { accountId, id: conversation.id } }, data: {
      ...(occurredAt > conversation.lastActivityAt ? { lastActivityAt: occurredAt } : {}),
      ...(eligible && (!conversation.lastEligibleInboundAt || occurredAt > conversation.lastEligibleInboundAt) ? { lastEligibleInboundAt: occurredAt } : {}),
    } });
    await tx.message.createMany({ data: [{ accountId, conversationId: conversation.id, externalId: event.externalId,
      body: payload.text, direction: payload.echo ? 'outbound' : 'inbound', echo: payload.echo,
      kind: event.kind === 'message' && payload.text === null ? 'unavailable' : event.kind,
      occurredAt, receivedAt: event.receivedAt }], skipDuplicates: true });
    await decide?.(tx, { account, event, conversation: updatedConversation, contact, payload, eligible });
    await tx.inboundEvent.update({ where: { accountId_id: { accountId, id: eventId } }, data: { processedAt: new Date() } });
    return { accountId, eventId, conversationId: conversation.id, eligible, echo: payload.echo };
  });
}
