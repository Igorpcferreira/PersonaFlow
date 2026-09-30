import { z } from 'zod';
import { Prisma } from '../generated/prisma/client';
import type { Database } from '../shared/db';

const DAY = 24 * 60 * 60_000;
const accountIdSchema = z.uuid();

export type RetentionResult = {
  accountId: string;
  dryRun: boolean;
  messages: number;
  notes: number;
  deliveryIntents: number;
  inboundEvents: number;
};

export async function retainAccountContent(
  db: Database,
  value: { accountId: string; expectedPilotAccountId: string; execute?: boolean; now?: Date },
): Promise<RetentionResult> {
  const accountId = accountIdSchema.parse(value.accountId);
  const expectedPilotAccountId = accountIdSchema.parse(value.expectedPilotAccountId);
  if (accountId !== expectedPilotAccountId) throw new Error('A retenção aceita somente a conta piloto configurada.');
  const now = value.now ?? new Date();
  if (Number.isNaN(now.getTime())) throw new Error('Data de retenção inválida.');
  const contentCutoff = new Date(now.getTime() - 90 * DAY);
  const eventCutoff = new Date(now.getTime() - 7 * DAY);
  const account = await db.instagramAccount.findUnique({ where: { id: accountId }, select: { id: true } });
  if (!account) throw new Error('Conta piloto inexistente.');

  const messagesWhere = { accountId, body: { not: null }, receivedAt: { lt: contentCutoff } };
  const notesWhere = { accountId, note: { not: null }, noteUpdatedAt: { lt: contentCutoff } };
  const eventsWhere = { accountId, payload: { not: Prisma.DbNull }, receivedAt: { lt: eventCutoff }, processedAt: { not: null } };
  const [messages, notes, inboundEvents, intentRows] = await Promise.all([
    db.message.count({ where: messagesWhere }),
    db.conversation.count({ where: notesWhere }),
    db.inboundEvent.count({ where: eventsWhere }),
    db.$queryRaw<{ count: bigint }[]>`
      SELECT count(*)::bigint AS count
      FROM "DeliveryIntent"
      WHERE "accountId" = ${accountId}::uuid
        AND "createdAt" < ${contentCutoff}
        AND "body" <> '{}'::jsonb
    `,
  ]);
  const deliveryIntents = Number(intentRows[0]?.count ?? 0n);
  const result: RetentionResult = { accountId, dryRun: value.execute !== true, messages, notes, deliveryIntents, inboundEvents };
  if (result.dryRun) return result;

  await db.$transaction(async (tx) => {
    await tx.message.updateMany({ where: messagesWhere, data: { body: null } });
    await tx.conversation.updateMany({ where: notesWhere, data: { note: null, noteUpdatedAt: null } });
    await tx.inboundEvent.updateMany({ where: eventsWhere, data: { payload: Prisma.DbNull } });
    await tx.$executeRaw`
      UPDATE "DeliveryIntent"
      SET "body" = '{}'::jsonb
      WHERE "accountId" = ${accountId}::uuid
        AND "createdAt" < ${contentCutoff}
        AND "body" <> '{}'::jsonb
    `;
  });
  return { ...result, dryRun: false };
}

function commandArguments(argv: string[]) {
  let accountId: string | undefined;
  let execute = false;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--account-id' && argv[index + 1]) { accountId = argv[++index]; continue; }
    if (argv[index] === '--execute') { execute = true; continue; }
    throw new Error('Uso: tsx src/jobs/retention.ts --account-id <UUID> [--execute]');
  }
  if (!accountId) throw new Error('Informe o ID exato da conta piloto com --account-id.');
  const expectedPilotAccountId = process.env.META_INSTAGRAM_PILOT_ACCOUNT_ID;
  if (!expectedPilotAccountId) throw new Error('Defina META_INSTAGRAM_PILOT_ACCOUNT_ID com o UUID da conta piloto.');
  return { accountId: accountIdSchema.parse(accountId), expectedPilotAccountId: accountIdSchema.parse(expectedPilotAccountId), execute };
}

async function main() {
  const { createPrisma } = await import('../shared/db');
  const db = createPrisma();
  try {
    const result = await retainAccountContent(db, commandArguments(process.argv.slice(2)));
    console.log(JSON.stringify(result));
  } finally { await db.$disconnect(); }
}

if (process.argv[1]?.endsWith('retention.ts')) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Falha de retenção.');
    process.exitCode = 1;
  });
}
