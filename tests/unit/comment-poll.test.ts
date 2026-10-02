import { describe, expect, it, vi } from 'vitest';
import { pollEligibleMetaComments } from '../../src/integrations/meta/comment-poll';

const config = { graphVersion: 'v24.0', professionalId: '17841422211864282', reelId: '17890000000000001', accessToken: 'test-token-not-a-real-secret' };

describe('coletor de comentários Meta', () => {
  it('consulta somente o Reel configurado e devolve apenas IDs e horários de comentários elegíveis', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ data: [
      { id: '17890000000000002', text: 'Quero uma prévia', timestamp: '2026-10-01T12:00:00+00:00', from: { id: '17890000000000003' } },
      { id: '17890000000000006', text: 'PREVIA', timestamp: '2026-10-01T12:02:00+00:00', from: { id: '17890000000000007' } },
      { id: '17890000000000004', text: 'Legal', timestamp: '2026-10-01T12:01:00+00:00', from: { id: '17890000000000005' } },
    ] }), { status: 200 }));
    const result = await pollEligibleMetaComments({ ...config, acceptUnaccented: true }, request);
    expect(result.comments).toEqual([
      { commentId: '17890000000000002', occurredAt: '2026-10-01T12:00:00.000Z' },
      { commentId: '17890000000000006', occurredAt: '2026-10-01T12:02:00.000Z' },
    ]);
    expect(result.ignored).toBe(1);
    expect(JSON.stringify(result.comments)).not.toMatch(/Quero|17890000000000003/);
    const [url, init] = request.mock.calls[0];
    expect(url.toString()).toBe('https://graph.instagram.com/v24.0/17890000000000001/comments?fields=id%2Ctext%2Ctimestamp%2Cfrom&limit=100');
    expect(init?.headers).toEqual({ authorization: 'Bearer test-token-not-a-real-secret' });
  });

  it('não chama a rede quando a configuração do Reel não é válida', async () => {
    const request = vi.fn<typeof fetch>();
    await expect(pollEligibleMetaComments({ ...config, reelId: 'reel-inválido' }, request)).rejects.toThrow('configuração omitida');
    expect(request).not.toHaveBeenCalled();
  });
});
