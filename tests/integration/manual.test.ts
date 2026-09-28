import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrisma } from '../../src/shared/db';
import { createBoss } from '../../src/jobs/queue';
import { manualAction } from '../../src/modules/inbox/manual';
import { DAY, DELIVERY_QUEUE, createIntent } from '../../src/modules/delivery/ledger';
import { deliveryFixture } from '../helpers/delivery-fixture';
import { sweepDeliveryAccount } from '../../src/jobs/delivery';

const db = createPrisma(), boss = createBoss();
beforeAll(async () => { await boss.start(); await boss.createQueue(DELIVERY_QUEUE); });
afterAll(async () => { await boss.stop(); await db.$disconnect(); });
describe('PF-022-L: controle/envio manual PostgreSQL', () => {
  it('assumir cancela automáticos, envio exige controle/janela; retomar não reativa pendentes', async () => {
    const f = await deliveryFixture(db);
    const intent = await createIntent(db, boss, { accountId: f.account.id, conversationId: f.conversation.id, eventId: f.event.id,
      automationId: f.automation.id, source: 'automatic', effect: 'private_reply', body: { text: 'Pendente' } });
    const send = { action: 'send', text: 'Manual', clientRequestId: randomUUID() };
    await expect(manualAction(db, boss, f.account.id, f.conversation.id, send)).rejects.toMatchObject({ status: 409 });
    await manualAction(db, boss, f.account.id, f.conversation.id, { action: 'assume' });
    expect((await db.deliveryIntent.findUniqueOrThrow({ where: { accountId_id: { accountId: f.account.id, id: intent.id } } })).status).toBe('canceled');
    await db.conversation.update({ where: { accountId_id: { accountId: f.account.id, id: f.conversation.id } }, data: { lastEligibleInboundAt: new Date(Date.now() - DAY - 1) } });
    await expect(manualAction(db, boss, f.account.id, f.conversation.id, send)).rejects.toMatchObject({ status: 409 });
    await manualAction(db, boss, f.account.id, f.conversation.id, { action: 'resume' });
    expect((await db.deliveryIntent.findUniqueOrThrow({ where: { accountId_id: { accountId: f.account.id, id: intent.id } } })).status).toBe('canceled');
  });
  it('dupla submissão tem um job/efeito; pedido não se transfere entre contas/conversas', async () => {
    const a = await deliveryFixture(db), b = await deliveryFixture(db);
    await manualAction(db, boss, a.account.id, a.conversation.id, { action: 'assume' });
    const body = { action: 'send', text: 'Resposta fictícia', clientRequestId: randomUUID() };
    const results = await Promise.all([1, 2, 3].map(() => manualAction(db, boss, a.account.id, a.conversation.id, body)));
    expect(new Set(results.map((result) => 'intentId' in result && result.intentId)).size).toBe(1);
    await sweepDeliveryAccount(db, a.vault, undefined, a.account.id);
    expect(await db.syntheticEffect.count({ where: { accountId: a.account.id } })).toBe(1);
    await expect(manualAction(db, boss, b.account.id, a.conversation.id, body)).rejects.toMatchObject({ status: 404 });
    const contact = await db.contact.create({ data: { accountId: a.account.id, igScopedUserId: 'another-synthetic-visitor' } });
    const conversation = await db.conversation.create({ data: { accountId: a.account.id, contactId: contact.id } });
    await expect(manualAction(db, boss, a.account.id, conversation.id, body)).rejects.toMatchObject({ status: 409 });
  });
  it('incerto/falhou são observáveis e replay com mesmo ID não reenvia, mesmo após retomada', async () => {
    const f = await deliveryFixture(db);
    await manualAction(db, boss, f.account.id, f.conversation.id, { action: 'assume' });
    for (const simulationOutcome of ['timeout', 'rejected'] as const) {
      const body = { action: 'send', text: 'Resultado fictício', simulationOutcome, clientRequestId: randomUUID() };
      const first = await manualAction(db, boss, f.account.id, f.conversation.id, body);
      await sweepDeliveryAccount(db, f.vault, undefined, f.account.id);
      await sweepDeliveryAccount(db, f.vault, undefined, f.account.id);
      const repeated = await manualAction(db, boss, f.account.id, f.conversation.id, body);
      expect(repeated).toMatchObject({ intentId: 'intentId' in first ? first.intentId : '', status: simulationOutcome === 'timeout' ? 'unknown' : 'rejected' });
    }
    expect(await db.syntheticEffect.count({ where: { accountId: f.account.id } })).toBe(1);
    expect(await db.deliveryAttempt.count({ where: { accountId: f.account.id } })).toBe(2);
    await manualAction(db, boss, f.account.id, f.conversation.id, { action: 'resume' });
    await sweepDeliveryAccount(db, f.vault, undefined, f.account.id);
    expect(await db.syntheticEffect.count({ where: { accountId: f.account.id } })).toBe(1);
  });
});
