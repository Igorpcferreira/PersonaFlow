import { randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InstagramLoginOAuthProvider, metaAuthorizationURL } from '../../src/integrations/meta/oauth-contract';
import { parseMetaRuntimeConfig, parseMetaWebhookRuntimeConfig } from '../../src/shared/local-runtime';

const env = {
  PERSONAFLOW_SEND_MODE: 'disabled',
  PERSONAFLOW_TOKEN_KEY: randomBytes(32).toString('hex'),
  META_INSTAGRAM_APP_ID: '1234567890',
  META_INSTAGRAM_APP_SECRET: randomBytes(32).toString('hex'),
  META_INSTAGRAM_OAUTH_CALLBACK_URL: 'https://persona.example.test/api/meta/oauth/callback',
  META_INSTAGRAM_GRAPH_VERSION: 'v25.0',
  META_INSTAGRAM_PILOT_ACCOUNT_ID: '11111111-1111-4111-8111-111111111111',
  META_INSTAGRAM_PILOT_PROFESSIONAL_ID: '17841400000000000',
  META_WEBHOOK_APP_ALIAS: 'somoskyber-pilot',
  META_WEBHOOK_APP_SECRET: randomBytes(32).toString('hex'),
  META_WEBHOOK_VERIFY_TOKEN: randomBytes(32).toString('hex'),
};

afterEach(() => { vi.restoreAllMocks(); });

describe('OAuth Instagram do piloto', () => {
  it('exige callback HTTPS exato, piloto explícito e envio permanentemente desabilitado', () => {
    const config = parseMetaRuntimeConfig(env);
    expect(config.callbackURL).toBe(env.META_INSTAGRAM_OAUTH_CALLBACK_URL);
    for (const invalid of [
      { ...env, PERSONAFLOW_SEND_MODE: 'enabled' },
      { ...env, META_INSTAGRAM_OAUTH_CALLBACK_URL: 'http://persona.example.test/api/meta/oauth/callback' },
      { ...env, META_INSTAGRAM_OAUTH_CALLBACK_URL: 'https://persona.example.test/other' },
      { ...env, META_INSTAGRAM_PILOT_ACCOUNT_ID: 'not-a-uuid' },
    ]) expect(() => parseMetaRuntimeConfig(invalid)).toThrow('valores omitidos');
  });

  it('expõe app Meta de webhook separado, sem aceitar alias ou segredos ausentes', () => {
    const config = parseMetaWebhookRuntimeConfig(env);
    expect(config.webhookAlias).toBe('somoskyber-pilot');
    expect(() => parseMetaWebhookRuntimeConfig({ ...env, META_WEBHOOK_APP_ALIAS: 'Somente Kyber' })).toThrow('valores omitidos');
    expect(() => parseMetaWebhookRuntimeConfig({ ...env, META_WEBHOOK_VERIFY_TOKEN: 'curto' })).toThrow('valores omitidos');
  });

  it('monta autorização somente com state, callback e scopes mínimos', () => {
    const config = parseMetaRuntimeConfig(env);
    const url = metaAuthorizationURL(config, 'state-for-test');
    expect(url.origin + url.pathname).toBe('https://www.instagram.com/oauth/authorize');
    expect(url.searchParams.get('client_id')).toBe(env.META_INSTAGRAM_APP_ID);
    expect(url.searchParams.get('redirect_uri')).toBe(env.META_INSTAGRAM_OAUTH_CALLBACK_URL);
    expect(url.searchParams.get('scope')).toBe('instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments');
    expect(url.searchParams.get('state')).toBe('state-for-test');
    expect(url.toString()).not.toContain(env.META_INSTAGRAM_APP_SECRET);
  });

  it('troca o código no servidor, estende o token e busca a identidade sem usar rede real', async () => {
    const calls: Array<{ url: URL; init: RequestInit }> = [];
    const request = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = new URL(input instanceof URL ? input : String(input));
      calls.push({ url, init: init ?? {} });
      if (url.hostname === 'api.instagram.com') return Response.json({ access_token: 'short-test-token' });
      if (url.pathname.endsWith('/access_token')) return Response.json({ access_token: 'long-test-token', expires_in: 5_184_000 });
      return Response.json({ user_id: env.META_INSTAGRAM_PILOT_PROFESSIONAL_ID, id: 'app-scoped-test-id' });
    });
    const globalFetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Rede externa proibida.'));
    const provider = new InstagramLoginOAuthProvider(parseMetaRuntimeConfig(env), request as typeof fetch);
    const grant = await provider.exchangeCode('authorization-code');
    expect(grant.accessToken).toBe('long-test-token');
    expect(grant.expiresIn).toBe(5_184_000);
    expect(await provider.identity(grant.accessToken)).toEqual({ user_id: env.META_INSTAGRAM_PILOT_PROFESSIONAL_ID, id: 'app-scoped-test-id' });
    expect(calls).toHaveLength(3);
    expect(calls[0].init.method).toBe('POST');
    expect(calls[1].url.searchParams.get('grant_type')).toBe('ig_exchange_token');
    expect(calls[2].url.searchParams.get('fields')).toBe('user_id,id');
    expect(globalFetch).not.toHaveBeenCalled();
  });
});
