import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrisma } from '../../src/shared/db';
import { createConversation, createMessage, getConversation } from '../../src/modules/accounts/service';
import {
  createBoss,
  enqueueInboundEvent,
  INBOUND_QUEUE,
  insertInboundEventAndJob,
  processInboundEvent,
} from '../../src/jobs/queue';

const db = createPrisma();

async function account(label: string) {
  return db.instagramAccount.create({
    data: { label, professionalId: `ficticia-${label}-${randomUUID()}` },
  });
}

async function waitUntil(check: () => Promise<boolean>, milliseconds = 8000) {
  const deadline = Date.now() + milliseconds;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Resultado esperado não apareceu no PostgreSQL.');
}

beforeAll(async () => {
  await db.$connect();
});

afterAll(async () => {
  await db.$disconnect();
});

describe('PF-011: PostgreSQL e pg-boss reais', () => {
  it('rollback do evento também elimina o job criado na mesma transação Prisma', async () => {
    const a = await account('rollback');
    const boss = createBoss();
    await boss.start();
    try {
      await boss.createQueue(INBOUND_QUEUE);
      const externalId = `evt-${randomUUID()}`;
      let jobId: string | null = null;
      await expect(db.$transaction(async (tx) => {
        const result = await insertInboundEventAndJob(tx, boss, a.id, externalId);
        jobId = result.jobId;
        throw new Error('rollback esperado');
      })).rejects.toThrow('rollback esperado');

      expect(await db.inboundEvent.count({ where: { accountId: a.id, externalId } })).toBe(0);
      expect(jobId).toBeTruthy();
      const rows = await db.$queryRawUnsafe<{ count: number }[]>(
        'SELECT count(*)::int AS count FROM pgboss.job WHERE id = $1::uuid', jobId,
      );
      expect(rows[0].count).toBe(0);
    } finally {
      await boss.stop();
    }
  });

  it('job confirmado sobrevive ao reinício do processo e é processado com a conta explícita', async () => {
    const a = await account('restart');
    const before = createBoss();
    await before.start();
    await before.createQueue(INBOUND_QUEUE);
    const { event, jobId } = await enqueueInboundEvent(db, before, a.id, `evt-${randomUUID()}`);
    expect(jobId).toBeTruthy();
    await before.stop();

    const after = createBoss();
    await after.start();
    try {
      await after.work(INBOUND_QUEUE, async (jobs) => {
        for (const job of jobs) await processInboundEvent(db, job.data);
      });
      await waitUntil(async () => Boolean((await db.inboundEvent.findUnique({
        where: { accountId_id: { accountId: a.id, id: event.id } },
      }))?.processedAt));
    } finally {
      await after.stop();
    }
  });

  it('falha do worker não executa transporte externo nem processa evento sem novo claim', async () => {
    const a = await account('crash');
    const boss = createBoss();
    await boss.start();
    await boss.createQueue(INBOUND_QUEUE);
    const { event } = await enqueueInboundEvent(db, boss, a.id, `evt-${randomUUID()}`);
    let attempts = 0;
    try {
      await boss.work(INBOUND_QUEUE, async () => {
        attempts += 1;
        throw new Error('falha simulada antes do processamento');
      });
      await waitUntil(async () => attempts > 0);
      expect((await db.inboundEvent.findUnique({
        where: { accountId_id: { accountId: a.id, id: event.id } },
      }))?.processedAt).toBeNull();
    } finally {
      await boss.stop();
    }
  });
});

describe('PF-012: isolamento de contas fictícias', () => {
  it('escopa acesso e rejeita relações cruzadas no serviço e no banco', async () => {
    const a = await account('A');
    const b = await account('B');
    const ciphertextA = Buffer.from('ciphertext-ficticio-A');
    const ciphertextB = Buffer.from('ciphertext-ficticio-B');
    await db.accountCredential.createMany({ data: [
      { accountId: a.id, ciphertext: ciphertextA, keyVersion: 1 },
      { accountId: b.id, ciphertext: ciphertextB, keyVersion: 2 },
    ] });
    const [credentialA, credentialB] = await Promise.all([
      db.accountCredential.findUniqueOrThrow({ where: { accountId: a.id } }),
      db.accountCredential.findUniqueOrThrow({ where: { accountId: b.id } }),
    ]);
    expect(Buffer.from(credentialA.ciphertext)).toEqual(ciphertextA);
    expect(Buffer.from(credentialB.ciphertext)).toEqual(ciphertextB);

    const contactA = await db.contact.create({ data: { accountId: a.id, igScopedUserId: 'mesmo-id-ficticio' } });
    const contactB = await db.contact.create({ data: { accountId: b.id, igScopedUserId: 'mesmo-id-ficticio' } });
    const conversationA = await createConversation(db, a.id, contactA.id);
    const conversationB = await createConversation(db, b.id, contactB.id);
    await createMessage(db, a.id, conversationA.id, 'mid-A', 'mensagem A');
    await createMessage(db, b.id, conversationB.id, 'mid-B', 'mensagem B');

    expect(await getConversation(db, a.id, conversationB.id)).toBeNull();
    expect(await getConversation(db, b.id, conversationA.id)).toBeNull();
    expect((await getConversation(db, a.id, conversationA.id))?.messages.map((message) => message.body))
      .toEqual(['mensagem A']);
    await expect(createConversation(db, a.id, contactB.id)).rejects.toThrow('Contato inexistente');
    await expect(createMessage(db, a.id, conversationB.id, 'mid-cross', 'bloquear'))
      .rejects.toThrow('Conversa inexistente');
    await expect(db.conversation.create({ data: { accountId: a.id, contactId: contactB.id } }))
      .rejects.toThrow();
    await expect(db.message.create({ data: {
      accountId: a.id, conversationId: conversationB.id, externalId: 'mid-cross-db', body: 'bloquear',
    } })).rejects.toThrow();
  });
});
