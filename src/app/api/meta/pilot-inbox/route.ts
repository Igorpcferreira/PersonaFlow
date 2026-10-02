import { requireOperator } from '@/shared/auth';
import { getAuthRuntime } from '@/shared/auth-runtime';
import { parseMetaRuntimeConfig } from '@/shared/local-runtime';
import { conversationThread, listConversations } from '@/modules/inbox/queries';

const privateHeaders = { 'Cache-Control': 'no-store' };

export async function GET(request: Request) {
  let runtime: ReturnType<typeof getAuthRuntime>;
  try { runtime = getAuthRuntime(); }
  catch { return Response.json({ error: 'Caixa indisponível.' }, { status: 503, headers: privateHeaders }); }
  const { auth, db, config } = runtime;
  try { await requireOperator(auth, db, config, request); }
  catch { return Response.json({ error: 'Entre como operador para continuar.' }, { status: 401, headers: privateHeaders }); }
  try {
    if (config.mode !== 'production') throw new Error('Modo indisponível.');
    const meta = parseMetaRuntimeConfig(process.env);
    const account = await db.instagramAccount.findUnique({ where: { id: meta.pilotAccountId }, select: { professionalId: true } });
    if (!account || account.professionalId !== meta.pilotProfessionalId) throw new Error('Conta divergente.');
    const conversationId = new URL(request.url).searchParams.get('conversationId');
    if (conversationId) {
      const thread = await conversationThread(db, meta.pilotAccountId, conversationId);
      return Response.json(thread, { headers: privateHeaders });
    }
    const list = await listConversations(db, meta.pilotAccountId);
    return Response.json(list, { headers: privateHeaders });
  } catch {
    return Response.json({ error: 'Caixa indisponível.' }, { status: 503, headers: privateHeaders });
  }
}
