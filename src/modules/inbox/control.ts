import type { Prisma } from '../../generated/prisma/client';
import type { Database } from '../../shared/db';
import { lockAccount } from '../../shared/account-lock';

export async function lockConversation(tx: Prisma.TransactionClient, accountId: string, conversationId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Conversation" WHERE "accountId" = ${accountId}::uuid AND id = ${conversationId}::uuid FOR UPDATE`;
  if (!rows.length) throw new Error('Conversa inexistente nesta conta.');
}
export async function setConversationControl(db: Database, accountId: string, conversationId: string, control: 'automatic' | 'manual') {
  return db.$transaction(async (tx) => {
    await lockAccount(tx, accountId);
    await lockConversation(tx, accountId, conversationId);
    const conversation = await tx.conversation.update({ where: { accountId_id: { accountId, id: conversationId } },
      data: { control, controlVersion: { increment: 1 } } });
    await tx.deliveryIntent.updateMany({ where: { accountId, conversationId, source: 'automatic', status: 'pending' },
      data: { status: 'canceled', reason: control === 'manual' ? 'manual_control' : 'control_changed' } });
    const inFlight = await tx.deliveryIntent.count({ where: { accountId, conversationId, status: 'sending' } });
    return { conversation, inFlight };
  });
}
export async function setAccountPause(db: Database, accountId: string, paused: boolean) {
  await db.$transaction(async (tx) => {
    await lockAccount(tx, accountId);
    await tx.instagramAccount.update({ where: { id: accountId }, data: { pausedAt: paused ? new Date() : null } });
    if (paused) await tx.deliveryIntent.updateMany({ where: { accountId, status: 'pending' }, data: { status: 'canceled', reason: 'account_paused' } });
  });
}
