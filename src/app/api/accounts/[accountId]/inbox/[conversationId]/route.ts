import { operatorContext, requestError } from '@/shared/operator-context';
import { conversationThread } from '@/modules/inbox/queries';
import { manualAction } from '@/modules/inbox/manual';

export async function GET(request: Request, { params }: { params: Promise<{ accountId: string; conversationId: string }> }) {
  try {
    const { accountId, conversationId } = await params;
    const { db } = await operatorContext(request, accountId);
    return Response.json(await conversationThread(db, accountId, conversationId, new URL(request.url).searchParams.get('cursor') ?? undefined), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return requestError(error); }
}
export async function POST(request: Request, { params }: { params: Promise<{ accountId: string; conversationId: string }> }) {
  try {
    const { accountId, conversationId } = await params;
    const { db, boss } = await operatorContext(request, accountId, true);
    const result = await manualAction(db, boss, accountId, conversationId, await request.json());
    return Response.json(result, { status: 'intentId' in result ? 202 : 200, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return requestError(error); }
}
