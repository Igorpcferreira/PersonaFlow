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

export type RetentionCommand = {
  accountId: string;
  expectedPilotAccountId: string;
  execute: boolean;
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

export function parseRetentionCommand(
  argv: string[],
  env: Record<string, string | undefined> = process.env,
): RetentionCommand {
  let accountId: string | undefined;
  let execute = false;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--account-id' && argv[index + 1]) { accountId = argv[++index]; continue; }
    if (argv[index] === '--execute') { execute = true; continue; }
    throw new Error('Uso: tsx src/jobs/retention.ts --account-id <UUID> [--execute]');
  }
  if (!accountId) throw new Error('Informe o ID exato da conta piloto com --account-id.');
  const expectedPilotAccountId = env.META_INSTAGRAM_PILOT_ACCOUNT_ID;
  if (!expectedPilotAccountId) throw new Error('Defina META_INSTAGRAM_PILOT_ACCOUNT_ID com o UUID da conta piloto.');
  if (execute && env.PERSONAFLOW_RETENTION_EXECUTE !== 'confirm') {
    throw new Error('A execução efetiva exige PERSONAFLOW_RETENTION_EXECUTE=confirm.');
  }
  return { accountId: accountIdSchema.parse(accountId), expectedPilotAccountId: accountIdSchema.parse(expectedPilotAccountId), execute };
}

export function retentionLogLine(result: RetentionResult) {
  return JSON.stringify({
    event: 'retention.completed',
    accountId: result.accountId,
    dryRun: result.dryRun,
    redactions: {
      messages: result.messages,
      notes: result.notes,
      deliveryIntents: result.deliveryIntents,
      inboundEvents: result.inboundEvents,
    },
  });
}

function retentionErrorLogLine(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  const safeMessages = new Set([
    'Informe o ID exato da conta piloto com --account-id.',
    'Defina META_INSTAGRAM_PILOT_ACCOUNT_ID com o UUID da conta piloto.',
    'A execução efetiva exige PERSONAFLOW_RETENTION_EXECUTE=confirm.',
    'A retenção aceita somente a conta piloto configurada.',
    'Conta piloto inexistente.',
    'Data de retenção inválida.',
  ]);
  return JSON.stringify({ event: 'retention.failed', reason: safeMessages.has(message) ? message : 'Falha de retenção.' });
}

async function main() {
  const { createPrisma } = await import('../shared/db');
  const db = createPrisma();
  try {
    const result = await retainAccountContent(db, parseRetentionCommand(process.argv.slice(2)));
    console.log(retentionLogLine(result));
  } finally { await db.$disconnect(); }
}

if (process.argv[1]?.endsWith('retention.ts')) {
  main().catch((error: unknown) => {
    console.error(retentionErrorLogLine(error));
    process.exitCode = 1;
  });
}
