import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createPrisma } from '../../src/shared/db';
import { createBoss } from '../../src/jobs/queue';
import { DELIVERY_QUEUE, META_PILOT_DELIVERY_QUEUE } from '../../src/modules/delivery/ledger';
import { emptyRecipe } from '../../src/modules/automations/recipe';
import { decideAutomation } from '../../src/modules/automations/decision';
import { processInboxEvent } from '../../src/modules/inbox/ingestion';
import { META_PILOT_APPROVED_TEXT } from '../../src/integrations/meta/pilot-runtime';

const db = createPrisma(), boss = createBoss();
const pilot = { professionalId: '17841422211864282', reelId: '17890000000000001', alias: 'somoskyber-pilot' };
const process = (accountId: string, eventId: string) => processInboxEvent(db, { accountId, eventId }, (tx, context) => decideAutomation(tx, boss, context));
const createdAccountIds = new Set<string>();

async function fixture(patch: { mediaId?: string; ruleMediaId?: string; text?: string; config?: object } = {}) {
  const accountId = randomUUID();
  const commentId = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const config = patch.config ?? { ...emptyRecipe, terms: ['prévia'], introduction: META_PILOT_APPROVED_TEXT };
  const account = await db.instagramAccount.create({ data: { id: accountId, label: 'Piloto Meta isolado', professionalId: pilot.professionalId,
    connectionGeneration: 1, webhookAppAlias: pilot.alias } });
  const contact = await db.contact.create({ data: { accountId, igScopedUserId: `contact-${randomUUID()}` } });
  const conversation = await db.conversation.create({ data: { accountId, contactId: contact.id } });
  await db.automation.create({ data: { accountId, name: 'Piloto Meta', status: 'active', mediaId: patch.ruleMediaId ?? pilot.reelId, config } });
  const event = await db.inboundEvent.create({ data: { accountId, externalId: `comment:${commentId}`, kind: 'comment', generation: 1,
    payload: { actorId: contact.igScopedUserId, text: patch.text ?? 'Quero uma prévia', mediaId: patch.mediaId ?? pilot.reelId, echo: false, buttonPayload: null } } });
  createdAccountIds.add(account.id);
  return { accountId, conversationId: conversation.id, eventId: event.id, commentId };
}

beforeAll(async () => { await boss.start(); await boss.createQueue(DELIVERY_QUEUE); await boss.createQueue(META_PILOT_DELIVERY_QUEUE); });
afterEach(async () => {
  vi.unstubAllEnvs();
  await db.instagramAccount.deleteMany({ where: { id: { in: [...createdAccountIds] } } });
  createdAccountIds.clear();
});
afterAll(async () => { await boss.stop(); await db.$disconnect(); });

