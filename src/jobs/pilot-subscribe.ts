import { z } from 'zod';
import { createPrisma } from '../shared/db';
import { TokenVault } from '../modules/accounts/token-vault';
import { subscribePilotComments } from '../modules/accounts/meta-subscription';

const schema = z.object({ PERSONAFLOW_MODE: z.literal('production'),
  PERSONAFLOW_TOKEN_KEY: z.string().regex(/^[a-f0-9]{64}$/),
  META_INSTAGRAM_PILOT_ACCOUNT_ID: z.uuid(), META_INSTAGRAM_PILOT_PROFESSIONAL_ID: z.string().regex(/^[1-9]\d*$/),
  META_INSTAGRAM_GRAPH_VERSION: z.string().regex(/^v[1-9]\d*\.\d+$/),
  META_WEBHOOK_APP_ALIAS: z.string().regex(/^[a-z0-9-]{1,50}$/) });

async function main() {
  if (process.argv.length !== 3 || process.argv[2] !== '--execute')
    throw new Error('Uso: tsx src/jobs/pilot-subscribe.ts --execute');
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) throw new Error('Configuração Meta incompleta; valores omitidos.');
  const config = parsed.data;
  const db = createPrisma();
  try {
    const vault = new TokenVault(new Map([[1, Buffer.from(config.PERSONAFLOW_TOKEN_KEY, 'hex')]]), 1);
    const outcome = await subscribePilotComments(db, vault, { accountId: config.META_INSTAGRAM_PILOT_ACCOUNT_ID,
      professionalId: config.META_INSTAGRAM_PILOT_PROFESSIONAL_ID, webhookAlias: config.META_WEBHOOK_APP_ALIAS,
      graphVersion: config.META_INSTAGRAM_GRAPH_VERSION });
    console.log(JSON.stringify({ event: 'meta.comments.subscription', ...outcome }));
    if (!outcome.confirmed) process.exitCode = 1;
  } finally { await db.$disconnect(); }
}

if (process.argv[1]?.endsWith('pilot-subscribe.ts')) main().catch(() => {
  console.error('Assinatura de comentários não confirmada; detalhes da Meta omitidos.');
  process.exitCode = 1;
});
