import { createPrisma } from '../shared/db';
import { createBoss, INBOUND_QUEUE } from './queue';
import { processInboxEvent } from '../modules/inbox/ingestion';
import { startSyntheticDeliveryWorker } from './delivery';
import { parseAuthConfig } from '../shared/auth-config';
import { parseLocalSecrets } from '../shared/local-runtime';
import { TokenVault } from '../modules/accounts/token-vault';

async function main() {
  const db = createPrisma();
  const boss = createBoss();
  let stopDelivery: (() => Promise<void>) | undefined;
  try {
    await boss.start();
    await boss.createQueue(INBOUND_QUEUE);
    if (process.env.PERSONAFLOW_MODE === 'local-demo') {
      parseAuthConfig(process.env);
      const settings = parseLocalSecrets(process.env);
      stopDelivery = await startSyntheticDeliveryWorker(db, boss, new TokenVault(new Map([[1, Buffer.from(settings.PERSONAFLOW_TOKEN_KEY, 'hex')]]), 1));
    }
    await boss.work(INBOUND_QUEUE, { pollingIntervalSeconds: 0.5 }, async (jobs) => {
      for (const job of jobs) await processInboxEvent(db, job.data);
    });
    console.log('Worker local ativo; efeitos exclusivamente sintéticos no banco local.');
    const stop = async () => {
      await stopDelivery?.();
      await boss.stop();
      await db.$disconnect();
      process.exit(0);
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  } catch {
    await stopDelivery?.();
    await boss.stop().catch(() => undefined);
    await db.$disconnect();
    throw new Error('Falha ao iniciar o worker local; detalhes de conexão omitidos.');
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Falha desconhecida.');
  process.exitCode = 1;
});
