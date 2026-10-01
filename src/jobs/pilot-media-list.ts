import { z } from 'zod';
import { createPrisma } from '../shared/db';
import { TokenVault } from '../modules/accounts/token-vault';

const settingsSchema = z.object({
  PERSONAFLOW_MODE: z.literal('production'),
  PERSONAFLOW_TOKEN_KEY: z.string().regex(/^[a-f0-9]{64}$/),
  META_INSTAGRAM_PILOT_ACCOUNT_ID: z.uuid(),
  META_INSTAGRAM_PILOT_PROFESSIONAL_ID: z.string().regex(/^[1-9]\d*$/),
  META_INSTAGRAM_GRAPH_VERSION: z.string().regex(/^v[1-9]\d*\.\d+$/),
});
const mediaSchema = z.object({ data: z.array(z.object({
  id: z.string().regex(/^[1-9]\d*$/),
  media_type: z.string().optional(),
  media_product_type: z.string().optional(),
  permalink: z.string().url().optional(),
  timestamp: z.string().datetime({ offset: true }).optional(),
})).max(25) });

async function main() {
  if (process.argv.length !== 3 || process.argv[2] !== '--list')
    throw new Error('Uso: tsx src/jobs/pilot-media-list.ts --list');
  const config = settingsSchema.parse(process.env);
  const db = createPrisma();
  try {
    const account = await db.instagramAccount.findUniqueOrThrow({
      where: { id: config.META_INSTAGRAM_PILOT_ACCOUNT_ID }, include: { credential: true },
    });
    const credential = account.credential;
    if (account.professionalId !== config.META_INSTAGRAM_PILOT_PROFESSIONAL_ID || !credential || credential.revokedAt ||
        credential.generation !== account.connectionGeneration || !credential.expiresAt || credential.expiresAt <= new Date())
      throw new Error('Conexão da conta piloto indisponível.');
    const vault = new TokenVault(new Map([[1, Buffer.from(config.PERSONAFLOW_TOKEN_KEY, 'hex')]]), 1);
    const token = vault.decrypt(account.id, credential.generation, credential.keyVersion, credential.ciphertext);
    const url = new URL(`https://graph.instagram.com/${config.META_INSTAGRAM_GRAPH_VERSION}/${account.professionalId}/media`);
    url.searchParams.set('fields', 'id,media_type,media_product_type,permalink,timestamp');
    url.searchParams.set('limit', '25');
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`Consulta de mídias recusada pela Meta (HTTP ${response.status}).`);
    const parsed = mediaSchema.parse(await response.json());
    const reels = parsed.data.filter((item) => item.media_product_type === 'REELS' ||
      (item.media_type === 'VIDEO' && item.permalink?.includes('/reel/')));
    console.log(JSON.stringify({ event: 'meta.pilot.reels', count: reels.length,
      reels: reels.map(({ id, permalink, timestamp }) => ({ id, permalink, timestamp })) }));
  } finally { await db.$disconnect(); }
}

main().catch(() => {
  console.error('Não foi possível listar Reels da conta piloto; detalhes da Meta omitidos.');
  process.exitCode = 1;
});
