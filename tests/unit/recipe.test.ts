import { describe, expect, it } from 'vitest';
import { emptyRecipe, matchingTerm, normalizeTerms, readyRecipe } from '../../src/modules/automations/recipe';

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
  it('rascunho vazio não ativa; seguir exige botão e mensagem, texto privado tem limite', () => {
    expect(readyRecipe(emptyRecipe)).toBe(false);
    const ready = { ...emptyRecipe, terms: ['site'], introduction: 'Apresentação', finalMessage: 'Mensagem final', link: 'https://example.invalid' };
    expect(readyRecipe(ready)).toBe(true);
    expect(readyRecipe({ ...ready, followRequired: true, followPrompt: 'Siga para continuar' })).toBe(false);
    expect(readyRecipe({ ...ready, introduction: 'a'.repeat(2000) })).toBe(false);
  });
});
