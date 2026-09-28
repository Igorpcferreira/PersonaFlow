import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPrisma } from '../../src/shared/db';
import { createBoss, INBOUND_QUEUE } from '../../src/jobs/queue';
import { accountDiagnostics, diagnosticAction } from '../../src/modules/accounts/diagnostics';
import { createIntent, DAY, DELIVERY_QUEUE } from '../../src/modules/delivery/ledger';
import { sweepDeliveryAccount } from '../../src/jobs/delivery';
import { deliveryFixture } from '../helpers/delivery-fixture';
import type { WebhookApp } from '../../src/integrations/meta/webhook';

const db = createPrisma(), boss = createBoss();
const app: WebhookApp = { kind: 'synthetic', alias: 'simulation', secret: 'synthetic-diagnostic-secret-'.repeat(2), verifyToken: 'synthetic-diagnostic-verify-'.repeat(2) };
type Fixture = Awaited<ReturnType<typeof deliveryFixture>>;
async function session() {
  const user = await db.user.create({ data: { id: randomUUID(), name: 'Operador fictício', email: `${randomUUID()}@example.invalid` } });
  return db.session.create({ data: { id: randomUUID(), userId: user.id, token: randomUUID(), expiresAt: new Date(Date.now() + DAY) } });
}
async function intent(f: Fixture, outcome: 'accepted' | 'timeout' = 'accepted') {
  const event = await db.inboundEvent.create({ data: { accountId: f.account.id, kind: 'comment', generation: (await db.instagramAccount.findUniqueOrThrow({ where: { id: f.account.id } })).connectionGeneration,
    externalId: `comment:${randomUUID()}`, payload: f.event.payload! } });
  return createIntent(db, boss, { accountId: f.account.id, conversationId: f.conversation.id, automationId: f.automation.id, eventId: event.id,
    source: 'automatic', effect: 'private_reply', body: { text: 'Texto sintético' }, simulationOutcome: outcome });
}
beforeAll(async () => { await boss.start(); await boss.createQueue(INBOUND_QUEUE); await boss.createQueue(DELIVERY_QUEUE); });
beforeEach(() => { vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Rede externa proibida.')); });
afterEach(() => { expect(vi.mocked(globalThis.fetch).mock.calls).toHaveLength(0); vi.restoreAllMocks(); });
afterAll(async () => { await boss.stop(); await db.$disconnect(); });
describe('PF-026-L: diagnóstico/ações PostgreSQL por conta', () => {
  it('DTO não expõe credenciais; fila/idades e heartbeat expiram sem misturar A/B', async () => {
    const a = await deliveryFixture(db), b = await deliveryFixture(db), now = new Date();
    await db.inboundEvent.update({ where: { accountId_id: { accountId: a.account.id, id: a.event.id } }, data: { receivedAt: new Date(now.getTime() - 65_000) } });
    await intent(a); await intent(b);
    await boss.send(INBOUND_QUEUE, { accountId: a.account.id, eventId: a.event.id });
    await boss.send(INBOUND_QUEUE, { accountId: b.account.id, eventId: b.event.id });
    await db.workerHeartbeat.create({ data: { accountId: a.account.id, kind: 'delivery', seenAt: now } });
    const result = await accountDiagnostics(db, a.vault, a.account.id, now);
    expect(result.queue.unprocessed).toBe(2);
    expect(result.queue.oldestInboundAgeSeconds).toBe(65);
    expect(result.queue.pending).toBe(1);
    expect(result.queue.jobs.filter((job) => job.name === INBOUND_QUEUE).reduce((sum, job) => sum + job.count, 0)).toBe(1);
    expect(result.worker.state).toBe('active');
    expect((await accountDiagnostics(db, a.vault, a.account.id, new Date(now.getTime() + 30_000))).worker.state).toBe('stale');
    expect((await accountDiagnostics(db, b.vault, b.account.id, now)).worker.state).toBe('absent');
    expect(JSON.stringify(result)).not.toMatch(/ciphertext|accessToken|refreshLease|synthetic-token|secret|keyVersion/);
    expect(result.connection.refreshEligible).toBe(false);
    await db.accountCredential.update({ where: { accountId: a.account.id }, data: { issuedAt: new Date(now.getTime() - DAY) } });
    expect((await accountDiagnostics(db, a.vault, a.account.id, now)).connection.refreshEligible).toBe(true);
    const operator = await session();
    await diagnosticAction(db, a.vault, app, a.account.id, operator.id, { action: 'refresh' });
    expect((await accountDiagnostics(db, a.vault, a.account.id)).connection).toMatchObject({ status: 'connected', generation: 1, refreshEligible: false });
    expect((await accountDiagnostics(db, a.vault, a.account.id)).queue.pending).toBe(1);
  });
  it('pausa, revogação, expiração/reconexão cancelam pendentes antigos; B segue enviando', async () => {
    const a = await deliveryFixture(db), b = await deliveryFixture(db), operator = await session();
    const action = (value: unknown) => diagnosticAction(db, a.vault, app, a.account.id, operator.id, value);
    const beforePause = await intent(a);
    await action({ action: 'pause' }); await action({ action: 'resume' });
    expect((await db.deliveryIntent.findUniqueOrThrow({ where: { accountId_id: { accountId: a.account.id, id: beforePause.id } } })).status).toBe('canceled');
    const beforeRevoke = await intent(a); await action({ action: 'revoke' });
    expect((await accountDiagnostics(db, a.vault, a.account.id)).connection.status).toBe('revoked');
    expect((await db.deliveryIntent.findUniqueOrThrow({ where: { accountId_id: { accountId: a.account.id, id: beforeRevoke.id } } })).status).toBe('canceled');
    await intent(b); await sweepDeliveryAccount(db, b.vault, undefined, b.account.id);
    expect(await db.syntheticEffect.count({ where: { accountId: b.account.id } })).toBe(1);
    expect((await db.instagramAccount.findUniqueOrThrow({ where: { id: b.account.id } })).connectionGeneration).toBe(1);
    await action({ action: 'reconnect' });
    expect((await accountDiagnostics(db, a.vault, a.account.id)).connection).toMatchObject({ status: 'connected', generation: 3, subscriptionCurrent: true });
    const beforeExpire = await intent(a); await action({ action: 'expire' });
    expect((await accountDiagnostics(db, a.vault, a.account.id)).connection.status).toBe('expired');
    await expect(action({ action: 'refresh' })).rejects.toMatchObject({ status: 409 });
    await action({ action: 'reconnect' }); await sweepDeliveryAccount(db, a.vault, undefined, a.account.id);
    expect((await db.deliveryIntent.findUniqueOrThrow({ where: { accountId_id: { accountId: a.account.id, id: beforeExpire.id } } })).status).toBe('canceled');
    expect(await db.syntheticEffect.count({ where: { accountId: a.account.id } })).toBe(0);
    await intent(a); await sweepDeliveryAccount(db, a.vault, undefined, a.account.id);
    expect(await db.syntheticEffect.count({ where: { accountId: a.account.id } })).toBe(1);
  });
  it('limite/espera isolados e unknown terminal; não há ação retry/reset de reservas', async () => {
    const a = await deliveryFixture(db), b = await deliveryFixture(db), operator = await session();
    const action = (value: unknown) => diagnosticAction(db, a.vault, app, a.account.id, operator.id, value);
    await action({ action: 'limit', quota: 1 });
    const unknown = await intent(a, 'timeout'); const waiting = await intent(a); await intent(b);
    await sweepDeliveryAccount(db, a.vault, undefined, a.account.id); await sweepDeliveryAccount(db, b.vault, undefined, b.account.id);
    const result = await accountDiagnostics(db, a.vault, a.account.id);
    expect(result.results.unknown).toBe(1); expect(result.results.uncertain[0].id).toBe(unknown.id);
    expect(result.limit).toMatchObject({ used: 1, quota: 1 }); expect(result.queue.pending).toBe(1);
    expect((await db.deliveryIntent.findUniqueOrThrow({ where: { accountId_id: { accountId: a.account.id, id: waiting.id } } })).reason).toBe('account_limit');
    expect(await db.syntheticEffect.count({ where: { accountId: b.account.id } })).toBe(1);
    await action({ action: 'limit', quota: 30 });
    expect((await accountDiagnostics(db, a.vault, a.account.id)).limit.used).toBe(1);
    await expect(action({ action: 'retry', intentId: unknown.id })).rejects.toMatchObject({ status: 400 });
    await db.accountLimit.update({ where: { accountId: a.account.id }, data: { cooldownUntil: new Date(Date.now() + 30_000) } });
    expect((await accountDiagnostics(db, a.vault, a.account.id)).limit.cooldownUntil).not.toBeNull();
    await sweepDeliveryAccount(db, a.vault, undefined, a.account.id);
    expect(await db.syntheticEffect.count({ where: { accountId: a.account.id } })).toBe(1);
    await action({ action: 'reconnect' });
    await sweepDeliveryAccount(db, a.vault, undefined, a.account.id);
    expect(await db.syntheticEffect.count({ where: { accountId: a.account.id } })).toBe(1);
    expect((await db.deliveryIntent.findUniqueOrThrow({ where: { accountId_id: { accountId: a.account.id, id: unknown.id } } })).status).toBe('unknown');
  });
  it('sessão expirada não reconecta; limite fora do intervalo e campos extras são recusados', async () => {
    const f = await deliveryFixture(db), operator = await session();
    await db.session.update({ where: { id: operator.id }, data: { expiresAt: new Date(Date.now() - 1) } });
    await expect(diagnosticAction(db, f.vault, app, f.account.id, operator.id, { action: 'reconnect' })).rejects.toThrow('omitidos');
    for (const value of [{ action: 'limit', quota: 0 }, { action: 'limit', quota: 31 }, { action: 'pause', accountId: randomUUID() }])
      await expect(diagnosticAction(db, f.vault, app, f.account.id, operator.id, value)).rejects.toMatchObject({ status: 400 });
    expect((await db.instagramAccount.findUniqueOrThrow({ where: { id: f.account.id } })).connectionGeneration).toBe(1);
  });
});
