import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPrisma } from '../../src/shared/db';
import { createBoss } from '../../src/jobs/queue';
import { createIntent, DAY, DELIVERY_QUEUE, type IntentInput } from '../../src/modules/delivery/ledger';
import { executeIntent } from '../../src/modules/delivery/executor';
import { setAccountPause, setConversationControl } from '../../src/modules/inbox/control';
import { FakeTransport } from '../../src/integrations/meta/fake-transport';
import { deliveryFixture } from '../helpers/delivery-fixture';
import { sweepDeliveryAccount } from '../../src/jobs/delivery';

const db = createPrisma();
const boss = createBoss();
type Fixture = Awaited<ReturnType<typeof deliveryFixture>>;
function data(f: Fixture, effect: IntentInput['effect'] = 'private_reply'): IntentInput {
  return { accountId: f.account.id, conversationId: f.conversation.id, eventId: f.event.id, automationId: f.automation.id,
    source: 'automatic', effect, body: { text: 'Mensagem fictícia editável' } };
}
const context = (intent: { accountId: string; id: string }) => ({ accountId: intent.accountId, intentId: intent.id });
beforeAll(async () => { await boss.start(); await boss.createQueue(DELIVERY_QUEUE); });
beforeEach(() => { vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Rede externa proibida.')); });
afterEach(() => { expect(vi.mocked(globalThis.fetch).mock.calls.length).toBe(0); vi.restoreAllMocks(); });
afterAll(async () => { await boss.stop(); await db.$disconnect(); });

describe('PF-017-L: ledger/executor PostgreSQL e efeitos sintéticos', () => {
  it('concorrência cria uma intenção/job e uma chamada por efeito; outra regra não duplica private reply', async () => {
    const f = await deliveryFixture(db);
    const inputs = [data(f), data(f, 'public_reply'), { ...data(f, 'button'), body: { text: 'Continue', button: { title: 'Abrir', payload: 'continue' } } }];
    const transport = new FakeTransport(db);
    for (const input of inputs) {
      const results = await Promise.all([1, 2, 3].map(() => createIntent(db, boss, input)));
      expect(new Set(results.map((intent) => intent.id)).size).toBe(1);
      await Promise.all(results.map((intent) => executeIntent(db, f.vault, transport, context(intent))));
    }
    const other = await db.automation.create({ data: { accountId: f.account.id, name: 'Outra regra', config: {}, status: 'active' } });
    const same = await createIntent(db, boss, { ...data(f), automationId: other.id });
    expect(same.status).toBe('accepted');
    expect(transport.calls).toBe(3);
    expect(await db.deliveryIntent.count({ where: { accountId: f.account.id } })).toBe(3);
    expect(await db.syntheticEffect.count({ where: { accountId: f.account.id } })).toBe(3);
    expect((await db.$queryRaw<{ count: number }[]>`SELECT count(*)::int AS count FROM pgboss.job WHERE name = ${DELIVERY_QUEUE} AND data->>'accountId' = ${f.account.id}`)[0].count).toBe(3);
  });
  it('ações manuais têm chave própria e retry do navegador preserva corpo; IDs/FKs cruzados são recusados', async () => {
    const a = await deliveryFixture(db), b = await deliveryFixture(db);
    await setConversationControl(db, a.account.id, a.conversation.id, 'manual');
    await setConversationControl(db, b.account.id, b.conversation.id, 'manual');
    const clientRequestId = randomUUID();
    const input: IntentInput = { accountId: a.account.id, conversationId: a.conversation.id, source: 'manual', effect: 'manual', clientRequestId, body: { text: 'Primeiro texto' } };
    const [first, duplicate] = await Promise.all([createIntent(db, boss, input), createIntent(db, boss, { ...input, body: { text: 'Texto tardio' } })]);
    expect(first.id).toBe(duplicate.id);
    expect(first.body).toEqual(duplicate.body);
    const other = await createIntent(db, boss, { ...input, accountId: b.account.id, conversationId: b.conversation.id });
    expect(other.id).not.toBe(first.id);
    await expect(createIntent(db, boss, { ...data(a), conversationId: b.conversation.id })).rejects.toThrow('nesta conta');
    await expect(createIntent(db, boss, { ...data(a), eventId: b.event.id })).rejects.toThrow();
    await expect(executeIntent(db, a.vault, new FakeTransport(db), { accountId: b.account.id, intentId: first.id })).rejects.toThrow();
    await expect(db.deliveryAttempt.create({ data: { accountId: b.account.id, intentId: first.id, number: 1 } })).rejects.toThrow();
  });
  it('prazo de comentário e janela de DM são verificados no servidor, antes/no limite/depois', async () => {
    const now = new Date();
    for (const [kind, effect, window] of [['comment', 'private_reply', 7 * DAY], ['message', 'automatic_dm', DAY]] as const) {
      for (const offset of [-1, 0, 1]) {
        const f = await deliveryFixture(db, new Date(now.getTime() - window - offset), kind);
        const intent = await createIntent(db, boss, data(f, effect));
        const transport = new FakeTransport(db);
        const result = await executeIntent(db, f.vault, transport, context(intent), { now });
        expect(result.status).toBe(offset < 0 ? 'accepted' : 'expired');
        expect(transport.calls).toBe(offset < 0 ? 1 : 0);
      }
    }
    const f = await deliveryFixture(db, new Date(now.getTime() - DAY - 1), 'message');
    await setConversationControl(db, f.account.id, f.conversation.id, 'manual');
    const intent = await createIntent(db, boss, { accountId: f.account.id, conversationId: f.conversation.id, source: 'manual', effect: 'manual', clientRequestId: randomUUID(), body: { text: 'Manual fora da janela' } });
    expect((await executeIntent(db, f.vault, new FakeTransport(db), context(intent), { now })).status).toBe('expired');
  });
  it('reserva anterior à pausa pode estar em trânsito; pausa confirmada cancela pendentes e retomar só serve eventos novos', async () => {
    const f = await deliveryFixture(db);
    const inFlight = await createIntent(db, boss, data(f));
    const pending = await createIntent(db, boss, data(f, 'public_reply'));
    const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
    const transport = new FakeTransport(db, 'accepted', async () => { entered.resolve(); await release.promise; });
    const completing = executeIntent(db, f.vault, transport, context(inFlight));
    await entered.promise;
    expect((await setConversationControl(db, f.account.id, f.conversation.id, 'manual')).inFlight).toBe(1);
    expect((await executeIntent(db, f.vault, transport, context(pending))).status).toBe('canceled');
    await setConversationControl(db, f.account.id, f.conversation.id, 'automatic');
    release.resolve();
    expect((await completing).status).toBe('accepted');
    expect((await executeIntent(db, f.vault, transport, context(pending))).status).toBe('canceled');
    expect(transport.calls).toBe(1);
  });
  it('revalida revisão, supressão, geração/token e pausa da conta; nenhuma chamada em estados bloqueados', async () => {
    for (const reason of ['revision', 'suppressed', 'generation', 'expired-token', 'paused']) {
      const f = await deliveryFixture(db);
      const intent = await createIntent(db, boss, data(f));
      if (reason === 'revision') await db.automation.update({ where: { accountId_id: { accountId: f.account.id, id: f.automation.id } }, data: { revision: { increment: 1 } } });
      if (reason === 'suppressed') await db.contact.update({ where: { accountId_id: { accountId: f.account.id, id: f.contact.id } }, data: { suppressedAt: new Date() } });
      if (reason === 'generation') await db.instagramAccount.update({ where: { id: f.account.id }, data: { connectionGeneration: { increment: 1 } } });
      if (reason === 'expired-token') await db.accountCredential.update({ where: { accountId: f.account.id }, data: { expiresAt: new Date(Date.now() - 1) } });
      if (reason === 'paused') await setAccountPause(db, f.account.id, true);
      const transport = new FakeTransport(db);
      const result = await executeIntent(db, f.vault, transport, context(intent));
      expect(['blocked', 'canceled']).toContain(result.status);
      expect(transport.calls).toBe(0);
    }
  });
  it('limite/cooldown de A não bloqueia B; orçamento é atômico e unknown também consome', async () => {
    const a = await deliveryFixture(db), b = await deliveryFixture(db);
    await db.accountLimit.create({ data: { accountId: a.account.id, quota: 1 } });
    const transport = new FakeTransport(db, 'timeout');
    const a1 = await createIntent(db, boss, data(a)), a2 = await createIntent(db, boss, data(a, 'public_reply'));
    const results = await Promise.all([a1, a2].map((intent) => executeIntent(db, a.vault, transport, context(intent))));
    expect(results.map((result) => result.status).sort()).toEqual(['pending', 'unknown']);
    expect(transport.calls).toBe(1);
    const bi = await createIntent(db, boss, data(b));
    expect((await executeIntent(db, b.vault, new FakeTransport(db), context(bi))).status).toBe('accepted');
    expect((await db.accountLimit.findUniqueOrThrow({ where: { accountId: a.account.id } })).used).toBe(1);
  });
  it('apenas falha comprovada antes do envio permite retry limitado; prazo/regras são reavaliados', async () => {
    const f = await deliveryFixture(db);
    const now = new Date();
    const intent = await createIntent(db, boss, data(f));
    const transport = new FakeTransport(db, 'before-send');
    expect((await executeIntent(db, f.vault, transport, context(intent), { now })).status).toBe('pending');
    await executeIntent(db, f.vault, transport, context(intent), { now });
    expect(transport.calls).toBe(1);
    expect((await executeIntent(db, f.vault, transport, context(intent), { now: new Date(now.getTime() + 3000) })).status).toBe('pending');
    expect((await executeIntent(db, f.vault, transport, context(intent), { now: new Date(now.getTime() + 8000) })).status).toBe('rejected');
    expect(transport.calls).toBe(3);
    expect(await db.syntheticEffect.count({ where: { accountId: f.account.id } })).toBe(0);
    const rate = await deliveryFixture(db);
    const rateIntent = await createIntent(db, boss, data(rate));
    await executeIntent(db, rate.vault, new FakeTransport(db, 'rate-limit'), context(rateIntent));
    expect((await db.accountLimit.findUniqueOrThrow({ where: { accountId: rate.account.id } })).cooldownUntil).not.toBeNull();
    await setAccountPause(db, rate.account.id, true);
    expect((await executeIntent(db, rate.vault, new FakeTransport(db), context(rateIntent), { now: new Date(Date.now() + 10_000) })).status).toBe('canceled');
  });
  it('aceite seguido de erro/timeout fica unknown, inclusive após recriar cliente; nunca reenvia', async () => {
    for (const mode of ['timeout', 'hold'] as const) {
      const f = await deliveryFixture(db);
      const intent = await createIntent(db, boss, data(f));
      const transport = new FakeTransport(db, mode);
      expect((await executeIntent(db, f.vault, transport, context(intent), { timeoutMs: 25 })).status).toBe('unknown');
      const restarted = createPrisma();
      try {
        expect((await executeIntent(restarted, f.vault, transport, context(intent))).status).toBe('unknown');
      } finally { await restarted.$disconnect(); }
      expect(transport.calls).toBe(1);
      expect(await db.syntheticEffect.count({ where: { accountId: f.account.id } })).toBe(1);
      expect((await db.deliveryAttempt.findFirstOrThrow({ where: { accountId: f.account.id } })).status).toBe('unknown');
    }
  });
  it('manutenção da conta recupera pending seguro e heartbeat; rejeição confirmada é terminal', async () => {
    const f = await deliveryFixture(db);
    const intent = await createIntent(db, boss, data(f));
    const failed = new FakeTransport(db, 'before-send');
    const now = new Date();
    await executeIntent(db, f.vault, failed, context(intent), { now });
    const recovered = new FakeTransport(db);
    await sweepDeliveryAccount(db, f.vault, recovered, f.account.id, new Date(now.getTime() + 3000));
    expect((await db.deliveryIntent.findUniqueOrThrow({ where: { accountId_id: { accountId: f.account.id, id: intent.id } } })).status).toBe('accepted');
    expect(recovered.calls).toBe(1);
    expect(await db.workerHeartbeat.count({ where: { accountId: f.account.id, kind: 'delivery' } })).toBe(1);
    const rejected = await createIntent(db, boss, data(f, 'public_reply'));
    const rejecting = new FakeTransport(db, 'rejected');
    expect((await executeIntent(db, f.vault, rejecting, context(rejected))).status).toBe('rejected');
    expect((await executeIntent(db, f.vault, rejecting, context(rejected))).status).toBe('rejected');
    expect(rejecting.calls).toBe(1);
  });
});
