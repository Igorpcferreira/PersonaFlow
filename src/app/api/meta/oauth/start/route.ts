import { metaAuthorizationURL } from '@/integrations/meta/oauth-contract';
import { createOAuthState } from '@/modules/accounts/connections';
import { requireOperator } from '@/shared/auth';
import { getAuthRuntime } from '@/shared/auth-runtime';
import { getMetaRuntime } from '@/shared/local-runtime';

export async function GET(request: Request) {
  try {
    const auth = getAuthRuntime();
    const operator = await requireOperator(auth.auth, auth.db, auth.config, request);
    const { db, config } = getMetaRuntime();
    const account = await db.instagramAccount.findUnique({ where: { id: config.pilotAccountId },
      select: { id: true, professionalId: true } });
    if (!account || account.professionalId !== config.pilotProfessionalId) throw new Error('Piloto inválido.');
    const state = await createOAuthState(db, account.id, operator.session.id);
    return Response.redirect(metaAuthorizationURL(config, state), 302);
  } catch {
    return Response.json({ error: 'Conexão Meta indisponível.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
