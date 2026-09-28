import { z } from 'zod';
import type { Database } from '../../shared/db';
import { lockAccount } from '../../shared/account-lock';
import { LOCAL_META_SCOPES } from '../../integrations/meta/oauth-contract';
import { BeforeSendFailure, type SyntheticTransport } from '../../integrations/meta/fake-transport';
import { TokenVault } from '../accounts/token-vault';
import { lockConversation } from '../inbox/control';
import { DAY, deliveryBody } from './ledger';

const contextSchema = z.object({ accountId: z.uuid(), intentId: z.uuid() }).strict();
type ExecutionOptions = { now?: Date; leaseMs?: number; timeoutMs?: number };
export async function executeIntent(db: Database, vault: TokenVault, transport: SyntheticTransport,
  context: { accountId: string; intentId: string }, options: ExecutionOptions = {}) {
  if (transport.kind !== 'synthetic' || !contextSchema.safeParse(context).success) throw new Error('Executor local recusado.');
  let now = options.now ?? new Date();
  const reserved = await db.$transaction(async (tx) => {
    await lockAccount(tx, context.accountId);
    const intent = await tx.deliveryIntent.findUniqueOrThrow({ where: { accountId_id: { accountId: context.accountId, id: context.intentId } } });
    await lockConversation(tx, context.accountId, intent.conversationId);
    now = options.now ?? new Date();
    if (intent.status === 'sending' && intent.reservedUntil && intent.reservedUntil <= now) {
      await tx.deliveryAttempt.updateMany({ where: { accountId: context.accountId, intentId: intent.id, status: 'started' }, data: { status: 'unknown', endedAt: now } });
      await tx.deliveryIntent.update({ where: { accountId_id: { accountId: context.accountId, id: intent.id } }, data: { status: 'unknown', reason: 'worker_interrupted' } });
      return null;
    }
    if (intent.status !== 'pending' || (intent.nextAttemptAt && intent.nextAttemptAt > now)) return null;
    const account = await tx.instagramAccount.findUniqueOrThrow({ where: { id: context.accountId }, include: { credential: true } });
    const conversation = await tx.conversation.findUniqueOrThrow({ where: { accountId_id: { accountId: context.accountId, id: intent.conversationId } }, include: { contact: true } });
    const automation = intent.automationId ? await tx.automation.findUnique({ where: { accountId_id: { accountId: context.accountId, id: intent.automationId } } }) : null;
    const event = intent.eventId ? await tx.inboundEvent.findUnique({ where: { accountId_id: { accountId: context.accountId, id: intent.eventId } } }) : null;
    const credential = account.credential;
    let reason: string | null = null;
    if (intent.deadline <= now) reason = 'deadline_expired';
    else if (account.pausedAt) reason = 'account_paused';
    else if (!credential || credential.revokedAt || !credential.expiresAt || credential.expiresAt <= now ||
      credential.generation !== intent.connectionGeneration || account.connectionGeneration !== intent.connectionGeneration ||
      LOCAL_META_SCOPES.some((scope) => !credential.scopes.includes(scope))) reason = 'connection_unavailable';
    else if (intent.source === 'automatic' && (conversation.control !== 'automatic' || conversation.controlVersion !== intent.controlVersion)) reason = 'manual_control';
    else if (intent.source === 'manual' && (conversation.control !== 'manual' || conversation.controlVersion !== intent.controlVersion)) reason = 'control_changed';
    else if (intent.source === 'automatic' && conversation.contact.suppressedAt) reason = 'contact_suppressed';
    else if (intent.source === 'automatic' && (!automation || automation.status !== 'active' || automation.revision !== intent.automationRevision)) reason = 'automation_changed';
    else if (event && (event.generation !== intent.connectionGeneration || (event.payload as { echo?: boolean } | null)?.echo !== false)) reason = 'event_ineligible';
    const commentEffect = event?.kind === 'comment' && ['private_reply', 'public_reply', 'button'].includes(intent.effect);
    if (!reason && !commentEffect && (!conversation.lastEligibleInboundAt || conversation.lastEligibleInboundAt.getTime() + DAY <= now.getTime())) reason = 'window_closed';
    const body = deliveryBody.safeParse(intent.body);
    if (!reason && !body.success) reason = 'payload_invalid';
    if (!reason) {
      try { vault.decrypt(context.accountId, credential!.generation, credential!.keyVersion, credential!.ciphertext); }
      catch { reason = 'connection_unavailable'; }
    }
    if (reason) {
      await tx.deliveryIntent.update({ where: { accountId_id: { accountId: context.accountId, id: intent.id } },
        data: { status: reason === 'deadline_expired' ? 'expired' : 'blocked', reason } });
      return null;
    }
    const limit = await tx.accountLimit.upsert({ where: { accountId: context.accountId }, create: { accountId: context.accountId, windowStartedAt: now }, update: {} });
    const newWindow = limit.windowStartedAt.getTime() + 60_000 <= now.getTime();
    const used = newWindow ? 0 : limit.used;
    if ((limit.cooldownUntil && limit.cooldownUntil > now) || used >= limit.quota) {
      await tx.deliveryIntent.update({ where: { accountId_id: { accountId: context.accountId, id: intent.id } },
        data: { reason: 'account_limit', nextAttemptAt: limit.cooldownUntil && limit.cooldownUntil > now ? limit.cooldownUntil : new Date(limit.windowStartedAt.getTime() + 60_000) } });
      return null;
    }
    await tx.accountLimit.update({ where: { accountId: context.accountId }, data: { used: used + 1, ...(newWindow ? { windowStartedAt: now } : {}) } });
    const number = await tx.deliveryAttempt.count({ where: { accountId: context.accountId, intentId: intent.id } }) + 1;
    const attempt = await tx.deliveryAttempt.create({ data: { accountId: context.accountId, intentId: intent.id, number, startedAt: now } });
    await tx.deliveryIntent.update({ where: { accountId_id: { accountId: context.accountId, id: intent.id } },
      data: { status: 'sending', reservedUntil: new Date(now.getTime() + (options.leaseMs ?? 30_000)), reason: null, nextAttemptAt: null } });
    return { intent, attempt, body: body.data! };
  });
  if (reserved) {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let status: 'accepted' | 'rejected' | 'unknown' | 'pending' = 'unknown';
    let acceptedId: string | null = null;
    let reason = 'ambiguous_result';
    let rateLimited = false;
    try {
      const result = await Promise.race([
        transport.send({ ...context, attemptId: reserved.attempt.id, effect: reserved.intent.effect, body: reserved.body, signal: controller.signal }),
        new Promise<never>((_, reject) => { timer = setTimeout(() => { reject(new Error('Prazo fictício excedido.')); controller.abort(); }, options.timeoutMs ?? 5000); }),
      ]);
      status = result.kind;
      if (result.kind === 'accepted') { acceptedId = result.id; reason = 'synthetic_accepted'; }
      else reason = 'synthetic_rejected';
    } catch (error) {
      if (error instanceof BeforeSendFailure) {
        status = reserved.attempt.number < 3 ? 'pending' : 'rejected';
        rateLimited = error.rateLimited;
        reason = rateLimited ? 'confirmed_rate_limit' : 'confirmed_before_send';
      }
    } finally { if (timer) clearTimeout(timer); }
    await db.$transaction(async (tx) => {
      await lockAccount(tx, context.accountId);
      const intent = await tx.deliveryIntent.findUniqueOrThrow({ where: { accountId_id: { accountId: context.accountId, id: context.intentId } } });
      const attempt = await tx.deliveryAttempt.findUniqueOrThrow({ where: { accountId_id: { accountId: context.accountId, id: reserved.attempt.id } } });
      if (intent.status !== 'sending' || attempt.status !== 'started') return;
      const delayUntil = new Date(now.getTime() + 1000 * 2 ** reserved.attempt.number);
      await tx.deliveryAttempt.update({ where: { accountId_id: { accountId: context.accountId, id: attempt.id } }, data: {
        status: status === 'pending' ? 'before_send_failure' : status, endedAt: new Date(),
      } });
      await tx.deliveryIntent.update({ where: { accountId_id: { accountId: context.accountId, id: intent.id } }, data: {
        status, acceptedId, reason, reservedUntil: null, nextAttemptAt: status === 'pending' ? delayUntil : null,
      } });
      if (rateLimited) await tx.accountLimit.update({ where: { accountId: context.accountId }, data: { cooldownUntil: delayUntil } });
    });
  }
  return db.deliveryIntent.findUniqueOrThrow({ where: { accountId_id: { accountId: context.accountId, id: context.intentId } } });
}
