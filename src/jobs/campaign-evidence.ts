import { z } from 'zod';
import { createPrisma } from '../shared/db';

/** Read-only, content-free evidence for one campaign comment. */
async function main() {
  const commentId = z.string().regex(/^[1-9]\d*$/).parse(process.argv[2]);
  const accountId = z.uuid().parse(process.env.META_INSTAGRAM_PILOT_ACCOUNT_ID);
  const reelId = z.string().regex(/^[1-9]\d*$/).parse(process.env.META_INSTAGRAM_APPROVED_REEL_ID);
  const db = createPrisma();
  try {
    const event = await db.inboundEvent.findUnique({ where: { accountId_externalId: { accountId, externalId: `comment:${commentId}` } } });
    const payload = event?.payload as { mediaId?: unknown } | null;
    if (!event || payload?.mediaId !== reelId) { console.log(JSON.stringify({ found: false })); return; }
    const intents = await db.deliveryIntent.findMany({ where: { accountId, eventId: event.id,
      effect: { in: ['private_reply', 'public_reply'] } }, select: { id: true, effect: true, status: true,
      reason: true, acceptedId: true } });
    const result = [];
    for (const intent of intents) {
      const attempts = await db.deliveryAttempt.count({ where: { accountId, intentId: intent.id } });
      result.push({ effect: intent.effect, status: intent.status, reason: intent.reason,
        providerIdRecorded: Boolean(intent.acceptedId), attempts });
    }
    console.log(JSON.stringify({ found: true, processed: Boolean(event.processedAt), intents: result }));
  } finally { await db.$disconnect(); }
}

main().catch(() => { console.error('Evidência indisponível.'); process.exitCode = 1; });
