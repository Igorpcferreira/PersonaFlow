import { randomBytes } from 'node:crypto';
import { z } from 'zod';

export const LOCAL_META_SCOPES = ['instagram_business_basic', 'instagram_business_manage_messages', 'instagram_business_manage_comments'] as const;
export const META_INSTAGRAM_SCOPES = LOCAL_META_SCOPES;
export const identitySchema = z.object({ user_id: z.string().min(1), id: z.string().min(1) });
export const grantSchema = z.object({ accessToken: z.string().min(1), expiresIn: z.number().int().min(60).max(60 * 24 * 60 * 60), scopes: z.array(z.enum(LOCAL_META_SCOPES)) });
export type TokenGrant = z.infer<typeof grantSchema>;

export type MetaOAuthSettings = {
  appId: string;
  appSecret: string;
  callbackURL: string;
  graphVersion: string;
};

const tokenResponseSchema = z.object({ access_token: z.string().min(1), expires_in: z.number().int().min(60).max(60 * 24 * 60 * 60) });

export function metaAuthorizationURL(settings: MetaOAuthSettings, state: string) {
  const url = new URL('https://www.instagram.com/oauth/authorize');
  url.searchParams.set('client_id', settings.appId);
  url.searchParams.set('redirect_uri', settings.callbackURL);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', META_INSTAGRAM_SCOPES.join(','));
  url.searchParams.set('state', state);
  return url;
}

export class SyntheticOAuthRevoked extends Error {
  constructor() { super('Conexão fictícia revogada.'); }
}

// Contrato canônico de teste; formatos HTTP/permissões reais pertencem ao pai PF-015.
export interface SyntheticOAuthProvider {
  readonly kind: 'synthetic';
  exchangeCode(code: string): Promise<TokenGrant>;
  identity(accessToken: string): Promise<unknown>;
  refresh(accessToken: string): Promise<TokenGrant>;
}

export interface MetaOAuthProvider {
  readonly kind: 'meta';
  exchangeCode(code: string): Promise<TokenGrant>;
  identity(accessToken: string): Promise<unknown>;
}

export class InstagramLoginOAuthProvider implements MetaOAuthProvider {
  readonly kind = 'meta' as const;
  constructor(private settings: MetaOAuthSettings, private request: typeof fetch = fetch) {}

  async exchangeCode(code: string): Promise<TokenGrant> {
    const body = new URLSearchParams({ client_id: this.settings.appId, client_secret: this.settings.appSecret,
      grant_type: 'authorization_code', redirect_uri: this.settings.callbackURL, code });
    const short = await this.json('https://api.instagram.com/oauth/access_token', { method: 'POST', body });
    const shortToken = z.object({ access_token: z.string().min(1) }).parse(short).access_token;
    const longURL = new URL(`https://graph.instagram.com/${this.settings.graphVersion}/access_token`);
    longURL.search = new URLSearchParams({ grant_type: 'ig_exchange_token', client_secret: this.settings.appSecret,
      access_token: shortToken }).toString();
    const long = tokenResponseSchema.parse(await this.json(longURL, { method: 'GET' }));
    // A resposta do Instagram Login não devolve os scopes concedidos. Persistimos somente
    // os três scopes exigidos pelo fluxo iniciado por este servidor; chamadas futuras ainda
    // precisam tratar recusas da Meta como conexão inválida, sem ampliar permissões aqui.
    return grantSchema.parse({ accessToken: long.access_token, expiresIn: long.expires_in, scopes: META_INSTAGRAM_SCOPES });
  }

  async identity(accessToken: string): Promise<unknown> {
    const url = new URL(`https://graph.instagram.com/${this.settings.graphVersion}/me`);
    url.search = new URLSearchParams({ fields: 'user_id,id', access_token: accessToken }).toString();
    return this.json(url, { method: 'GET' });
  }

  private async json(url: URL | string, init: RequestInit) {
    const response = await this.request(url, init);
    if (!response.ok) throw new Error('Meta OAuth recusado.');
    return response.json();
  }
}

export class FakeOAuthProvider implements SyntheticOAuthProvider {
  readonly kind = 'synthetic';
  exchanges = 0;
  refreshes = 0;
  constructor(private professionalId: string, private appScopedId: string, private scopes: string[] = [...LOCAL_META_SCOPES]) {}
  private grant(): TokenGrant {
    return grantSchema.parse({ accessToken: `synthetic-token-${randomBytes(16).toString('hex')}`, expiresIn: 60 * 24 * 60 * 60, scopes: this.scopes });
  }
  async exchangeCode() { this.exchanges += 1; return this.grant(); }
  async identity(): Promise<unknown> { return { user_id: this.professionalId, id: this.appScopedId }; }
  async refresh() { this.refreshes += 1; return this.grant(); }
}
