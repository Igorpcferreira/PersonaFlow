import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPrisma } from '../../src/shared/db';
import { createBoss } from '../../src/jobs/queue';
import { DAY, DELIVERY_QUEUE } from '../../src/modules/delivery/ledger';
import { emptyRecipe } from '../../src/modules/automations/recipe';
import { saveAutomation, setAutomationStatus } from '../../src/modules/automations/service';
import { decideAutomation } from '../../src/modules/automations/decision';
import { processInboxEvent } from '../../src/modules/inbox/ingestion';
import { sequencePayload } from '../../src/modules/automations/sequence-profile';
import { sequenceAction, listSequences } from '../../src/modules/automations/sequence-service';
import { sweepDeliveryAccount } from '../../src/jobs/delivery';
import { deliveryFixture } from '../helpers/delivery-fixture';
import type { WebhookApp } from '../../src/integrations/meta/webhook';

const db = createPrisma(), boss = createBoss();
const app: WebhookApp = { kind: 'synthetic', alias: 'simulation', secret: 'synthetic-sequence-secret-'.repeat(2), verifyToken: 'synthetic-sequence-verify-'.repeat(2) };
const config = { ...emptyRecipe, terms: ['site'], introduction: 'Introdução configurada da sequência', buttonEnabled: true,
  buttonTitle: 'Avançar configurado', followRequired: true, followPrompt: 'Pedido configurado para seguir', finalMessage: 'Final configurado', link: 'https://example.invalid/sequence' };
