export type AccountDiagnostics = {
  accountId: string; checkedAt: string; paused: boolean;
  connection: { status: 'connected' | 'expired' | 'revoked' | 'unavailable'; generation: number; expiresAt: string | null; refreshEligible: boolean; subscriptionCurrent: boolean };
  worker: { state: 'active' | 'stale' | 'absent'; seenAt: string | null };
  queue: { unprocessed: number; oldestInboundAgeSeconds: number | null; pending: number; sending: number; oldestPendingAgeSeconds: number | null;
    jobs: { name: string; state: string; count: number; oldestAgeSeconds: number | null }[] };
  limit: { quota: number; used: number; resetsAt: string; cooldownUntil: string | null };
  results: { unknown: number; rejected: number; blocked: number; uncertain: { id: string; conversationId: string; createdAt: string }[] };
};
