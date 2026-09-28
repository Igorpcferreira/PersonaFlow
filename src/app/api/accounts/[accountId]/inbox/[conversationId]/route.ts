import { operatorContext, requestError } from '@/shared/operator-context';
import { conversationThread } from '@/modules/inbox/queries';
import { manualAction } from '@/modules/inbox/manual';
import { organizeConversation } from '@/modules/inbox/organization';

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
    const value: unknown = await request.json();
    const result = value && typeof value === 'object' && 'action' in value && value.action === 'organize'
      ? { organization: await organizeConversation(db, accountId, conversationId, value) }
      : await manualAction(db, boss, accountId, conversationId, value);
    return Response.json(result, { status: 'intentId' in result ? 202 : 200, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return requestError(error); }
}
