import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { TokenVault } from '../../src/modules/accounts/token-vault';

const a = '11111111-1111-4111-8111-111111111111';
const b = '22222222-2222-4222-8222-222222222222';

describe('cifragem por conexão', () => {
  it('nonce distinto, sem plaintext, AAD vincula conta/geração/versão, adulteração falha', () => {
    const keys = new Map([[1, randomBytes(32)], [2, randomBytes(32)]]);
    const vault = new TokenVault(keys, 1);
    const token = 'synthetic-token-not-a-real-credential';
    const first = vault.encrypt(a, 1, token);
    const second = vault.encrypt(a, 1, token);
    expect(first.ciphertext.equals(second.ciphertext)).toBe(false);
    expect(first.ciphertext.includes(Buffer.from(token))).toBe(false);
    expect(vault.decrypt(a, 1, 1, first.ciphertext) === token).toBe(true);
    expect(() => vault.decrypt(b, 1, 1, first.ciphertext)).toThrow('valores omitidos');
    expect(() => vault.decrypt(a, 2, 1, first.ciphertext)).toThrow('valores omitidos');
    expect(() => vault.decrypt(a, 1, 2, first.ciphertext)).toThrow('valores omitidos');
    const tampered = Buffer.from(first.ciphertext);
    tampered[30] ^= 1;
    expect(() => vault.decrypt(a, 1, 1, tampered)).toThrow('valores omitidos');
    expect(() => new TokenVault(new Map([[2, keys.get(2)!]]), 2).decrypt(a, 1, 1, first.ciphertext)).toThrow('valores omitidos');
  });
  it('configuração de chave inválida falha sem expor material', () => {
    expect(() => new TokenVault(new Map([[1, randomBytes(31)]]), 1)).toThrow('valores omitidos');
    expect(() => new TokenVault(new Map([[1, randomBytes(32)]]), 2)).toThrow('valores omitidos');
  });
});
