import type { Database } from '../../shared/db';
import { dateRange, parseInboxFilters } from './filters';

export async function inboxMetrics(db: Database, accountId: string, value: unknown = {}) {
  const filters = parseInboxFilters(value), range = dateRange(filters);
  return db.$transaction(async (tx) => {
    const where = { accountId, createdAt: range };
    const statuses = await tx.deliveryIntent.groupBy({ by: ['status'], where, _count: { _all: true } });
    const effects = await tx.deliveryIntent.groupBy({ by: ['effect'], where, _count: { _all: true } });
    const counts = Object.fromEntries(statuses.map((row) => [row.status, row._count._all]));
    const totalIntents = statuses.reduce((total, row) => total + row._count._all, 0);
    const accepted = counts.accepted ?? 0, rejected = counts.rejected ?? 0, denominator = accepted + rejected;
    const attempts = await tx.deliveryAttempt.count({ where: { accountId, intent: where } });
    const retryAttempts = await tx.deliveryAttempt.count({ where: { accountId, number: { gt: 1 }, intent: where } });
    const inbound = await tx.message.count({ where: { accountId, direction: 'inbound', echo: false, receivedAt: range } });
    return { accountId, totalIntents, accepted, rejected, unknown: counts.unknown ?? 0, blocked: counts.blocked ?? 0,
      pending: counts.pending ?? 0, sending: counts.sending ?? 0, canceled: counts.canceled ?? 0, expired: counts.expired ?? 0,
      denominator, acceptanceRate: denominator ? Math.round(1000 * accepted / denominator) / 10 : null,
      attempts, retryAttempts, inbound, effects: effects.map((row) => ({ effect: row.effect, count: row._count._all })),
      period: { from: filters.from ?? null, to: filters.to ?? null, timezone: 'UTC-03:00' }, simulation: true };
  }, { isolationLevel: 'RepeatableRead' });
}
export type InboxMetrics = Awaited<ReturnType<typeof inboxMetrics>>;
