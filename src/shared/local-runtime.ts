import { z } from 'zod';
import { createBoss, INBOUND_QUEUE } from '../jobs/queue';
import { TokenVault } from '../modules/accounts/token-vault';
import { DELIVERY_QUEUE } from '../modules/delivery/ledger';
import type { WebhookApp } from '../integrations/meta/webhook';
import { InstagramLoginOAuthProvider, type MetaOAuthSettings } from '../integrations/meta/oauth-contract';
import { createPrisma } from './db';
import { getAuthRuntime } from './auth-runtime';

const secrets = z.object({
  PERSONAFLOW_TOKEN_KEY: z.string().regex(/^[a-f0-9]{64}$/),
  PERSONAFLOW_WEBHOOK_SECRET: z.string().min(32),
  PERSONAFLOW_WEBHOOK_VERIFY_TOKEN: z.string().min(32),
});
export function parseLocalSecrets(env: Record<string, string | undefined>) {
  const parsed = secrets.safeParse(env);
  if (!parsed.success) throw new Error('Configuração da simulação ausente ou inválida; valores omitidos.');
  return parsed.data;
}

const metaConfigSchema = z.object({
  PERSONAFLOW_SEND_MODE: z.literal('disabled'),
  PERSONAFLOW_TOKEN_KEY: z.string().regex(/^[a-f0-9]{64}$/),
  META_INSTAGRAM_APP_ID: z.string().regex(/^\d+$/),
  META_INSTAGRAM_APP_SECRET: z.string().min(32),
  META_INSTAGRAM_OAUTH_CALLBACK_URL: z.url(),
  META_INSTAGRAM_GRAPH_VERSION: z.string().regex(/^v\d+\.\d+$/),
  META_INSTAGRAM_PILOT_ACCOUNT_ID: z.uuid(),
  META_INSTAGRAM_PILOT_PROFESSIONAL_ID: z.string().regex(/^\d+$/),
});

export type MetaRuntimeConfig = MetaOAuthSettings & { pilotAccountId: string; pilotProfessionalId: string };
export type MetaWebhookRuntimeConfig = MetaRuntimeConfig & { webhookAlias: string; webhookSecret: string; webhookVerifyToken: string };

export function parseMetaRuntimeConfig(env: Record<string, string | undefined>): MetaRuntimeConfig {
  const parsed = metaConfigSchema.safeParse(env);
  if (!parsed.success) throw new Error('Configuração Meta ausente ou inválida; valores omitidos.');
  const data = parsed.data;
  const callback = new URL(data.META_INSTAGRAM_OAUTH_CALLBACK_URL);
  if (callback.protocol !== 'https:' || callback.pathname !== '/api/meta/oauth/callback' || callback.search || callback.hash ||
      callback.username || callback.password) throw new Error('Configuração Meta ausente ou inválida; valores omitidos.');
  return { appId: data.META_INSTAGRAM_APP_ID, appSecret: data.META_INSTAGRAM_APP_SECRET, callbackURL: callback.toString(),
    graphVersion: data.META_INSTAGRAM_GRAPH_VERSION, pilotAccountId: data.META_INSTAGRAM_PILOT_ACCOUNT_ID,
    pilotProfessionalId: data.META_INSTAGRAM_PILOT_PROFESSIONAL_ID };
}

export function parseMetaWebhookRuntimeConfig(env: Record<string, string | undefined>): MetaWebhookRuntimeConfig {
  const config = parseMetaRuntimeConfig(env);
  const parsed = z.object({
    META_WEBHOOK_APP_ALIAS: z.string().regex(/^[a-z0-9-]{1,50}$/),
    META_WEBHOOK_APP_SECRET: z.string().min(32),
    META_WEBHOOK_VERIFY_TOKEN: z.string().min(32),
  }).safeParse(env);
  if (!parsed.success) throw new Error('Configuração Meta ausente ou inválida; valores omitidos.');
  return { ...config, webhookAlias: parsed.data.META_WEBHOOK_APP_ALIAS, webhookSecret: parsed.data.META_WEBHOOK_APP_SECRET,
    webhookVerifyToken: parsed.data.META_WEBHOOK_VERIFY_TOKEN };
}

function createMetaRuntime() {
  const config = parseMetaRuntimeConfig(process.env);
  const vault = new TokenVault(new Map([[1, Buffer.from(process.env.PERSONAFLOW_TOKEN_KEY!, 'hex')]]), 1);
  return { db: createPrisma(), vault, config, provider: new InstagramLoginOAuthProvider(config) };
}
const metaRuntime = globalThis as typeof globalThis & { personaMeta?: ReturnType<typeof createMetaRuntime> };
export function getMetaRuntime() {
  return metaRuntime.personaMeta ??= createMetaRuntime();
}

async function createMetaWebhookRuntime() {
  const config = parseMetaWebhookRuntimeConfig(process.env);
  const db = createPrisma();
  const boss = createBoss();
  const app: WebhookApp = { kind: 'meta', alias: config.webhookAlias, secret: config.webhookSecret,
    verifyToken: config.webhookVerifyToken, pilotProfessionalId: config.pilotProfessionalId };
  try { await boss.start(); await boss.createQueue(INBOUND_QUEUE); await boss.createQueue(DELIVERY_QUEUE); }
  catch { await boss.stop().catch(() => undefined); await db.$disconnect().catch(() => undefined); throw new Error('Fila Meta indisponível.'); }
  return { db, boss, app, config };
}
const metaWebhookRuntime = globalThis as typeof globalThis & { personaMetaWebhook?: Promise<Awaited<ReturnType<typeof createMetaWebhookRuntime>>> };

// Uso da rota Meta real: retorna apenas infraestrutura de recepção. Não habilita delivery.
export async function getMetaWebhookRuntime() {
  metaWebhookRuntime.personaMetaWebhook ??= createMetaWebhookRuntime().catch((error: unknown) => {
    metaWebhookRuntime.personaMetaWebhook = undefined;
    throw error;
  });
  return metaWebhookRuntime.personaMetaWebhook;
}
async function createRuntime() {
  const auth = getAuthRuntime();
  if (auth.config.mode !== 'local-demo') throw new Error('Simulação local desabilitada.');
  const settings = parseLocalSecrets(process.env);
  const vault = new TokenVault(new Map([[1, Buffer.from(settings.PERSONAFLOW_TOKEN_KEY, 'hex')]]), 1);
  const app: WebhookApp = { kind: 'synthetic', alias: 'simulation', secret: settings.PERSONAFLOW_WEBHOOK_SECRET,
    verifyToken: settings.PERSONAFLOW_WEBHOOK_VERIFY_TOKEN };
  const boss = createBoss();
  try { await boss.start(); await boss.createQueue(INBOUND_QUEUE); await boss.createQueue(DELIVERY_QUEUE); }
  catch { await boss.stop().catch(() => undefined); throw new Error('Fila local indisponível.'); }
  return { ...auth, vault, app, boss };
}
const runtime = globalThis as typeof globalThis & { personaLocal?: Promise<Awaited<ReturnType<typeof createRuntime>>> };
export async function getLocalRuntime() {
  runtime.personaLocal ??= createRuntime().catch((error: unknown) => { runtime.personaLocal = undefined; throw error; });
  return runtime.personaLocal;
}
