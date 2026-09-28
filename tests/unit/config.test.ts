import { describe, expect, it } from 'vitest';
import { parseDatabaseUrl } from '../../src/shared/config';

describe('configuração local', () => {
  it('aceita somente URL local do projeto', () => {
    expect(parseDatabaseUrl('postgresql://local:example@127.0.0.1:5432/personaflow_test'))
      .toContain('personaflow_test');
  });

  it.each([undefined, '', 'postgresql://token-muito-sensivel@externo.example/prod', 'https://localhost/personaflow_test'])
  ('rejeita configuração inválida sem revelar o valor', (input) => {
    expect(() => parseDatabaseUrl(input)).toThrowError(/DATABASE_URL inválida/);
    try { parseDatabaseUrl(input); } catch (error) {
      expect(String(error)).not.toContain('token-muito-sensivel');
    }
  });
});
