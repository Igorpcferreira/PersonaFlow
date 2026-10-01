import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createPrisma } from '../../src/shared/db';
import { createBoss } from '../../src/jobs/queue';
import { DELIVERY_QUEUE, META_PILOT_DELIVERY_QUEUE, createIntent } from '../../src/modules/delivery/ledger';
import { executeIntent, type MetaPilotTransport } from '../../src/modules/delivery/executor';
import { recoverExpiredMetaReservations, sweepDeliveryAccount } from '../../src/jobs/delivery';
import { TokenVault } from '../../src/modules/accounts/token-vault';
import { LOCAL_META_SCOPES } from '../../src/integrations/meta/oauth-contract';
import { emptyRecipe } from '../../src/modules/automations/recipe';
import { META_PILOT_APPROVED_TEXT } from '../../src/integrations/meta/pilot-runtime';

const db = createPrisma(), boss = createBoss();
const professionalId = '17841422211864282', reelId = '17890000000000001', webhookAlias = 'somoskyber-pilot';
const created = new Set<string>();
let commentNumber = 17890000000000000n;

async function fixture() {
  const account = await db.instagramAccount.create({ data: { professionalId: `${professionalId}${randomBytes(3).toString('hex').replace(/[a-f]/g, '1')}`,
    label: 'Teste de entrega Meta', connectionGeneration: 1, webhookAppAlias: webhookAlias } });
  // Every test account is distinct while the transport must match the account's actual ID.
  const currentProfessionalId = account.professionalId;
  created.add(account.id);
  const vault = new TokenVault(new Map([[1, randomBytes(32)]]), 1);
  await db.accountCredential.create({ data: { accountId: account.id, ...vault.encrypt(account.id, 1, 'token-de-teste'), generation: 1,
    scopes: [...LOCAL_META_SCOPES], expiresAt: new Date(Date.now() + 60_000) } });
  const contact = await db.contact.create({ data: { accountId: account.id, igScopedUserId: `contact-${randomUUID()}` } });
  const conversation = await db.conversation.create({ data: { accountId: account.id, contactId: contact.id } });
  const automation = await db.automation.create({ data: { accountId: account.id, name: 'Piloto', mediaId: reelId, status: 'active',
    config: { ...emptyRecipe, terms: ['prévia'], introduction: META_PILOT_APPROVED_TEXT } } });
  commentNumber += 1n;
  const event = await db.inboundEvent.create({ data: { accountId: account.id, externalId: `comment:${commentNumber}`, kind: 'comment',
    generation: 1, payload: { actorId: contact.igScopedUserId, text: 'Quero prévia', mediaId: reelId, echo: false, buttonPayload: null } } });
  const intent = await createIntent(db, boss, { accountId: account.id, conversationId: conversation.id, eventId: event.id,
    automationId: automation.id, source: 'automatic', effect: 'private_reply', body: { text: META_PILOT_APPROVED_TEXT } });
  const send = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ message_id: 'mid-1' }), { status: 200 }));
  const transport: MetaPilotTransport = { kind: 'meta', accountId: account.id, professionalId: currentProfessionalId,
    scope: 'test-comment', reelId, commentId: String(commentNumber), webhookAlias, graphVersion: 'v24.0', options: { fetch: send } };
  return { account, automation, event, intent, vault, transport, send };
}

beforeAll(async () => { await boss.start(); await boss.createQueue(DELIVERY_QUEUE); await boss.createQueue(META_PILOT_DELIVERY_QUEUE); });
afterEach(async () => { vi.unstubAllEnvs(); await db.instagramAccount.deleteMany({ where: { id: { in: [...created] } } }); created.clear(); });
afterAll(async () => { await boss.stop(); await db.$disconnect(); });

