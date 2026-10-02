import { z } from 'zod';
import { createBoss, INBOUND_QUEUE } from './queue';
import { createPrisma } from '../shared/db';
import { TokenVault } from '../modules/accounts/token-vault';
import { pollEligibleMetaComments, ingestPolledMetaComments } from '../integrations/meta/comment-poll';
import type { WebhookApp } from '../integrations/meta/webhook';

const configSchema = z.object({
  PERSONAFLOW_MODE: z.literal('production'),
  PERSONAFLOW_SEND_MODE: z.literal('disabled'),
  PERSONAFLOW_TOKEN_KEY: z.string().regex(/^[a-f0-9]{64}$/),
  META_INSTAGRAM_GRAPH_VERSION: z.string().regex(/^v[1-9]\d*\.\d+$/),
  META_INSTAGRAM_PILOT_ACCOUNT_ID: z.uuid(),
  META_INSTAGRAM_PILOT_PROFESSIONAL_ID: z.string().regex(/^[1-9]\d*$/),
  META_INSTAGRAM_PILOT_REEL_ID: z.string().regex(/^[1-9]\d*$/),
  META_WEBHOOK_APP_ALIAS: z.string().regex(/^[a-z0-9-]{1,50}$/),
  META_WEBHOOK_APP_SECRET: z.string().min(32),
  META_WEBHOOK_VERIFY_TOKEN: z.string().min(32),
});

async function main() {
  const mode = process.argv[2] ?? '--check';
  if ((mode !== '--check' && mode !== '--ingest') || process.argv.length > 3) throw new Error('Uso: tsx src/jobs/pilot-comment-poll.ts [--check|--ingest]');
  const config = configSchema.parse(process.env);
  const db = createPrisma();
  let boss: ReturnType<typeof createBoss> | undefined;
  try {
    const account = await db.instagramAccount.findUniqueOrThrow({ where: { id: config.META_INSTAGRAM_PILOT_ACCOUNT_ID }, include: { credential: true } });
    const credential = account.credential;
    if (account.professionalId !== config.META_INSTAGRAM_PILOT_PROFESSIONAL_ID || account.webhookAppAlias !== config.META_WEBHOOK_APP_ALIAS ||
        !credential || credential.revokedAt || credential.generation !== account.connectionGeneration || !credential.expiresAt || credential.expiresAt <= new Date())
      throw new Error('Conexão da conta piloto indisponível.');
    const vault = new TokenVault(new Map([[1, Buffer.from(config.PERSONAFLOW_TOKEN_KEY, 'hex')]]), 1);
    const result = await pollEligibleMetaComments({ graphVersion: config.META_INSTAGRAM_GRAPH_VERSION,
      professionalId: config.META_INSTAGRAM_PILOT_PROFESSIONAL_ID, reelId: config.META_INSTAGRAM_PILOT_REEL_ID,
      accessToken: vault.decrypt(account.id, credential.generation, credential.keyVersion, credential.ciphertext) });
    if (mode === '--check') {
      console.log(JSON.stringify({ event: 'meta.pilot.comment_poll.checked', comments: result.comments, ignored: result.ignored }));
      return;
    }
    boss = createBoss();
    await boss.start(); await boss.createQueue(INBOUND_QUEUE);
    const app: WebhookApp = { kind: 'meta', alias: config.META_WEBHOOK_APP_ALIAS, secret: config.META_WEBHOOK_APP_SECRET,
      verifyToken: config.META_WEBHOOK_VERIFY_TOKEN, pilotProfessionalId: config.META_INSTAGRAM_PILOT_PROFESSIONAL_ID };
    const persisted = await ingestPolledMetaComments(db, boss, app, { professionalId: config.META_INSTAGRAM_PILOT_PROFESSIONAL_ID,
      reelId: config.META_INSTAGRAM_PILOT_REEL_ID }, result.eligible);
    console.log(JSON.stringify({ event: 'meta.pilot.comment_poll.ingested', comments: result.comments, ...persisted, ignored: result.ignored }));
  } finally {
    await boss?.stop();
    await db.$disconnect();
  }
}

if (process.argv[1]?.endsWith('pilot-comment-poll.ts')) main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : '';
  const safe = /^Consulta de comentários recusada pela Meta \(HTTP [1-5]\d\d\)\.$/.test(message) ||
    message === 'Conexão da conta piloto indisponível.' ||
    /^Formato da resposta Meta inesperado \(comments:[a-zA-Z0-9.,]{0,160}\)\.$/.test(message);
  console.error(safe ? message : 'Consulta de comentários indisponível; detalhes omitidos.');
  process.exitCode = 1;
});
