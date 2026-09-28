import { requireOperator } from '@/shared/auth';
import { getAuthRuntime } from '@/shared/auth-runtime';

export async function GET(request: Request) {
  try {
    const { db, auth, config } = getAuthRuntime();
    const { user, session } = await requireOperator(auth, db, config, request);
    return Response.json({ name: user.name, id: user.id, expiresAt: session.expiresAt, simulation: true }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return Response.json({ error: 'Entre como operador no modo local.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }
}
