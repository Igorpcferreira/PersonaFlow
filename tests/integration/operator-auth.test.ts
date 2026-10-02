import { randomBytes, createHash } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPrisma } from '../../src/shared/db';
import { authorizeLocalProvider, createAuth, handleAuthRequest, requireOperator, type OperatorAuth } from '../../src/shared/auth';
import { parseAuthConfig, type AuthConfig } from '../../src/shared/auth-config';

const db = createPrisma();
const config = parseAuthConfig({
  PERSONAFLOW_MODE: 'local-demo', BETTER_AUTH_URL: 'http://127.0.0.1:3000',
  BETTER_AUTH_SECRET: randomBytes(32).toString('hex'), PERSONAFLOW_BIND_HOST: '127.0.0.1',
  OPERATOR_ALLOWLIST: 'local-demo:demo-operator-001', NODE_ENV: 'test',
});
let githubFetchMockActive = false;

class BrowserCookies {
  private values = new Map<string, string>();
  apply(response: Response) {
    for (const line of response.headers.getSetCookie()) {
      const [pair] = line.split(';');
      const index = pair.indexOf('=');
      const name = pair.slice(0, index);
      const value = pair.slice(index + 1);
      if (!value || /max-age=0/i.test(line)) this.values.delete(name); else this.values.set(name, value);
    }
  }
  headers() { return { cookie: [...this.values].map(([key, value]) => `${key}=${value}`).join('; ') }; }
}

function post(path: string, cookies: BrowserCookies, body: unknown, origin = config.baseURL) {
  return new Request(`${config.baseURL}/api/auth${path}`, { method: 'POST', headers: {
    ...cookies.headers(), origin, 'content-type': 'application/json',
  }, body: JSON.stringify(body) });
}

async function begin(auth: OperatorAuth, cookies: BrowserCookies) {
  const result = await handleAuthRequest(auth, config, post('/sign-in/social', cookies, {
    provider: 'local-demo', callbackURL: '/?login=success', errorCallbackURL: '/?login=error',
  }));
  cookies.apply(result);
  const body = await result.json() as { url?: string };
  if (result.status !== 200 || !body.url) throw new Error('Fluxo sintético não iniciou.');
  const provider = await authorizeLocalProvider(db, config, new Request(body.url));
  const callback = provider.headers.get('location');
  if (!callback) throw new Error('Provedor não retornou callback local.');
  return callback;
}

async function login(auth: OperatorAuth, cookies: BrowserCookies) {
  const callback = await begin(auth, cookies);
  const result = await handleAuthRequest(auth, config, new Request(callback, { headers: cookies.headers() }));
  cookies.apply(result);
  expect(new URL(result.headers.get('location') ?? config.baseURL, config.baseURL).searchParams.get('login')).toBe('success');
  return result;
}

function productionConfig() {
  return parseAuthConfig({
    PERSONAFLOW_MODE: 'production', NODE_ENV: 'production', PERSONAFLOW_BIND_HOST: '127.0.0.1',
    BETTER_AUTH_URL: 'https://personaflow.somoskyber.com.br', BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
    OPERATOR_ALLOWLIST: 'github:123456', GITHUB_CLIENT_ID: 'test-client-id', GITHUB_CLIENT_SECRET: 'test-client-secret',
  });
}

function productionPost(config: AuthConfig, cookies: BrowserCookies, body: unknown, headers: HeadersInit = {}) {
  return new Request(`${config.baseURL}/api/auth/sign-in/social`, { method: 'POST', headers: {
    ...cookies.headers(), origin: config.baseURL, 'content-type': 'application/json', ...headers,
  }, body: JSON.stringify(body) });
}

async function beginGitHub(auth: OperatorAuth, config: AuthConfig, cookies: BrowserCookies, headers: HeadersInit = {}) {
  const response = await handleAuthRequest(auth, config, productionPost(config, cookies, {
    provider: 'github', callbackURL: '/', errorCallbackURL: '/?login=error',
  }, headers));
  cookies.apply(response);
  expect(response.status).toBe(200);
  const authorization = new URL((await response.json() as { url: string }).url);
  expect(authorization.origin).toBe('https://github.com');
  expect(authorization.searchParams.get('redirect_uri')).toBe(`${config.baseURL}/api/auth/callback/github`);
  return authorization;
}