describe('envio Meta restrito ao piloto', () => {
  function enable(transport: MetaPilotTransport) {
    if (transport.scope !== 'test-comment') throw new Error('Teste exige transporte de comentário controlado.');
    vi.stubEnv('PERSONAFLOW_MODE', 'production'); vi.stubEnv('PERSONAFLOW_SEND_MODE', 'meta-private-reply');
    vi.stubEnv('META_INSTAGRAM_PILOT_ACCOUNT_ID', transport.accountId);
    vi.stubEnv('META_INSTAGRAM_PILOT_PROFESSIONAL_ID', transport.professionalId);
    vi.stubEnv('META_INSTAGRAM_PILOT_REEL_ID', transport.reelId);
    vi.stubEnv('META_INSTAGRAM_TEST_COMMENT_ID', transport.commentId);
    vi.stubEnv('META_WEBHOOK_APP_ALIAS', transport.webhookAlias);
    vi.stubEnv('META_INSTAGRAM_GRAPH_VERSION', transport.graphVersion);
  }

  it('recusa sem gate explícito e revalida antes de chamar a Meta', async () => {
    const f = await fixture();
    await expect(executeIntent(db, f.vault, f.transport, { accountId: f.account.id, intentId: f.intent.id })).rejects.toThrow('recusado');
    enable(f.transport);
    await db.automation.update({ where: { accountId_id: { accountId: f.account.id, id: f.automation.id } }, data: { revision: { increment: 1 } } });
    const result = await executeIntent(db, f.vault, f.transport, { accountId: f.account.id, intentId: f.intent.id });
    expect(result.status).toBe('blocked');
    expect(f.send).not.toHaveBeenCalled();
  });

  it('uma intenção aceita faz uma única chamada e o replay não reenvia', async () => {
    const f = await fixture(); enable(f.transport);
    const result = await executeIntent(db, f.vault, f.transport, { accountId: f.account.id, intentId: f.intent.id });
    expect(result).toMatchObject({ status: 'accepted', reason: 'meta_api_accepted', acceptedId: 'mid-1' });
    expect(f.send).toHaveBeenCalledTimes(1);
    expect(f.send.mock.calls[0][0].toString()).toContain('/messages');
    expect(await executeIntent(db, f.vault, f.transport, { accountId: f.account.id, intentId: f.intent.id })).toMatchObject({ status: 'accepted' });
    expect(f.send).toHaveBeenCalledTimes(1);
  });

  it('resultado ambíguo fica terminal e não tenta novamente', async () => {
    const f = await fixture(); enable(f.transport);
    f.send.mockRejectedValueOnce(new Error('Resposta de rede perdida'));
    const first = await executeIntent(db, f.vault, f.transport, { accountId: f.account.id, intentId: f.intent.id });
    expect(first.status).toBe('unknown');
    await executeIntent(db, f.vault, f.transport, { accountId: f.account.id, intentId: f.intent.id });
    expect(f.send).toHaveBeenCalledTimes(1);
  });

  it('dois comentários elegíveis acumulados liberam somente o ID selecionado', async () => {
    const f = await fixture();
    const original = await db.inboundEvent.findUniqueOrThrow({ where: { accountId_id: { accountId: f.account.id, id: f.event.id } } });
    commentNumber += 1n;
    const other = await db.inboundEvent.create({ data: { accountId: f.account.id, externalId: `comment:${commentNumber}`,
      kind: 'comment', generation: 1, payload: original.payload! } });
    const otherIntent = await createIntent(db, boss, { accountId: f.account.id, conversationId: f.intent.conversationId,
      eventId: other.id, automationId: f.automation.id, source: 'automatic', effect: 'private_reply',
      body: { text: META_PILOT_APPROVED_TEXT } });
    enable(f.transport);
    expect((await executeIntent(db, f.vault, f.transport, { accountId: f.account.id, intentId: otherIntent.id })).status).toBe('blocked');
    expect(f.send).not.toHaveBeenCalled();
    expect((await executeIntent(db, f.vault, f.transport, { accountId: f.account.id, intentId: f.intent.id })).status).toBe('accepted');
    expect(f.send).toHaveBeenCalledTimes(1);
  });

  it('campanha processa comentários distintos do Reel aprovado, mas bloqueia outro Reel antes do HTTP', async () => {
    const f = await fixture();
    const campaignReel = '17890000000000003';
    await db.automation.update({ where: { accountId_id: { accountId: f.account.id, id: f.automation.id } }, data: {
      mediaId: campaignReel, config: { ...emptyRecipe, terms: ['prévia', 'previa'], introduction: META_PILOT_APPROVED_TEXT },
    } });
    await db.inboundEvent.update({ where: { accountId_id: { accountId: f.account.id, id: f.event.id } }, data: {
      payload: { actorId: `contact-${randomUUID()}`, text: 'Quero PREVIA', mediaId: campaignReel, echo: false, buttonPayload: null },
    } });
    const transport: MetaPilotTransport = { ...f.transport, scope: 'campaign', reelId: campaignReel };
    vi.stubEnv('PERSONAFLOW_MODE', 'production'); vi.stubEnv('PERSONAFLOW_SEND_MODE', 'meta-campaign-private-reply');
    vi.stubEnv('META_INSTAGRAM_PILOT_ACCOUNT_ID', transport.accountId); vi.stubEnv('META_INSTAGRAM_PILOT_PROFESSIONAL_ID', transport.professionalId);
    vi.stubEnv('META_INSTAGRAM_PILOT_REEL_ID', reelId); vi.stubEnv('META_INSTAGRAM_APPROVED_REEL_ID', campaignReel);
    vi.stubEnv('META_WEBHOOK_APP_ALIAS', transport.webhookAlias); vi.stubEnv('META_INSTAGRAM_GRAPH_VERSION', transport.graphVersion);
    expect((await executeIntent(db, f.vault, transport, { accountId: f.account.id, intentId: f.intent.id })).status).toBe('accepted');
    expect(f.send).toHaveBeenCalledTimes(1);
    const other = await fixture();
    const otherTransport: MetaPilotTransport = { ...other.transport, scope: 'campaign', reelId: campaignReel };
    vi.stubEnv('META_INSTAGRAM_PILOT_ACCOUNT_ID', otherTransport.accountId); vi.stubEnv('META_INSTAGRAM_PILOT_PROFESSIONAL_ID', otherTransport.professionalId);
    vi.stubEnv('META_WEBHOOK_APP_ALIAS', otherTransport.webhookAlias); vi.stubEnv('META_INSTAGRAM_GRAPH_VERSION', otherTransport.graphVersion);
    expect((await executeIntent(db, other.vault, otherTransport, { accountId: other.account.id, intentId: other.intent.id })).status).toBe('blocked');
    expect(other.send).not.toHaveBeenCalled();
  });

  it('intenção pendente antes de ativar envio não passa pelo gate do comentário de teste', async () => {
    const f = await fixture();
    const original = await db.inboundEvent.findUniqueOrThrow({ where: { accountId_id: { accountId: f.account.id, id: f.event.id } } });
    commentNumber += 1n;
    const older = await db.inboundEvent.create({ data: { accountId: f.account.id, externalId: `comment:${commentNumber}`,
      kind: 'comment', generation: 1, payload: original.payload! } });
    const olderIntent = await createIntent(db, boss, { accountId: f.account.id, conversationId: f.intent.conversationId,
      eventId: older.id, automationId: f.automation.id, source: 'automatic', effect: 'private_reply',
      body: { text: META_PILOT_APPROVED_TEXT } });
    enable(f.transport);
    await sweepDeliveryAccount(db, f.vault, f.transport, f.account.id);
    expect((await db.deliveryIntent.findUniqueOrThrow({ where: { accountId_id: { accountId: f.account.id, id: olderIntent.id } } }))
      .status).toBe('blocked');
    expect((await db.deliveryIntent.findUniqueOrThrow({ where: { accountId_id: { accountId: f.account.id, id: f.intent.id } } }))
      .status).toBe('accepted');
    expect(f.send).toHaveBeenCalledTimes(1);
  });

  it('reinício com envio desligado marca reserva expirada como incerta, sem HTTP', async () => {
    const f = await fixture();
    const now = new Date();
    await db.deliveryAttempt.create({ data: { accountId: f.account.id, intentId: f.intent.id, number: 1,
      status: 'started', startedAt: new Date(now.getTime() - 60_000) } });
    await db.deliveryIntent.update({ where: { accountId_id: { accountId: f.account.id, id: f.intent.id } }, data: {
      status: 'sending', reservedUntil: new Date(now.getTime() - 1000) } });
    vi.stubEnv('PERSONAFLOW_MODE', 'production'); vi.stubEnv('PERSONAFLOW_SEND_MODE', 'disabled');
    expect(await recoverExpiredMetaReservations(db, f.account.id, now)).toBe(1);
    expect(await recoverExpiredMetaReservations(db, f.account.id, now)).toBe(0);
    expect((await db.deliveryIntent.findUniqueOrThrow({ where: { accountId_id: { accountId: f.account.id, id: f.intent.id } } })).status).toBe('unknown');
    expect(f.send).not.toHaveBeenCalled();
  });

  it('Reel divergente e texto alterado são bloqueados antes da chamada', async () => {
    const wrongEvent = await fixture(); enable(wrongEvent.transport);
    await db.inboundEvent.update({ where: { accountId_id: { accountId: wrongEvent.account.id, id: wrongEvent.event.id } },
      data: { payload: { actorId: `contact-${randomUUID()}`, text: 'Quero prévia', mediaId: '17890000000000002', echo: false, buttonPayload: null } } });
    expect((await executeIntent(db, wrongEvent.vault, wrongEvent.transport, { accountId: wrongEvent.account.id, intentId: wrongEvent.intent.id })).status).toBe('blocked');
    expect(wrongEvent.send).not.toHaveBeenCalled();
    const changed = await fixture();
    enable(changed.transport);
    await db.deliveryIntent.update({ where: { accountId_id: { accountId: changed.account.id, id: changed.intent.id } },
      data: { body: { text: 'Outra mensagem' } } });
    expect((await executeIntent(db, changed.vault, changed.transport, { accountId: changed.account.id, intentId: changed.intent.id })).status).toBe('blocked');
    expect(changed.send).not.toHaveBeenCalled();
  });
});
