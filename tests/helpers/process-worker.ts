// Processo filho usado somente para comprovar claim abandonado e recuperação real.
import { createPrisma } from '../../src/shared/db';
import { createBoss, processInboundEvent } from '../../src/jobs/queue';

const [queue, mode] = process.argv.slice(2);
const db = createPrisma();
const boss = createBoss({ superviseIntervalSeconds: 1, monitorIntervalSeconds: 1 });

async function main() {
  await boss.start();
  await boss.work(queue, { pollingIntervalSeconds: 0.5 }, async (jobs) => {
    for (const job of jobs) {
      if (mode === 'crash') {
        process.send?.({ type: 'claimed', jobId: job.id, pid: process.pid });
        // Esperar o pai matar o processo sem stop/complete; nenhum transporte envolvido.
        await new Promise(() => undefined);
      } else {
        await processInboundEvent(db, job.data);
        process.send?.({ type: 'processed', jobId: job.id, pid: process.pid });
      }
    }
  });
  process.send?.({ type: 'ready', pid: process.pid });
  process.on('message', async (message) => {
    if (message === 'stop') {
      await boss.stop();
      await db.$disconnect();
      process.exit(0);
    }
  });
}

main().catch(() => {
  console.error('Processo de teste falhou; detalhes omitidos.');
  process.exit(1);
});
