import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPrisma } from '../../src/shared/db';
import { createBoss } from '../../src/jobs/queue';
import { DAY, DELIVERY_QUEUE } from '../../src/modules/delivery/ledger';
import { emptyRecipe } from '../../src/modules/automations/recipe';
import { saveAutomation, setAutomationStatus } from '../../src/modules/automations/service';
import { decideAutomation } from '../../src/modules/automations/decision';
import { processInboxEvent } from '../../src/modules/inbox/ingestion';
import { setAccountPause, setConversationControl } from '../../src/modules/inbox/control';
import { sweepDeliveryAccount } from '../../src/jobs/delivery';
import { deliveryFixture } from '../helpers/delivery-fixture';

const db = createPrisma(), boss = createBoss();
const config = { ...emptyRecipe, terms: ['ajuda', 'parar', 'sair'], introduction: 'Resposta textual configurada' };
const processEvent = (accountId: string, eventId: string) => processInboxEvent(db, { accountId, eventId }, (tx, context) => decideAutomation(tx, boss, context));
async function fixture(trigger: 'message' | 'story' = 'message') {
  const f = await deliveryFixture(db, new Date(), trigger);
  const draft = await saveAutomation(db, f.account.id, { name: trigger, trigger, mediaId: null, config }, f.automation.id, 1);
  const automation = await setAutomationStatus(db, f.account.id, draft.id, 'active', draft.revision);
  await db.inboundEvent.update({ where: { accountId_id: { accountId: f.account.id, id: f.event.id } }, data: {
    payload: { actorId: f.contact.igScopedUserId, text: 'Quero AJUDA!', echo: false, mediaId: null, buttonPayload: null },
  } });
  return { ...f, automation };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function inbound(f: Fixture, text: string | null, kind = 'message', patch: { echo?: boolean; generation?: number; actorId?: string; occurredAt?: Date } = {}) {
  const event = await db.inboundEvent.create({ data: { accountId: f.account.id, kind, externalId: `${kind}:${randomUUID()}`,
    generation: patch.generation ?? 1, occurredAt: patch.occurredAt ?? new Date(), payload: {
      actorId: patch.actorId ?? f.contact.igScopedUserId, text, echo: patch.echo ?? false, mediaId: null, buttonPayload: null,
    } } });
  await processEvent(f.account.id, event.id); return event;
}
beforeAll(async () => { await boss.start(); await boss.createQueue(DELIVERY_QUEUE); });
beforeEach(() => { vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Rede externa proibida.')); });
afterEach(() => { expect(vi.mocked(globalThis.fetch).mock.calls).toHaveLength(0); vi.restoreAllMocks(); });
afterAll(async () => { await boss.stop(); await db.$disconnect(); });

describe('PF-024-L: DM/story e supressão transacional', () => {
  it('gatilhos distintos, texto editável, replay concorrente e contas isoladas', async () => {
    const a = await fixture(), b = await fixture('story');
    await db.inboundEvent.update({ where: { accountId_id: { accountId: b.account.id, id: b.event.id } }, data: { externalId: a.event.externalId } });
    await Promise.all([processEvent(a.account.id, a.event.id), processEvent(a.account.id, a.event.id), processEvent(b.account.id, b.event.id)]);
    for (const f of [a, b]) {
      const intents = await db.deliveryIntent.findMany({ where: { accountId: f.account.id } });
      expect(intents).toHaveLength(1); expect(intents[0].effect).toBe('automatic_dm');
      expect(intents[0].body).toEqual({ text: config.introduction });
      await sweepDeliveryAccount(db, f.vault, undefined, f.account.id); await processEvent(f.account.id, f.event.id);
      expect(await db.syntheticEffect.count({ where: { accountId: f.account.id } })).toBe(1);
    }
    await inbound(a, 'ajuda', 'story'); await inbound(b, 'ajuda', 'message');
    expect(await db.deliveryIntent.count({ where: { accountId: a.account.id } })).toBe(1);
    expect(await db.deliveryIntent.count({ where: { accountId: b.account.id } })).toBe(1);
  });
  it('echo/sem texto/self/geração antiga/palavra parcial/pausa/manual não disparam', async () => {
    for (const reason of ['echo', 'empty', 'self', 'old', 'partial', 'paused', 'manual']) {
      const f = await fixture('story');
      if (reason === 'paused') await setAccountPause(db, f.account.id, true);
      if (reason === 'manual') await setConversationControl(db, f.account.id, f.conversation.id, 'manual');
      await inbound(f, reason === 'empty' ? null : reason === 'partial' ? 'ajudas' : 'ajuda', 'story', {
        echo: reason === 'echo', generation: reason === 'old' ? 0 : 1, actorId: reason === 'self' ? f.account.professionalId : f.contact.igScopedUserId,
      });
      expect(await db.deliveryIntent.count({ where: { accountId: f.account.id } }), reason).toBe(0);
    }
  });
  it('PARAR/SAIR cancelam pendentes sem resposta e sobrevivem a novas entradas/geração; B segue', async () => {
    for (const command of [' PARAR! ', 'sair']) {
      const a = await fixture(), b = await fixture(); await processEvent(a.account.id, a.event.id);
      const stop = await inbound(a, command, command.includes('PARAR') ? 'message' : 'story');
      await processEvent(a.account.id, stop.id);
      const contact = await db.contact.findUniqueOrThrow({ where: { accountId_id: { accountId: a.account.id, id: a.contact.id } } });
      expect(contact.suppressedAt).not.toBeNull();
      expect(await db.deliveryIntent.count({ where: { accountId: a.account.id } })).toBe(1);
      expect((await db.deliveryIntent.findFirstOrThrow({ where: { accountId: a.account.id } })).status).toBe('canceled');
      await inbound(a, 'ajuda');
      await db.instagramAccount.update({ where: { id: a.account.id }, data: { connectionGeneration: 2 } });
      await inbound(a, 'ajuda', 'message', { generation: 2 });
      await sweepDeliveryAccount(db, a.vault, undefined, a.account.id);
      expect(await db.syntheticEffect.count({ where: { accountId: a.account.id } })).toBe(0);
      expect((await db.contact.findUniqueOrThrow({ where: { accountId_id: { accountId: a.account.id, id: a.contact.id } } })).suppressedAt).toEqual(contact.suppressedAt);
      await processEvent(b.account.id, b.event.id); await sweepDeliveryAccount(db, b.vault, undefined, b.account.id);
      expect(await db.syntheticEffect.count({ where: { accountId: b.account.id } })).toBe(1);
    }
  });
  it('opt-out vale durante pausa/manual; echo/obsoleto/comentário/frase não suprimem', async () => {
    for (const control of ['paused', 'manual']) {
      const f = await fixture();
      if (control === 'paused') await setAccountPause(db, f.account.id, true);
      else await setConversationControl(db, f.account.id, f.conversation.id, 'manual');
      await inbound(f, 'SAIR');
      expect((await db.contact.findUniqueOrThrow({ where: { accountId_id: { accountId: f.account.id, id: f.contact.id } } })).suppressedAt).not.toBeNull();
    }
    for (const reason of ['echo', 'old', 'comment', 'phrase']) {
      const f = await fixture(); await inbound(f, reason === 'phrase' ? 'quero parar depois' : 'PARAR', reason === 'comment' ? 'comment' : 'message', { echo: reason === 'echo', generation: reason === 'old' ? 0 : 1 });
      expect((await db.contact.findUniqueOrThrow({ where: { accountId_id: { accountId: f.account.id, id: f.contact.id } } })).suppressedAt, reason).toBeNull();
    }
  });
  it('janela vencida bloqueia no executor, edição/pausa impedem efeito e conflito é por gatilho', async () => {
    const f = await fixture();
    const other = await saveAutomation(db, f.account.id, { name: 'Outra DM', trigger: 'message', config });
    await expect(setAutomationStatus(db, f.account.id, other.id, 'active', other.revision)).rejects.toMatchObject({ status: 409 });
    const story = await saveAutomation(db, f.account.id, { name: 'Story', trigger: 'story', config });
    await setAutomationStatus(db, f.account.id, story.id, 'active', story.revision);
    await inbound(f, 'ajuda', 'message', { occurredAt: new Date(Date.now() - DAY - 1000) });
    await sweepDeliveryAccount(db, f.vault, undefined, f.account.id);
    expect((await db.deliveryIntent.findFirstOrThrow({ where: { accountId: f.account.id } })).status).toBe('expired');
    await processEvent(f.account.id, f.event.id); await setAccountPause(db, f.account.id, true);
    await sweepDeliveryAccount(db, f.vault, undefined, f.account.id);
    expect(await db.syntheticEffect.count({ where: { accountId: f.account.id } })).toBe(0);
  });
  it('falha PostgreSQL no opt-out reverte preferência/cancelamento/mensagem/processedAt', async () => {
    const f = await fixture(); await processEvent(f.account.id, f.event.id);
    const event = await db.inboundEvent.create({ data: { accountId: f.account.id, kind: 'message', externalId: `message:${randomUUID()}`, generation: 1, occurredAt: new Date(),
      payload: { actorId: f.contact.igScopedUserId, text: 'PARAR', echo: false, mediaId: null, buttonPayload: null } } });
    const fn = `fail_stop_${randomUUID().replaceAll('-', '')}`;
    await db.$executeRawUnsafe(`CREATE FUNCTION ${fn}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."accountId" = '${f.account.id}' THEN RAISE EXCEPTION 'synthetic failure'; END IF; RETURN NEW; END $$`);
    await db.$executeRawUnsafe(`CREATE TRIGGER ${fn} BEFORE UPDATE ON "DeliveryIntent" FOR EACH ROW EXECUTE FUNCTION ${fn}()`);
    try {
      await expect(processEvent(f.account.id, event.id)).rejects.toThrow();
      expect((await db.contact.findUniqueOrThrow({ where: { accountId_id: { accountId: f.account.id, id: f.contact.id } } })).suppressedAt).toBeNull();
      expect((await db.deliveryIntent.findFirstOrThrow({ where: { accountId: f.account.id } })).status).toBe('pending');
      expect((await db.inboundEvent.findUniqueOrThrow({ where: { accountId_id: { accountId: f.account.id, id: event.id } } })).processedAt).toBeNull();
    } finally {
      await db.$executeRawUnsafe(`DROP TRIGGER ${fn} ON "DeliveryIntent"`); await db.$executeRawUnsafe(`DROP FUNCTION ${fn}()`);
    }
    await processEvent(f.account.id, event.id); expect(await db.message.count({ where: { accountId: f.account.id } })).toBe(2);
    expect((await db.deliveryIntent.findFirstOrThrow({ where: { accountId: f.account.id } })).status).toBe('canceled');
  });
});
