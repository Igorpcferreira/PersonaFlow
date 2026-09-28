import { randomUUID } from 'node:crypto';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { resolve } from 'node:path';

async function port() {
  const server = createServer().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Porta indisponível.');
  await new Promise<void>((done) => server.close(() => done()));
  return address.port;
}

async function waitForWeb(url: string, child: ChildProcess) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error('Supervisor E2E terminou antes da web.');
    try { if ((await fetch(url, { signal: AbortSignal.timeout(3000) })).ok) return; } catch { /* web iniciando */ }
    await new Promise((done) => setTimeout(done, 300));
  }
  throw new Error('Web E2E não iniciou no prazo.');
}

async function main() {
  const webPort = await port();
  const env = { ...process.env,
    PERSONAFLOW_DEMO_NAMESPACE: `e2e-${randomUUID()}`, DEMO_PORT: String(webPort),
    E2E_BASE_URL: `http://127.0.0.1:${webPort}`, PLAYWRIGHT_BROWSERS_PATH: resolve('.local-tools/playwright'),
  };
  const supervisor = spawn(process.execPath, ['--import', 'tsx', resolve('scripts/demo.ts')], { env, stdio: 'ignore', windowsHide: true });
  let completed = false;
  try {
    await waitForWeb(env.E2E_BASE_URL, supervisor);
    for (let repeat = 0; repeat < 2; repeat += 1) {
      const seeded = spawnSync(process.execPath, ['--import', 'tsx', resolve('scripts/demo.ts'), '--seed'], { env, stdio: 'ignore', windowsHide: true });
      if (seeded.status !== 0) throw new Error('Seed repetido E2E não confirmou.');
    }
    const result = spawnSync(process.execPath, [resolve('node_modules/@playwright/test/cli.js'), 'test', ...process.argv.slice(2)], { env, stdio: 'inherit', windowsHide: true });
    completed = result.status === 0;
  } finally {
    if (supervisor.exitCode === null && supervisor.signalCode === null) {
      const exited = once(supervisor, 'exit');
      const stop = spawnSync(process.execPath, ['--import', 'tsx', resolve('scripts/demo.ts'), '--stop'], { env, stdio: 'ignore', windowsHide: true });
      if (stop.status !== 0) throw new Error('Parada E2E não confirmada; verificar supervisor local.');
      let deadline: ReturnType<typeof setTimeout> | undefined;
      try { await Promise.race([exited, new Promise((_, reject) => { deadline = setTimeout(() => reject(new Error('Supervisor E2E não encerrou.')), 15_000); })]); }
      finally { if (deadline) clearTimeout(deadline); }
    }
  }
  if (!completed) throw new Error('E2E falhou.');
}

main().catch(() => { console.error('Verificação E2E local falhou; detalhes de conexão omitidos.'); process.exitCode = 1; });
