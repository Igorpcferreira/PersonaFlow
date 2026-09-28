import { PgBoss } from 'pg-boss';
import type { Prisma } from '../generated/prisma/client';
import type { Database } from '../shared/db';
import { getDatabaseUrl } from '../shared/config';

export const INBOUND_QUEUE = 'inbound-event';

export function createBoss(options: { superviseIntervalSeconds?: number; monitorIntervalSeconds?: number } = {}) {
  const boss = new PgBoss({ connectionString: getDatabaseUrl(), schedule: false, ...options });
  boss.on('error', () => console.error('Falha da fila local; detalhes omitidos.'));
  return boss;
}

export async function enqueueInboundEvent(
  db: Database,
  boss: PgBoss,
  accountId: string,
  externalId: string,
) {
  return db.$transaction((tx) => insertInboundEventAndJob(tx, boss, accountId, externalId));
}

export async function insertInboundEventAndJob(
  tx: Prisma.TransactionClient,
  boss: PgBoss,
  accountId: string,
  externalId: string,
) {
    const event = await tx.inboundEvent.create({ data: { accountId, externalId } });
    const adapter = {
      executeSql: async (sql: string, values: unknown[]) => ({
        rows: await tx.$queryRawUnsafe<Record<string, unknown>[]>(sql, ...values),
      }),
    };
    const jobId = await boss.send(
      INBOUND_QUEUE,
      { accountId, eventId: event.id },
      { db: adapter, retryLimit: 1, retryDelay: 0 },
    );
    if (!jobId) throw new Error('Job não persistido.');
    return { event, jobId };
}

export async function processInboundEvent(db: Database, data: unknown) {
  if (!data || typeof data !== 'object') throw new Error('Job inválido.');
  const { accountId, eventId } = data as Record<string, unknown>;
  if (typeof accountId !== 'string' || typeof eventId !== 'string') throw new Error('Job sem conta ou evento.');
  const result = await db.inboundEvent.updateMany({
    where: { accountId, id: eventId, processedAt: null },
    data: { processedAt: new Date() },
  });
  return result.count;
}
