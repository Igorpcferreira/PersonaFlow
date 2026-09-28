import { randomBytes } from 'node:crypto';
import { z } from 'zod';

export const LOCAL_META_SCOPES = ['instagram_business_basic', 'instagram_business_manage_messages', 'instagram_business_manage_comments'] as const;
export const identitySchema = z.object({ user_id: z.string().min(1), id: z.string().min(1) });
export const grantSchema = z.object({ accessToken: z.string().min(1), expiresIn: z.number().int().min(60).max(60 * 24 * 60 * 60), scopes: z.array(z.enum(LOCAL_META_SCOPES)) });
export type TokenGrant = z.infer<typeof grantSchema>;

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
