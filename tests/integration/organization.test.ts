import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPrisma } from '../../src/shared/db';
import { createBoss } from '../../src/jobs/queue';
import { organizeConversation } from '../../src/modules/inbox/organization';
import { listConversations, conversationThread } from '../../src/modules/inbox/queries';
import { inboxMetrics } from '../../src/modules/inbox/metrics';
import { processInboxEvent } from '../../src/modules/inbox/ingestion';
import { createIntent, DELIVERY_QUEUE, DAY } from '../../src/modules/delivery/ledger';
import { executeIntent } from '../../src/modules/delivery/executor';
import { FakeTransport } from '../../src/integrations/meta/fake-transport';
import { setAccountPause } from '../../src/modules/inbox/control';
import { deliveryFixture } from '../helpers/delivery-fixture';

const db = createPrisma(), boss = createBoss();
beforeAll(async () => { await boss.start(); await boss.createQueue(DELIVERY_QUEUE); });
beforeEach(() => { vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Rede externa proibida.')); });
afterEach(() => { expect(vi.mocked(globalThis.fetch).mock.calls).toHaveLength(0); vi.restoreAllMocks(); });
afterAll(async () => { await boss.stop(); await db.$disconnect(); });
const organize = (accountId: string, conversationId: string, version = 0, note = 'Nota fictícia de atendimento', status = 'resolved') =>
  organizeConversation(db, accountId, conversationId, { action: 'organize', version, note, status });

describe('PF-025-L: organização e métricas por intenção', () => {
  it('nota/estado por conta, CAS concorrente, controle intacto e novas entradas preservam organização', async () => {
    const a = await deliveryFixture(db), b = await deliveryFixture(db);
    const results = await Promise.allSettled([organize(a.account.id, a.conversation.id), organize(a.account.id, a.conversation.id, 0, 'Outra edição')]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({ reason: { status: 409 } });
    const current = (await conversationThread(db, a.account.id, a.conversation.id)).conversation;
    expect(current.status).toBe('resolved'); expect(current.organizationVersion).toBe(1);
    expect(current.control).toBe('automatic'); expect(current.controlVersion).toBe(0);
    await expect(organize(b.account.id, a.conversation.id)).rejects.toMatchObject({ status: 404 });
    expect((await conversationThread(db, b.account.id, b.conversation.id)).conversation.note).toBeNull();
    await processInboxEvent(db, { accountId: a.account.id, eventId: a.event.id });
    expect((await conversationThread(db, a.account.id, a.conversation.id)).conversation.note).toBe(current.note);
    expect((await conversationThread(db, a.account.id, a.conversation.id)).conversation.status).toBe('resolved');
    await organize(a.account.id, a.conversation.id, 1, '', 'open');
    expect((await conversationThread(db, a.account.id, a.conversation.id)).conversation.note).toBeNull();
    await expect(organize(a.account.id, a.conversation.id, 2, 'x'.repeat(4001))).rejects.toMatchObject({ status: 400 });
  });
  it('filtros de estado/manual/data/busca e paginação não misturam contas nem cursores', async () => {
    const a = await deliveryFixture(db), b = await deliveryFixture(db);
    const day = new Date('2026-09-28T03:00:00Z');
    await db.conversation.update({ where: { accountId_id: { accountId: a.account.id, id: a.conversation.id } }, data: { lastActivityAt: day, status: 'resolved', control: 'manual', note: 'Agendar retorno' } });
    await db.conversation.update({ where: { accountId_id: { accountId: b.account.id, id: b.conversation.id } }, data: { lastActivityAt: day, status: 'resolved', control: 'manual', note: 'Agendar retorno B' } });
    const filter = { status: 'resolved', control: 'manual', from: '2026-09-28', to: '2026-09-28', q: 'RETORNO' };
    expect((await listConversations(db, a.account.id, undefined, filter)).conversations.map((item) => item.id)).toEqual([a.conversation.id]);
    expect((await listConversations(db, a.account.id, undefined, { ...filter, status: 'open' })).conversations).toHaveLength(0);
    await expect(listConversations(db, a.account.id, b.conversation.id, filter)).rejects.toMatchObject({ status: 404 });
    await expect(listConversations(db, a.account.id, a.conversation.id, { status: 'open' })).rejects.toMatchObject({ status: 404 });
    for (let i = 0; i < 32; i++) {
      const contact = await db.contact.create({ data: { accountId: a.account.id, igScopedUserId: `synthetic-${i}` } });
      await db.conversation.create({ data: { accountId: a.account.id, contactId: contact.id, lastActivityAt: day, note: 'Paginar' } });
    }
    const first = await listConversations(db, a.account.id, undefined, { q: 'paginar' });
    const next = await listConversations(db, a.account.id, first.nextCursor!, { q: 'paginar' });
    expect(first.conversations).toHaveLength(30); expect(next.conversations).toHaveLength(2);
    expect(new Set([...first.conversations, ...next.conversations].map((item) => item.id)).size).toBe(32);
    await db.message.create({ data: { accountId: a.account.id, conversationId: a.conversation.id, externalId: randomUUID(), body: 'Buscar pelo conteúdo' } });
    expect((await listConversations(db, a.account.id, undefined, { q: 'CONTEÚDO' })).conversations.map((item) => item.id)).toEqual([a.conversation.id]);
  });
  it('dias incluem bordas de Brasília, intervalos inválidos são recusados e vazio não inventa taxa', async () => {
    const f = await deliveryFixture(db), filter = { from: '2026-09-28', to: '2026-09-28' };
    for (const [time, expected] of [['2026-09-28T02:59:59.999Z', 0], ['2026-09-28T03:00:00Z', 1], ['2026-09-29T02:59:59.999Z', 1], ['2026-09-29T03:00:00Z', 0]] as const) {
      await db.conversation.update({ where: { accountId_id: { accountId: f.account.id, id: f.conversation.id } }, data: { lastActivityAt: new Date(time) } });
      expect((await listConversations(db, f.account.id, undefined, filter)).conversations).toHaveLength(expected);
    }
    for (const invalid of [{ from: '0000-01-01' }, { to: '9999-12-31' }, { from: '2026-02-30' }, { from: '2026-09-29', to: '2026-09-28' }, { control: 'unknown' }, { q: 'x'.repeat(101) }, { extra: true }])
      await expect(listConversations(db, f.account.id, undefined, invalid)).rejects.toMatchObject({ status: 400 });
    const empty = await inboxMetrics(db, f.account.id); expect(empty.totalIntents).toBe(0); expect(empty.acceptanceRate).toBeNull();
  });
  it('retry não vira novo envio; unknown/bloqueadas/canceladas/expiradas fora do denominador, A/B isolados', async () => {
    const f = await deliveryFixture(db), b = await deliveryFixture(db);
    async function intent(at = new Date()) {
      const event = await db.inboundEvent.create({ data: { accountId: f.account.id, externalId: `comment:${randomUUID()}`, kind: 'comment', generation: 1,
        occurredAt: at, payload: f.event.payload! } });
      return createIntent(db, boss, { accountId: f.account.id, conversationId: f.conversation.id, automationId: f.automation.id,
        eventId: event.id, source: 'automatic', effect: 'private_reply', body: { text: 'Métrica fictícia' } });
    }
    for (const mode of ['accepted', 'rejected', 'timeout'] as const) {
      const item = await intent(); await executeIntent(db, f.vault, new FakeTransport(db, mode), { accountId: f.account.id, intentId: item.id });
    }
    const retry = await intent();
    await executeIntent(db, f.vault, new FakeTransport(db, 'before-send'), { accountId: f.account.id, intentId: retry.id });
    const pendingRetry = await db.deliveryIntent.findUniqueOrThrow({ where: { accountId_id: { accountId: f.account.id, id: retry.id } } });
    await executeIntent(db, f.vault, new FakeTransport(db), { accountId: f.account.id, intentId: retry.id }, { now: new Date(pendingRetry.nextAttemptAt!.getTime() + 1) });
    const blocked = await intent();
    await db.contact.update({ where: { accountId_id: { accountId: f.account.id, id: f.contact.id } }, data: { suppressedAt: new Date() } });
    await executeIntent(db, f.vault, new FakeTransport(db), { accountId: f.account.id, intentId: blocked.id });
    const expired = await intent(new Date(Date.now() - 7 * DAY - 1000));
    await executeIntent(db, f.vault, new FakeTransport(db), { accountId: f.account.id, intentId: expired.id });
    await intent(); await setAccountPause(db, f.account.id, true);
    const metric = await inboxMetrics(db, f.account.id);
    expect(metric).toMatchObject({ totalIntents: 7, accepted: 2, rejected: 1, unknown: 1, blocked: 1, expired: 1, canceled: 1,
      denominator: 3, acceptanceRate: 66.7, attempts: 5, retryAttempts: 1 });
    expect(metric.effects).toEqual([{ effect: 'private_reply', count: 7 }]);
    expect((await inboxMetrics(db, b.account.id)).totalIntents).toBe(0);
    expect((await inboxMetrics(db, f.account.id, { status: 'open', control: 'manual', q: 'inexistente' })).totalIntents).toBe(7);
  });
  it('métricas usam coorte criada no período e entradas recebidas sem echo, sem multiplicar tentativas', async () => {
    const f = await deliveryFixture(db);
    const item = await createIntent(db, boss, { accountId: f.account.id, conversationId: f.conversation.id, automationId: f.automation.id,
      eventId: f.event.id, source: 'automatic', effect: 'private_reply', body: { text: 'Coorte' } });
    await executeIntent(db, f.vault, new FakeTransport(db), { accountId: f.account.id, intentId: item.id });
    await db.deliveryIntent.update({ where: { accountId_id: { accountId: f.account.id, id: item.id } }, data: { createdAt: new Date('2026-09-28T03:00:00Z') } });
    for (const [echo, receivedAt] of [[false, '2026-09-29T02:59:59.999Z'], [true, '2026-09-28T04:00:00Z'], [false, '2026-09-29T03:00:00Z']] as const)
      await db.message.create({ data: { accountId: f.account.id, conversationId: f.conversation.id, externalId: randomUUID(), echo, direction: echo ? 'outbound' : 'inbound', receivedAt: new Date(receivedAt), body: null } });
    expect(await inboxMetrics(db, f.account.id, { from: '2026-09-28', to: '2026-09-28' })).toMatchObject({ totalIntents: 1, inbound: 1, attempts: 1, acceptanceRate: 100 });
    expect(await inboxMetrics(db, f.account.id, { from: '2026-09-29', to: '2026-09-29' })).toMatchObject({ totalIntents: 0, inbound: 1, attempts: 0, acceptanceRate: null });
  });
});
