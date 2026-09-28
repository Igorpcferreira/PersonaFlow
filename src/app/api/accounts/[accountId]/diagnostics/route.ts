import { accountDiagnostics, diagnosticAction } from '@/modules/accounts/diagnostics';
import { operatorContext, requestError } from '@/shared/operator-context';

export async function GET(request: Request, { params }: { params: Promise<{ accountId: string }> }) {
  try {
    const { accountId } = await params;
    const { db, vault } = await operatorContext(request, accountId);
    return Response.json(await accountDiagnostics(db, vault, accountId), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return requestError(error); }
}
export async function POST(request: Request, { params }: { params: Promise<{ accountId: string }> }) {
  try {
    const { accountId } = await params;
    const { db, vault, app, operator } = await operatorContext(request, accountId, true);
    return Response.json(await diagnosticAction(db, vault, app, accountId, operator.session.id, await request.json()), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return requestError(error); }
}
