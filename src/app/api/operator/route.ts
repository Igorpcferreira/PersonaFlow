import { requireOperator } from '@/shared/auth';
import { getAuthRuntime } from '@/shared/auth-runtime';

export async function GET(request: Request) {
  let runtime: ReturnType<typeof getAuthRuntime>;
  try {
    runtime = getAuthRuntime();
  } catch {
    return Response.json({ error: 'Configuração de autenticação indisponível.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
  try {
    const { db, auth, config } = runtime;
    const { user, session } = await requireOperator(auth, db, config, request);
    return Response.json({ name: user.name, id: user.id, expiresAt: session.expiresAt, simulation: config.mode === 'local-demo', mode: config.mode }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return Response.json({ error: 'Entre como operador para continuar.', mode: runtime.config.mode }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }
}
