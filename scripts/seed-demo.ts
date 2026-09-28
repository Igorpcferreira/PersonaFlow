import { createPrisma } from '../src/shared/db';
import { parseAuthConfig } from '../src/shared/auth-config';
import { parseLocalSecrets } from '../src/shared/local-runtime';
import { seedSyntheticAccounts } from '../src/modules/accounts/seed';
import { TokenVault } from '../src/modules/accounts/token-vault';

async function main() {
  if (parseAuthConfig(process.env).mode !== 'local-demo') throw new Error('Seed somente em simulação local.');
  const settings = parseLocalSecrets(process.env);
  const db = createPrisma();
  try {
    await seedSyntheticAccounts(db, new TokenVault(new Map([[1, Buffer.from(settings.PERSONAFLOW_TOKEN_KEY, 'hex')]]), 1));
    console.log('Duas contas fictícias preparadas; trabalho existente preservado.');
  } finally { await db.$disconnect(); }
}
main().catch(() => { console.error('Seed local recusado ou indisponível; valores omitidos.'); process.exitCode = 1; });