function mockGitHub(profile: Record<string, unknown>, emails: unknown) {
  githubFetchMockActive = true;
  vi.mocked(globalThis.fetch).mockImplementation(async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url === 'https://github.com/login/oauth/access_token') {
      return Response.json({ access_token: 'github-test-token', token_type: 'bearer', scope: 'read:user user:email' });
    }
    if (url === 'https://api.github.com/user') return Response.json(profile);
    if (url === 'https://api.github.com/user/emails') return Response.json(emails);
    throw new Error(`Endpoint externo inesperado: ${url}`);
  });
}

function canonicalLocation(response: Response, config: AuthConfig) {
  return new URL(response.headers.get('location') ?? config.baseURL, config.baseURL);
}

beforeEach(() => {
  githubFetchMockActive = false;
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Rede externa proibida neste teste.'));
});
afterEach(() => {
  if (!githubFetchMockActive) expect(vi.mocked(globalThis.fetch)).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});
afterAll(() => db.$disconnect());

describe('PF-014-L: Better Auth/Prisma e provedor sintético sem rede', () => {
  it('persiste sessão, permite instância nova, cookie HttpOnly, logout revoga no banco', async () => {
    const auth = createAuth(db, config);
    const cookies = new BrowserCookies();
    await expect(requireOperator(auth, db, config, new Request(config.baseURL))).rejects.toThrow('Entre como operador');
    const response = await login(auth, cookies);
    expect(response.headers.getSetCookie().some((line) => /httponly/i.test(line) && /samesite=lax/i.test(line))).toBe(true);
    const session = await requireOperator(createAuth(db, config), db, config, new Request(config.baseURL, { headers: cookies.headers() }));
    expect(session.user.name).toBe('Operador fictício');
    expect(await db.session.count({ where: { id: session.session.id } })).toBe(1);
    const out = await handleAuthRequest(auth, config, post('/sign-out', cookies, {}));
    expect(out.status).toBe(200);
    expect(await db.session.count({ where: { id: session.session.id } })).toBe(0);
    await expect(requireOperator(auth, db, config, new Request(config.baseURL, { headers: cookies.headers() }))).rejects.toThrow('Entre como operador');
  });

  it('recusa CSRF no primeiro login/logout, callback sem cookie e replay sem nova sessão', async () => {
    const auth = createAuth(db, config);
    const cookies = new BrowserCookies();
    expect((await handleAuthRequest(auth, config, post('/sign-in/social', cookies, { provider: 'local-demo' }, 'http://external.example'))).status).toBe(403);
    const callback = await begin(auth, cookies);
    const noCookie = await handleAuthRequest(auth, config, new Request(callback));
    expect(new URL(noCookie.headers.get('location') ?? config.baseURL, config.baseURL).searchParams.get('login')).not.toBe('success');
    // Iniciar novamente: um callback inválido pode consumir state defensivamente.
    const validCallback = await begin(auth, cookies);
    const ok = await handleAuthRequest(auth, config, new Request(validCallback, { headers: cookies.headers() }));
    cookies.apply(ok);
    expect(new URL(ok.headers.get('location') ?? config.baseURL, config.baseURL).searchParams.get('login')).toBe('success');
    const count = await db.session.count();
    const replay = await handleAuthRequest(auth, config, new Request(validCallback, { headers: cookies.headers() }));
    expect(new URL(replay.headers.get('location') ?? config.baseURL, config.baseURL).searchParams.get('login')).not.toBe('success');
    expect(await db.session.count()).toBe(count);
    const forbidden = await handleAuthRequest(auth, config, post('/sign-out', cookies, {}, 'http://external.example'));
    expect(forbidden.status).toBe(403);
    expect((await requireOperator(auth, db, config, new Request(config.baseURL, { headers: cookies.headers() }))).user.name).toBe('Operador fictício');
  });

  it('ID imutável fora da allowlist não cria operador, mesmo com email/nome idênticos', async () => {
    const auth = createAuth(db, config);
    const cookies = new BrowserCookies();
    const callback = await begin(auth, cookies);
    const code = new URL(callback).searchParams.get('code')!;
    await db.localOAuthGrant.update({ where: { codeHash: createHash('sha256').update(code).digest('hex') }, data: { subject: 'demo-operator-intruder' } });
    const count = await db.user.count();
    const response = await handleAuthRequest(auth, config, new Request(callback, { headers: cookies.headers() }));
    expect(new URL(response.headers.get('location') ?? config.baseURL, config.baseURL).searchParams.get('login')).not.toBe('success');
    expect(await db.user.count()).toBe(count);
    expect(await db.account.count({ where: { accountId: 'demo-operator-intruder' } })).toBe(0);
  });

  it('PKCE/prazo e callback concorrente: código vinculado e uma única sessão', async () => {
    const auth = createAuth(db, config);
    const cookies = new BrowserCookies();
    for (const reason of ['pkce', 'expired']) {
      const callback = await begin(auth, cookies);
      const code = new URL(callback).searchParams.get('code')!;
      const sessionCount = await db.session.count();
      await db.localOAuthGrant.update({ where: { codeHash: createHash('sha256').update(code).digest('hex') },
        data: reason === 'pkce' ? { challenge: 'different-challenge' } : { expiresAt: new Date(Date.now() - 1000) } });
      const response = await handleAuthRequest(auth, config, new Request(callback, { headers: cookies.headers() }));
      const target = new URL(response.headers.get('location') ?? config.baseURL, config.baseURL);
      expect(target.searchParams.get('login'), reason).not.toBe('success');
      expect(await db.session.count(), reason).toBe(sessionCount);
    }
    const callback = await begin(auth, cookies);
    const count = await db.session.count();
    const responses = await Promise.all([1, 2].map(() => handleAuthRequest(auth, config,
      new Request(callback, { headers: cookies.headers() }))));
    expect(responses.filter((response) => new URL(response.headers.get('location') ?? config.baseURL, config.baseURL).searchParams.get('login') === 'success').length).toBe(1);
    expect(await db.session.count()).toBe(count + 1);
  });

  it('revalida allowlist e expiração; produção/locked não oferece login sintético ou cadastro', async () => {
    const auth = createAuth(db, config);
    const cookies = new BrowserCookies();
    await login(auth, cookies);
    const request = new Request(config.baseURL, { headers: cookies.headers() });
    const changed: AuthConfig = { ...config, subjects: ['github:123456'] };
    await expect(requireOperator(createAuth(db, changed), db, changed, request)).rejects.toThrow('Entre como operador');
    const session = await requireOperator(auth, db, config, request);
    await db.session.update({ where: { id: session.session.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await expect(requireOperator(auth, db, config, request)).rejects.toThrow('Entre como operador');
    const locked = { ...config, mode: 'locked' as const };
    expect((await handleAuthRequest(createAuth(db, locked), locked, post('/sign-in/social', cookies, { provider: 'local-demo' }))).status).toBe(403);
    expect((await handleAuthRequest(auth, config, post('/sign-in/social', cookies, { provider: 'github' }))).status).toBe(403);
    expect((await handleAuthRequest(auth, config, post('/sign-up/email', cookies, { email: 'operator@example.invalid' }))).status).toBe(404);
    expect((await handleAuthRequest(auth, config, new Request(`${config.baseURL}/api/auth/callback/github`))).status).toBe(404);
    expect((await handleAuthRequest(auth, config, post('/sign-in/social', cookies, { provider: 'local-demo', callbackURL: 'https://external.example' }))).status).not.toBe(200);
  });

  it('em produção inicia somente OAuth GitHub na URL canônica, sem consultar rede antes do callback', async () => {
    const production = productionConfig();
    const productionAuth = createAuth(db, production);
    const github = await handleAuthRequest(productionAuth, production, new Request(`${production.baseURL}/api/auth/sign-in/social`, {
      method: 'POST', headers: { origin: production.baseURL, 'content-type': 'application/json' },
      body: JSON.stringify({ provider: 'github', callbackURL: '/', errorCallbackURL: '/?login=error' }),
    }));
    expect(github.status).toBe(200);
    expect(new URL((await github.json() as { url: string }).url).origin).toBe('https://github.com');
    const local = await handleAuthRequest(productionAuth, production, new Request(`${production.baseURL}/api/auth/sign-in/social`, {
      method: 'POST', headers: { origin: production.baseURL, 'content-type': 'application/json' },
      body: JSON.stringify({ provider: 'local-demo', callbackURL: '/' }),
    }));
    expect(local.status).toBe(403);
    for (const body of [
      { provider: 'github', callbackURL: '/', errorCallbackURL: '/?login=error', scopes: ['repo'] },
      { provider: 'github', callbackURL: '/outra', errorCallbackURL: '/?login=error' },
    ]) expect((await handleAuthRequest(productionAuth, production, new Request(`${production.baseURL}/api/auth/sign-in/social`, {
      method: 'POST', headers: { origin: production.baseURL, 'content-type': 'application/json' }, body: JSON.stringify(body),
    }))).status).toBe(403);
  });

  it('em produção, GitHub autorizado cria User, Account e Session com cookie Secure, HttpOnly e SameSite', async () => {
    const production = productionConfig();
    const auth = createAuth(db, production);
    const cookies = new BrowserCookies();
    const authorization = await beginGitHub(auth, production, cookies);
    expect(vi.mocked(globalThis.fetch)).not.toHaveBeenCalled();
    mockGitHub({ id: 123456, login: 'operator', name: 'Operador', email: null }, [
      { email: 'operator@example.test', primary: true, verified: true },
    ]);
    const callback = new URL(`${production.baseURL}/api/auth/callback/github`);
    callback.searchParams.set('code', 'allowed-code');
    callback.searchParams.set('state', authorization.searchParams.get('state')!);
    const before = { users: await db.user.count(), accounts: await db.account.count(), sessions: await db.session.count() };
    const response = await handleAuthRequest(auth, production, new Request(callback, { headers: cookies.headers() }));
    cookies.apply(response);
    expect(canonicalLocation(response, production).origin).toBe(production.baseURL);
    expect(response.headers.getSetCookie().some((line) => /secure/i.test(line) && /httponly/i.test(line) && /samesite=lax/i.test(line))).toBe(true);
    expect(await db.user.count()).toBe(before.users + 1);
    expect(await db.account.count({ where: { providerId: 'github', accountId: '123456' } })).toBe(1);
    expect(await db.session.count()).toBe(before.sessions + 1);
    expect(vi.mocked(globalThis.fetch).mock.calls.map(([url]) => String(url))).toEqual([
      'https://github.com/login/oauth/access_token', 'https://api.github.com/user', 'https://api.github.com/user/emails',
    ]);
  });

  it('em produção, ID GitHub fora da allowlist não associa e-mail existente nem cria User, Account ou Session', async () => {
    const production = productionConfig();
    const auth = createAuth(db, production);
    const cookies = new BrowserCookies();
    const authorization = await beginGitHub(auth, production, cookies);
    const email = 'same-email@example.test';
    await db.user.create({ data: { id: randomBytes(16).toString('hex'), name: 'Existente', email, emailVerified: true, createdAt: new Date(), updatedAt: new Date() } });
    const before = { users: await db.user.count(), accounts: await db.account.count(), sessions: await db.session.count() };
    mockGitHub({ id: 999999, login: 'intruder', email }, [{ email, primary: true, verified: true }]);
    const callback = new URL(`${production.baseURL}/api/auth/callback/github?code=unauthorized-code`);
    callback.searchParams.set('state', authorization.searchParams.get('state')!);
    const response = await handleAuthRequest(auth, production, new Request(callback, { headers: cookies.headers() }));
    expect(canonicalLocation(response, production).searchParams.get('login')).not.toBe('success');
    expect(await db.user.count()).toBe(before.users);
    expect(await db.account.count()).toBe(before.accounts);
    expect(await db.session.count()).toBe(before.sessions);
    expect(vi.mocked(globalThis.fetch).mock.calls.map(([url]) => String(url))).toEqual([
      'https://github.com/login/oauth/access_token', 'https://api.github.com/user',
    ]);
  });

  it('em produção, e-mail não verificado, state ausente ou errado e replay recusam sem sessão', async () => {
    const production = productionConfig();
    const auth = createAuth(db, production);
    const cookies = new BrowserCookies();
    const before = { users: await db.user.count(), accounts: await db.account.count(), sessions: await db.session.count() };
    const unverified = await beginGitHub(auth, production, cookies);
    mockGitHub({ id: 123456, login: 'operator', email: 'operator@example.test' }, [
      { email: 'operator@example.test', primary: true, verified: false },
    ]);
    const unverifiedCallback = new URL(`${production.baseURL}/api/auth/callback/github?code=unverified-code`);
    unverifiedCallback.searchParams.set('state', unverified.searchParams.get('state')!);
    const unverifiedResponse = await handleAuthRequest(auth, production, new Request(unverifiedCallback, { headers: cookies.headers() }));
    expect(canonicalLocation(unverifiedResponse, production).searchParams.get('login')).not.toBe('success');
    expect(await db.user.count()).toBe(before.users);
    expect(await db.account.count()).toBe(before.accounts);
    expect(await db.session.count()).toBe(before.sessions);

    const missing = await handleAuthRequest(auth, production, new Request(`${production.baseURL}/api/auth/callback/github?code=missing-state`, { headers: cookies.headers() }));
    expect(canonicalLocation(missing, production).origin).toBe(production.baseURL);
    await beginGitHub(auth, production, cookies);
    const wrongCallback = new URL(`${production.baseURL}/api/auth/callback/github?code=wrong-state&state=wrong`);
    const wrongResponse = await handleAuthRequest(auth, production, new Request(wrongCallback, { headers: cookies.headers() }));
    expect(canonicalLocation(wrongResponse, production).origin).toBe(production.baseURL);

    const valid = await beginGitHub(auth, production, cookies);
    mockGitHub({ id: 123456, login: 'operator', email: null }, [{ email: 'operator@example.test', primary: true, verified: true }]);
    const validCallback = new URL(`${production.baseURL}/api/auth/callback/github?code=one-time-code`);
    validCallback.searchParams.set('state', valid.searchParams.get('state')!);
    const accepted = await handleAuthRequest(auth, production, new Request(validCallback, { headers: cookies.headers() }));
    expect(canonicalLocation(accepted, production).origin).toBe(production.baseURL);
    const sessionCount = await db.session.count();
    const replay = await handleAuthRequest(auth, production, new Request(validCallback, { headers: cookies.headers() }));
    expect(canonicalLocation(replay, production).origin).toBe(production.baseURL);
    expect(await db.session.count()).toBe(sessionCount);
  });

  it('em produção, POST cruzado e Host ou Forwarded hostis não desviam o callback da URL canônica', async () => {
    const production = productionConfig();
    const auth = createAuth(db, production);
    const cookies = new BrowserCookies();
    const crossOrigin = await handleAuthRequest(auth, production, productionPost(production, cookies, { provider: 'github', callbackURL: '/' }, { origin: 'https://attacker.example' }));
    expect(crossOrigin.status).toBe(403);
    expect(crossOrigin.headers.get('location')).toBeNull();

    const authorization = await beginGitHub(auth, production, cookies, {
      host: 'attacker.example', forwarded: 'host=attacker.example;proto=http',
      'x-forwarded-host': 'attacker.example', 'x-forwarded-proto': 'http',
    });
    mockGitHub({ id: 123456, login: 'operator', email: null }, [{ email: 'operator@example.test', primary: true, verified: true }]);
    const callback = new URL(`${production.baseURL}/api/auth/callback/github?code=canonical-code`);
    callback.searchParams.set('state', authorization.searchParams.get('state')!);
    const response = await handleAuthRequest(auth, production, new Request(callback, { headers: {
      ...cookies.headers(), host: 'attacker.example', forwarded: 'host=attacker.example;proto=http', 'x-forwarded-host': 'attacker.example', 'x-forwarded-proto': 'http',
    } }));
    expect(canonicalLocation(response, production).origin).toBe(production.baseURL);
  });
});
