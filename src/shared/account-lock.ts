import type { Prisma } from '../generated/prisma/client';

export async function lockAccount(tx: Prisma.TransactionClient, accountId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "InstagramAccount" WHERE "id" = ${accountId}::uuid FOR UPDATE`;
  if (rows.length !== 1) throw new Error('Conta inexistente.');
}
