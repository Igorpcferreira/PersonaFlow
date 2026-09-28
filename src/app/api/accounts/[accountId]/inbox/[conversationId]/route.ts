import { operatorContext, requestError } from '@/shared/operator-context';
import { conversationThread } from '@/modules/inbox/queries';

export async function GET(request: Request, { params }: { params: Promise<{ accountId: string; conversationId: string }> }) {
  try {
    const { accountId, conversationId } = await params;
    const { db } = await operatorContext(request, accountId);
    return Response.json(await conversationThread(db, accountId, conversationId, new URL(request.url).searchParams.get('cursor') ?? undefined), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return requestError(error); }
}
