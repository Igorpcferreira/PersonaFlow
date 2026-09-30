import { describe, expect, it } from 'vitest';
import { assertLocalRequest, assertSameOrigin, parseAuthConfig, PRODUCTION_ORIGIN } from '../../src/shared/auth-config';

const env = {
  PERSONAFLOW_MODE: 'local-demo', BETTER_AUTH_URL: 'http://127.0.0.1:3000',
  BETTER_AUTH_SECRET: 'synthetic-test-secret-with-enough-characters',
  OPERATOR_ALLOWLIST: 'local-demo:demo-operator-001', PERSONAFLOW_BIND_HOST: '127.0.0.1', NODE_ENV: 'test',
};

describe('limites de autenticação local', () => {
  it.each([
    { PERSONAFLOW_MODE: 'production' }, { NODE_ENV: 'production' },
    { BETTER_AUTH_URL: 'http://external.example' }, { PERSONAFLOW_BIND_HOST: '0.0.0.0' },
    { BETTER_AUTH_URL: 'http://127.0.0.1:3000?host=external.example' },
    { OPERATOR_ALLOWLIST: 'operator@example.invalid' }, { BETTER_AUTH_SECRET: 'short-sensitive-value' },
  ])('recusa modo/configuração insegura com erro sanitizado', (patch) => {
    expect(() => parseAuthConfig({ ...env, ...patch })).toThrow('valores omitidos');
  });

  it('recusa Host/proxy/origem e local desativado', () => {
    const config = parseAuthConfig(env);
    expect(() => assertLocalRequest(new Request('http://external.example'), config)).toThrow();
    expect(() => assertLocalRequest(new Request(config.baseURL, { headers: { host: 'external.example' } }), config)).toThrow();
    expect(() => assertLocalRequest(new Request(config.baseURL, { headers: { 'x-forwarded-for': '192.0.2.1' } }), config)).toThrow();
    expect(() => assertLocalRequest(new Request(config.baseURL, { headers: { 'x-forwarded-for': '127.0.0.1, 192.0.2.1' } }), config)).toThrow();
    expect(() => assertLocalRequest(new Request(config.baseURL, { headers: { 'x-forwarded-host': 'external.example' } }), config)).toThrow();
    expect(() => assertLocalRequest(new Request(config.baseURL, { headers: { 'x-forwarded-for': '127.0.0.1', 'x-forwarded-host': '127.0.0.1:3000', 'x-forwarded-proto': 'http' } }), config)).not.toThrow();
    expect(() => assertLocalRequest(new Request('http://localhost:3000/api/operator', { headers: { host: '127.0.0.1:3000' } }), config)).not.toThrow();
    expect(() => assertLocalRequest(new Request('http://localhost:3001/api/operator', { headers: { host: '127.0.0.1:3000' } }), config)).toThrow();
    expect(() => assertLocalRequest(new Request(config.baseURL), { ...config, mode: 'locked' })).toThrow();
    expect(() => assertSameOrigin(new Request(config.baseURL, { headers: { origin: 'http://external.example' } }), config)).toThrow();
    expect(() => assertSameOrigin(new Request(config.baseURL, { headers: { origin: config.baseURL, 'content-type': 'text/plain' } }), config)).toThrow();
  });

  it('exige produção explícita, URL HTTPS canônica e uma única identidade GitHub imutável', () => {
    const production = {
      ...env, PERSONAFLOW_MODE: 'production', NODE_ENV: 'production', BETTER_AUTH_URL: PRODUCTION_ORIGIN,
      OPERATOR_ALLOWLIST: 'github:123456', GITHUB_CLIENT_ID: 'test-client-id', GITHUB_CLIENT_SECRET: 'test-client-secret',
    };
    expect(parseAuthConfig(production)).toMatchObject({ mode: 'production', baseURL: PRODUCTION_ORIGIN, subjects: ['github:123456'] });
    for (const patch of [
      { BETTER_AUTH_URL: 'http://personaflow.somoskyber.com.br' }, { BETTER_AUTH_URL: `${PRODUCTION_ORIGIN}/admin` },
      { OPERATOR_ALLOWLIST: 'github:123456,github:789012' }, { OPERATOR_ALLOWLIST: 'local-demo:demo-operator-001' },
      { GITHUB_CLIENT_ID: undefined }, { GITHUB_CLIENT_SECRET: undefined }, { PERSONAFLOW_BIND_HOST: '0.0.0.0' },
    ]) expect(() => parseAuthConfig({ ...production, ...patch })).toThrow('valores omitidos');
  });
});
