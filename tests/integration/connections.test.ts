import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPrisma } from '../../src/shared/db';
import { TokenVault } from '../../src/modules/accounts/token-vault';
import { completeOAuth, completeOAuthCallback, createOAuthState, getConnectedToken, refreshConnection, revokeConnection, rotateCredentialKey } from '../../src/modules/accounts/connections';
import { FakeOAuthProvider, LOCAL_META_SCOPES, SyntheticOAuthRevoked, type MetaOAuthProvider, type SyntheticOAuthProvider } from '../../src/integrations/meta/oauth-contract';

const db = createPrisma();
const keys = new Map([[1, randomBytes(32)], [2, randomBytes(32)]]);
const vault = new TokenVault(keys, 1);
const stateHash = (state: string) => createHash('sha256').update(state).digest('hex');

async function fixture(label: string) {
  const user = await db.user.create({ data: { id: randomUUID(), name: 'Operador sintético', email: `${randomUUID()}@example.invalid` } });
  const session = await db.session.create({ data: { id: randomUUID(), token: randomUUID(), userId: user.id, expiresAt: new Date(Date.now() + 60 * 60_000) } });
  const account = await db.instagramAccount.create({ data: { label, professionalId: `professional-${randomUUID()}` } });
  const provider = new FakeOAuthProvider(account.professionalId, `app-scoped-${randomUUID()}`);
  const context = { accountId: account.id, sessionId: session.id, state: await createOAuthState(db, account.id, session.id), code: 'synthetic-code' };
  return { account, session, provider, context };
}

async function connected(label: string) {
  const result = await fixture(label);
  await completeOAuth(db, vault, result.provider, result.context);
  return result;
}

