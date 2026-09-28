import { operatorContext, requestError } from '@/shared/operator-context';
import { listConversations } from '@/modules/inbox/queries';

export async function GET(request: Request, { params }: { params: Promise<{ accountId: string }> }) {
  try {
    const { accountId } = await params;
    const { db } = await operatorContext(request, accountId);
    return Response.json(await listConversations(db, accountId, new URL(request.url).searchParams.get('cursor') ?? undefined), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return requestError(error); }
}
