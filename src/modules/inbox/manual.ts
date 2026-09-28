import { z } from 'zod';
import type { PgBoss } from 'pg-boss';
import type { Database } from '../../shared/db';
import { RequestRejected } from '../../shared/operator-context';
import { createIntent, DAY, simulationOutcomes } from '../delivery/ledger';
import { setConversationControl } from './control';

const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.enum(['assume', 'resume']) }).strict(),
  z.object({ action: z.literal('send'), text: z.string().trim().min(1).max(2000), clientRequestId: z.uuid(),
    simulationOutcome: z.enum(simulationOutcomes).optional() }).strict(),
]);
export async function manualAction(db: Database, boss: PgBoss, accountId: string, conversationId: string, value: unknown) {
  if (!z.uuid().safeParse(conversationId).success) throw new RequestRejected(400);
  const parsed = actionSchema.safeParse(value);
  if (!parsed.success) throw new RequestRejected(400);
  const conversation = await db.conversation.findUnique({ where: { accountId_id: { accountId, id: conversationId } } });
  if (!conversation) throw new RequestRejected(404);
  const action = parsed.data;
  if (action.action !== 'send') return {
    control: await setConversationControl(db, accountId, conversationId, action.action === 'assume' ? 'manual' : 'automatic'),
  };
  const existing = await db.deliveryIntent.findUnique({ where: { accountId_idempotencyKey: { accountId, idempotencyKey: `manual:${action.clientRequestId}` } } });
  if (existing) {
    if (existing.conversationId !== conversationId) throw new RequestRejected(409);
    return { intentId: existing.id, status: existing.status, simulation: true };
  }
  if (conversation.control !== 'manual' || !conversation.lastEligibleInboundAt || conversation.lastEligibleInboundAt.getTime() + DAY <= Date.now()) throw new RequestRejected(409);
  const intent = await createIntent(db, boss, { accountId, conversationId, source: 'manual', effect: 'manual',
    clientRequestId: action.clientRequestId, simulationOutcome: action.simulationOutcome, body: { text: action.text } });
  return { intentId: intent.id, status: intent.status, simulation: true };
}
