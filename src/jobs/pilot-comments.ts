import { z } from 'zod';
import type { Database } from '../shared/db';

const configSchema = z.object({ PERSONAFLOW_MODE: z.literal('production'),
  META_INSTAGRAM_PILOT_ACCOUNT_ID: z.uuid(), META_INSTAGRAM_PILOT_REEL_ID: z.string().regex(/^[1-9]\d*$/) });

/** Read-only evidence for selecting the one controlled test comment. No actor or body is returned. */
export async function listPilotCommentCandidates(db: Database, env: Record<string, string | undefined>, now = new Date()) {
  const config = configSchema.parse(env);
  const items = await db.inboundEvent.findMany({ where: { accountId: config.META_INSTAGRAM_PILOT_ACCOUNT_ID,
    kind: 'comment', receivedAt: { gte: new Date(now.getTime() - 24 * 60 * 60_000) } },
    orderBy: { receivedAt: 'desc' }, take: 20,
    select: { id: true, externalId: true, receivedAt: true, payload: true } });
  const output = [];
  for (const item of items) {
    const payload = item.payload as { mediaId?: unknown } | null;
    if (payload?.mediaId !== config.META_INSTAGRAM_PILOT_REEL_ID || !/^comment:[1-9]\d*$/.test(item.externalId)) continue;
    const intent = await db.deliveryIntent.findFirst({ where: { accountId: config.META_INSTAGRAM_PILOT_ACCOUNT_ID,
      eventId: item.id, effect: 'private_reply' }, select: { status: true, createdAt: true } });
    output.push({ commentId: item.externalId.slice('comment:'.length), receivedAt: item.receivedAt.toISOString(),
      intentStatus: intent?.status ?? 'none', intentCreatedAt: intent?.createdAt.toISOString() ?? null });
  }
  return output;
}

async function main() {
  if (process.argv.length !== 3 || process.argv[2] !== '--list') throw new Error('Uso: tsx src/jobs/pilot-comments.ts --list');
  const { createPrisma } = await import('../shared/db');
  const db = createPrisma();
  try { console.log(JSON.stringify({ candidates: await listPilotCommentCandidates(db, process.env) })); }
  finally { await db.$disconnect(); }
}

if (process.argv[1]?.endsWith('pilot-comments.ts')) main().catch(() => {
  console.error('Consulta de comentários indisponível; conteúdo omitido.');
  process.exitCode = 1;
});
