import { z } from 'zod';
import { requireOperator } from './auth';
import { assertSameOrigin } from './auth-config';
import { getLocalRuntime } from './local-runtime';
import { getAuthRuntime } from './auth-runtime';

export class RequestRejected extends Error {
  constructor(readonly status: number, readonly publicMessage?: string) { super('Solicitação local recusada.'); }
}
export async function operatorContext(request: Request, accountId?: string, write = false) {
  const authRuntime = getAuthRuntime();
  let operator: Awaited<ReturnType<typeof requireOperator>>;
  try {
    operator = await requireOperator(authRuntime.auth, authRuntime.db, authRuntime.config, request);
    if (write) assertSameOrigin(request, authRuntime.config);
  } catch { throw new RequestRejected(401); }
  // As APIs do painel ainda chamam exclusivamente o runtime sintético local.
  if (authRuntime.config.mode !== 'local-demo') throw new RequestRejected(503, 'Painel operacional indisponível neste modo.');
  if (write && accountId === undefined) throw new RequestRejected(400);
  if (accountId !== undefined) {
    if (!z.uuid().safeParse(accountId).success || !await authRuntime.db.instagramAccount.findUnique({ where: { id: accountId }, select: { id: true } })) throw new RequestRejected(404);
  }
  const runtime = await getLocalRuntime();
  return { ...runtime, operator };
}
export function requestError(error: unknown) {
  return Response.json({ error: error instanceof RequestRejected && error.publicMessage ? error.publicMessage : error instanceof RequestRejected && error.status === 401 ? 'Entre como operador para continuar.' :
    error instanceof RequestRejected && error.status === 404 ? 'Recurso não encontrado nesta conta.' :
    error instanceof RequestRejected && error.status === 409 ? 'Assuma a conversa e confira uma interação recebida nas últimas 24 horas.' : 'Não foi possível concluir a ação local.' },
  { status: error instanceof RequestRejected ? error.status : 503, headers: { 'Cache-Control': 'no-store' } });
}
