import { describe, expect, it, vi } from 'vitest';
import { sendMetaPrivateReply, type MetaPrivateReplyCommand, type MetaPrivateReplyConfig } from '../../src/integrations/meta/private-reply';

const config: MetaPrivateReplyConfig = {
  graphVersion: 'v24.0',
  professionalId: '17841422211864282',
  accessToken: 'test-token-not-a-real-secret',
  approvedText: 'Oi! Vi seu pedido de prévia.',
};
const command: MetaPrivateReplyCommand = {
  professionalId: config.professionalId,
  commentExternalId: '17999887766554433',
  text: config.approvedText,
};

const response = (status: number, body = '') => new Response(body, { status, headers: { 'content-type': 'application/json' } });

describe('Meta private reply transport', () => {
  it('chama uma vez o endpoint oficial com a conta, comentário e texto exatos', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(response(200, '{"message_id":"mid.1"}'));

    await expect(sendMetaPrivateReply(config, command, { fetch })).resolves.toEqual({ kind: 'accepted', status: 200, messageId: 'mid.1' });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith('https://graph.instagram.com/v24.0/17841422211864282/messages', expect.objectContaining({
      method: 'POST',
      headers: { authorization: 'Bearer test-token-not-a-real-secret', 'content-type': 'application/json' },
      body: JSON.stringify({ recipient: { comment_id: '17999887766554433' }, message: { text: config.approvedText } }),
    }));
  });

  it.each([
    ['outra conta profissional', { ...command, professionalId: '17840000000000000' }, 'professional_account_mismatch'],
    ['comentário inválido', { ...command, commentExternalId: 'comment-url-not-an-id' }, 'invalid_comment_external_id'],
    ['texto diferente do aprovado', { ...command, text: `${command.text} Agora.` }, 'text_not_approved'],
  ] as const)('recusa %s antes de chamar a API', async (_name, invalidCommand, reason) => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    await expect(sendMetaPrivateReply(config, invalidCommand, { fetch })).resolves.toEqual({ kind: 'confirmed_before_send', reason });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    [400, { kind: 'rejected', reason: 'http_4xx', status: 400 }],
    [403, { kind: 'rejected', reason: 'http_4xx', status: 403 }],
    [500, { kind: 'ambiguous', reason: 'http_5xx', status: 500 }],
    [503, { kind: 'ambiguous', reason: 'http_5xx', status: 503 }],
  ] as const)('classifica HTTP %i sem retentar', async (status, expected) => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(response(status, '{"error":"ignored"}'));
    await expect(sendMetaPrivateReply(config, command, { fetch })).resolves.toEqual(expected);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('mantém timeout como resultado ambíguo e não chama outra vez', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation((_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
    }));
    await expect(sendMetaPrivateReply(config, command, { fetch, timeoutMs: 10 })).resolves.toEqual({ kind: 'ambiguous', reason: 'timeout' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('mantém falha de rede após iniciar a chamada como ambígua', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(new TypeError('network down'));
    await expect(sendMetaPrivateReply(config, command, { fetch })).resolves.toEqual({ kind: 'ambiguous', reason: 'network_after_request' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('não aceita uma resposta bem-sucedida cujo corpo ultrapassa o limite seguro', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(response(200, 'x'.repeat(4_097)));
    await expect(sendMetaPrivateReply(config, command, { fetch })).resolves.toEqual({ kind: 'ambiguous', reason: 'response_too_large', status: 200 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
