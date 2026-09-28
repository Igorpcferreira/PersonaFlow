import { listSequences, sequenceAction } from '@/modules/automations/sequence-service';
import { operatorContext, requestError } from '@/shared/operator-context';

export async function GET(request: Request, { params }: { params: Promise<{ accountId: string }> }) {
  try {
    const { accountId } = await params; const { db } = await operatorContext(request, accountId);
    return Response.json({ accountId, sequences: await listSequences(db, accountId), simulation: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return requestError(error); }
}
export async function POST(request: Request, { params }: { params: Promise<{ accountId: string }> }) {
  try {
    const { accountId } = await params; const { db, boss, app } = await operatorContext(request, accountId, true);
    return await sequenceAction(db, boss, app, accountId, await request.json());
  } catch (error) { return requestError(error); }
}
