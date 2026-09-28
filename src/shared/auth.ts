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

  return betterAuth({
    appName: 'PersonaFlow', baseURL: config.baseURL, secret: config.secret,
    database: prismaAdapter(db, { provider: 'postgresql', transaction: true }),
    emailAndPassword: { enabled: false },
    // Sem credenciais externas. O handler abaixo recusa sign-in/callback GitHub nesta etapa.
    socialProviders: { github: {
      clientId: 'not-configured-local-stage', clientSecret: 'not-configured-local-stage',
      disableSignUp: true,
    } },
    plugins: config.mode === 'local-demo' ? [localProvider] : [],
    trustedOrigins: [config.baseURL],
    account: { accountLinking: { enabled: false }, encryptOAuthTokens: true },
    session: { expiresIn: 60 * 60 * 8, updateAge: 60 * 60, cookieCache: { enabled: false } },
    advanced: { trustedProxyHeaders: false, defaultCookieAttributes: { httpOnly: true, sameSite: 'lax' } },
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
  assertLocalRequest(request, config);
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session || !await authorizedUser(db, config, session.user.id)) throw new APIError('UNAUTHORIZED', { message: 'Entre como operador.' });
  return session;
}

export async function handleAuthRequest(auth: OperatorAuth, config: AuthConfig, request: Request): Promise<Response> {
  try {
    assertLocalRequest(request, config);
    const path = new URL(request.url).pathname.replace('/api/auth', '');
    if (request.method === 'POST') {
      assertSameOrigin(request, config);
      if (path === '/sign-in/social') {
        const body = await request.clone().json();
        if (body.provider !== 'local-demo' || body.requestSignUp || body.idToken) return Response.json({ error: 'Provedor indisponível nesta etapa local.' }, { status: 403 });
        for (const field of ['callbackURL', 'errorCallbackURL', 'newUserCallbackURL']) {
          const value = body[field];
          if (value !== undefined && (typeof value !== 'string' || !value.startsWith('/') ||
              value.startsWith('//') || /[\\\x00-\x20]/.test(value) || /%2f|%5c/i.test(value) ||
              new URL(value, config.baseURL).origin !== config.baseURL)) {
            return Response.json({ error: 'Destino de login inválido.' }, { status: 403 });
          }
        }
      } else if (path !== '/sign-out') return Response.json({ error: 'Operação indisponível.' }, { status: 404 });
    } else if (request.method !== 'GET' || path !== '/callback/local-demo') {
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
