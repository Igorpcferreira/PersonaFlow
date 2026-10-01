import { describe, expect, it } from 'vitest';
import { allowsMetaPilotDecision, isMetaPilotProduction, META_CAMPAIGN_APPROVED_TEXT, META_CAMPAIGN_PUBLIC_REPLY_TEXT, META_CAMPAIGN_WHATSAPP_URL, META_PILOT_APPROVED_TEXT, readApprovedFutureMetaPilot } from '../../src/integrations/meta/pilot-runtime';
import type { NormalizedInbound } from '../../src/modules/inbox/ingestion';

const env = { PERSONAFLOW_MODE: 'production', META_INSTAGRAM_PILOT_ACCOUNT_ID: '11111111-1111-4111-8111-111111111111',
  META_INSTAGRAM_PILOT_PROFESSIONAL_ID: '17841422211864282', META_INSTAGRAM_PILOT_REEL_ID: '17890000000000001', META_INSTAGRAM_TEST_COMMENT_ID: '17890000000000002', META_WEBHOOK_APP_ALIAS: 'somoskyber-pilot' };
const context = { account: { id: env.META_INSTAGRAM_PILOT_ACCOUNT_ID, professionalId: env.META_INSTAGRAM_PILOT_PROFESSIONAL_ID, webhookAppAlias: env.META_WEBHOOK_APP_ALIAS },
  event: { kind: 'comment', generation: 1, externalId: `comment:${env.META_INSTAGRAM_TEST_COMMENT_ID}` }, payload: { mediaId: env.META_INSTAGRAM_PILOT_REEL_ID, text: 'Quero uma prévia', echo: false } } as unknown as NormalizedInbound;
const intent = { source: 'automatic' as const, effect: 'private_reply' as const, body: { text: META_PILOT_APPROVED_TEXT } };

describe('runtime do piloto Meta', () => {
  it('mantém o comportamento local e fecha produção sem configuração completa', () => {
    expect(isMetaPilotProduction({ PERSONAFLOW_MODE: 'local-demo' })).toBe(false);
    expect(allowsMetaPilotDecision({ PERSONAFLOW_MODE: 'local-demo' }, context, [intent])).toBe(true);
    expect(allowsMetaPilotDecision({ PERSONAFLOW_MODE: 'production' }, context, [intent])).toBe(false);
  });

  it.each([
    ['conta interna', { ...env, META_INSTAGRAM_PILOT_ACCOUNT_ID: '22222222-2222-4222-8222-222222222222' }, context, [intent]],
    ['alias do webhook', { ...env, META_WEBHOOK_APP_ALIAS: 'outro-piloto' }, context, [intent]],
    ['Reel', env, { ...context, payload: { ...context.payload, mediaId: '17890000000000002' } }, [intent]],
    ['texto', env, context, [{ ...intent, body: { text: 'Texto diferente' } }]],
    ['resposta pública', env, context, [{ ...intent, effect: 'public_reply' }]],
    ['comentário não autorizado', env, { ...context, event: { ...context.event, externalId: 'comment:17890000000000003' } }, [intent]],
    ['ID do comentário ausente', { ...env, META_INSTAGRAM_TEST_COMMENT_ID: undefined }, context, [intent]],
    ['mais de uma intenção', env, context, [intent, { ...intent, effect: 'public_reply' }]],
  ] as const)('recusa %s', (_name, candidateEnv, candidateContext, planned) => {
    expect(allowsMetaPilotDecision(candidateEnv, candidateContext, planned)).toBe(false);
  });

  it('aceita somente a intenção privada exata', () => {
    expect(allowsMetaPilotDecision(env, context, [intent])).toBe(true);
  });

  it('prepara somente um Reel futuro explícito e mantém o transporte desativado', () => {
    const future = { ...env, PERSONAFLOW_SEND_MODE: 'meta-campaign-private-reply', META_INSTAGRAM_APPROVED_REEL_ID: '17890000000000003' };
    expect(readApprovedFutureMetaPilot(future)).toEqual({
      accountId: env.META_INSTAGRAM_PILOT_ACCOUNT_ID,
      professionalId: env.META_INSTAGRAM_PILOT_PROFESSIONAL_ID,
      reelId: '17890000000000003',
      webhookAlias: env.META_WEBHOOK_APP_ALIAS,
      keyword: 'prévia',
      approvedText: META_CAMPAIGN_APPROVED_TEXT,
    });
  });

  it.each([
    ['sem Reel aprovado', { ...env, PERSONAFLOW_SEND_MODE: 'meta-campaign-private-reply' }],
    ['modo de teste', { ...env, PERSONAFLOW_SEND_MODE: 'meta-private-reply', META_INSTAGRAM_APPROVED_REEL_ID: '17890000000000003' }],
    ['Reel do piloto atual', { ...env, PERSONAFLOW_SEND_MODE: 'meta-campaign-private-reply', META_INSTAGRAM_APPROVED_REEL_ID: env.META_INSTAGRAM_PILOT_REEL_ID }],
    ['ID inválido', { ...env, PERSONAFLOW_SEND_MODE: 'meta-campaign-private-reply', META_INSTAGRAM_APPROVED_REEL_ID: 'reel-futuro' }],
  ] as const)('fecha a preparação %s', (_name, candidate) => {
    expect(readApprovedFutureMetaPilot(candidate)).toBeNull();
  });

  it('libera a campanha somente para comentários do Reel aprovado, sem ID de comentário', () => {
    const campaign = { ...env, PERSONAFLOW_SEND_MODE: 'meta-campaign-private-reply', META_INSTAGRAM_APPROVED_REEL_ID: '17890000000000003' };
    const campaignContext = { ...context, event: { ...context.event, externalId: 'comment:17890000000000009' },
      payload: { ...context.payload, mediaId: campaign.META_INSTAGRAM_APPROVED_REEL_ID } } as NormalizedInbound;
    const campaignIntent = { ...intent, body: { text: META_CAMPAIGN_APPROVED_TEXT } };
    expect(allowsMetaPilotDecision(campaign, campaignContext, [campaignIntent])).toBe(true);
    expect(allowsMetaPilotDecision(campaign, campaignContext, [intent])).toBe(false);
    expect(allowsMetaPilotDecision(campaign, campaignContext, [campaignIntent,
      { source: 'automatic', effect: 'public_reply', body: { text: META_CAMPAIGN_PUBLIC_REPLY_TEXT } }])).toBe(true);
    expect(allowsMetaPilotDecision(campaign, campaignContext, [campaignIntent,
      { source: 'automatic', effect: 'public_reply', body: { text: 'Outro texto' } }])).toBe(false);
    expect(allowsMetaPilotDecision(campaign, { ...campaignContext, payload: { ...campaignContext.payload, mediaId: env.META_INSTAGRAM_PILOT_REEL_ID } }, [campaignIntent])).toBe(false);
  });

  it('mantém a rota de WhatsApp e identifica a campanha Kyber', () => {
    const url = new URL(META_CAMPAIGN_WHATSAPP_URL);
    expect(`${url.origin}${url.pathname}`).toBe('https://somoskyber.com.br/fale');
    expect(url.searchParams.get('origem')).toBe('instagram-reels-previa');
    expect(url.searchParams.get('text')).toContain('Reels da Kyber');
    expect(META_CAMPAIGN_APPROVED_TEXT).toContain(META_CAMPAIGN_WHATSAPP_URL);
  });
});
