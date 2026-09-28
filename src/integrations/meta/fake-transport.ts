import type { Database } from '../../shared/db';
import type { z } from 'zod';
import type { deliveryBody } from '../../modules/delivery/ledger';

export interface SyntheticSend {
  accountId: string; intentId: string; attemptId: string; effect: string;
  body: z.infer<typeof deliveryBody>; signal: AbortSignal;
}
export interface SyntheticTransport {
  readonly kind: 'synthetic';
  send(context: SyntheticSend): Promise<{ kind: 'accepted'; id: string } | { kind: 'rejected' }>;
}
export class BeforeSendFailure extends Error {
  constructor(readonly rateLimited = false) { super('Falha fictícia comprovada antes do envio.'); }
}
export class FakeTransport implements SyntheticTransport {
  readonly kind = 'synthetic';
  calls = 0;
  constructor(private db: Database, private mode: 'accepted' | 'timeout' | 'before-send' | 'rate-limit' | 'rejected' | 'hold' = 'accepted',
    private afterAccepted?: (context: SyntheticSend) => Promise<void>) {}
  async send(context: SyntheticSend): Promise<{ kind: 'accepted'; id: string } | { kind: 'rejected' }> {
    this.calls += 1;
    if (this.mode === 'before-send' || this.mode === 'rate-limit') throw new BeforeSendFailure(this.mode === 'rate-limit');
    if (this.mode === 'rejected') return { kind: 'rejected' };
    const effect = await this.db.syntheticEffect.create({ data: { accountId: context.accountId, intentId: context.intentId, attemptId: context.attemptId } });
    await this.afterAccepted?.(context);
    if (this.mode === 'timeout') throw new Error('Resposta fictícia perdida após aceite.');
    if (this.mode === 'hold') await new Promise<void>((done) => {
      if (context.signal.aborted) done(); else context.signal.addEventListener('abort', () => done(), { once: true });
    });
    return { kind: 'accepted', id: `synthetic-${effect.id}` };
  }
}
