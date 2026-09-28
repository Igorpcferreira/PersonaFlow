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

beforeEach(() => { vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Rede externa proibida neste teste.')); });
afterEach(() => { expect(vi.mocked(globalThis.fetch).mock.calls.length).toBe(0); vi.restoreAllMocks(); });
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
});
