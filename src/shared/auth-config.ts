import { z } from 'zod';

const loopback = new Set(['127.0.0.1', 'localhost', '[::1]']);
export const PRODUCTION_ORIGIN = 'https://personaflow.somoskyber.com.br';
const schema = z.object({
  PERSONAFLOW_MODE: z.enum(['local-demo', 'production', 'locked']),
  BETTER_AUTH_URL: z.url(), BETTER_AUTH_SECRET: z.string().min(32), OPERATOR_ALLOWLIST: z.string().min(1),
  NODE_ENV: z.string().optional(), PERSONAFLOW_BIND_HOST: z.string(),
  GITHUB_CLIENT_ID: z.string().min(1).optional(), GITHUB_CLIENT_SECRET: z.string().min(1).optional(),
});

export type AuthMode = 'local-demo' | 'production' | 'locked';
export type AuthConfig = {
  mode: AuthMode; baseURL: string; secret: string; subjects: string[];
  github?: { clientId: string; clientSecret: string };
};

export function parseAuthConfig(env: Record<string, string | undefined>): AuthConfig {
  const parsed = schema.safeParse(env);
  const fail = () => { throw new Error('Configuração de autenticação inválida; valores omitidos.'); };
  if (!parsed.success) return fail();
  const data = parsed.data;
  const url = new URL(data.BETTER_AUTH_URL);
  const subjects = data.OPERATOR_ALLOWLIST.split(',').map((subject) => subject.trim());
  if (subjects.some((subject) => !/^(local-demo:demo-operator-[a-z0-9-]+|github:[0-9]+)$/.test(subject))) return fail();
  if (data.PERSONAFLOW_MODE === 'production') {
    if (data.NODE_ENV !== 'production' || url.origin !== PRODUCTION_ORIGIN || url.pathname !== '/' ||
        url.search || url.hash || url.username || url.password || !loopback.has(data.PERSONAFLOW_BIND_HOST) ||
        subjects.length !== 1 || !/^github:[0-9]+$/.test(subjects[0]) || !data.GITHUB_CLIENT_ID || !data.GITHUB_CLIENT_SECRET) return fail();
    return { mode: 'production', baseURL: PRODUCTION_ORIGIN, secret: data.BETTER_AUTH_SECRET, subjects,
      github: { clientId: data.GITHUB_CLIENT_ID, clientSecret: data.GITHUB_CLIENT_SECRET } };
  }
  if (url.protocol !== 'http:' || !loopback.has(url.hostname) || url.pathname !== '/' ||
      url.search || url.hash || url.username || url.password || !loopback.has(data.PERSONAFLOW_BIND_HOST)) return fail();
  if (data.PERSONAFLOW_MODE === 'local-demo' && data.NODE_ENV === 'production') return fail();
  return { mode: data.PERSONAFLOW_MODE, baseURL: url.origin, secret: data.BETTER_AUTH_SECRET, subjects };
}

export function assertLocalRequest(request: Request, config: AuthConfig) {
  if (config.mode !== 'local-demo') throw new Error('Demonstração local indisponível.');
  const requestURL = new URL(request.url);
  const baseURL = new URL(config.baseURL);
  // NextRequest normaliza 127.0.0.1 para localhost. O Host original deve continuar
  // exato; aceitar só essa representação interna com a mesma porta e protocolo.
  if (requestURL.origin !== config.baseURL && !(loopback.has(requestURL.hostname) &&
      requestURL.protocol === baseURL.protocol && requestURL.port === baseURL.port &&
      request.headers.get('host') === baseURL.host)) throw new Error('URL local inválida.');
  if (request.headers.has('forwarded')) throw new Error('Encaminhamento local inválido.');
  // Next acrescenta estes headers mesmo sem proxy. Só aceitar os valores locais exatos;
  // o processo web também é iniciado exclusivamente em loopback pelo comando do projeto.
  const forwardedIP = request.headers.get('x-forwarded-for');
  const forwardedHost = request.headers.get('x-forwarded-host');
  const forwardedProto = request.headers.get('x-forwarded-proto');
  if ((forwardedIP && !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(forwardedIP)) ||
      (forwardedHost && forwardedHost !== new URL(config.baseURL).host) ||
      (forwardedProto && forwardedProto !== 'http')) throw new Error('Proxy local inválido.');
  const host = request.headers.get('host');
  if (host && host !== new URL(config.baseURL).host) throw new Error('Host local inválido.');
}

export function assertSameOrigin(request: Request, config: AuthConfig) {
  if (request.headers.get('origin') !== config.baseURL ||
      request.headers.get('content-type')?.split(';')[0] !== 'application/json' ||
      request.headers.get('sec-fetch-site') === 'cross-site') throw new Error('Origem da ação inválida.');
}

export function allowedSubject(config: AuthConfig, provider: string, subject: string) {
  return config.subjects.includes(`${provider}:${subject}`);
}
