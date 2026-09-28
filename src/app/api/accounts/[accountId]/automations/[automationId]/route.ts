import { z } from 'zod';
import { operatorContext, requestError, RequestRejected } from '@/shared/operator-context';
import { saveAutomation, setAutomationStatus } from '@/modules/automations/service';

const action = z.discriminatedUnion('action', [
  z.object({ action: z.literal('save'), revision: z.number().int().positive(), value: z.unknown() }).strict(),
  z.object({ action: z.enum(['activate', 'pause']), revision: z.number().int().positive() }).strict(),
]);
export async function POST(request: Request, { params }: { params: Promise<{ accountId: string; automationId: string }> }) {
  try {
    const { accountId, automationId } = await params;
    const { db } = await operatorContext(request, accountId, true);
    const parsed = action.safeParse(await request.json());
    if (!parsed.success) throw new RequestRejected(400);
    const data = parsed.data;
    const automation = data.action === 'save' ? await saveAutomation(db, accountId, data.value, automationId, data.revision) :
      await setAutomationStatus(db, accountId, automationId, data.action === 'activate' ? 'active' : 'paused', data.revision);
    return Response.json({ automation }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return requestError(error); }
}
