import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { getDatabaseUrl } from '../src/shared/config';

try {
  if (Number(process.versions.node.split('.')[0]) !== 24) {
    throw new Error('Use Node.js 24 para este projeto.');
  }
  getDatabaseUrl();
  const result = spawnSync(process.execPath, [resolve('node_modules/prisma/build/index.js'), 'generate'], {
    stdio: 'inherit',
  });
  if (result.status !== 0) throw new Error('Falha na geração do cliente Prisma.');
  console.log('Ferramentas e configuração local verificadas.');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Falha no setup local.');
  process.exit(1);
}
