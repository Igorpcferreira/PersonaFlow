import { z } from 'zod';
import type { PgBoss } from 'pg-boss';
import type { Database } from '../shared/db';
import { TokenVault } from '../modules/accounts/token-vault';
import { DELIVERY_QUEUE } from '../modules/delivery/ledger';
import { executeIntent } from '../modules/delivery/executor';
import { FakeTransport, type SyntheticTransport } from '../integrations/meta/fake-transport';

const jobSchema = z.object({ accountId: z.uuid(), intentId: z.uuid() }).strict();
export async function sweepDeliveryAccount(db: Database, vault: TokenVault, transport: SyntheticTransport, accountId: string, now?: Date) {
  if (!z.uuid().safeParse(accountId).success) throw new Error('Conta de manutenção inválida.');
  const scanAt = now ?? new Date();
  const intents = await db.deliveryIntent.findMany({ where: { accountId, OR: [
    { status: 'pending', OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: scanAt } }] },
    { status: 'sending', reservedUntil: { lte: scanAt } },
  ] }, orderBy: { createdAt: 'asc' }, take: 20, select: { id: true } });
  for (const intent of intents) await executeIntent(db, vault, transport, { accountId, intentId: intent.id }, { now });
  await db.workerHeartbeat.upsert({ where: { accountId_kind: { accountId, kind: 'delivery' } },
    create: { accountId, kind: 'delivery', seenAt: new Date() }, update: { seenAt: new Date() } });
}
export async function startSyntheticDeliveryWorker(db: Database, boss: PgBoss, vault: TokenVault) {
  const transport = new FakeTransport(db);
  await boss.createQueue(DELIVERY_QUEUE);
  await boss.work(DELIVERY_QUEUE, { pollingIntervalSeconds: 0.5 }, async (jobs) => {
    for (const job of jobs) await executeIntent(db, vault, transport, jobSchema.parse(job.data));
  });
  let stopped = false;
  let active: Promise<void> | undefined;
  const tick = () => {
    if (stopped || active) return;
    active = (async () => {
      const accounts = await db.instagramAccount.findMany({ select: { id: true }, orderBy: { id: 'asc' } });
      for (const account of accounts) {
        try { await sweepDeliveryAccount(db, vault, transport, account.id); }
        catch { console.error(JSON.stringify({ accountId: account.id, code: 'local_delivery_maintenance_failed' })); }
      }
    })().catch(() => { console.error(JSON.stringify({ accountId: null, code: 'local_delivery_scan_failed' })); })
      .finally(() => { active = undefined; });
  };
  const interval = setInterval(tick, 1000);
  tick();
  return async () => { stopped = true; clearInterval(interval); await active; };
}
