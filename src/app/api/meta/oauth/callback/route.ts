import { completeOAuthCallback } from '@/modules/accounts/connections';
import { getMetaRuntime } from '@/shared/local-runtime';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const state = url.searchParams.get('state');
    const code = url.searchParams.get('code');
    if (!state || !code || state.length > 512 || code.length > 4096 || url.searchParams.has('error')) throw new Error('Callback inválido.');
    const { db, vault, provider } = getMetaRuntime();
    await completeOAuthCallback(db, vault, provider, { state, code });
    return Response.json({ connected: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'Conexão Meta recusada.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  }
}
