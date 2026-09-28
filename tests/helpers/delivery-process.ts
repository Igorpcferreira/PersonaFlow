import { createPrisma } from '../../src/shared/db';
import { TokenVault } from '../../src/modules/accounts/token-vault';
import { executeIntent } from '../../src/modules/delivery/executor';
import { FakeTransport } from '../../src/integrations/meta/fake-transport';

const [accountId, intentId, mode] = process.argv.slice(2);
const db = createPrisma();
const key = process.env.PERSONAFLOW_TEST_TOKEN_KEY;
if (!key || !/^[a-f0-9]{64}$/.test(key)) throw new Error('Chave de fixture ausente.');
const vault = new TokenVault(new Map([[1, Buffer.from(key, 'hex')]]), 1);
async function main() {
  const transport = new FakeTransport(db, 'accepted', mode === 'crash' ? async () => {
    process.send?.({ type: 'accepted', intentId, pid: process.pid });
    await new Promise(() => undefined);
  } : undefined);
  const intent = await executeIntent(db, vault, transport, { accountId, intentId }, { leaseMs: 300, timeoutMs: 60_000 });
  process.send?.({ type: 'recovered', intentId, pid: process.pid, status: intent.status, calls: transport.calls });
  await db.$disconnect();
  process.disconnect?.();
}
main().catch(() => { console.error('Processo de teste de envio falhou; detalhes omitidos.'); process.exit(1); });
