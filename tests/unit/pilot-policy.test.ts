import { describe, expect, it } from 'vitest';
import { validateMetaPilot, type MetaPilotConfig, type MetaPilotContext } from '../../src/integrations/meta/pilot-policy';

const config: MetaPilotConfig = {
  professionalId: 17841422211864282n,
  mediaId: 'reel-selected-by-operator',
  keyword: 'prévia',
  approvedText: 'Oi! Vi seu pedido de prévia.',
};

const context = (): MetaPilotContext => ({
  account: { professionalId: String(config.professionalId) },
  event: { professionalId: String(config.professionalId), kind: 'comment', mediaId: config.mediaId, text: 'Quero uma PRE\u0301VIA!', echo: false },
  intent: { source: 'automatic', effect: 'private_reply', body: { text: config.approvedText } },
});

describe('PF-pilot: política restrita para a primeira DM da Kyber', () => {
  it('permite somente o comentário elegível no Reel e texto aprovados', () => {
    expect(validateMetaPilot(config, context())).toEqual({ allowed: true });
  });

  it.each([
    ['configuração sem Reel', () => validateMetaPilot({ ...config, mediaId: '   ' }, context()), 'invalid_configuration'],
    ['conta profissional diferente', () => validateMetaPilot(config, { ...context(), account: { professionalId: '999' } }), 'professional_account_mismatch'],
    ['evento de outra conta', () => validateMetaPilot(config, { ...context(), event: { ...context().event, professionalId: '999' } }), 'professional_account_mismatch'],
    ['outro Reel', () => validateMetaPilot(config, { ...context(), event: { ...context().event, mediaId: 'other-reel' } }), 'reel_mismatch'],
    ['evento que não é comentário', () => validateMetaPilot(config, { ...context(), event: { ...context().event, kind: 'message' } }), 'not_an_eligible_comment'],
    ['comentário sem termo', () => validateMetaPilot(config, { ...context(), event: { ...context().event, text: 'Quero saber mais' } }), 'keyword_not_found'],
    ['evento echo', () => validateMetaPilot(config, { ...context(), event: { ...context().event, echo: true } }), 'echo_event'],
    ['origem manual', () => validateMetaPilot(config, { ...context(), intent: { ...context().intent, source: 'manual' } }), 'manual_intent'],
    ['resposta pública', () => validateMetaPilot(config, { ...context(), intent: { ...context().intent, effect: 'public_reply' } }), 'effect_not_private_reply'],
    ['texto diferente', () => validateMetaPilot(config, { ...context(), intent: { ...context().intent, body: { text: `${config.approvedText} Extra.` } } }), 'body_not_approved'],
    ['botão no corpo', () => validateMetaPilot(config, { ...context(), intent: { ...context().intent, body: { text: config.approvedText, button: { title: 'Abrir', payload: 'x' } } } }), 'body_has_button'],
    ['link no corpo', () => validateMetaPilot(config, { ...context(), intent: { ...context().intent, body: { text: config.approvedText, link: 'https://example.invalid' } } }), 'body_has_link'],
  ] as const)('recusa %s', (_name, decide, reason) => {
    expect(decide()).toEqual({ allowed: false, reason });
  });
});
