import { assertLocalRequest } from '@/shared/auth-config';
import { getLocalRuntime } from '@/shared/local-runtime';
import { handleWebhookPost } from '@/integrations/meta/ingestion';
import { verifyWebhookChallenge } from '@/integrations/meta/webhook';

export async function POST(request: Request) {
  try {
    const { db, boss, app, config } = await getLocalRuntime();
    assertLocalRequest(request, config);
    return handleWebhookPost(request, db, boss, app);
  } catch { return Response.json({ error: 'Webhook fictício indisponível.' }, { status: 503 }); }
}
export async function GET(request: Request) {
  try {
    const { app, config } = await getLocalRuntime();
    assertLocalRequest(request, config);
    return verifyWebhookChallenge(app, request);
  } catch { return Response.json({ error: 'Verificação local recusada.' }, { status: 400 }); }
}
