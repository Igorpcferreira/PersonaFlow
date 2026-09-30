import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { betterAuth } from 'better-auth';
import { APIError } from 'better-auth/api';
import { genericOAuth } from 'better-auth/plugins';
import { prismaAdapter } from '@better-auth/prisma-adapter';
import type { Database } from './db';
import { allowedSubject, assertLocalRequest, assertSameOrigin, type AuthConfig } from './auth-config';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const challenge = (value: string) => createHash('sha256').update(value).digest('base64url');
export const DEMO_OPERATOR_SUBJECT = 'demo-operator-001';
const rejected = () => new APIError('FORBIDDEN', { message: 'Operador não autorizado.' });

type GitHubProfile = { id?: string | number; login?: string; name?: string | null; email?: string | null; avatar_url?: string | null };
type GitHubEmail = { email: string; primary: boolean; verified: boolean };

function githubProvider(config: AuthConfig) {
  if (!config.github) throw new Error('GitHub indisponível.');
  return genericOAuth({ config: [{
    providerId: 'github', name: 'GitHub', clientId: config.github.clientId, clientSecret: config.github.clientSecret,
    authorizationUrl: 'https://github.com/login/oauth/authorize', tokenUrl: 'https://github.com/login/oauth/access_token',
    scopes: ['read:user', 'user:email'], pkce: true,
    accountSubject: ({ profile }) => {
      const subject = String((profile as GitHubProfile).id ?? '');
      if (!/^[0-9]+$/.test(subject) || !allowedSubject(config, 'github', subject)) throw rejected();
      return subject;
    },
    getUserInfo: async (tokens) => {
      if (!tokens.accessToken) return null;
      const headers = { Accept: 'application/vnd.github+json', Authorization: `Bearer ${tokens.accessToken}`, 'User-Agent': 'PersonaFlow' };
      const profileResponse = await fetch('https://api.github.com/user', { headers });
      if (!profileResponse.ok) return null;
      const profile = await profileResponse.json() as GitHubProfile;
      const subject = String(profile.id ?? '');
      // Rejeita antes de entregar o perfil ao ciclo de persistência do Better Auth.
      if (!/^[0-9]+$/.test(subject) || !allowedSubject(config, 'github', subject)) throw rejected();
      const emailResponse = await fetch('https://api.github.com/user/emails', { headers });
      if (!emailResponse.ok) return null;
      const emails = await emailResponse.json() as GitHubEmail[];
      const email = profile.email ?? emails.find((item) => item.primary && item.verified)?.email ?? emails.find((item) => item.verified)?.email;
      const verified = typeof email === 'string' && emails.some((item) => item.email === email && item.verified);
      if (!email || !verified) return null;
      return { id: subject, name: profile.name || profile.login || 'Operador', email, emailVerified: true, image: profile.avatar_url ?? undefined };
    },
  }] });
}

export function createAuth(db: Database, config: AuthConfig) {
  const localProvider = genericOAuth({ config: [{
    providerId: 'local-demo', clientId: 'personaflow-local-synthetic', pkce: true,
    authorizationUrl: `${config.baseURL}/api/local-provider/authorize`,
    scopes: ['profile'],
    accountSubject: ({ profile }) => {
      const subject = String(profile.id ?? '');
      if (!allowedSubject(config, 'local-demo', subject)) throw rejected();
      return subject;
    },
    getToken: async ({ code, redirectURI, codeVerifier }) => {
      if (config.mode !== 'local-demo' || !codeVerifier) throw rejected();
      // DELETE RETURNING é claim de uso único, inclusive em callbacks concorrentes.
      const grants = await db.$queryRaw<{ subject: string }[]>`
        DELETE FROM "LocalOAuthGrant"
        WHERE "codeHash" = ${hash(code)} AND "expiresAt" > NOW()
          AND "challenge" = ${challenge(codeVerifier)} AND "redirectURI" = ${redirectURI}
        RETURNING "subject"`;
      const grant = grants[0];
      if (!grant || !allowedSubject(config, 'local-demo', grant.subject)) throw rejected();
      return { accessToken: `synthetic-${randomUUID()}`, scopes: ['profile'], raw: { subject: grant.subject } };
    },
    getUserInfo: async (tokens) => {
      const subject = tokens.raw?.subject;
      if (typeof subject !== 'string' || !allowedSubject(config, 'local-demo', subject)) throw rejected();
      return { id: subject, name: 'Operador fictício', email: 'operator@example.invalid', emailVerified: true };
    },
  }] });

  const plugins = config.mode === 'local-demo' ? [localProvider] : config.mode === 'production' ? [githubProvider(config)] : [];
  return betterAuth({
    appName: 'PersonaFlow', baseURL: config.baseURL, secret: config.secret,
    database: prismaAdapter(db, { provider: 'postgresql', transaction: true }),
    emailAndPassword: { enabled: false }, socialProviders: {}, plugins,
    trustedOrigins: [config.baseURL],
    account: { accountLinking: { enabled: false }, encryptOAuthTokens: true },
    session: { expiresIn: 60 * 60 * 8, updateAge: 60 * 60, cookieCache: { enabled: false } },
    advanced: { trustedProxyHeaders: false, defaultCookieAttributes: { httpOnly: true, sameSite: 'lax', secure: config.mode === 'production' } },
    logger: { disabled: true },
    databaseHooks: {
      account: { create: { before: async (identity) => {
        if (!allowedSubject(config, identity.providerId, identity.accountId)) throw rejected();
        return { data: identity };
      } } },
      session: { create: { before: async (session) => {
        if (!await authorizedUser(db, config, session.userId)) throw rejected();
        return { data: session };
      } } },
    },
  });
}

