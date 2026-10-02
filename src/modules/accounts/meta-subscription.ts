import type { Database } from '../../shared/db';
import { TokenVault } from './token-vault';
import { subscribeMetaComments } from '../../integrations/meta/subscribe';
import { lockAccount } from '../../shared/account-lock';

export async function subscribePilotComments(db: Database, vault: TokenVault,
  config: { accountId: string; professionalId: string; webhookAlias: string; graphVersion: string },
  request: typeof fetch = fetch) {
  const account = await db.instagramAccount.findUniqueOrThrow({ where: { id: config.accountId }, include: { credential: true } });
  const credential = account.credential;
  if (account.professionalId !== config.professionalId || account.webhookAppAlias !== config.webhookAlias ||
      !credential || credential.revokedAt || credential.generation !== account.connectionGeneration ||
      !credential.expiresAt || credential.expiresAt <= new Date()) throw new Error('Conexão do piloto indisponível.');
  const token = vault.decrypt(account.id, credential.generation, credential.keyVersion, credential.ciphertext);
  const outcome = await subscribeMetaComments({ graphVersion: config.graphVersion, professionalId: config.professionalId,
    accessToken: token }, request);
  if (!outcome.confirmed) return outcome;
  await db.$transaction(async (tx) => {
    await lockAccount(tx, config.accountId);
    const current = await tx.instagramAccount.findUniqueOrThrow({ where: { id: config.accountId }, include: { credential: true } });
    if (current.professionalId !== config.professionalId || current.webhookAppAlias !== config.webhookAlias ||
        current.connectionGeneration !== account.connectionGeneration || current.credential?.generation !== credential.generation ||
        current.credential?.revokedAt) throw new Error('Conexão alterada durante a assinatura.');
    await tx.instagramAccount.update({ where: { id: config.accountId }, data: {
      webhookGeneration: current.connectionGeneration, webhookFields: ['comments'],
    } });
  });
  return outcome;
}
