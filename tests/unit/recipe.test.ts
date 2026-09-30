import { describe, expect, it } from 'vitest';
import { emptyRecipe, matchingTerm, normalizeTerms, readyRecipe, isStopCommand } from '../../src/modules/automations/recipe';

describe('PF-023-L: termos Unicode e configuração', () => {
  it('palavras/expressões inteiras normalizam caixa/espaço/NFKC e preservam acentos', () => {
    expect(normalizeTerms([' Site ', 'SITE', 'saiba   mais'])).toEqual(['site', 'saiba mais']);
    expect(matchingTerm('Quero o SITE!', ['site'])).toBe('site');
    expect(matchingTerm('Website e site2', ['site'])).toBeNull();
    expect(matchingTerm('ＱＵＥＲＯ saiba   mais.', ['saiba mais'])).toBe('saiba mais');
    expect(matchingTerm('Café?', ['cafe'])).toBeNull();
    expect(matchingTerm('cafe\u0301?', ['café'])).toBe('café');
    expect(matchingTerm('cafés', ['café'])).toBeNull();
    expect(matchingTerm('link.site', ['link.site'])).toBe('link.site');
  });
  it('DM/story exigem texto, recusam passos de comentário e reconhecem opt-out completo', () => {
    const text = { ...emptyRecipe, terms: ['ajuda'], introduction: 'Resposta' };
    expect(readyRecipe(text, 'message')).toBe(true);
    expect(readyRecipe(text, 'story')).toBe(true);
    expect(readyRecipe(text)).toBe(true);
    expect(readyRecipe({ ...text, buttonEnabled: true }, 'message')).toBe(false);
    expect(readyRecipe({ ...text, introduction: 'a'.repeat(2000), finalMessage: 'b' }, 'story')).toBe(false);
    for (const value of [' PARAR ', 'sair!', 'ＳＡＩＲ', 'Parar.']) expect(isStopCommand(value)).toBe(true);
    for (const value of ['não quero parar', 'parar depois', 'sairei']) expect(isStopCommand(value)).toBe(false);
  });
  it('rascunho vazio não ativa; seguir exige botão e mensagem, texto privado tem limite', () => {
    expect(readyRecipe(emptyRecipe)).toBe(false);
    const ready = { ...emptyRecipe, terms: ['site'], introduction: 'Apresentação', finalMessage: 'Mensagem final', link: 'https://example.invalid' };
    expect(readyRecipe(ready)).toBe(true);
    expect(readyRecipe({ ...ready, buttonEnabled: true, buttonTitle: 'Continuar', finalMessage: '', link: '' })).toBe(false);
    expect(readyRecipe({ ...ready, followRequired: true, followPrompt: 'Siga para continuar' })).toBe(false);
    expect(readyRecipe({ ...ready, introduction: 'a'.repeat(2000) })).toBe(false);
    expect(readyRecipe({ ...ready, buttonEnabled: true, buttonTitle: 'Continuar', introduction: 'a'.repeat(2000) })).toBe(true);
    expect(readyRecipe({ ...ready, buttonEnabled: true, buttonTitle: 'Continuar', finalMessage: 'a'.repeat(2000) })).toBe(false);
  });
});
