import { z } from 'zod';
import type { Database } from '../../shared/db';
import { lockAccount } from '../../shared/account-lock';
import { RequestRejected } from '../../shared/operator-context';
import { lockConversation } from './control';

const input = z.object({ action: z.literal('organize'), status: z.enum(['open', 'resolved']), note: z.string().trim().max(4000),
  version: z.number().int().nonnegative() }).strict();
export async function organizeConversation(db: Database, accountId: string, conversationId: string, value: unknown) {
  const parsed = input.safeParse(value);
  if (!parsed.success || !z.uuid().safeParse(conversationId).success) throw new RequestRejected(400, 'Revise estado e nota da conversa.');
  return db.$transaction(async (tx) => {
    await lockAccount(tx, accountId);
    const existing = await tx.conversation.findUnique({ where: { accountId_id: { accountId, id: conversationId } } });
    if (!existing) throw new RequestRejected(404);
    await lockConversation(tx, accountId, conversationId);
    if (existing.organizationVersion !== parsed.data.version) throw new RequestRejected(409, 'A organização da conversa mudou. Atualize antes de salvar.');
    const note = parsed.data.note || null;
    return tx.conversation.update({ where: { accountId_id: { accountId, id: conversationId } }, data: {
      status: parsed.data.status, note, organizationVersion: { increment: 1 },
      ...(existing.note !== note ? { noteUpdatedAt: note ? new Date() : null } : {}),
    }, select: { id: true, accountId: true, status: true, note: true, organizationVersion: true } });
  });
}
