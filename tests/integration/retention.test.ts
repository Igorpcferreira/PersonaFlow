import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { createPrisma } from '../../src/shared/db';
import { organizeConversation } from '../../src/modules/inbox/organization';
import { retainAccountContent } from '../../src/jobs/retention';

const db = createPrisma();
afterAll(() => db.$disconnect());

const day = 24 * 60 * 60_000;
const now = new Date('2026-09-30T12:00:00.000Z');
const ago = (days: number) => new Date(now.getTime() - days * day);

async function fixture(label: string) {
  const account = await db.instagramAccount.create({ data: { label, professionalId: `synthetic-${randomUUID()}` } });
  const contact = await db.contact.create({ data: { accountId: account.id, igScopedUserId: `visitor-${randomUUID()}` } });
  const conversation = await db.conversation.create({ data: { accountId: account.id, contactId: contact.id } });
  return { account, conversation };
}

describe('retenção de conteúdo por conta piloto', () => {
  it('simula antes de redigir, preserva ledger e não toca outra conta', async () => {
    const pilot = await fixture('Piloto de retenção'), other = await fixture('Outra conta');
    await db.conversation.update({ where: { accountId_id: { accountId: pilot.account.id, id: pilot.conversation.id } }, data: { note: 'Nota pessoal antiga', noteUpdatedAt: ago(91) } });
    await db.message.createMany({ data: [
      { accountId: pilot.account.id, conversationId: pilot.conversation.id, externalId: `old-message-${randomUUID()}`, body: 'Mensagem antiga', receivedAt: ago(91) },
      { accountId: pilot.account.id, conversationId: pilot.conversation.id, externalId: `new-message-${randomUUID()}`, body: 'Mensagem recente', receivedAt: ago(89) },
      { accountId: other.account.id, conversationId: other.conversation.id, externalId: `other-message-${randomUUID()}`, body: 'Outra mensagem antiga', receivedAt: ago(91) },
    ] });
    await db.inboundEvent.createMany({ data: [
      { accountId: pilot.account.id, externalId: `old-event-${randomUUID()}`, payload: { text: 'Diagnóstico antigo' }, receivedAt: ago(8), processedAt: ago(8) },
      { accountId: pilot.account.id, externalId: `new-event-${randomUUID()}`, payload: { text: 'Diagnóstico recente' }, receivedAt: ago(6) },
      { accountId: pilot.account.id, externalId: `pending-event-${randomUUID()}`, payload: { text: 'Evento tardio pendente' }, receivedAt: ago(8) },
    ] });
    const oldIntent = await db.deliveryIntent.create({ data: { accountId: pilot.account.id, conversationId: pilot.conversation.id,
      controlVersion: 0, connectionGeneration: 0, source: 'manual', effect: 'manual', idempotencyKey: `old-intent-${randomUUID()}`,
      body: { text: 'Resposta antiga' }, deadline: now, createdAt: ago(91) } });
    await db.deliveryIntent.create({ data: { accountId: pilot.account.id, conversationId: pilot.conversation.id,
      controlVersion: 0, connectionGeneration: 0, source: 'manual', effect: 'manual', idempotencyKey: `new-intent-${randomUUID()}`,
      body: { text: 'Resposta recente' }, deadline: now, createdAt: ago(89) } });

    await expect(retainAccountContent(db, { accountId: 'not-a-uuid', expectedPilotAccountId: pilot.account.id })).rejects.toThrow();
    await expect(retainAccountContent(db, { accountId: other.account.id, expectedPilotAccountId: pilot.account.id })).rejects.toThrow('conta piloto');
    const dryRun = await retainAccountContent(db, { accountId: pilot.account.id, expectedPilotAccountId: pilot.account.id, now });
    expect(dryRun).toMatchObject({ dryRun: true, messages: 1, notes: 1, deliveryIntents: 1, inboundEvents: 1 });
    expect((await db.message.findFirstOrThrow({ where: { accountId: pilot.account.id, externalId: { startsWith: 'old-message-' } } })).body).toBe('Mensagem antiga');

    const executed = await retainAccountContent(db, { accountId: pilot.account.id, expectedPilotAccountId: pilot.account.id, execute: true, now });
    expect(executed).toMatchObject({ dryRun: false, messages: 1, notes: 1, deliveryIntents: 1, inboundEvents: 1 });
    const [conversation, messages, events, intents, untouched] = await Promise.all([
      db.conversation.findUniqueOrThrow({ where: { accountId_id: { accountId: pilot.account.id, id: pilot.conversation.id } } }),
      db.message.findMany({ where: { accountId: pilot.account.id }, orderBy: { receivedAt: 'asc' } }),
      db.inboundEvent.findMany({ where: { accountId: pilot.account.id }, orderBy: { receivedAt: 'asc' } }),
      db.deliveryIntent.findMany({ where: { accountId: pilot.account.id }, orderBy: { createdAt: 'asc' } }),
      db.message.findFirstOrThrow({ where: { accountId: other.account.id } }),
    ]);
    expect(conversation).toMatchObject({ note: null, noteUpdatedAt: null });
    expect(messages.map((message) => message.body)).toEqual([null, 'Mensagem recente']);
    expect(events.find((event) => event.externalId.startsWith('old-event-'))!.payload).toBeNull();
    expect(events.find((event) => event.externalId.startsWith('new-event-'))!.payload).toEqual({ text: 'Diagnóstico recente' });
    expect(events.find((event) => event.externalId.startsWith('pending-event-'))!.payload).toEqual({ text: 'Evento tardio pendente' });
    expect(intents[0]).toMatchObject({ id: oldIntent.id, status: 'pending', body: {} });
    expect(intents[1].body).toEqual({ text: 'Resposta recente' });
    expect(untouched.body).toBe('Outra mensagem antiga');
  });

  it('marca apenas uma edição real da nota', async () => {
    const item = await fixture('Timestamp de nota');
    const first = await organizeConversation(db, item.account.id, item.conversation.id, { action: 'organize', version: 0, note: 'Primeira nota', status: 'open' });
    const afterFirst = await db.conversation.findUniqueOrThrow({ where: { accountId_id: { accountId: item.account.id, id: item.conversation.id } } });
    expect(afterFirst.noteUpdatedAt).not.toBeNull();
    await organizeConversation(db, item.account.id, item.conversation.id, { action: 'organize', version: first.organizationVersion, note: 'Primeira nota', status: 'resolved' });
    const afterStatus = await db.conversation.findUniqueOrThrow({ where: { accountId_id: { accountId: item.account.id, id: item.conversation.id } } });
    expect(afterStatus.noteUpdatedAt).toEqual(afterFirst.noteUpdatedAt);
    await organizeConversation(db, item.account.id, item.conversation.id, { action: 'organize', version: afterStatus.organizationVersion, note: 'Nota corrigida', status: 'resolved' });
    const afterEdit = await db.conversation.findUniqueOrThrow({ where: { accountId_id: { accountId: item.account.id, id: item.conversation.id } } });
    expect(afterEdit.noteUpdatedAt!.getTime()).toBeGreaterThanOrEqual(afterFirst.noteUpdatedAt!.getTime());
  });
});
