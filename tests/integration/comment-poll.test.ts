import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrisma } from '../../src/shared/db';
import { createBoss, INBOUND_QUEUE } from '../../src/jobs/queue';
import { ingestPolledMetaComments, pollEligibleMetaComments } from '../../src/integrations/meta/comment-poll';
import type { WebhookApp } from '../../src/integrations/meta/webhook';

const db = createPrisma(), boss = createBoss();
const professionalId = '17841422211864282', reelId = '17890000000000001', alias = 'somoskyber-pilot';
const app: WebhookApp = { kind: 'meta', alias, secret: randomBytes(32).toString('hex'), verifyToken: randomBytes(32).toString('hex'), pilotProfessionalId: professionalId };

beforeAll(async () => { await boss.start(); await boss.createQueue(INBOUND_QUEUE); });
afterAll(async () => { await boss.stop(); await db.$disconnect(); });

describe('coletor Meta persistido', () => {
  it('deduplica o mesmo comentário elegível sem chamada de rede real e não cria entrega', async () => {
    const account = await db.instagramAccount.create({ data: { label: 'Piloto de coleta isolado', professionalId, connectionGeneration: 1,
      webhookAppAlias: alias, webhookGeneration: 1, webhookFields: ['comments'], credential: { create: { ciphertext: randomBytes(32), keyVersion: 1, generation: 1,
        expiresAt: new Date(Date.now() + 60_000) } } } });
    const request = async () => new Response(JSON.stringify({ data: [
      { id: `1789${randomUUID().replaceAll('-', '').slice(0, 16)}`.replace(/[^0-9]/g, ''), text: 'Quero prévia', timestamp: '2026-10-01T12:00:00+00:00', from: { id: '17890000000000003' } },
      { id: '17890000000000004', text: 'somente uma reação', timestamp: '2026-10-01T12:01:00+00:00', from: { id: '17890000000000005' } },
    ] }));
    const polled = await pollEligibleMetaComments({ graphVersion: 'v24.0', professionalId, reelId, accessToken: 'token-ficticio' }, request);
    const first = await ingestPolledMetaComments(db, boss, app, { professionalId, reelId }, polled.eligible);
    const second = await ingestPolledMetaComments(db, boss, app, { professionalId, reelId }, polled.eligible);
    expect(first).toEqual({ inserted: 1, duplicate: 0, ignored: 0 });
    expect(second).toEqual({ inserted: 0, duplicate: 1, ignored: 0 });
    expect(polled.comments).toHaveLength(1); expect(polled.ignored).toBe(1);
    expect(await db.inboundEvent.count({ where: { accountId: account.id } })).toBe(1);
    expect(await db.deliveryIntent.count({ where: { accountId: account.id } })).toBe(0);
    await db.instagramAccount.delete({ where: { id: account.id } });
  });
});
