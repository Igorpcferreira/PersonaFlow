import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import EmbeddedPostgres from 'embedded-postgres';
import { parseDatabaseUrl } from '../src/shared/config';

function runLocal(binary: string, args: string[]) {
  const result = spawnSync(process.execPath, [resolve(binary), ...args], {
    stdio: 'inherit',
    env: process.env,
  });
  if (result.status !== 0) throw new Error('Verificação de integração falhou.');
}

async function availablePort() {
  const server = createServer();
  await new Promise<void>((resolveReady) => server.listen(0, '127.0.0.1', resolveReady));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Porta local indisponível.');
  await new Promise<void>((resolveClosed) => server.close(() => resolveClosed()));
  return address.port;
}

async function main() {
  if (process.env.TEST_DATABASE_URL) {
    const url = parseDatabaseUrl(process.env.TEST_DATABASE_URL);
    if (!new URL(url).pathname.startsWith('/personaflow_test')) throw new Error('Exige banco personaflow_test*.');
    process.env.DATABASE_URL = url;
    runLocal('node_modules/tsx/dist/cli.mjs', ['scripts/migrate.ts']);
    runLocal('node_modules/vitest/vitest.mjs', ['run', 'tests/integration']);
    return;
  }

  const port = await availablePort();
  const password = randomBytes(24).toString('hex');
  const root = resolve('.local-postgres');
  mkdirSync(root, { recursive: true });
  const databaseDir = resolve(root, `run-${randomUUID()}`);
  const postgres = new EmbeddedPostgres({
    databaseDir,
    user: 'persona_test',
    password,
    port,
    persistent: false,
    onLog: () => undefined,
    onError: () => undefined,
  });

  try {
    await postgres.initialise();
    await postgres.start();
    await postgres.createDatabase('personaflow_test');
    process.env.DATABASE_URL = `postgresql://persona_test:${password}@127.0.0.1:${port}/personaflow_test`;
    parseDatabaseUrl(process.env.DATABASE_URL);
    runLocal('node_modules/tsx/dist/cli.mjs', ['scripts/migrate.ts']);
    runLocal('node_modules/vitest/vitest.mjs', ['run', 'tests/integration']);
  } finally {
    await postgres.stop().catch(() => undefined);
    delete process.env.DATABASE_URL;
  }
}

main().catch(() => {
  console.error('Falha no PostgreSQL isolado ou no teste de integração; nenhum dado de conexão exibido.');
  process.exit(1);
});
