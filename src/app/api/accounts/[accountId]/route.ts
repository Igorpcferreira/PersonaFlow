import { operatorContext, requestError } from '@/shared/operator-context';

export async function GET(request: Request, { params }: { params: Promise<{ accountId: string }> }) {
  try {
    const { accountId } = await params;
    const { db } = await operatorContext(request, accountId);
    const account = await db.instagramAccount.findUniqueOrThrow({ where: { id: accountId }, select: { id: true, label: true, pausedAt: true } });
    return Response.json({ account, simulation: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return requestError(error); }
}
