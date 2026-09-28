import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrisma } from '../../src/shared/db';
import { createBoss, INBOUND_QUEUE } from '../../src/jobs/queue';
import { subscribeSyntheticAccount } from '../../src/modules/accounts/subscription';
import { handleWebhookPost } from '../../src/integrations/meta/ingestion';
import { signSyntheticWebhook, type WebhookApp } from '../../src/integrations/meta/webhook';
import { syntheticBatch } from '../fixtures/meta/batch';

const db = createPrisma();
const boss = createBoss();
const app: WebhookApp = { kind: 'synthetic', alias: 'simulation', secret: randomBytes(32).toString('hex'), verifyToken: randomBytes(32).toString('hex') };
async function account() {
  const account = await db.instagramAccount.create({ data: { professionalId: `synthetic-${randomUUID()}`, label: 'Conta fictícia', connectionGeneration: 1,
    credential: { create: { ciphertext: randomBytes(32), keyVersion: 1, generation: 1 } } } });
  await subscribeSyntheticAccount(db, account.id, app);
  return account;
}
function request(batch: unknown, signature?: string) {
  const bytes = Buffer.from(JSON.stringify(batch));
  return new Request('http://127.0.0.1/api/local-webhook', { method: 'POST', body: bytes,
    headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': signature ?? signSyntheticWebhook(app, bytes) } });
}
async function jobs(accountId: string) {
  return (await db.$queryRaw<{ count: number }[]>`SELECT count(*)::int AS count FROM pgboss.job WHERE data->>'accountId' = ${accountId}`)[0].count;
}
beforeAll(async () => { await boss.start(); await boss.createQueue(INBOUND_QUEUE); });
afterAll(async () => { await boss.stop(); await db.$disconnect(); });

describe('PF-016-L: webhook durável PostgreSQL/fila reais', () => {
  it('lote A/B e mesmo ID entre tipos/contas persistem separados; concorrência/replay não duplicam jobs', async () => {
    const a = await account(), b = await account();
    const batch = syntheticBatch([a.professionalId, b.professionalId], `event-${randomUUID()}`);
    const responses = await Promise.all([1, 2, 3].map(() => handleWebhookPost(request(batch), db, boss, app)));
    expect(responses.every((response) => response.status === 200)).toBe(true);
    const results = await Promise.all(responses.map((response) => response.json()));
    expect(results.reduce((sum, result) => sum + result.inserted, 0)).toBe(4);
    expect(await db.inboundEvent.count({ where: { accountId: a.id } })).toBe(2);
    expect(await db.inboundEvent.count({ where: { accountId: b.id } })).toBe(2);
    expect(await jobs(a.id)).toBe(2); expect(await jobs(b.id)).toBe(2);
    const stored = await db.inboundEvent.findMany({ where: { accountId: a.id } });
    expect(stored.every((event) => event.generation === 1 && event.payload !== null)).toBe(true);
    // Remoção pontual apenas de jobs desta fixture efêmera prova dedup independente da retenção da fila.
    await db.$executeRaw`DELETE FROM pgboss.job WHERE data->>'accountId' = ${a.id}`;
    const replay = await handleWebhookPost(request(batch), db, boss, app);
    expect((await replay.json()).duplicate).toBe(4);
    expect(await jobs(a.id)).toBe(0);
  });
  it('app/subscription/geração/conta desconhecida são individuais; assinatura inválida não grava nada', async () => {
    const a = await account(), b = await account();
    await db.instagramAccount.update({ where: { id: a.id }, data: { connectionGeneration: 2 } });
    const batch = syntheticBatch([a.professionalId, b.professionalId, 'unknown-account'], `event-${randomUUID()}`);
    expect((await handleWebhookPost(request(batch, 'sha256=00'), db, boss, app)).status).toBe(400);
    expect(await jobs(b.id)).toBe(0);
    const response = await handleWebhookPost(request(batch), db, boss, app);
    expect(await response.json()).toMatchObject({ inserted: 2, ignored: 4 });
    expect(await db.inboundEvent.count({ where: { accountId: a.id } })).toBe(0);
    expect(await jobs(b.id)).toBe(2);
    await db.instagramAccount.update({ where: { id: b.id }, data: { webhookAppAlias: 'other-app' } });
    expect((await (await handleWebhookPost(request(syntheticBatch([b.professionalId], 'new-event')), db, boss, app)).json()).ignored).toBe(2);
  });
  it('erro real de banco no job reverte todo lote e responde 503; reentrega após reparar confirma commit', async () => {
    const a = await account(), b = await account();
    const batch = syntheticBatch([a.professionalId, b.professionalId], `rollback-${randomUUID()}`);
    const functionName = `fail_webhook_${randomUUID().replaceAll('-', '')}`;
    const triggerName = `${functionName}_trigger`;
    // Trigger isolado por UUID da fixture; não interfere nos demais testes/contas.
    await db.$executeRawUnsafe(`CREATE FUNCTION ${functionName}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.data->>'accountId' = '${b.id}' THEN RAISE EXCEPTION 'synthetic failure'; END IF; RETURN NEW; END $$`);
    await db.$executeRawUnsafe(`CREATE TRIGGER ${triggerName} BEFORE INSERT ON pgboss.job FOR EACH ROW EXECUTE FUNCTION ${functionName}()`);
    try {
      expect((await handleWebhookPost(request(batch), db, boss, app)).status).toBe(503);
      expect(await db.inboundEvent.count({ where: { accountId: { in: [a.id, b.id] } } })).toBe(0);
      expect(await jobs(a.id)).toBe(0); expect(await jobs(b.id)).toBe(0);
    } finally {
      await db.$executeRawUnsafe(`DROP TRIGGER ${triggerName} ON pgboss.job`);
      await db.$executeRawUnsafe(`DROP FUNCTION ${functionName}()`);
    }
    const success = await handleWebhookPost(request(batch), db, boss, app);
    expect(success.status).toBe(200);
    expect((await success.json()).inserted).toBe(4);
    expect(await jobs(a.id)).toBe(2); expect(await jobs(b.id)).toBe(2);
  });
});
