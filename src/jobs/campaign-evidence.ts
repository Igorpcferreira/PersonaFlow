import { z } from 'zod';
import { createPrisma } from '../shared/db';
import { canonicalApprovedCampaignMediaId, readApprovedFutureMetaPilot } from '../integrations/meta/pilot-runtime';

/** Read-only, content-free evidence for one campaign comment. */
async function main() {
  const commentId = z.string().regex(/^[1-9]\d*$/).parse(process.argv[2]);
  const accountId = z.uuid().parse(process.env.META_INSTAGRAM_PILOT_ACCOUNT_ID);
  // Evidence is read-only and remains available while sending is disabled.
  const campaign = readApprovedFutureMetaPilot({ ...process.env, PERSONAFLOW_SEND_MODE: 'meta-campaign-private-reply' });
  if (!campaign || campaign.accountId !== accountId) throw new Error('Campanha sem seleção válida.');
  const db = createPrisma();
  try {
    const event = await db.inboundEvent.findUnique({ where: { accountId_externalId: { accountId, externalId: `comment:${commentId}` } } });
    const payload = event?.payload as { mediaId?: unknown } | null;
    if (!event || canonicalApprovedCampaignMediaId(campaign, typeof payload?.mediaId === 'string' ? payload.mediaId : null) !== campaign.reelId) { console.log(JSON.stringify({ found: false })); return; }
    const intents = await db.deliveryIntent.findMany({ where: { accountId, eventId: event.id,
      effect: { in: ['private_reply', 'public_reply'] } }, select: { id: true, effect: true, source: true, status: true,
      reason: true, acceptedId: true } });
    const result = [];
    for (const intent of intents) {
      const attempts = await db.deliveryAttempt.count({ where: { accountId, intentId: intent.id } });
      result.push({ effect: intent.effect, source: intent.source, status: intent.status, reason: intent.reason,
        providerIdRecorded: Boolean(intent.acceptedId), attempts });
    }
    console.log(JSON.stringify({ found: true, adAlias: payload?.mediaId === campaign.approvedAdMediaId, processed: Boolean(event.processedAt), intents: result }));
  } finally { await db.$disconnect(); }
}

main().catch(() => { console.error('Evidência indisponível.'); process.exitCode = 1; });