export type OperatorAuth = ReturnType<typeof createAuth>;

async function authorizedUser(db: Database, config: AuthConfig, userId: string) {
  const identities = await db.account.findMany({ where: { userId }, select: { providerId: true, accountId: true } });
  return identities.some((identity) => allowedSubject(config, identity.providerId, identity.accountId));
}

export async function requireOperator(auth: OperatorAuth, db: Database, config: AuthConfig, request: Request) {
  if (config.mode === 'local-demo') assertLocalRequest(request, config);
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session || !await authorizedUser(db, config, session.user.id)) throw new APIError('UNAUTHORIZED', { message: 'Entre como operador.' });
  return session;
}

function validLoginDestination(value: unknown, config: AuthConfig) {
  return value === undefined || typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') &&
    !/[\\\x00-\x20]/.test(value) && !/%2f|%5c/i.test(value) && new URL(value, config.baseURL).origin === config.baseURL;
}

export async function handleAuthRequest(auth: OperatorAuth, config: AuthConfig, request: Request): Promise<Response> {
  try {
    if (config.mode === 'local-demo') assertLocalRequest(request, config);
    const path = new URL(request.url).pathname.replace('/api/auth', '');
    const provider = config.mode === 'local-demo' ? 'local-demo' : config.mode === 'production' ? 'github' : undefined;
    if (request.method === 'POST') {
      assertSameOrigin(request, config);
      if (path === '/sign-in/social') {
        const body = await request.clone().json();
        if (!body || typeof body !== 'object' || Array.isArray(body) ||
            (config.mode === 'production' && (Object.keys(body).some((field) => !['provider', 'callbackURL', 'errorCallbackURL'].includes(field)) ||
              body.callbackURL !== '/' || body.errorCallbackURL !== '/?login=error')) ||
            !provider || body.provider !== provider || body.requestSignUp || body.idToken ||
            !['callbackURL', 'errorCallbackURL', 'newUserCallbackURL'].every((field) => validLoginDestination(body[field], config))) return Response.json({ error: 'Provedor indisponível.' }, { status: 403 });
      } else if (path !== '/sign-out') return Response.json({ error: 'Operação indisponível.' }, { status: 404 });
      else if (config.mode === 'production' && JSON.stringify(await request.clone().json()) !== '{}') return Response.json({ error: 'Operação indisponível.' }, { status: 403 });
    } else if (request.method !== 'GET' || !provider || path !== `/callback/${provider}`) {
      return Response.json({ error: 'Operação indisponível.' }, { status: 404 });
    }
    const response = await auth.handler(request);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error) {
    const reasons: Record<string, string> = {
      'Demonstração local indisponível.': 'LOCAL_MODE_REQUIRED',
      'URL local inválida.': 'LOCAL_URL_INVALID',
      'Encaminhamento local inválido.': 'LOCAL_FORWARDING_INVALID',
      'Proxy local inválido.': 'LOCAL_PROXY_INVALID',
      'Host local inválido.': 'LOCAL_HOST_INVALID',
      'Origem da ação inválida.': 'ORIGIN_INVALID',
    };
    const code = error instanceof Error ? reasons[error.message] ?? 'AUTH_ACTION_REJECTED' : 'AUTH_ACTION_REJECTED';
    return Response.json({ error: 'Ação de autenticação recusada.', code }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  }
}

export async function authorizeLocalProvider(db: Database, config: AuthConfig, request: Request) {
  assertLocalRequest(request, config);
  const url = new URL(request.url);
  const redirectURI = url.searchParams.get('redirect_uri');
  const state = url.searchParams.get('state');
  const pkce = url.searchParams.get('code_challenge');
  if (request.method !== 'GET' || redirectURI !== `${config.baseURL}/api/auth/callback/local-demo` ||
      url.searchParams.get('client_id') !== 'personaflow-local-synthetic' ||
      url.searchParams.get('response_type') !== 'code' || !state || state.length > 512 ||
      !pkce || !/^[A-Za-z0-9_-]{43}$/.test(pkce) || url.searchParams.get('code_challenge_method') !== 'S256') {
    throw rejected();
  }
  const code = randomBytes(32).toString('base64url');
  await db.localOAuthGrant.create({ data: {
    codeHash: hash(code), subject: DEMO_OPERATOR_SUBJECT, redirectURI, challenge: pkce,
    expiresAt: new Date(Date.now() + 60_000),
  } });
  const callback = new URL(redirectURI);
  callback.searchParams.set('code', code);
  callback.searchParams.set('state', state);
  return Response.redirect(callback, 302);
}
