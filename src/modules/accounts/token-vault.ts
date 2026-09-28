import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { z } from 'zod';

const payload = z.object({ accessToken: z.string().min(1).max(8192) }).strict();

export class TokenVault {
  private keys: Map<number, Buffer>;
  readonly activeVersion: number;

  constructor(keys: ReadonlyMap<number, Uint8Array>, activeVersion: number) {
    if (!keys.has(activeVersion) || [...keys].some(([version, key]) => !Number.isInteger(version) || version < 1 || key.length !== 32)) {
      throw new Error('Chaves de cifragem inválidas; valores omitidos.');
    }
    this.keys = new Map([...keys].map(([version, key]) => [version, Buffer.from(key)]));
    this.activeVersion = activeVersion;
  }

  private context(accountId: string, generation: number, version: number) {
    if (!/^[a-f0-9-]{36}$/i.test(accountId) || !Number.isInteger(generation) || generation < 1) throw new Error('Contexto de credencial inválido.');
    return Buffer.from(`personaflow:credential:v1:${accountId.toLowerCase()}:${generation}:${version}`);
  }

  encrypt(accountId: string, generation: number, accessToken: string) {
    const data = payload.safeParse({ accessToken });
    if (!data.success) throw new Error('Credencial inválida; valor omitido.');
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.keys.get(this.activeVersion)!, nonce);
    cipher.setAAD(this.context(accountId, generation, this.activeVersion));
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(data.data), 'utf8'), cipher.final()]);
    return { keyVersion: this.activeVersion, ciphertext: Buffer.concat([Buffer.from([1]), nonce, cipher.getAuthTag(), encrypted]) };
  }

  decrypt(accountId: string, generation: number, keyVersion: number, value: Uint8Array) {
    try {
      const encrypted = Buffer.from(value);
      const key = this.keys.get(keyVersion);
      if (!key || encrypted.length < 30 || encrypted[0] !== 1) throw new Error();
      const decipher = createDecipheriv('aes-256-gcm', key, encrypted.subarray(1, 13));
      decipher.setAAD(this.context(accountId, generation, keyVersion));
      decipher.setAuthTag(encrypted.subarray(13, 29));
      const plaintext = Buffer.concat([decipher.update(encrypted.subarray(29)), decipher.final()]);
      return payload.parse(JSON.parse(plaintext.toString('utf8'))).accessToken;
    } catch { throw new Error('Credencial indisponível ou contexto/chave inválidos; valores omitidos.'); }
  }
}
