import { createPrisma } from '../shared/db';
import { createBoss, INBOUND_QUEUE } from './queue';
import { processInboxEvent } from '../modules/inbox/ingestion';
import { decideAutomation } from '../modules/automations/decision';
import { startMetaPilotDeliveryWorker, startMetaPilotRecovery, startSyntheticDeliveryWorker } from './delivery';
import { parseAuthConfig } from '../shared/auth-config';
import { parseLocalSecrets, parseMetaWebhookRuntimeConfig } from '../shared/local-runtime';
import { TokenVault } from '../modules/accounts/token-vault';
import { z } from 'zod';
import { readApprovedFutureMetaPilot } from '../integrations/meta/pilot-runtime';

async function main() {
  const db = createPrisma();
  const boss = createBoss();
  let stopDelivery: (() => Promise<void>) | undefined;
  try {
    await boss.start();
    await boss.createQueue(INBOUND_QUEUE);
    if (process.env.PERSONAFLOW_MODE === 'local-demo') {
      parseAuthConfig(process.env);
      const settings = parseLocalSecrets(process.env);
      stopDelivery = await startSyntheticDeliveryWorker(db, boss, new TokenVault(new Map([[1, Buffer.from(settings.PERSONAFLOW_TOKEN_KEY, 'hex')]]), 1));
    } else if (process.env.PERSONAFLOW_MODE === 'production') {
      parseAuthConfig(process.env);
      const settings = parseMetaWebhookRuntimeConfig(process.env);
      if (process.env.PERSONAFLOW_SEND_MODE === 'meta-private-reply') {
        const reelId = z.string().regex(/^[1-9]\d*$/).parse(process.env.META_INSTAGRAM_PILOT_REEL_ID);
        const commentId = z.string().regex(/^[1-9]\d*$/).parse(process.env.META_INSTAGRAM_TEST_COMMENT_ID);
        stopDelivery = await startMetaPilotDeliveryWorker(db, boss,
          new TokenVault(new Map([[1, Buffer.from(process.env.PERSONAFLOW_TOKEN_KEY!, 'hex')]]), 1),
          { kind: 'meta', accountId: settings.pilotAccountId, professionalId: settings.pilotProfessionalId,
            scope: 'test-comment', reelId, commentId, webhookAlias: settings.webhookAlias, graphVersion: settings.graphVersion });
      } else if (process.env.PERSONAFLOW_SEND_MODE === 'meta-campaign-private-reply') {
        const campaign = readApprovedFutureMetaPilot(process.env);
        if (!campaign) throw new Error('Campanha Meta incompleta ou inconsistente.');
        stopDelivery = await startMetaPilotDeliveryWorker(db, boss,
          new TokenVault(new Map([[1, Buffer.from(process.env.PERSONAFLOW_TOKEN_KEY!, 'hex')]]), 1),
          { kind: 'meta', scope: 'campaign', accountId: campaign.accountId, professionalId: campaign.professionalId,
            reelId: campaign.reelId, webhookAlias: campaign.webhookAlias, graphVersion: settings.graphVersion });
      } else stopDelivery = startMetaPilotRecovery(db, settings.pilotAccountId);
    }
    await boss.work(INBOUND_QUEUE, { pollingIntervalSeconds: 0.5 }, async (jobs) => {
      for (const job of jobs) await processInboxEvent(db, job.data, (tx, context) => decideAutomation(tx, boss, context));
    });
    console.log(process.env.PERSONAFLOW_MODE === 'production' ? 'Worker de produção ativo; envio sujeito ao gate configurado.' :
      'Worker local ativo; efeitos exclusivamente sintéticos no banco local.');
    const stop = async () => {
      await stopDelivery?.();
      await boss.stop();
      await db.$disconnect();
      process.exit(0);
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  } catch {
    await stopDelivery?.();
    await boss.stop().catch(() => undefined);
    await db.$disconnect();
    throw new Error('Falha ao iniciar o worker local; detalhes de conexão omitidos.');
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Falha desconhecida.');
  process.exitCode = 1;
});