const process = (accountId: string, eventId: string) => processInboxEvent(db, { accountId, eventId }, (tx, context) => decideAutomation(tx, boss, context));
async function fixture(followRequired = true, publicReplyEnabled = false) {
  const f = await deliveryFixture(db);
  await db.conversation.update({ where: { accountId_id: { accountId: f.account.id, id: f.conversation.id } }, data: { lastEligibleInboundAt: null } });
  const draft = await saveAutomation(db, f.account.id, { name: 'Sequência configurável', mediaId: 'synthetic-reel-2', config: { ...config, followRequired, publicReplyEnabled, publicReply: publicReplyEnabled ? 'Pública configurada' : '' } }, f.automation.id, 1);
  const automation = await setAutomationStatus(db, f.account.id, draft.id, 'active', draft.revision);
  await db.inboundEvent.update({ where: { accountId_id: { accountId: f.account.id, id: f.event.id } }, data: {
    payload: { actorId: f.contact.igScopedUserId, text: 'site', mediaId: 'synthetic-reel-2', echo: false, buttonPayload: null },
  } });
  return { ...f, automation };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function start(f: Fixture) {
  await process(f.account.id, f.event.id); await sweepDeliveryAccount(db, f.vault, undefined, f.account.id);
  return db.sequenceRun.findFirstOrThrow({ where: { accountId: f.account.id } });
}
async function interact(f: Fixture, runId: string, consent = true, changes: { occurredAt?: Date; generation?: number; actorId?: string; echo?: boolean; buttonPayload?: string } = {}) {
  const event = await db.inboundEvent.create({ data: { accountId: f.account.id, externalId: `postback:${randomUUID()}`, kind: 'postback',
    generation: changes.generation ?? f.account.connectionGeneration, occurredAt: changes.occurredAt ?? new Date(),
    payload: { actorId: changes.actorId ?? f.contact.igScopedUserId, text: null, mediaId: null, echo: changes.echo ?? false, buttonPayload: changes.buttonPayload ?? sequencePayload(runId, consent) } } });
  await process(f.account.id, event.id); return event;
}
const profile = (f: Fixture, runId: string, state: 'true' | 'false' | 'unknown' | 'error') => sequenceAction(db, boss, app, f.account.id, { action: 'profile', runId, state });
const runOf = (f: Fixture) => db.sequenceRun.findFirstOrThrow({ where: { accountId: f.account.id } });
beforeAll(async () => { await boss.start(); await boss.createQueue(DELIVERY_QUEUE); });
beforeEach(() => { vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Rede externa proibida.')); });
afterEach(() => { expect(vi.mocked(globalThis.fetch).mock.calls).toHaveLength(0); vi.restoreAllMocks(); });
afterAll(async () => { await boss.stop(); await db.$disconnect(); });

describe('PF-104-L: sequência/follow PostgreSQL sem rede/polling', () => {
  it('introdução/botão/pública próprios por comentário/conta; comentário não abre janela nem consulta perfil', async () => {
    const a = await fixture(true, true), b = await fixture(true, true);
    await db.inboundEvent.update({ where: { accountId_id: { accountId: b.account.id, id: b.event.id } }, data: { externalId: a.event.externalId } });
    await Promise.all([process(a.account.id, a.event.id), process(a.account.id, a.event.id), process(b.account.id, b.event.id)]);
    for (const f of [a, b]) {
      expect(await db.sequenceRun.count({ where: { accountId: f.account.id } })).toBe(1);
      expect((await runOf(f)).profileChecks).toBe(0);
      expect((await db.conversation.findUniqueOrThrow({ where: { accountId_id: { accountId: f.account.id, id: f.conversation.id } } })).lastEligibleInboundAt).toBeNull();
      const intents = await db.deliveryIntent.findMany({ where: { accountId: f.account.id } });
      expect(intents.map((intent) => intent.effect).sort()).toEqual(['button', 'private_reply', 'public_reply']);
      expect(intents.find((intent) => intent.effect === 'private_reply')!.body).toEqual({ text: config.introduction });
      expect(intents.find((intent) => intent.effect === 'button')!.body).toEqual({ text: config.buttonTitle, button: { title: config.buttonTitle, payload: sequencePayload((await runOf(f)).id) } });
      await sweepDeliveryAccount(db, f.vault, undefined, f.account.id); await process(f.account.id, f.event.id);
      expect(await db.syntheticEffect.count({ where: { accountId: f.account.id } })).toBe(3);
    }
    const aIntent = await db.deliveryIntent.findFirstOrThrow({ where: { accountId: a.account.id } });
    await expect(db.deliveryIntent.update({ where: { accountId_id: { accountId: a.account.id, id: aIntent.id } }, data: { sequenceRunId: (await runOf(b)).id } })).rejects.toThrow();
    await expect(profile(b, (await runOf(a)).id, 'true')).rejects.toMatchObject({ status: 404 });
  });
  it('sem consentimento não lê; false pede seguir, mudança isolada não envia; nova interação true libera um link', async () => {
    const f = await fixture(), run = await start(f);
    await profile(f, run.id, 'false');
    const before = await db.conversation.findUniqueOrThrow({ where: { accountId_id: { accountId: f.account.id, id: f.conversation.id } } });
    expect(before.lastEligibleInboundAt).toBeNull(); expect((await runOf(f)).profileChecks).toBe(0);
    await interact(f, run.id, false); expect((await runOf(f)).profileChecks).toBe(0);
    expect((await runOf(f)).state).toBe('consent_required');
    const first = await interact(f, run.id); await sweepDeliveryAccount(db, f.vault, undefined, f.account.id);
    expect(await runOf(f)).toMatchObject({ state: 'follow_false', followState: 'false', profileChecks: 1 });
    expect((await db.deliveryIntent.findFirstOrThrow({ where: { accountId: f.account.id, effect: 'automatic_dm' } })).body).toEqual({ text: config.followPrompt });
    const eligibleAt = (await db.conversation.findUniqueOrThrow({ where: { accountId_id: { accountId: f.account.id, id: f.conversation.id } } })).lastEligibleInboundAt;
    await profile(f, run.id, 'true'); await sweepDeliveryAccount(db, f.vault, undefined, f.account.id);
    expect((await runOf(f)).profileChecks).toBe(1);
    expect((await db.conversation.findUniqueOrThrow({ where: { accountId_id: { accountId: f.account.id, id: f.conversation.id } } })).lastEligibleInboundAt).toEqual(eligibleAt);
    expect(await db.deliveryIntent.count({ where: { accountId: f.account.id, effect: 'link' } })).toBe(0);
    await process(f.account.id, first.id); expect((await runOf(f)).profileChecks).toBe(1);
    const next = await interact(f, run.id); await sweepDeliveryAccount(db, f.vault, undefined, f.account.id);
    const link = await db.deliveryIntent.findFirstOrThrow({ where: { accountId: f.account.id, effect: 'link' } });
    expect(link).toMatchObject({ status: 'accepted', idempotencyKey: `${f.event.externalId}:link` });
    expect(link.body).toEqual({ text: `${config.finalMessage}\n${config.link}`, link: config.link });
    expect((await runOf(f)).profileChecks).toBe(3); // false/decisão true/reserva true, sem polling.
    await Promise.all([process(f.account.id, next.id), interact(f, run.id), interact(f, run.id)]);
    await sweepDeliveryAccount(db, f.vault, undefined, f.account.id);
    expect((await runOf(f)).profileChecks).toBe(3);
    expect(await db.deliveryIntent.count({ where: { accountId: f.account.id, effect: 'link' } })).toBe(1);
    expect(await db.syntheticEffect.count({ where: { accountId: f.account.id, intentId: link.id } })).toBe(1);
  });
  it('unknown e erro não viram false nem liberam/pedem link; sem polling e só nova interação reconsulta', async () => {
    for (const state of ['unknown', 'error'] as const) {
      const f = await fixture(), run = await start(f); await profile(f, run.id, state);
      const event = await interact(f, run.id); await sweepDeliveryAccount(db, f.vault, undefined, f.account.id);
      expect(await runOf(f)).toMatchObject({ state: 'follow_unknown', followState: 'unknown', profileChecks: 1 });
      expect(await db.deliveryIntent.count({ where: { accountId: f.account.id, effect: { in: ['link', 'automatic_dm'] } } })).toBe(0);
      await profile(f, run.id, 'true');
      for (let repeat = 0; repeat < 2; repeat += 1) { await process(f.account.id, event.id); await sweepDeliveryAccount(db, f.vault, undefined, f.account.id); }
      expect((await runOf(f)).profileChecks).toBe(1);
      await interact(f, run.id); await sweepDeliveryAccount(db, f.vault, undefined, f.account.id);
      expect((await runOf(f)).profileChecks).toBe(3);
      expect(await db.syntheticEffect.count({ where: { accountId: f.account.id } })).toBe(3);
    }
  });
  it('botão incerto tem efeito próprio terminal e não permite consulta/link ou reenvio', async () => {
    const f = await fixture(); await process(f.account.id, f.event.id);
    const run = await runOf(f);
    await db.deliveryIntent.updateMany({ where: { accountId: f.account.id, effect: 'button' }, data: { simulationOutcome: 'timeout' } });
    await sweepDeliveryAccount(db, f.vault, undefined, f.account.id);
    await profile(f, run.id, 'true'); await interact(f, run.id); await process(f.account.id, f.event.id);
    await sweepDeliveryAccount(db, f.vault, undefined, f.account.id);
    expect((await db.deliveryIntent.findFirstOrThrow({ where: { accountId: f.account.id, effect: 'button' } })).status).toBe('unknown');
    expect((await runOf(f)).profileChecks).toBe(0);
    expect(await db.deliveryIntent.count({ where: { accountId: f.account.id, effect: 'link' } })).toBe(0);
    expect(await db.syntheticEffect.count({ where: { accountId: f.account.id } })).toBe(2);
    expect((await listSequences(db, f.account.id))[0].canInteract).toBe(false);
  });
  it('sem follow gate o botão abre interação elegível e libera link sem consultar perfil', async () => {
    const f = await fixture(false), run = await start(f);
    await interact(f, run.id, false); await sweepDeliveryAccount(db, f.vault, undefined, f.account.id);
    expect((await runOf(f)).profileChecks).toBe(0);
    expect((await db.deliveryIntent.findFirstOrThrow({ where: { accountId: f.account.id, effect: 'link' } })).status).toBe('accepted');
  });
  it('contato/conta/geração/revisão/controle/pausa/echo/janela/UUID inválidos impedem consulta e link', async () => {
    for (const reason of ['contact', 'account', 'generation', 'revision', 'control', 'pause', 'echo', 'window', 'uuid', 'expired']) {
      const f = await fixture(), run = await start(f); await profile(f, run.id, 'true');
      let target = f;
      if (reason === 'account') target = await fixture();
      if (reason === 'generation') await db.instagramAccount.update({ where: { id: f.account.id }, data: { connectionGeneration: 2 } });
      if (reason === 'pause') await db.instagramAccount.update({ where: { id: f.account.id }, data: { pausedAt: new Date() } });
      if (reason === 'control') await db.conversation.update({ where: { accountId_id: { accountId: f.account.id, id: f.conversation.id } }, data: { control: 'manual', controlVersion: 1 } });
      if (reason === 'revision') await saveAutomation(db, f.account.id, { name: 'Revisada', mediaId: 'synthetic-reel-2', config }, f.automation.id, f.automation.revision);
      if (reason === 'expired') await db.accountCredential.update({ where: { accountId: f.account.id }, data: { expiresAt: new Date(Date.now() - 1) } });
      await interact(target, run.id, true, { ...(reason === 'contact' ? { actorId: 'another-fictitious-contact' } : {}),
        ...(reason === 'echo' ? { echo: true } : {}), ...(reason === 'window' ? { occurredAt: new Date(Date.now() - DAY) } : {}),
        ...(reason === 'uuid' ? { buttonPayload: `sequence:${'-'.repeat(36)}:consent` } : {}) });
      expect((await runOf(f)).profileChecks, reason).toBe(0);
      expect(await db.deliveryIntent.count({ where: { accountId: f.account.id, effect: 'link' } }), reason).toBe(0);
    }
  });
  it('follow é conferido outra vez antes do transporte; condição alterada bloqueia sem efeito/retry', async () => {
    const f = await fixture(), run = await start(f); await profile(f, run.id, 'true'); await interact(f, run.id);
    expect((await runOf(f)).profileChecks).toBe(1);
    await profile(f, run.id, 'false'); await sweepDeliveryAccount(db, f.vault, undefined, f.account.id);
    const link = await db.deliveryIntent.findFirstOrThrow({ where: { accountId: f.account.id, effect: 'link' } });
    expect(link).toMatchObject({ status: 'blocked', reason: 'follow_unverified' });
    expect(await db.deliveryAttempt.count({ where: { accountId: f.account.id, intentId: link.id } })).toBe(0);
    expect(await db.syntheticEffect.count({ where: { accountId: f.account.id } })).toBe(2);
    expect((await runOf(f)).profileChecks).toBe(2);
    await profile(f, run.id, 'true'); await interact(f, run.id); await sweepDeliveryAccount(db, f.vault, undefined, f.account.id);
    expect(await db.syntheticEffect.count({ where: { accountId: f.account.id } })).toBe(2);
    expect((await listSequences(db, f.account.id))[0]).toMatchObject({ state: 'link_blocked', canInteract: false });
  });
  it('intenção limitada não consulta perfil a cada manutenção; revalida apenas ao reservar', async () => {
    const f = await fixture(), run = await start(f); await profile(f, run.id, 'true');
    await db.accountLimit.update({ where: { accountId: f.account.id }, data: { quota: 2 } });
    await interact(f, run.id);
    expect((await runOf(f)).profileChecks).toBe(1);
    for (let scan = 0; scan < 3; scan += 1) await sweepDeliveryAccount(db, f.vault, undefined, f.account.id);
    expect((await runOf(f)).profileChecks).toBe(1);
    expect((await db.deliveryIntent.findFirstOrThrow({ where: { accountId: f.account.id, effect: 'link' } })).reason).toBe('account_limit');
    await sweepDeliveryAccount(db, f.vault, undefined, f.account.id, new Date(Date.now() + 60_000));
    expect((await runOf(f)).profileChecks).toBe(2);
    expect((await db.deliveryIntent.findFirstOrThrow({ where: { accountId: f.account.id, effect: 'link' } })).status).toBe('accepted');
  });
  it('link com resposta perdida continua unknown após novo cliente/interações, sem reenvio', async () => {
    const f = await fixture(), run = await start(f); await profile(f, run.id, 'true'); await interact(f, run.id);
    await db.deliveryIntent.updateMany({ where: { accountId: f.account.id, effect: 'link' }, data: { simulationOutcome: 'timeout' } });
    await sweepDeliveryAccount(db, f.vault, undefined, f.account.id);
    const restarted = createPrisma();
    try { await sweepDeliveryAccount(restarted, f.vault, undefined, f.account.id); expect((await listSequences(restarted, f.account.id))[0].state).toBe('link_unknown'); }
    finally { await restarted.$disconnect(); }
    await interact(f, run.id); await sweepDeliveryAccount(db, f.vault, undefined, f.account.id);
    expect(await db.deliveryAttempt.count({ where: { accountId: f.account.id, intent: { effect: 'link' } } })).toBe(1);
    expect(await db.syntheticEffect.count({ where: { accountId: f.account.id } })).toBe(3);
  });
  it('falha no job do botão reverte run/introdução/job/mensagem; reparo processa uma vez', async () => {
    const f = await fixture(), functionName = `fail_button_${randomUUID().replaceAll('-', '')}`, triggerName = `${functionName}_trigger`;
    await db.$executeRawUnsafe(`CREATE FUNCTION ${functionName}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.name = '${DELIVERY_QUEUE}' AND NEW.data->>'accountId' = '${f.account.id}' AND EXISTS (SELECT 1 FROM "DeliveryIntent" WHERE id = (NEW.data->>'intentId')::uuid AND "accountId" = '${f.account.id}'::uuid AND effect = 'button') THEN RAISE EXCEPTION 'synthetic button failure'; END IF; RETURN NEW; END $$`);
    await db.$executeRawUnsafe(`CREATE TRIGGER ${triggerName} BEFORE INSERT ON pgboss.job FOR EACH ROW EXECUTE FUNCTION ${functionName}()`);
    try {
      await expect(process(f.account.id, f.event.id)).rejects.toThrow();
      expect(await db.sequenceRun.count({ where: { accountId: f.account.id } })).toBe(0);
      expect(await db.deliveryIntent.count({ where: { accountId: f.account.id } })).toBe(0);
      expect(await db.message.count({ where: { accountId: f.account.id } })).toBe(0);
      expect((await db.inboundEvent.findUniqueOrThrow({ where: { accountId_id: { accountId: f.account.id, id: f.event.id } } })).processedAt).toBeNull();
    } finally { await db.$executeRawUnsafe(`DROP TRIGGER ${triggerName} ON pgboss.job`); await db.$executeRawUnsafe(`DROP FUNCTION ${functionName}()`); }
    await start(f); expect(await db.sequenceRun.count({ where: { accountId: f.account.id } })).toBe(1);
    expect(await db.syntheticEffect.count({ where: { accountId: f.account.id } })).toBe(2);
  });
});
