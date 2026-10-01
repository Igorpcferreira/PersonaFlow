import { z } from 'zod';
import { isDeepStrictEqual } from 'node:util';
import { createPrisma } from '../shared/db';
import { emptyRecipe } from '../modules/automations/recipe';
import { LOCAL_META_SCOPES } from '../integrations/meta/oauth-contract';
import { META_PILOT_APPROVED_TEXT } from '../integrations/meta/pilot-runtime';

const settings = z.object({
  PERSONAFLOW_MODE: z.literal('production'),
  PERSONAFLOW_SEND_MODE: z.literal('disabled'),
  META_INSTAGRAM_PILOT_ACCOUNT_ID: z.uuid(),
  META_INSTAGRAM_PILOT_PROFESSIONAL_ID: z.string().regex(/^[1-9]\d*$/),
  META_INSTAGRAM_PILOT_REEL_ID: z.string().regex(/^[1-9]\d*$/),
  META_INSTAGRAM_APPROVED_REEL_ID: z.string().regex(/^[1-9]\d*$/),
  META_WEBHOOK_APP_ALIAS: z.string().regex(/^[a-z0-9-]{1,50}$/),
});

const recipe = { ...emptyRecipe, terms: ['prévia', 'previa'], introduction: META_PILOT_APPROVED_TEXT };
const ruleName = 'Kyber · prévia · campanha';

async function main() {
  const mode = process.argv[2];
  if (process.argv.length !== 3 || (mode !== '--check' && mode !== '--arm')) throw new Error('Uso: campaign-setup --check|--arm');
  const config = settings.parse(process.env);
  if (config.META_INSTAGRAM_APPROVED_REEL_ID === config.META_INSTAGRAM_PILOT_REEL_ID)
    throw new Error('O Reel da campanha deve ser diferente do piloto anterior.');
  const db = createPrisma();
  try {
    const result = await db.$transaction(async (tx) => {
      const account = await tx.instagramAccount.findUnique({ where: { id: config.META_INSTAGRAM_PILOT_ACCOUNT_ID }, include: { credential: true } });
      if (!account || account.professionalId !== config.META_INSTAGRAM_PILOT_PROFESSIONAL_ID ||
          account.webhookAppAlias !== config.META_WEBHOOK_APP_ALIAS || account.pausedAt ||
          account.webhookGeneration !== account.connectionGeneration || !account.webhookFields.includes('comments') ||
          !account.credential || account.credential.revokedAt || !account.credential.expiresAt ||
          account.credential.expiresAt <= new Date() || account.credential.generation !== account.connectionGeneration ||
          LOCAL_META_SCOPES.some((scope) => !account.credential!.scopes.includes(scope)))
        throw new Error('Conta Meta ou assinatura de comentários indisponível.');
      const rules = await tx.automation.findMany({ where: { accountId: account.id, trigger: 'comment', mediaId: config.META_INSTAGRAM_APPROVED_REEL_ID } });
      if (rules.length > 1 || (rules[0] && (rules[0].name !== ruleName || !isDeepStrictEqual(rules[0].config, recipe))))
        throw new Error('Outra regra ou configuração divergente atende este Reel.');
      let rule = rules[0];
      if (mode === '--arm' && !rule) rule = await tx.automation.create({ data: {
        accountId: account.id, name: ruleName, trigger: 'comment', mediaId: config.META_INSTAGRAM_APPROVED_REEL_ID,
        status: 'active', config: recipe,
      } });
      else if (mode === '--arm' && rule?.status !== 'active') rule = await tx.automation.update({
        where: { accountId_id: { accountId: account.id, id: rule!.id } },
        data: { status: 'active', revision: { increment: 1 } },
      });
      return { reelId: config.META_INSTAGRAM_APPROVED_REEL_ID, ruleStatus: rule?.status ?? 'absent',
        sendMode: config.PERSONAFLOW_SEND_MODE };
    });
    console.log(JSON.stringify(result));
  } finally { await db.$disconnect(); }
}

main().catch(() => { console.error('Regra da campanha indisponível; detalhes omitidos.'); process.exitCode = 1; });
