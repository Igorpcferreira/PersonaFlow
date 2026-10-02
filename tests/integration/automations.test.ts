import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPrisma } from '../../src/shared/db';
import { createBoss } from '../../src/jobs/queue';
import { DELIVERY_QUEUE } from '../../src/modules/delivery/ledger';
import { saveAutomation, setAutomationStatus } from '../../src/modules/automations/service';
import { emptyRecipe } from '../../src/modules/automations/recipe';
import { decideAutomation } from '../../src/modules/automations/decision';
import { processInboxEvent } from '../../src/modules/inbox/ingestion';
import { sweepDeliveryAccount } from '../../src/jobs/delivery';
import { deliveryFixture } from '../helpers/delivery-fixture';

const db = createPrisma(), boss = createBoss();
const config = { ...emptyRecipe, terms: ['site'], introduction: 'Apresentação configurada', finalMessage: 'Final configurado', link: 'https://example.invalid/configurado' };
async function fixture() {
  const f = await deliveryFixture(db);
  const draft = await saveAutomation(db, f.account.id, { name: 'Reel configurável', mediaId: 'synthetic-reel-1', config }, f.automation.id, 1);
  const active = await setAutomationStatus(db, f.account.id, draft.id, 'active', draft.revision);
  await db.inboundEvent.update({ where: { accountId_id: { accountId: f.account.id, id: f.event.id } },
    data: { payload: { actorId: f.contact.igScopedUserId, text: 'Quero o SITE!', mediaId: 'synthetic-reel-1', echo: false, buttonPayload: null } } });
  return { ...f, automation: active };
}
const process = (accountId: string, eventId: string) => processInboxEvent(db, { accountId, eventId }, (tx, context) => decideAutomation(tx, boss, context));
beforeAll(async () => { await boss.start(); await boss.createQueue(DELIVERY_QUEUE); });
beforeEach(() => { vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Rede externa proibida.')); });
afterEach(() => { expect(vi.mocked(globalThis.fetch).mock.calls).toHaveLength(0); vi.restoreAllMocks(); });
afterAll(async () => { await boss.stop(); await db.$disconnect(); });
describe('PF-023-L: receita transacional PostgreSQL', () => {
  it('comentário de prévia aceita uma única DM sem link nem sequência', async () => {
    const f = await fixture();
    const pilot = { ...emptyRecipe, terms: ['prévia'], introduction: 'Me mande o Instagram do negócio ou fotos.' };
    const draft = await saveAutomation(db, f.account.id, { name: 'Prévia Kyber', mediaId: 'synthetic-reel-1', config: pilot }, f.automation.id, f.automation.revision);
    await setAutomationStatus(db, f.account.id, draft.id, 'active', draft.revision);
    await db.inboundEvent.update({ where: { accountId_id: { accountId: f.account.id, id: f.event.id } },
      data: { payload: { actorId: f.contact.igScopedUserId, text: 'Quero uma prévia!', mediaId: 'synthetic-reel-1', echo: false, buttonPayload: null } } });
    await process(f.account.id, f.event.id);
    const intents = await db.deliveryIntent.findMany({ where: { accountId: f.account.id } });
    expect(intents).toHaveLength(1);
    expect(intents[0].effect).toBe('private_reply');
    expect(intents[0].body).toEqual({ text: pilot.introduction });
  });
  it('comentário concorrente/replay gera uma intenção/job/efeito com textos configurados; A não escreve B', async () => {
    const a = await fixture(), b = await fixture();
    await Promise.all([1, 2, 3].map(() => process(a.account.id, a.event.id)));
    expect(await db.deliveryIntent.count({ where: { accountId: a.account.id } })).toBe(1);
    expect(await db.deliveryIntent.count({ where: { accountId: b.account.id } })).toBe(0);
    const intent = await db.deliveryIntent.findFirstOrThrow({ where: { accountId: a.account.id } });
    expect(intent.body).toEqual({ text: `${config.introduction}\n${config.finalMessage}\n${config.link}`, link: config.link });
    await sweepDeliveryAccount(db, a.vault, undefined, a.account.id);
    await process(a.account.id, a.event.id);
    expect(await db.syntheticEffect.count({ where: { accountId: a.account.id } })).toBe(1);
    expect(await db.syntheticEffect.count({ where: { accountId: b.account.id } })).toBe(0);
  });
  it('conflito/edição obsoleta/IDs cruzados são rejeitados; editar cancela revisão pendente', async () => {
    const a = await fixture(), b = await fixture();
    const other = await saveAutomation(db, a.account.id, { name: 'Conflito', mediaId: 'synthetic-reel-1', config });
    await expect(setAutomationStatus(db, a.account.id, other.id, 'active', other.revision)).rejects.toMatchObject({ status: 409 });
    await expect(saveAutomation(db, b.account.id, { name: 'Cruzado', mediaId: 'synthetic-reel-1', config }, a.automation.id, a.automation.revision)).rejects.toMatchObject({ status: 404 });
    await process(a.account.id, a.event.id);
    const updated = await saveAutomation(db, a.account.id, { name: 'Edição', mediaId: 'synthetic-reel-1', config: { ...config, introduction: 'Novo texto' } }, a.automation.id, a.automation.revision);
    expect(updated.status).toBe('draft');
    expect((await db.deliveryIntent.findFirstOrThrow({ where: { accountId: a.account.id } })).status).toBe('canceled');
    await expect(saveAutomation(db, a.account.id, { name: 'Tardia', mediaId: 'synthetic-reel-1', config }, a.automation.id, a.automation.revision)).rejects.toMatchObject({ status: 409 });
    await sweepDeliveryAccount(db, a.vault, undefined, a.account.id);
    expect(await db.syntheticEffect.count({ where: { accountId: a.account.id } })).toBe(0);
  });
  it('self-comment, echo, outro reel, palavra parcial, pausa e geração obsoleta não disparam', async () => {
    for (const reason of ['self', 'echo', 'media', 'partial', 'pause', 'generation']) {
      const f = await fixture();
      const payload = { actorId: reason === 'self' ? f.account.professionalId : f.contact.igScopedUserId,
        text: reason === 'partial' ? 'website' : 'site', mediaId: reason === 'media' ? 'synthetic-reel-2' : 'synthetic-reel-1', echo: reason === 'echo', buttonPayload: null };
      await db.inboundEvent.update({ where: { accountId_id: { accountId: f.account.id, id: f.event.id } }, data: { payload } });
      if (reason === 'pause') await db.instagramAccount.update({ where: { id: f.account.id }, data: { pausedAt: new Date() } });
      if (reason === 'generation') await db.instagramAccount.update({ where: { id: f.account.id }, data: { connectionGeneration: 2 } });
      await process(f.account.id, f.event.id);
      expect(await db.deliveryIntent.count({ where: { accountId: f.account.id } }), reason).toBe(0);
    }
  });
  it('falha real ao inserir job reverte mensagem/decisão/processedAt; retry processa uma vez', async () => {
    const f = await fixture();
    const functionName = `fail_recipe_${randomUUID().replaceAll('-', '')}`, triggerName = `${functionName}_trigger`;
    await db.$executeRawUnsafe(`CREATE FUNCTION ${functionName}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.data->>'accountId' = '${f.account.id}' AND NEW.name = '${DELIVERY_QUEUE}' THEN RAISE EXCEPTION 'synthetic failure'; END IF; RETURN NEW; END $$`);
    await db.$executeRawUnsafe(`CREATE TRIGGER ${triggerName} BEFORE INSERT ON pgboss.job FOR EACH ROW EXECUTE FUNCTION ${functionName}()`);
    try {
      await expect(process(f.account.id, f.event.id)).rejects.toThrow();
      expect(await db.message.count({ where: { accountId: f.account.id } })).toBe(0);
      expect(await db.deliveryIntent.count({ where: { accountId: f.account.id } })).toBe(0);
      expect((await db.inboundEvent.findUniqueOrThrow({ where: { accountId_id: { accountId: f.account.id, id: f.event.id } } })).processedAt).toBeNull();
    } finally {
      await db.$executeRawUnsafe(`DROP TRIGGER ${triggerName} ON pgboss.job`);
      await db.$executeRawUnsafe(`DROP FUNCTION ${functionName}()`);
    }
    await process(f.account.id, f.event.id);
    await sweepDeliveryAccount(db, f.vault, undefined, f.account.id);
    expect(await db.message.count({ where: { accountId: f.account.id } })).toBe(1);
    expect(await db.deliveryIntent.count({ where: { accountId: f.account.id } })).toBe(1);
    expect(await db.syntheticEffect.count({ where: { accountId: f.account.id } })).toBe(1);
  });
});
