import { describe, expect, it, vi } from 'vitest';
import { subscribeMetaComments } from '../../src/integrations/meta/subscribe';

const config = { graphVersion: 'v24.0', professionalId: '17841422211864282', accessToken: 'token-ficticio' };
describe('assinatura restrita dos comentários', () => {
  it('confirma somente após GET mostrar comments', async () => {
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ subscribed_fields: ['comments'] }] }), { status: 200 }));
    expect(await subscribeMetaComments(config, request)).toEqual({ confirmed: true, reason: 'confirmed' });
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[0][0]).toBe(`https://graph.instagram.com/v24.0/${config.professionalId}/subscribed_apps`);
    expect(request.mock.calls[0][1]?.body).toBe('subscribed_fields=comments');
  });
  it('POST aceito sem confirmação GET permanece não verificado', async () => {
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [] }), { status: 200 }));
    expect(await subscribeMetaComments(config, request)).toEqual({ confirmed: false, reason: 'unverified' });
  });
  it('falha de rede não é tratada como sucesso', async () => {
    const request = vi.fn<typeof fetch>().mockRejectedValue(new Error('rede'));
    expect(await subscribeMetaComments(config, request)).toEqual({ confirmed: false, reason: 'ambiguous' });
  });
});
