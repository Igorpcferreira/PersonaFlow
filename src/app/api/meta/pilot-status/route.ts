import { requireOperator } from '@/shared/auth';
import { getAuthRuntime } from '@/shared/auth-runtime';
import { parseMetaRuntimeConfig } from '@/shared/local-runtime';

export async function GET(request: Request) {
  let runtime: ReturnType<typeof getAuthRuntime>;
  try { runtime = getAuthRuntime(); }
  catch { return Response.json({ error: 'Estado do piloto indisponível.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
  const { auth, db, config } = runtime;
  try { await requireOperator(auth, db, config, request); }
  catch { return Response.json({ error: 'Entre como operador para continuar.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } }); }
  try {
    if (config.mode !== 'production') throw new Error('Indisponível.');
    const meta = parseMetaRuntimeConfig(process.env);
    const account = await db.instagramAccount.findUnique({
      where: { id: meta.pilotAccountId }, include: { credential: true },
    });
    if (account && account.professionalId !== meta.pilotProfessionalId) throw new Error('Conta divergente.');
    const credential = account?.credential;
    const connected = Boolean(account && credential && !credential.revokedAt &&
      credential.generation === account.connectionGeneration && credential.expiresAt && credential.expiresAt > new Date());
    const subscribed = Boolean(connected && account?.webhookGeneration === account?.connectionGeneration &&
      account?.webhookFields.includes('comments'));
    return Response.json({ prepared: Boolean(account), connected, subscribed,
      sendingEnabled: process.env.PERSONAFLOW_SEND_MODE === 'meta-private-reply' },
    { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'Estado do piloto indisponível.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
