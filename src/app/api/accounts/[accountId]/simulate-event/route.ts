import { operatorContext, requestError } from '@/shared/operator-context';
import { simulateInbound } from '@/integrations/meta/simulation';

export async function POST(request: Request, { params }: { params: Promise<{ accountId: string }> }) {
  try {
    const { accountId } = await params;
    const { db, boss, app } = await operatorContext(request, accountId, true);
    return (await simulateInbound(db, boss, app, accountId, await request.json())).response;
  } catch (error) { return requestError(error); }
}
