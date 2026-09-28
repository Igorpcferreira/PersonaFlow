import { operatorContext, requestError } from '@/shared/operator-context';
import { saveAutomation } from '@/modules/automations/service';
import { LOCAL_RECIPE_CAPABILITIES } from '@/modules/automations/recipe';
import { DEMO_REELS } from '@/shared/demo-data';

export async function GET(request: Request, { params }: { params: Promise<{ accountId: string }> }) {
  try {
    const { accountId } = await params;
    const { db } = await operatorContext(request, accountId);
    const automations = await db.automation.findMany({ where: { accountId }, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }] });
    return Response.json({ automations, reels: DEMO_REELS, capabilities: LOCAL_RECIPE_CAPABILITIES, simulation: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return requestError(error); }
}
export async function POST(request: Request, { params }: { params: Promise<{ accountId: string }> }) {
  try {
    const { accountId } = await params;
    const { db } = await operatorContext(request, accountId, true);
    return Response.json({ automation: await saveAutomation(db, accountId, await request.json()) }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return requestError(error); }
}
