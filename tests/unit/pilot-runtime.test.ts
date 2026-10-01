import { describe, expect, it } from 'vitest';
import { allowsMetaPilotDecision, isMetaPilotProduction, META_PILOT_APPROVED_TEXT } from '../../src/integrations/meta/pilot-runtime';
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
});
