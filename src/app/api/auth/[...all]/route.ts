import { handleAuthRequest } from '@/shared/auth';
import { getAuthRuntime } from '@/shared/auth-runtime';

async function handler(request: Request) {
  try {
    const { auth, config } = getAuthRuntime();
    return await handleAuthRequest(auth, config, request);
  } catch {
    return Response.json({ error: 'Autenticação local indisponível.' }, { status: 503 });
  }
}
export const GET = handler;
export const POST = handler;
