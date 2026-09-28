import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { createPrisma } from '../../src/shared/db';
import { processInboxEvent } from '../../src/modules/inbox/ingestion';
import { conversationThread, listConversations } from '../../src/modules/inbox/queries';

const db = createPrisma();
afterAll(() => db.$disconnect());
const account = () => db.instagramAccount.create({ data: { label: 'Inbox fictícia', professionalId: `synthetic-${randomUUID()}` } });
async function event(accountId: string, externalId: string, at: Date, kind = 'message', echo = false, text: string | null = 'Texto fictício') {
  return db.inboundEvent.create({ data: { accountId, externalId, occurredAt: at, kind,
    payload: { actorId: 'same-synthetic-visitor', text, echo, mediaId: null, buttonPayload: null } } });
}
describe('PF-021-L: inbox PostgreSQL', () => {
  it('replay/concorrência e mesmos interlocutor/ID externo em A/B não duplicam nem misturam thread', async () => {
    const a = await account(), b = await account();
    for (const owner of [a, b]) {
      const entry = await event(owner.id, 'same-mid', new Date(), 'message', false, owner.label + owner.id);
      await Promise.all([1, 2, 3].map(() => processInboxEvent(db, { accountId: owner.id, eventId: entry.id })));
    }
    expect(await db.message.count({ where: { accountId: a.id } })).toBe(1);
    expect(await db.message.count({ where: { accountId: b.id } })).toBe(1);
    const aList = await listConversations(db, a.id), bList = await listConversations(db, b.id);
    expect(aList.conversations).toHaveLength(1); expect(bList.conversations).toHaveLength(1);
    expect(aList.conversations[0].id).not.toBe(bList.conversations[0].id);
    await expect(conversationThread(db, b.id, aList.conversations[0].id)).rejects.toMatchObject({ status: 404 });
    await expect(conversationThread(db, a.id, aList.conversations[0].id, bList.conversations[0].id)).rejects.toMatchObject({ status: 404 });
  });
  it('janela é monotônica: comentário/echo/sem texto não abrem; atraso não renova e futuro é limitado ao recebimento', async () => {
    const a = await account();
    const now = Date.now();
    const values = [
      { at: now - 1000, kind: 'comment', echo: false, text: 'site' },
      { at: now - 500, kind: 'message', echo: true, text: 'Saída' },
      { at: now - 100, kind: 'message', echo: false, text: null },
    ];
    for (const value of values) {
      const entry = await event(a.id, randomUUID(), new Date(value.at), value.kind, value.echo, value.text);
      await processInboxEvent(db, { accountId: a.id, eventId: entry.id });
    }
    let list = await listConversations(db, a.id);
    expect(list.conversations[0].lastEligibleInboundAt).toBeNull();
    const recent = await event(a.id, randomUUID(), new Date(now - 10_000), 'story');
    await processInboxEvent(db, { accountId: a.id, eventId: recent.id });
    const old = await event(a.id, randomUUID(), new Date(now - 60_000));
    await processInboxEvent(db, { accountId: a.id, eventId: old.id });
    list = await listConversations(db, a.id);
    expect(list.conversations[0].lastEligibleInboundAt!.getTime()).toBe(now - 10_000);
    const future = await event(a.id, randomUUID(), new Date(now + 60_000));
    await processInboxEvent(db, { accountId: a.id, eventId: future.id });
    list = await listConversations(db, a.id);
    expect(list.conversations[0].lastEligibleInboundAt!.getTime()).toBe(future.receivedAt.getTime());
    const thread = await conversationThread(db, a.id, list.conversations[0].id);
    expect(thread.messages.some((message) => message.echo && message.direction === 'outbound')).toBe(true);
    expect(thread.messages.some((message) => message.kind === 'unavailable' && message.body === null)).toBe(true);
    const reconnected = await account();
    await db.instagramAccount.update({ where: { id: reconnected.id }, data: { connectionGeneration: 1 } });
    const obsolete = await event(reconnected.id, randomUUID(), new Date());
    await processInboxEvent(db, { accountId: reconnected.id, eventId: obsolete.id });
    expect((await listConversations(db, reconnected.id)).conversations[0].lastEligibleInboundAt).toBeNull();
  });
  it('thread paginada preserva ordem e não aceita cursor de outra conta/conversa', async () => {
    const a = await account(), b = await account();
    const start = Date.now() - 120_000;
    for (let number = 52; number >= 0; number -= 1) {
      const entry = await event(a.id, `message:${number}`, new Date(start + number * 1000));
      await processInboxEvent(db, { accountId: a.id, eventId: entry.id });
    }
    const list = await listConversations(db, a.id);
    const first = await conversationThread(db, a.id, list.conversations[0].id);
    expect(first.messages).toHaveLength(50); expect(first.partialHistory).toBe(true);
    const previous = await conversationThread(db, a.id, list.conversations[0].id, first.nextCursor!);
    expect(previous.messages).toHaveLength(3); expect(previous.nextCursor).toBeNull();
    const ordered = [...previous.messages, ...first.messages].map((message) => message.occurredAt.getTime());
    expect(ordered).toEqual(ordered.toSorted((left, right) => left - right));
    const other = await event(b.id, 'other-mid', new Date());
    await processInboxEvent(db, { accountId: b.id, eventId: other.id });
    const bList = await listConversations(db, b.id);
    const bThread = await conversationThread(db, b.id, bList.conversations[0].id);
    await expect(conversationThread(db, a.id, list.conversations[0].id, bThread.messages[0].id)).rejects.toMatchObject({ status: 404 });
  });
});
