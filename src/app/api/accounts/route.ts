import { operatorContext, requestError } from '@/shared/operator-context';

export async function GET(request: Request) {
  try {
    const { db } = await operatorContext(request);
    const accounts = await db.instagramAccount.findMany({ orderBy: { label: 'asc' }, select: { id: true, label: true, pausedAt: true } });
    return Response.json({ accounts, simulation: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return requestError(error); }
}
