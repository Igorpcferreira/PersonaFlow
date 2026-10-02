import { handleWebhookPost } from '@/integrations/meta/ingestion';
import { verifyWebhookChallenge } from '@/integrations/meta/webhook';
import { getMetaWebhookRuntime } from '@/shared/local-runtime';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const { app } = await getMetaWebhookRuntime();
    return verifyWebhookChallenge(app, request);
  } catch {
    return new Response('Verificação recusada.', { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }
}

export async function POST(request: Request) {
  try {
    const { db, boss, app } = await getMetaWebhookRuntime();
    return handleWebhookPost(request, db, boss, app);
  } catch {
    return new Response('Recepção indisponível.', { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