beforeEach(() => { vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Rede externa proibida.')); });
afterEach(() => { expect(vi.mocked(globalThis.fetch).mock.calls.length).toBe(0); vi.restoreAllMocks(); });
afterAll(() => db.$disconnect());

describe('PF-015-L: OAuth/credenciais PostgreSQL sem rede', () => {
  it('state vinculado a sessão e conta, replay e concorrência só fazem uma troca', async () => {
    const a = await fixture('state-A');
    const b = await fixture('state-B');
    await expect(completeOAuth(db, vault, a.provider, { ...a.context, accountId: b.account.id })).rejects.toThrow('omitidos');
    await expect(completeOAuth(db, vault, a.provider, { ...a.context, sessionId: b.session.id })).rejects.toThrow('omitidos');
    expect(a.provider.exchanges).toBe(0);
    const results = await Promise.allSettled([1, 2].map(() => completeOAuth(db, vault, a.provider, a.context)));
    expect(results.filter((result) => result.status === 'fulfilled').length).toBe(1);
    expect(a.provider.exchanges).toBe(1);
    await expect(completeOAuth(db, vault, a.provider, a.context)).rejects.toThrow('omitidos');
    expect(a.provider.exchanges).toBe(1);
    expect(await db.accountCredential.count({ where: { accountId: b.account.id } })).toBe(0);
  });

  it('callback Meta recupera conta e sessão somente do state opaco e cifra o token', async () => {
    const a = await fixture('meta-callback');
    const provider: MetaOAuthProvider = {
      kind: 'meta',
      exchangeCode: async (code) => {
        expect(code).toBe('code-from-meta');
        return { accessToken: 'meta-token-for-test-only', expiresIn: 60 * 24 * 60 * 60, scopes: [...LOCAL_META_SCOPES] };
      },
      identity: async () => ({ user_id: a.account.professionalId, id: 'meta-app-scoped-id' }),
    };
    await completeOAuthCallback(db, vault, provider, { state: a.context.state, code: 'code-from-meta' });
    const credential = await db.accountCredential.findUniqueOrThrow({ where: { accountId: a.account.id } });
    expect(Buffer.from(credential.ciphertext).includes(Buffer.from('meta-token-for-test-only'))).toBe(false);
    expect((await getConnectedToken(db, vault, a.account.id)).accessToken).toBe('meta-token-for-test-only');
    await expect(completeOAuthCallback(db, vault, provider, { state: a.context.state, code: 'replay' })).rejects.toThrow('omitidos');
  });

  it('state/sessão expirados, scopes ausentes e user_id não comprovado bloqueiam conexão', async () => {
    for (const reason of ['state-expired', 'session-expired', 'missing-scope', 'missing-user-id', 'wrong-user-id']) {
      const a = await fixture(reason);
      if (reason === 'state-expired') await db.metaOAuthState.update({ where: { stateHash: stateHash(a.context.state) }, data: { expiresAt: new Date(Date.now() - 1000) } });
      if (reason === 'session-expired') await db.session.update({ where: { id: a.session.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
      if (reason === 'missing-scope') a.provider = new FakeOAuthProvider(a.account.professionalId, 'app-only', [LOCAL_META_SCOPES[0]]);
      if (reason === 'missing-user-id') a.provider.identity = async () => ({ id: a.account.professionalId });
      if (reason === 'wrong-user-id') a.provider.identity = async () => ({ user_id: 'different-professional', id: a.account.professionalId });
      await expect(completeOAuth(db, vault, a.provider, a.context), reason).rejects.toThrow('omitidos');
      expect(await db.accountCredential.count({ where: { accountId: a.account.id } }), reason).toBe(0);
    }
  });

  it('contas têm ciphertext próprio; rotação/reconexão/revogação de A preservam B', async () => {
    const a = await connected('cipher-A');
    const b = await connected('cipher-B');
    const tokenA = await getConnectedToken(db, vault, a.account.id);
    const tokenB = await getConnectedToken(db, vault, b.account.id);
    const beforeB = await db.accountCredential.findUniqueOrThrow({ where: { accountId: b.account.id } });
    const credentialA = await db.accountCredential.findUniqueOrThrow({ where: { accountId: a.account.id } });
    expect(() => vault.decrypt(b.account.id, credentialA.generation, credentialA.keyVersion, credentialA.ciphertext)).toThrow('omitidos');
    const rotated = new TokenVault(keys, 2);
    await rotateCredentialKey(db, rotated, a.account.id);
    expect((await db.accountCredential.findUniqueOrThrow({ where: { accountId: a.account.id } })).keyVersion).toBe(2);
    expect((await getConnectedToken(db, rotated, a.account.id)).accessToken === tokenA.accessToken).toBe(true);
    const state = await createOAuthState(db, a.account.id, a.session.id);
    await completeOAuth(db, rotated, a.provider, { ...a.context, state });
    await expect(getConnectedToken(db, rotated, a.account.id, tokenA.generation)).rejects.toThrow('omitidos');
    await revokeConnection(db, a.account.id);
    await expect(getConnectedToken(db, rotated, a.account.id)).rejects.toThrow('omitidos');
    const afterB = await db.accountCredential.findUniqueOrThrow({ where: { accountId: b.account.id } });
    expect(Buffer.from(beforeB.ciphertext).equals(Buffer.from(afterB.ciphertext))).toBe(true);
    expect((await getConnectedToken(db, rotated, b.account.id)).accessToken === tokenB.accessToken).toBe(true);
  });

  it('refresh só após 24h, com token válido; concorrência reserva uma lease durável', async () => {
    const a = await connected('refresh');
    await expect(refreshConnection(db, vault, a.provider, a.account.id)).rejects.toThrow('omitidos');
    expect(a.provider.refreshes).toBe(0);
    await db.accountCredential.update({ where: { accountId: a.account.id }, data: { issuedAt: new Date(Date.now() - 25 * 60 * 60_000) } });
    const results = await Promise.allSettled([1, 2].map(() => refreshConnection(db, vault, a.provider, a.account.id)));
    expect(results.filter((result) => result.status === 'fulfilled').length).toBe(1);
    expect(a.provider.refreshes).toBe(1);
    expect((await db.accountCredential.findUniqueOrThrow({ where: { accountId: a.account.id } })).refreshLease).toBeNull();
    await db.accountCredential.update({ where: { accountId: a.account.id }, data: { issuedAt: new Date(Date.now() - 25 * 60 * 60_000), expiresAt: new Date(Date.now() - 1000) } });
    await expect(refreshConnection(db, vault, a.provider, a.account.id)).rejects.toThrow('omitidos');
    expect(a.provider.refreshes).toBe(1);
  });

  it('resposta tardia após revogação/reconexão não sobrescreve nova geração', async () => {
    const a = await fixture('late-oauth');
    let release: () => void = () => undefined;
    const pending = new Promise<void>((done) => { release = done; });
    const entered = Promise.withResolvers<void>();
    const provider: SyntheticOAuthProvider = { kind: 'synthetic', identity: () => a.provider.identity(), refresh: () => a.provider.refresh(),
      exchangeCode: async () => { entered.resolve(); await pending; return a.provider.exchangeCode(); },
    };
    const completing = completeOAuth(db, vault, provider, a.context);
    const result = Promise.allSettled([completing]);
    await entered.promise;
    await revokeConnection(db, a.account.id);
    const state = await createOAuthState(db, a.account.id, a.session.id);
    await completeOAuth(db, vault, a.provider, { ...a.context, state });
    const current = await getConnectedToken(db, vault, a.account.id);
    release();
    expect((await result)[0].status).toBe('rejected');
    expect((await getConnectedToken(db, vault, a.account.id)).accessToken === current.accessToken).toBe(true);
  });

  it('revogação indicada pelo provider limita A e sanitiza erros', async () => {
    const a = await connected('revoked-A');
    const b = await connected('revoked-B');
    await db.accountCredential.update({ where: { accountId: a.account.id }, data: { issuedAt: new Date(Date.now() - 25 * 60 * 60_000) } });
    a.provider.refresh = async () => { throw new SyntheticOAuthRevoked(); };
    await expect(refreshConnection(db, vault, a.provider, a.account.id)).rejects.toThrow('omitidos');
    await expect(getConnectedToken(db, vault, a.account.id)).rejects.toThrow('omitidos');
    expect((await getConnectedToken(db, vault, b.account.id)).generation).toBe(1);
  });

  it('lease abandonada só expira no prazo; refresh tardio não substitui reconexão', async () => {
    const a = await connected('refresh-lease');
    await db.accountCredential.update({ where: { accountId: a.account.id }, data: {
      issuedAt: new Date(Date.now() - 25 * 60 * 60_000), refreshLease: randomUUID(), refreshLeasedUntil: new Date(Date.now() + 60_000),
    } });
    await expect(refreshConnection(db, vault, a.provider, a.account.id)).rejects.toThrow('omitidos');
    expect(a.provider.refreshes).toBe(0);
    await db.accountCredential.update({ where: { accountId: a.account.id }, data: { refreshLeasedUntil: new Date(Date.now() - 1000) } });
    const restarted = createPrisma();
    try { await refreshConnection(restarted, vault, a.provider, a.account.id); }
    finally { await restarted.$disconnect(); }
    expect(a.provider.refreshes).toBe(1);
    await db.accountCredential.update({ where: { accountId: a.account.id }, data: { issuedAt: new Date(Date.now() - 25 * 60 * 60_000) } });
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const delayed: SyntheticOAuthProvider = { kind: 'synthetic', exchangeCode: () => a.provider.exchangeCode(), identity: () => a.provider.identity(),
      refresh: async () => { entered.resolve(); await release.promise; return a.provider.refresh(); },
    };
    const result = Promise.allSettled([refreshConnection(db, vault, delayed, a.account.id)]);
    await entered.promise;
    const state = await createOAuthState(db, a.account.id, a.session.id);
    await completeOAuth(db, vault, a.provider, { ...a.context, state });
    const current = await getConnectedToken(db, vault, a.account.id);
    release.resolve();
    expect((await result)[0].status).toBe('rejected');
    expect((await getConnectedToken(db, vault, a.account.id)).accessToken === current.accessToken).toBe(true);
  });
});
