import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { createPrisma } from '../../src/shared/db';
import { configureMetaPilot } from '../../src/jobs/pilot-setup';
import { TokenVault } from '../../src/modules/accounts/token-vault';
import { LOCAL_META_SCOPES } from '../../src/integrations/meta/oauth-contract';
import { subscribePilotComments } from '../../src/modules/accounts/meta-subscription';

const db = createPrisma();
const accountId = randomUUID();
const env = { PERSONAFLOW_MODE: 'production', PERSONAFLOW_SEND_MODE: 'disabled',
  META_INSTAGRAM_PILOT_ACCOUNT_ID: accountId, META_INSTAGRAM_PILOT_PROFESSIONAL_ID: '17841422211864282',
  META_INSTAGRAM_PILOT_REEL_ID: '17890000000000001', META_WEBHOOK_APP_ALIAS: 'somoskyber-pilot' };
afterAll(async () => { await db.instagramAccount.deleteMany({ where: { id: accountId } }); await db.$disconnect(); });

describe('configuração explícita do único piloto', () => {
  it('consulta sem escrita, prepara rascunho e só ativa com credencial e webhook comprovados', async () => {
    expect((await configureMetaPilot(db, env, 'check')).status).toBe('absent');
    expect(await db.instagramAccount.count({ where: { id: accountId } })).toBe(0);
    const draft = await configureMetaPilot(db, env, 'prepare');
    expect(draft.status).toBe('draft');
    expect((await configureMetaPilot(db, env, 'prepare')).automationId).toBe(draft.automationId);
    const enabled = { ...env, PERSONAFLOW_SEND_MODE: 'meta-private-reply', META_INSTAGRAM_TEST_COMMENT_ID: '17890000000000002' };
    await expect(configureMetaPilot(db, enabled, 'activate')).rejects.toThrow('desabilitado');
    await expect(configureMetaPilot(db, env, 'activate')).rejects.toThrow('não comprovada');
    const vault = new TokenVault(new Map([[1, randomBytes(32)]]), 1);
    await db.instagramAccount.update({ where: { id: accountId }, data: { connectionGeneration: 1 } });
    await db.accountCredential.create({ data: { accountId, ...vault.encrypt(accountId, 1, 'token-ficticio'), generation: 1,
      scopes: [...LOCAL_META_SCOPES], expiresAt: new Date(Date.now() + 60_000) } });
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ subscribed_fields: ['comments'] }] }), { status: 200 }));
    expect(await subscribePilotComments(db, vault, { accountId, professionalId: env.META_INSTAGRAM_PILOT_PROFESSIONAL_ID,
      webhookAlias: env.META_WEBHOOK_APP_ALIAS, graphVersion: 'v24.0' }, request)).toEqual({ confirmed: true, reason: 'confirmed' });
    expect(request).toHaveBeenCalledTimes(2);
    expect((await configureMetaPilot(db, env, 'activate')).status).toBe('active');
    expect((await configureMetaPilot(db, env, 'activate')).automationId).toBe(draft.automationId);
  });
});
