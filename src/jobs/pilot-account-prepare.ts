import { z } from 'zod';
import { createPrisma } from '../shared/db';

const configSchema = z.object({
  PERSONAFLOW_MODE: z.literal('production'),
  PERSONAFLOW_SEND_MODE: z.literal('disabled'),
  META_INSTAGRAM_PILOT_ACCOUNT_ID: z.uuid(),
  META_INSTAGRAM_PILOT_PROFESSIONAL_ID: z.string().regex(/^[1-9]\d*$/),
  META_WEBHOOK_APP_ALIAS: z.string().regex(/^[a-z0-9-]{1,50}$/),
});

// Prepara a conta para o OAuth antes de existir um Reels. Não cria regra nem habilita envio.
export async function preparePilotAccount(env: Record<string, string | undefined>) {
  const config = configSchema.parse(env);
  const db = createPrisma();
  try {
    return await db.$transaction(async (tx) => {
      const existing = await tx.instagramAccount.findUnique({
        where: { professionalId: config.META_INSTAGRAM_PILOT_PROFESSIONAL_ID },
      });
      if (existing && (existing.id !== config.META_INSTAGRAM_PILOT_ACCOUNT_ID ||
          existing.webhookAppAlias !== config.META_WEBHOOK_APP_ALIAS || existing.label !== '@somoskyber')) {
        throw new Error('Conta profissional já vinculada a outra configuração.');
      }
      const byId = await tx.instagramAccount.findUnique({ where: { id: config.META_INSTAGRAM_PILOT_ACCOUNT_ID } });
      if (byId && byId.professionalId !== config.META_INSTAGRAM_PILOT_PROFESSIONAL_ID) {
        throw new Error('Identidade interna já usada por outra conta.');
      }
      if (!existing) {
        await tx.instagramAccount.create({ data: {
          id: config.META_INSTAGRAM_PILOT_ACCOUNT_ID,
          professionalId: config.META_INSTAGRAM_PILOT_PROFESSIONAL_ID,
          webhookAppAlias: config.META_WEBHOOK_APP_ALIAS,
          label: '@somoskyber',
        } });
      }
      return { accountPrepared: true, alreadyExisted: Boolean(existing), sendingEnabled: false };
    });
  } finally { await db.$disconnect(); }
}

if (process.argv[1]?.endsWith('pilot-account-prepare.ts')) {
  preparePilotAccount(process.env).then((result) => console.log(JSON.stringify(result))).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Falha ao preparar conta piloto.');
    process.exitCode = 1;
  });
}
