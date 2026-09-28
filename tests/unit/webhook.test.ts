import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { MAX_WEBHOOK_BYTES, parseSignedWebhook, readWebhookBytes, signSyntheticWebhook, verifyWebhookChallenge, type WebhookApp } from '../../src/integrations/meta/webhook';
import { syntheticBatch } from '../fixtures/meta/batch';
import { parseLocalSecrets } from '../../src/shared/local-runtime';

const app: WebhookApp = { kind: 'synthetic', alias: 'simulation', secret: randomBytes(32).toString('hex'), verifyToken: randomBytes(32).toString('hex') };
const encode = (value: unknown) => Buffer.from(JSON.stringify(value));
const parse = (value: unknown) => { const bytes = encode(value); return parseSignedWebhook(app, bytes, signSyntheticWebhook(app, bytes)); };

describe('PF-016-L: bytes, identidade e parsing', () => {
  it('segredos da simulação exigem chave de 256 bits; erro omite valores', () => {
    expect(() => parseLocalSecrets({ PERSONAFLOW_TOKEN_KEY: 'not-a-key' })).toThrow('valores omitidos');
    expect(parseLocalSecrets({ PERSONAFLOW_TOKEN_KEY: randomBytes(32).toString('hex'),
      PERSONAFLOW_WEBHOOK_SECRET: app.secret, PERSONAFLOW_WEBHOOK_VERIFY_TOKEN: app.verifyToken })).toBeDefined();
  });
  it('assinatura exige bytes originais e app exato; rejeita corpo malformado/tamanho/UTF-8', async () => {
    const bytes = encode(syntheticBatch(['account-A'], 'same-id'));
    const signature = signSyntheticWebhook(app, bytes);
    expect(parseSignedWebhook(app, bytes, signature).events).toHaveLength(2);
    for (const invalid of [null, 'sha256=00', signature.toUpperCase()]) expect(() => parseSignedWebhook(app, bytes, invalid)).toThrow('omitidos');
    expect(() => parseSignedWebhook(app, Buffer.concat([bytes, Buffer.from(' ')]), signature)).toThrow('omitidos');
    expect(() => parseSignedWebhook({ ...app, secret: randomBytes(32).toString('hex') }, bytes, signature)).toThrow('omitidos');
    for (const raw of [Buffer.from('{'), Buffer.from([0xff]), Buffer.alloc(MAX_WEBHOOK_BYTES + 1)]) {
      expect(() => parseSignedWebhook(app, raw, signSyntheticWebhook(app, raw))).toThrow('omitidos');
    }
    await expect(readWebhookBytes(new Request('http://127.0.0.1/webhook', { method: 'POST', body: bytes, headers: { 'Content-Length': String(MAX_WEBHOOK_BYTES + 1) } }))).rejects.toThrow('omitidos');
    const stream = new ReadableStream({ start(controller) { controller.enqueue(Buffer.alloc(MAX_WEBHOOK_BYTES)); controller.enqueue(Buffer.from('x')); controller.close(); } });
    await expect(readWebhookBytes(new Request('http://127.0.0.1/webhook', { method: 'POST', body: stream, duplex: 'half' } as RequestInit))).rejects.toThrow('omitidos');
  });
  it('evolução aditiva não altera roteamento, tipos desconhecidos não disparam; campos essenciais inválidos recusam lote', () => {
    const value = syntheticBatch(['A', 'B'], 'id');
    const events = parse(value).events;
    expect(events.map((event) => [event.professionalId, event.externalId])).toEqual([['A', 'comment:id'], ['A', 'message:id'], ['B', 'comment:id'], ['B', 'message:id']]);
    value.entry[0].changes.push({ field: 'future-event', value: value.entry[0].changes[0].value });
    expect(parse(value).ignored).toBe(1);
    value.entry[0].messaging[0].recipient.id = 'B';
    expect(() => parse(value)).toThrow('omitidos');
    for (const malformed of [{ object: 'page', entry: [] }, { object: 'instagram', entry: [{ id: 'A', time: 1, changes: [{ field: 'comments', value: { id: 'x' } }] }] },
      syntheticBatch(['A'], 'x', new Date(Date.now() + 600_000))]) expect(() => parse(malformed)).toThrow('omitidos');
  });
  it('story/echo/postback são explícitos, sem converter payload desconhecido em texto', () => {
    const batch = { object: 'instagram', entry: [{ id: 'A', time: Math.floor(Date.now() / 1000), messaging: [
      { sender: { id: 'A' }, recipient: { id: 'contact' }, timestamp: Date.now(), message: { mid: 'echo', is_echo: true, text: 'resposta' } },
      { sender: { id: 'contact' }, recipient: { id: 'A' }, timestamp: Date.now(), message: { mid: 'story', text: 'site', reply_to: { story: { id: 'story-1' } } } },
      { sender: { id: 'contact' }, recipient: { id: 'A' }, timestamp: Date.now(), postback: { mid: 'button', payload: 'continue' } },
      { sender: { id: 'contact' }, recipient: { id: 'A' }, timestamp: Date.now(), message: { mid: 'image', attachments: [{ type: 'image' }] } },
    ] }] };
    const events = parse(batch).events;
    expect(events.map((event) => event.kind)).toEqual(['message', 'story', 'postback', 'message']);
    expect(events[0].echo).toBe(true);
    expect(events[2].buttonPayload).toBe('continue');
    expect(events[3].text).toBeNull();
  });
  it('challenge exige o verify token do único app configurado', async () => {
    const url = new URL('http://127.0.0.1/api/local-webhook');
    url.search = new URLSearchParams({ 'hub.mode': 'subscribe', 'hub.verify_token': app.verifyToken, 'hub.challenge': '1234' }).toString();
    expect(await verifyWebhookChallenge(app, new Request(url)).text()).toBe('1234');
    url.searchParams.set('hub.verify_token', 'wrong');
    expect(() => verifyWebhookChallenge(app, new Request(url))).toThrow('omitidos');
  });
});
