import { z } from 'zod';
import { isDeepStrictEqual } from 'node:util';
import type { Database } from '../shared/db';
import { emptyRecipe } from '../modules/automations/recipe';
import { LOCAL_META_SCOPES } from '../integrations/meta/oauth-contract';
import { META_PILOT_APPROVED_TEXT } from '../integrations/meta/pilot-runtime';

const configSchema = z.object({
  PERSONAFLOW_MODE: z.literal('production'),
  META_INSTAGRAM_PILOT_ACCOUNT_ID: z.uuid(),
  META_INSTAGRAM_PILOT_PROFESSIONAL_ID: z.string().regex(/^[1-9]\d*$/),
  META_INSTAGRAM_PILOT_REEL_ID: z.string().regex(/^[1-9]\d*$/),
  META_WEBHOOK_APP_ALIAS: z.string().regex(/^[a-z0-9-]{1,50}$/),
});

const recipe = { ...emptyRecipe, terms: ['prévia'], introduction: META_PILOT_APPROVED_TEXT };
type Mode = 'check' | 'prepare' | 'activate';

/** Explicit single-account setup. Check is read-only; prepare cannot activate sending. */
export async function configureMetaPilot(db: Database, env: Record<string, string | undefined>, mode: Mode) {
  const parsed = configSchema.safeParse(env);
  if (!parsed.success) throw new Error('Configuração do piloto incompleta; valores omitidos.');
  const config = parsed.data;
  const accountId = config.META_INSTAGRAM_PILOT_ACCOUNT_ID;
  const professionalId = config.META_INSTAGRAM_PILOT_PROFESSIONAL_ID;
  const reelId = config.META_INSTAGRAM_PILOT_REEL_ID;
  const alias = config.META_WEBHOOK_APP_ALIAS;
  // Arm only the event capture. A controlled comment is selected later, while sending is still disabled.
  if (mode === 'activate' && env.PERSONAFLOW_SEND_MODE !== 'disabled')
    throw new Error('A regra só pode ser armada com envio desabilitado.');

  return db.$transaction(async (tx) => {
    let account = await tx.instagramAccount.findUnique({ where: { id: accountId }, include: { credential: true } });
    const conflictingAccount = await tx.instagramAccount.findUnique({ where: { professionalId }, select: { id: true } });
    if (conflictingAccount && conflictingAccount.id !== accountId) throw new Error('Conta profissional já vinculada a outro registro.');
    if (account && (account.professionalId !== professionalId || account.webhookAppAlias !== alias))
      throw new Error('Conta piloto diverge da configuração aprovada.');
    if (!account && mode !== 'check') {
      await tx.instagramAccount.create({ data: { id: accountId, professionalId, webhookAppAlias: alias, label: '@somoskyber' } });
      account = await tx.instagramAccount.findUniqueOrThrow({ where: { id: accountId }, include: { credential: true } });
    }
    const rules = account ? await tx.automation.findMany({ where: { accountId, trigger: 'comment', mediaId: reelId } }) : [];
    if (rules.length > 1) throw new Error('Mais de uma regra encontrada para o Reels piloto.');
    let rule = rules[0];
    if (rule && (rule.name !== 'Kyber · prévia · piloto' || !isDeepStrictEqual(rule.config, recipe)))
      throw new Error('Regra existente diverge do texto ou das condições aprovadas.');
    if (!rule && account && mode !== 'check') rule = await tx.automation.create({ data: {
      accountId, name: 'Kyber · prévia · piloto', trigger: 'comment', mediaId: reelId, status: 'draft', config: recipe,
    } });
    if (mode === 'activate') {
      if (!account || !rule || account.pausedAt || !account.credential || account.credential.revokedAt ||
          !account.credential.expiresAt || account.credential.expiresAt <= new Date() ||
          account.credential.generation !== account.connectionGeneration ||
          account.webhookGeneration !== account.connectionGeneration || !account.webhookFields.includes('comments') ||
          LOCAL_META_SCOPES.some((scope) => !account.credential!.scopes.includes(scope)))
        throw new Error('Conexão Meta ou assinatura de comentários ainda não comprovada.');
      const otherActive = await tx.automation.findFirst({ where: { accountId, trigger: 'comment', mediaId: reelId,
        status: 'active', id: { not: rule.id } }, select: { id: true } });
      if (otherActive) throw new Error('Outra regra ativa já atende este Reels.');
      if (rule.status !== 'active') rule = await tx.automation.update({ where: { accountId_id: { accountId, id: rule.id } },
        data: { status: 'active', revision: { increment: 1 } } });
    }
    return { accountId, professionalId, reelId, accountPrepared: Boolean(account),
      automationId: rule?.id ?? null, status: rule?.status ?? 'absent', mode };
  });
}

async function main() {
  const mode = process.argv[2];
  if (mode !== '--check' && mode !== '--prepare' && mode !== '--activate' || process.argv.length !== 3)
    throw new Error('Uso: tsx src/jobs/pilot-setup.ts --check|--prepare|--activate');
  const { createPrisma } = await import('../shared/db');
  const db = createPrisma();
  try { console.log(JSON.stringify(await configureMetaPilot(db, process.env, mode.slice(2) as Mode))); }
  finally { await db.$disconnect(); }
}

if (process.argv[1]?.endsWith('pilot-setup.ts')) main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Falha de configuração do piloto.');
  process.exitCode = 1;
});
