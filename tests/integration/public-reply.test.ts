import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPrisma } from '../../src/shared/db';
import { createBoss } from '../../src/jobs/queue';
import { DELIVERY_QUEUE } from '../../src/modules/delivery/ledger';
import { emptyRecipe } from '../../src/modules/automations/recipe';
import { saveAutomation, setAutomationStatus } from '../../src/modules/automations/service';
import { decideAutomation } from '../../src/modules/automations/decision';
import { processInboxEvent } from '../../src/modules/inbox/ingestion';
import { sweepDeliveryAccount } from '../../src/jobs/delivery';
import { deliveryFixture } from '../helpers/delivery-fixture';

const db = createPrisma(), boss = createBoss();
const config = { ...emptyRecipe, terms: ['site'], introduction: 'Introdução configurada', finalMessage: 'Final configurado', link: 'https://example.invalid/public',
  publicReplyEnabled: true, publicReply: 'Texto público configurado pelo operador' };
async function fixture() {
  const f = await deliveryFixture(db);
  const draft = await saveAutomation(db, f.account.id, { name: 'Pública opcional', mediaId: 'synthetic-reel-3', config }, f.automation.id, 1);
  const automation = await setAutomationStatus(db, f.account.id, draft.id, 'active', draft.revision);
  await db.inboundEvent.update({ where: { accountId_id: { accountId: f.account.id, id: f.event.id } },
    data: { payload: { actorId: f.contact.igScopedUserId, text: 'Quero o site', mediaId: 'synthetic-reel-3', echo: false, buttonPayload: null } } });
  return { ...f, automation };
}
const process = (accountId: string, eventId: string) => processInboxEvent(db, { accountId, eventId }, (tx, context) => decideAutomation(tx, boss, context));
beforeAll(async () => { await boss.start(); await boss.createQueue(DELIVERY_QUEUE); });
beforeEach(() => { vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Rede externa proibida.')); });
afterEach(() => { expect(vi.mocked(globalThis.fetch).mock.calls).toHaveLength(0); vi.restoreAllMocks(); });
afterAll(async () => { await boss.stop(); await db.$disconnect(); });
describe('PF-100-L: resposta pública com efeito próprio PostgreSQL', () => {
  it('mesmo comentário nas duas contas/concorrrência/replay cria uma pública e privada por conta', async () => {
    const a = await fixture(), b = await fixture();
    await db.inboundEvent.update({ where: { accountId_id: { accountId: b.account.id, id: b.event.id } }, data: { externalId: a.event.externalId } });
    await Promise.all([process(a.account.id, a.event.id), process(a.account.id, a.event.id), process(b.account.id, b.event.id)]);
    for (const f of [a, b]) {
      const intents = await db.deliveryIntent.findMany({ where: { accountId: f.account.id }, orderBy: { effect: 'asc' } });
      expect(intents).toHaveLength(2);
      expect(new Set(intents.map((intent) => intent.idempotencyKey)).size).toBe(2);
      expect(intents.find((intent) => intent.effect === 'public_reply')!.body).toEqual({ text: config.publicReply });
      await sweepDeliveryAccount(db, f.vault, undefined, f.account.id); await process(f.account.id, f.event.id);
      expect(await db.syntheticEffect.count({ where: { accountId: f.account.id } })).toBe(2);
    }
  });
  it('pública incerta/rejeitada não repete a privada aceita nem é reenviada em replay', async () => {
    for (const outcome of ['timeout', 'rejected'] as const) {
      const f = await fixture(); await process(f.account.id, f.event.id);
      await db.deliveryIntent.updateMany({ where: { accountId: f.account.id, effect: 'public_reply' }, data: { simulationOutcome: outcome } });
      await sweepDeliveryAccount(db, f.vault, undefined, f.account.id);
      expect(await db.deliveryIntent.findFirstOrThrow({ where: { accountId: f.account.id, effect: 'private_reply' } })).toMatchObject({ status: 'accepted' });
      expect(await db.deliveryIntent.findFirstOrThrow({ where: { accountId: f.account.id, effect: 'public_reply' } })).toMatchObject({ status: outcome === 'timeout' ? 'unknown' : 'rejected' });
      for (let repeat = 0; repeat < 2; repeat += 1) { await process(f.account.id, f.event.id); await sweepDeliveryAccount(db, f.vault, undefined, f.account.id); }
      expect(await db.deliveryAttempt.count({ where: { accountId: f.account.id } })).toBe(2);
      expect(await db.syntheticEffect.count({ where: { accountId: f.account.id } })).toBe(outcome === 'timeout' ? 2 : 1);
    }
  });
  it('pausa/edição cancelam ambos os efeitos pendentes; desativar opcional produz só privada', async () => {
    for (const edit of [false, true]) {
      const f = await fixture(); await process(f.account.id, f.event.id);
      if (edit) await saveAutomation(db, f.account.id, { name: 'Revisada', mediaId: 'synthetic-reel-3', config: { ...config, publicReply: 'Nova resposta' } }, f.automation.id, f.automation.revision);
      else await setAutomationStatus(db, f.account.id, f.automation.id, 'paused', f.automation.revision);
      expect(await db.deliveryIntent.count({ where: { accountId: f.account.id, status: 'canceled' } })).toBe(2);
      await sweepDeliveryAccount(db, f.vault, undefined, f.account.id);
      expect(await db.syntheticEffect.count({ where: { accountId: f.account.id } })).toBe(0);
    }
    const f = await fixture();
    const saved = await saveAutomation(db, f.account.id, { name: 'Somente privada', mediaId: 'synthetic-reel-3', config: { ...config, publicReplyEnabled: false } }, f.automation.id, f.automation.revision);
    await setAutomationStatus(db, f.account.id, f.automation.id, 'active', saved.revision); await process(f.account.id, f.event.id);
    expect(await db.deliveryIntent.count({ where: { accountId: f.account.id } })).toBe(1);
    expect((await db.deliveryIntent.findFirstOrThrow({ where: { accountId: f.account.id } })).effect).toBe('private_reply');
  });
  it('falha no job público reverte privada/job/mensagem/processedAt juntos', async () => {
    const f = await fixture();
    const functionName = `fail_public_${randomUUID().replaceAll('-', '')}`, triggerName = `${functionName}_trigger`;
    await db.$executeRawUnsafe(`CREATE FUNCTION ${functionName}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.name = '${DELIVERY_QUEUE}' AND NEW.data->>'accountId' = '${f.account.id}' AND EXISTS (SELECT 1 FROM "DeliveryIntent" WHERE id = (NEW.data->>'intentId')::uuid AND "accountId" = '${f.account.id}'::uuid AND effect = 'public_reply') THEN RAISE EXCEPTION 'synthetic public failure'; END IF; RETURN NEW; END $$`);
    await db.$executeRawUnsafe(`CREATE TRIGGER ${triggerName} BEFORE INSERT ON pgboss.job FOR EACH ROW EXECUTE FUNCTION ${functionName}()`);
    try {
      await expect(process(f.account.id, f.event.id)).rejects.toThrow();
      expect(await db.deliveryIntent.count({ where: { accountId: f.account.id } })).toBe(0);
      expect(await db.message.count({ where: { accountId: f.account.id } })).toBe(0);
      expect((await db.inboundEvent.findUniqueOrThrow({ where: { accountId_id: { accountId: f.account.id, id: f.event.id } } })).processedAt).toBeNull();
      expect((await db.$queryRaw<{ count: number }[]>`SELECT COUNT(*)::integer AS count FROM pgboss.job WHERE data->>'accountId' = ${f.account.id}`)[0].count).toBe(0);
    } finally {
      await db.$executeRawUnsafe(`DROP TRIGGER ${triggerName} ON pgboss.job`); await db.$executeRawUnsafe(`DROP FUNCTION ${functionName}()`);
    }
    await process(f.account.id, f.event.id); await sweepDeliveryAccount(db, f.vault, undefined, f.account.id);
    expect(await db.syntheticEffect.count({ where: { accountId: f.account.id } })).toBe(2);
  });
});