describe('decisão do piloto Meta em PostgreSQL isolado', () => {
  it('cria uma única resposta privada para o comentário elegível', async () => {
    const f = await fixture();
    vi.stubEnv('PERSONAFLOW_MODE', 'production'); vi.stubEnv('META_INSTAGRAM_PILOT_ACCOUNT_ID', f.accountId);
    vi.stubEnv('META_INSTAGRAM_PILOT_PROFESSIONAL_ID', pilot.professionalId); vi.stubEnv('META_INSTAGRAM_PILOT_REEL_ID', pilot.reelId);
    vi.stubEnv('META_INSTAGRAM_TEST_COMMENT_ID', f.commentId);
    vi.stubEnv('META_WEBHOOK_APP_ALIAS', pilot.alias);
    await process(f.accountId, f.eventId);
    const intents = await db.deliveryIntent.findMany({ where: { accountId: f.accountId } });
    expect(intents).toHaveLength(1);
    expect(intents[0]).toMatchObject({ source: 'automatic', effect: 'private_reply', body: { text: META_PILOT_APPROVED_TEXT } });
  });

  it('modo de campanha aceita comentários diferentes somente no Reel aprovado e sem opcionais', async () => {
    const f = await fixture({ mediaId: '17890000000000003', ruleMediaId: '17890000000000003', text: 'PREVIA',
      config: { ...emptyRecipe, terms: ['prévia', 'previa'], introduction: META_PILOT_APPROVED_TEXT } });
    vi.stubEnv('PERSONAFLOW_MODE', 'production'); vi.stubEnv('PERSONAFLOW_SEND_MODE', 'meta-campaign-private-reply');
    vi.stubEnv('META_INSTAGRAM_PILOT_ACCOUNT_ID', f.accountId); vi.stubEnv('META_INSTAGRAM_PILOT_PROFESSIONAL_ID', pilot.professionalId);
    vi.stubEnv('META_INSTAGRAM_PILOT_REEL_ID', pilot.reelId); vi.stubEnv('META_INSTAGRAM_APPROVED_REEL_ID', '17890000000000003');
    vi.stubEnv('META_WEBHOOK_APP_ALIAS', pilot.alias);
    await process(f.accountId, f.eventId);
    expect(await db.deliveryIntent.findMany({ where: { accountId: f.accountId } })).toMatchObject([
      { source: 'automatic', effect: 'private_reply', body: { text: META_PILOT_APPROVED_TEXT } },
    ]);
  });

  it('modo de campanha recusa receita com termo ou sequência diferente', async () => {
    const f = await fixture({ mediaId: '17890000000000003', ruleMediaId: '17890000000000003', config: { ...emptyRecipe, terms: ['prévia', 'site'], introduction: META_PILOT_APPROVED_TEXT } });
    vi.stubEnv('PERSONAFLOW_MODE', 'production'); vi.stubEnv('PERSONAFLOW_SEND_MODE', 'meta-campaign-private-reply');
    vi.stubEnv('META_INSTAGRAM_PILOT_ACCOUNT_ID', f.accountId); vi.stubEnv('META_INSTAGRAM_PILOT_PROFESSIONAL_ID', pilot.professionalId);
    vi.stubEnv('META_INSTAGRAM_PILOT_REEL_ID', pilot.reelId); vi.stubEnv('META_INSTAGRAM_APPROVED_REEL_ID', '17890000000000003');
    vi.stubEnv('META_WEBHOOK_APP_ALIAS', pilot.alias);
    await process(f.accountId, f.eventId);
    expect(await db.deliveryIntent.count({ where: { accountId: f.accountId } })).toBe(0);
  });

  it.each([
    ['conta interna incorreta', { accountId: '22222222-2222-4222-8222-222222222222' }, {}],
    ['Reel incorreto', {}, { mediaId: '17890000000000002' }],
    ['texto não aprovado', {}, { config: { ...emptyRecipe, terms: ['prévia'], introduction: 'Outro texto' } }],
    ['resposta pública configurada', {}, { config: { ...emptyRecipe, terms: ['prévia'], introduction: META_PILOT_APPROVED_TEXT, publicReplyEnabled: true, publicReply: 'Resposta pública' } }],
  ] as const)('não cria intenção para %s', async (_name, envPatch, fixturePatch) => {
    const f = await fixture(fixturePatch);
    vi.stubEnv('PERSONAFLOW_MODE', 'production'); vi.stubEnv('META_INSTAGRAM_PILOT_ACCOUNT_ID', 'accountId' in envPatch ? envPatch.accountId : f.accountId);
    vi.stubEnv('META_INSTAGRAM_PILOT_PROFESSIONAL_ID', pilot.professionalId); vi.stubEnv('META_INSTAGRAM_PILOT_REEL_ID', pilot.reelId);
    vi.stubEnv('META_INSTAGRAM_TEST_COMMENT_ID', f.commentId);
    vi.stubEnv('META_WEBHOOK_APP_ALIAS', pilot.alias);
    await process(f.accountId, f.eventId);
    expect(await db.deliveryIntent.count({ where: { accountId: f.accountId } })).toBe(0);
  });
});
