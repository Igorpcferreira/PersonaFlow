import { createPrisma } from '../shared/db';
import { createBoss, INBOUND_QUEUE, processInboundEvent } from './queue';

async function main() {
  const db = createPrisma();
  const boss = createBoss();
  try {
    await boss.start();
    await boss.createQueue(INBOUND_QUEUE);
    await boss.work(INBOUND_QUEUE, async (jobs) => {
      for (const job of jobs) await processInboundEvent(db, job.data);
    });
    console.log('Worker local ativo para eventos persistidos; nenhum transporte de envio configurado.');
    const stop = async () => {
      await boss.stop();
      await db.$disconnect();
      process.exit(0);
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  } catch {
    await boss.stop().catch(() => undefined);
    await db.$disconnect();
    throw new Error('Falha ao iniciar o worker local; detalhes de conexão omitidos.');
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Falha desconhecida.');
  process.exitCode = 1;
});
