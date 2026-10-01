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
  timestamp: z.string().max(64).optional(),
})).max(25) });

let diagnosticStage = 'arguments';
async function main() {
  const mode = process.argv[2];
  if (!((mode === '--list' && process.argv.length === 3) ||
        (mode === '--check-comments' && process.argv.length === 4 && /^[1-9]\d*$/.test(process.argv[3]))))
    throw new Error('Uso: tsx src/jobs/pilot-media-list.ts --list|--check-comments MEDIA_ID');
  diagnosticStage = 'configuration';
  const config = settingsSchema.parse(process.env);
  diagnosticStage = 'database';
  const db = createPrisma();
  try {
    diagnosticStage = 'credential';
    const account = await db.instagramAccount.findUniqueOrThrow({
      where: { id: config.META_INSTAGRAM_PILOT_ACCOUNT_ID }, include: { credential: true },
    });
    const credential = account.credential;
    if (account.professionalId !== config.META_INSTAGRAM_PILOT_PROFESSIONAL_ID || !credential || credential.revokedAt ||
        credential.generation !== account.connectionGeneration || !credential.expiresAt || credential.expiresAt <= new Date())
      throw new Error('Conexão da conta piloto indisponível.');
    const vault = new TokenVault(new Map([[1, Buffer.from(config.PERSONAFLOW_TOKEN_KEY, 'hex')]]), 1);
    const token = vault.decrypt(account.id, credential.generation, credential.keyVersion, credential.ciphertext);
    const url = mode === '--list'
      ? new URL(`https://graph.instagram.com/${config.META_INSTAGRAM_GRAPH_VERSION}/${account.professionalId}/media`)
      : new URL(`https://graph.instagram.com/${config.META_INSTAGRAM_GRAPH_VERSION}/${process.argv[3]}/comments`);
    url.searchParams.set('fields', mode === '--list' ? 'id,media_type,media_product_type,permalink,timestamp' : 'id');
    url.searchParams.set('limit', mode === '--list' ? '25' : '1');
    diagnosticStage = 'api';
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`Consulta de mídias recusada pela Meta (HTTP ${response.status}).`);
    diagnosticStage = 'response';
    if (mode === '--check-comments') {
      const parsed = z.object({ data: z.array(z.object({ id: z.string() })).max(1) }).safeParse(await response.json());
      if (!parsed.success) throw new Error('Formato da resposta Meta inesperado (comments).');
      console.log(JSON.stringify({ event: 'meta.pilot.comments_read', accessible: true, mediaId: process.argv[3] }));
      return;
    }
    const parsedResult = mediaSchema.safeParse(await response.json());
    if (!parsedResult.success) throw new Error(`Formato da resposta Meta inesperado (${parsedResult.error.issues.map((issue) => issue.path.join('.')).join(',').slice(0, 200)}).`);
    const parsed = parsedResult.data;
    const reels = parsed.data.filter((item) => item.media_product_type === 'REELS' ||
      (item.media_type === 'VIDEO' && item.permalink?.includes('/reel/')));
    console.log(JSON.stringify({ event: 'meta.pilot.reels', count: reels.length,
      reels: reels.map(({ id, permalink, timestamp }) => ({ id, permalink, timestamp })) }));
  } finally { await db.$disconnect(); }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : '';
  const safe = /^Consulta de mídias recusada pela Meta \(HTTP [1-5]\d\d\)\.$/.test(message) ||
    /^Formato da resposta Meta inesperado \([a-zA-Z0-9.,]{1,200}\)\.$/.test(message) ||
    message === 'Conexão da conta piloto indisponível.';
  console.error(safe ? message : `Não foi possível listar Reels da conta piloto na etapa ${diagnosticStage}; detalhes omitidos.`);
  process.exitCode = 1;
});
