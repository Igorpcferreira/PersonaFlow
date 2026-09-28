import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { getDatabaseUrl } from '../src/shared/config';

try {
  getDatabaseUrl();
  const result = spawnSync(process.execPath, [resolve('node_modules/prisma/build/index.js'), 'migrate', 'deploy'], {
    stdio: 'inherit',
  });
  if (result.status !== 0) throw new Error('Migração local falhou.');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Falha de migração.');
  process.exit(1);
}
