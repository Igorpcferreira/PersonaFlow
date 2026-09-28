import { randomBytes } from 'node:crypto';
import type { Database } from '../../shared/db';
import { DEMO_ACCOUNTS } from '../../shared/demo-data';
import { LOCAL_META_SCOPES } from '../../integrations/meta/oauth-contract';
import { WEBHOOK_FIELDS } from '../../integrations/meta/webhook';
import { TokenVault } from './token-vault';

// Apenas fixtures iniciais: repetir preserva reconexão, pausa e trabalho do usuário.
export async function seedSyntheticAccounts(db: Database, vault: TokenVault) {
  for (const account of DEMO_ACCOUNTS) await db.$transaction(async (tx) => {
    const created = await tx.instagramAccount.createMany({ data: [{ ...account, appScopedId: `synthetic-app-${account.id}`,
      connectionGeneration: 1, webhookAppAlias: 'simulation', webhookGeneration: 1, webhookFields: [...WEBHOOK_FIELDS] }], skipDuplicates: true });
    const stored = await tx.instagramAccount.findUnique({ where: { id: account.id } });
    if (!stored || stored.professionalId !== account.professionalId) throw new Error('Identidade da fixture local em conflito.');
    if (created.count) await tx.accountCredential.create({ data: { accountId: account.id,
      ...vault.encrypt(account.id, 1, `synthetic-${randomBytes(32).toString('hex')}`), generation: 1,
      scopes: [...LOCAL_META_SCOPES], issuedAt: new Date(), expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60_000) } });
  });
}
