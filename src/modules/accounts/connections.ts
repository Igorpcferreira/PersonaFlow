import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Database } from '../../shared/db';
import { lockAccount } from '../../shared/account-lock';
import { grantSchema, identitySchema, LOCAL_META_SCOPES, SyntheticOAuthRevoked, type MetaOAuthProvider, type SyntheticOAuthProvider, type TokenGrant } from '../../integrations/meta/oauth-contract';
import { TokenVault } from './token-vault';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const fail = () => new Error('Conexão local recusada; detalhes e credenciais omitidos.');

type OAuthCodeProvider = SyntheticOAuthProvider | MetaOAuthProvider;

function validateProvider(provider: OAuthCodeProvider) {
  if (provider.kind !== 'synthetic' && provider.kind !== 'meta') throw fail();
}

function verifiedGrant(grant: unknown, scopes: string[]): TokenGrant {
  const result = grantSchema.safeParse(grant);
  if (!result.success || scopes.some((scope) => !result.data.scopes.includes(scope as typeof LOCAL_META_SCOPES[number]))) throw fail();
  return result.data;
}

export async function createOAuthState(db: Database, accountId: string, sessionId: string) {
  const state = randomBytes(32).toString('base64url');
  await db.$transaction(async (tx) => {
    await lockAccount(tx, accountId);
    const account = await tx.instagramAccount.findUniqueOrThrow({ where: { id: accountId } });
    const session = await tx.session.findFirst({ where: { id: sessionId, expiresAt: { gt: new Date() } } });
    if (!session) throw fail();
    await tx.metaOAuthState.create({ data: { stateHash: hash(state), accountId, sessionId, generation: account.connectionGeneration,
      scopes: [...LOCAL_META_SCOPES], expiresAt: new Date(Date.now() + 5 * 60_000),
    } });
  });
  return state;
}

export async function completeOAuth(db: Database, vault: TokenVault, provider: OAuthCodeProvider,
  context: { accountId: string; sessionId: string; state: string; code: string }) {
  validateProvider(provider);
  const { accountId, sessionId, state, code } = context;
  // Sessão/conta incorretas não consomem o state legítimo; callback válido o consome
  // antes de consultar o provider, impedindo replay inclusive durante a troca.
  const claimed = await db.$queryRaw<{ generation: number; scopes: string[] }[]>`
    DELETE FROM "MetaOAuthState" o USING "Session" s
    WHERE o."stateHash" = ${hash(state)} AND o."accountId" = ${accountId}::uuid
      AND o."sessionId" = ${sessionId} AND s."id" = o."sessionId"
      AND o."expiresAt" > NOW() AND s."expiresAt" > NOW()
    RETURNING o."generation", o."scopes"`;
  if (!claimed[0]) throw fail();
  let grant: TokenGrant;
  let identity: { user_id: string; id: string };
  try {
    grant = verifiedGrant(await provider.exchangeCode(code), claimed[0].scopes);
    identity = identitySchema.parse(await provider.identity(grant.accessToken));
  } catch { throw fail(); }
  await db.$transaction(async (tx) => {
    await lockAccount(tx, accountId);
    const account = await tx.instagramAccount.findUniqueOrThrow({ where: { id: accountId } });
    const session = await tx.session.findFirst({ where: { id: sessionId, expiresAt: { gt: new Date() } } });
    if (!session || account.connectionGeneration !== claimed[0].generation || account.professionalId !== identity.user_id) throw fail();
    const generation = account.connectionGeneration + 1;
    const encrypted = vault.encrypt(accountId, generation, grant.accessToken);
    const data = { ...encrypted, generation, scopes: grant.scopes, issuedAt: new Date(),
      expiresAt: new Date(Date.now() + grant.expiresIn * 1000), revokedAt: null, refreshLease: null, refreshLeasedUntil: null };
    await tx.accountCredential.upsert({ where: { accountId }, create: { accountId, ...data }, update: data });
    await tx.instagramAccount.update({ where: { id: accountId }, data: { connectionGeneration: generation, appScopedId: identity.id } });
    await tx.deliveryIntent.updateMany({ where: { accountId, status: 'pending', connectionGeneration: { not: generation } }, data: { status: 'canceled', reason: 'connection_changed' } });
  });
}

// O callback externo carrega apenas state e code. A conta e a sessão são recuperadas do
// state opaco antes do claim de uso único, nunca de parâmetros controlados pela Meta.
export async function completeOAuthCallback(db: Database, vault: TokenVault, provider: MetaOAuthProvider,
  context: { state: string; code: string }) {
  if (provider.kind !== 'meta') throw fail();
  const stateHash = hash(context.state);
  const pending = await db.metaOAuthState.findFirst({ where: { stateHash, expiresAt: { gt: new Date() },
    session: { expiresAt: { gt: new Date() } } }, select: { accountId: true, sessionId: true } });
  if (!pending) throw fail();
  await completeOAuth(db, vault, provider, { ...context, ...pending });
}

