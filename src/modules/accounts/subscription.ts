import type { Database } from '../../shared/db';
import { lockAccount } from '../../shared/account-lock';
import { WEBHOOK_FIELDS, type WebhookApp } from '../../integrations/meta/webhook';

export async function subscribeSyntheticAccount(db: Database, accountId: string, app: WebhookApp) {
  if (app.kind !== 'synthetic' || !/^[a-z0-9-]{1,50}$/.test(app.alias)) throw new Error('App fictício inválido.');
  await db.$transaction(async (tx) => {
    await lockAccount(tx, accountId);
    const account = await tx.instagramAccount.findUniqueOrThrow({ where: { id: accountId }, include: { credential: true } });
    if (account.connectionGeneration < 1 || !account.credential || account.credential.revokedAt ||
        account.credential.generation !== account.connectionGeneration) throw new Error('Conexão fictícia indisponível.');
    await tx.instagramAccount.update({ where: { id: accountId }, data: {
      webhookAppAlias: app.alias, webhookGeneration: account.connectionGeneration, webhookFields: [...WEBHOOK_FIELDS],
    } });
  });
}
