import { operatorContext, requestError } from '@/shared/operator-context';
import { listConversations } from '@/modules/inbox/queries';
import { parseInboxFilters } from '@/modules/inbox/filters';
import { inboxMetrics } from '@/modules/inbox/metrics';

export async function GET(request: Request, { params }: { params: Promise<{ accountId: string }> }) {
  try {
    const { accountId } = await params;
    const { db } = await operatorContext(request, accountId);
    const query = new URL(request.url).searchParams, cursor = query.get('cursor') ?? undefined;
    query.delete('cursor');
    const filters = parseInboxFilters(Object.fromEntries(query));
    const [list, metrics] = await Promise.all([listConversations(db, accountId, cursor, filters), inboxMetrics(db, accountId, filters)]);
    return Response.json({ ...list, metrics }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return requestError(error); }
}