export async function getConnectedToken(db: Database, vault: TokenVault, accountId: string, expectedGeneration?: number) {
  const account = await db.instagramAccount.findUnique({ where: { id: accountId }, include: { credential: true } });
  const credential = account?.credential;
  if (!account || !credential || credential.revokedAt || !credential.expiresAt || credential.expiresAt <= new Date() ||
      credential.generation !== account.connectionGeneration || (expectedGeneration !== undefined && account.connectionGeneration !== expectedGeneration) ||
      LOCAL_META_SCOPES.some((scope) => !credential.scopes.includes(scope))) throw fail();
  return { generation: account.connectionGeneration,
    accessToken: vault.decrypt(accountId, credential.generation, credential.keyVersion, credential.ciphertext) };
}

export async function revokeConnection(db: Database, accountId: string) {
  await db.$transaction(async (tx) => {
    await lockAccount(tx, accountId);
    await tx.instagramAccount.update({ where: { id: accountId }, data: { connectionGeneration: { increment: 1 } } });
    await tx.accountCredential.updateMany({ where: { accountId }, data: { revokedAt: new Date(), refreshLease: null, refreshLeasedUntil: null } });
    await tx.deliveryIntent.updateMany({ where: { accountId, status: 'pending' }, data: { status: 'canceled', reason: 'connection_changed' } });
  });
}

export async function rotateCredentialKey(db: Database, vault: TokenVault, accountId: string) {
  await db.$transaction(async (tx) => {
    await lockAccount(tx, accountId);
    const credential = await tx.accountCredential.findUniqueOrThrow({ where: { accountId } });
    const plaintext = vault.decrypt(accountId, credential.generation, credential.keyVersion, credential.ciphertext);
    await tx.accountCredential.update({ where: { accountId }, data: vault.encrypt(accountId, credential.generation, plaintext) });
  });
}

export async function refreshConnection(db: Database, vault: TokenVault, provider: SyntheticOAuthProvider, accountId: string) {
  validateProvider(provider);
  const lease = randomUUID();
  const reserved = await db.$transaction(async (tx) => {
    await lockAccount(tx, accountId);
    const account = await tx.instagramAccount.findUniqueOrThrow({ where: { id: accountId }, include: { credential: true } });
    const credential = account.credential;
    const now = new Date();
    if (!credential || credential.revokedAt || !credential.issuedAt || !credential.expiresAt || credential.expiresAt <= now ||
        credential.issuedAt.getTime() > now.getTime() - 24 * 60 * 60_000 || credential.generation !== account.connectionGeneration ||
        (credential.refreshLeasedUntil && credential.refreshLeasedUntil > now)) throw fail();
    const accessToken = vault.decrypt(accountId, credential.generation, credential.keyVersion, credential.ciphertext);
    await tx.accountCredential.update({ where: { accountId }, data: { refreshLease: lease, refreshLeasedUntil: new Date(now.getTime() + 120_000) } });
    return { accessToken, generation: credential.generation, scopes: credential.scopes };
  });
  try {
    const grant = verifiedGrant(await provider.refresh(reserved.accessToken), reserved.scopes);
    await db.$transaction(async (tx) => {
      await lockAccount(tx, accountId);
      const account = await tx.instagramAccount.findUniqueOrThrow({ where: { id: accountId }, include: { credential: true } });
      if (account.connectionGeneration !== reserved.generation || account.credential?.refreshLease !== lease || account.credential.revokedAt) throw fail();
      await tx.accountCredential.update({ where: { accountId }, data: {
        ...vault.encrypt(accountId, reserved.generation, grant.accessToken), scopes: grant.scopes,
        issuedAt: new Date(), expiresAt: new Date(Date.now() + grant.expiresIn * 1000), refreshLease: null, refreshLeasedUntil: null,
      } });
    });
  } catch (error) {
    if (error instanceof SyntheticOAuthRevoked) await db.$transaction(async (tx) => {
      await lockAccount(tx, accountId);
      const credential = await tx.accountCredential.findUnique({ where: { accountId } });
      if (credential?.refreshLease !== lease) return;
      await tx.instagramAccount.update({ where: { id: accountId }, data: { connectionGeneration: { increment: 1 } } });
      await tx.accountCredential.update({ where: { accountId }, data: { revokedAt: new Date() } });
    });
    throw fail();
  }
  finally {
    await db.accountCredential.updateMany({ where: { accountId, refreshLease: lease }, data: { refreshLease: null, refreshLeasedUntil: null } });
  }
}
