import { z } from 'zod';
import { createPrisma } from '../shared/db';
import { createBoss } from './queue';
import { META_PILOT_DELIVERY_QUEUE } from '../modules/delivery/ledger';
import { decideAutomation } from '../modules/automations/decision';
import { META_PILOT_APPROVED_TEXT } from '../integrations/meta/pilot-runtime';

const configSchema = z.object({
  PERSONAFLOW_MODE: z.literal('production'),
  PERSONAFLOW_SEND_MODE: z.literal('disabled'),
  META_INSTAGRAM_PILOT_ACCOUNT_ID: z.uuid(),
  META_INSTAGRAM_TEST_COMMENT_ID: z.string().regex(/^[1-9]\d*$/),
});

/** Reconsider one already persisted pilot comment without changing inbound history or sending. */
async function main() {
  if (process.argv.length !== 3 || process.argv[2] !== '--prepare') throw new Error('Uso: pilot-reconsider-comment --prepare');
  const config = configSchema.parse(process.env);
  const db = createPrisma();
  const boss = createBoss();
  try {
    await boss.start();
    await boss.createQueue(META_PILOT_DELIVERY_QUEUE);
    const externalId = `comment:${config.META_INSTAGRAM_TEST_COMMENT_ID}`;
    const event = await db.inboundEvent.findUniqueOrThrow({ where: { accountId_externalId: {
      accountId: config.META_INSTAGRAM_PILOT_ACCOUNT_ID, externalId,
    } } });
    if (event.kind !== 'comment' || !event.processedAt) throw new Error('Comentário não processado.');
    const payload = z.object({ actorId: z.string(), text: z.string().nullable(), mediaId: z.string().nullable(),
      echo: z.boolean(), buttonPayload: z.string().nullable() }).strict().parse(event.payload);
    const before = await db.deliveryIntent.findFirst({ where: { accountId: event.accountId,
      eventId: event.id, effect: 'private_reply' }, select: { id: true } });
    if (before) throw new Error('Comentário já possui intenção; nada foi repetido.');
    const account = await db.instagramAccount.findUniqueOrThrow({ where: { id: event.accountId } });
    const contact = await db.contact.findUniqueOrThrow({ where: { accountId_igScopedUserId: {
      accountId: event.accountId, igScopedUserId: payload.actorId,
    } } });
    const conversation = await db.conversation.findUniqueOrThrow({ where: { accountId_contactId: {
      accountId: event.accountId, contactId: contact.id,
    } } });
    await db.$transaction((tx) => decideAutomation(tx, boss, {
      account, event, contact, conversation, payload, eligible: false,
    }));
    const intent = await db.deliveryIntent.findFirst({ where: { accountId: event.accountId,
      eventId: event.id, effect: 'private_reply' }, select: { status: true, body: true } });
    const body = intent?.body as { text?: unknown } | undefined;
    if (!intent || intent.status !== 'pending' || body?.text !== META_PILOT_APPROVED_TEXT)
      throw new Error('Piloto recusou a intenção; envio permanece desligado.');
    console.log(JSON.stringify({ commentId: config.META_INSTAGRAM_TEST_COMMENT_ID, intentStatus: intent.status,
      sendMode: config.PERSONAFLOW_SEND_MODE }));
  } finally {
    await boss.stop();
    await db.$disconnect();
  }
}

main().catch(() => { console.error('Preparação do comentário piloto falhou; detalhes omitidos.'); process.exitCode = 1; });
