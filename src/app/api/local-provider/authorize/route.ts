import { authorizeLocalProvider } from '@/shared/auth';
import { getAuthRuntime } from '@/shared/auth-runtime';

export async function GET(request: Request) {
  try {
    const { db, config } = getAuthRuntime();
    return await authorizeLocalProvider(db, config, request);
  } catch {
    return Response.json({ error: 'Provedor sintético indisponível.' }, { status: 403 });
  }
}
