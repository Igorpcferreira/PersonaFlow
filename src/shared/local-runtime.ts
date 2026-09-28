import { z } from 'zod';
import { createBoss, INBOUND_QUEUE } from '../jobs/queue';
import { TokenVault } from '../modules/accounts/token-vault';
import type { WebhookApp } from '../integrations/meta/webhook';
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
async function createRuntime() {
  const auth = getAuthRuntime();
  if (auth.config.mode !== 'local-demo') throw new Error('Simulação local desabilitada.');
  const settings = parseLocalSecrets(process.env);
  const vault = new TokenVault(new Map([[1, Buffer.from(settings.PERSONAFLOW_TOKEN_KEY, 'hex')]]), 1);
  const app: WebhookApp = { kind: 'synthetic', alias: 'simulation', secret: settings.PERSONAFLOW_WEBHOOK_SECRET,
    verifyToken: settings.PERSONAFLOW_WEBHOOK_VERIFY_TOKEN };
  const boss = createBoss();
  try { await boss.start(); await boss.createQueue(INBOUND_QUEUE); }
  catch { await boss.stop().catch(() => undefined); throw new Error('Fila local indisponível.'); }
  return { ...auth, vault, app, boss };
}
const runtime = globalThis as typeof globalThis & { personaLocal?: Promise<Awaited<ReturnType<typeof createRuntime>>> };
export async function getLocalRuntime() {
  runtime.personaLocal ??= createRuntime().catch((error: unknown) => { runtime.personaLocal = undefined; throw error; });
  return runtime.personaLocal;
}
