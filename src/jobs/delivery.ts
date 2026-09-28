import { z } from 'zod';
import type { PgBoss } from 'pg-boss';
import type { Database } from '../shared/db';
import { TokenVault } from '../modules/accounts/token-vault';
import { DELIVERY_QUEUE, simulationOutcomes } from '../modules/delivery/ledger';
import { executeIntent } from '../modules/delivery/executor';
import { FakeTransport, type SyntheticTransport } from '../integrations/meta/fake-transport';

const jobSchema = z.object({ accountId: z.uuid(), intentId: z.uuid() }).strict();
async function outcomeTransport(db: Database, accountId: string, intentId: string) {
  const intent = await db.deliveryIntent.findUniqueOrThrow({ where: { accountId_id: { accountId, id: intentId } }, select: { simulationOutcome: true } });
  return new FakeTransport(db, z.enum(simulationOutcomes).parse(intent.simulationOutcome));
}
export async function sweepDeliveryAccount(db: Database, vault: TokenVault, transport: SyntheticTransport | undefined, accountId: string, now?: Date) {
  if (!z.uuid().safeParse(accountId).success) throw new Error('Conta de manutenção inválida.');
  const scanAt = now ?? new Date();
  const intents = await db.deliveryIntent.findMany({ where: { accountId, OR: [
    { status: 'pending', OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: scanAt } }] },
    { status: 'sending', reservedUntil: { lte: scanAt } },
  ] }, orderBy: { createdAt: 'asc' }, take: 20, select: { id: true } });
  for (const intent of intents) await executeIntent(db, vault, transport ?? await outcomeTransport(db, accountId, intent.id), { accountId, intentId: intent.id }, { now });
  await db.workerHeartbeat.upsert({ where: { accountId_kind: { accountId, kind: 'delivery' } },
    create: { accountId, kind: 'delivery', seenAt: new Date() }, update: { seenAt: new Date() } });
}
export async function startSyntheticDeliveryWorker(db: Database, boss: PgBoss, vault: TokenVault) {
  await boss.createQueue(DELIVERY_QUEUE);
  await boss.work(DELIVERY_QUEUE, { pollingIntervalSeconds: 0.5 }, async (jobs) => {
    for (const job of jobs) {
      const context = jobSchema.parse(job.data);
      await executeIntent(db, vault, await outcomeTransport(db, context.accountId, context.intentId), context);
    }
  });
  let stopped = false;
  let active: Promise<void> | undefined;
  const tick = () => {
    if (stopped || active) return;
    active = (async () => {
      const accounts = await db.instagramAccount.findMany({ select: { id: true }, orderBy: { id: 'asc' } });
      for (const account of accounts) {
        try { await sweepDeliveryAccount(db, vault, undefined, account.id); }
        catch { console.error(JSON.stringify({ accountId: account.id, code: 'local_delivery_maintenance_failed' })); }
      }
    })().catch(() => { console.error(JSON.stringify({ accountId: null, code: 'local_delivery_scan_failed' })); })
      .finally(() => { active = undefined; });
  };
  const interval = setInterval(tick, 1000);
  tick();
  return async () => { stopped = true; clearInterval(interval); await active; };
}
