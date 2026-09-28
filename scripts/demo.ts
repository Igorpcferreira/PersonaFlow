import { randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { createServer as createTcpServer } from 'node:net';
import { createServer } from 'node:http';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { resolve } from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import { parseDatabaseUrl } from '../src/shared/config';
import { parseAuthConfig } from '../src/shared/auth-config';

const namespace = process.env.PERSONAFLOW_DEMO_NAMESPACE ?? 'demo';
if (!/^(demo|e2e-[a-f0-9-]{36})$/.test(namespace)) throw new Error('Namespace local inválido.');
const root = resolve('.local-postgres', namespace);
const settingsFile = resolve(root, 'settings.json');
const controlFile = resolve(root, 'control.json');
const lockFile = resolve(root, 'run.lock');

async function availablePort(port = 0) {
  const server = createTcpServer();
  server.listen(port, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Porta local indisponível.');
  await new Promise<void>((done) => server.close(() => done()));
  return address.port;
}

async function main() {
  if (process.argv.includes('--stop') || process.argv.includes('--seed')) {
    const action = process.argv.includes('--seed') ? 'seed' : 'stop';
    const control = JSON.parse(readFileSync(controlFile, 'utf8')) as { port: number; token: string };
    if (!Number.isInteger(control.port) || control.port < 1 || control.port > 65535 || !/^[a-f0-9]{64}$/.test(control.token)) throw new Error('Controle local inválido.');
    const response = await fetch(`http://127.0.0.1:${control.port}/${action}`, {
      method: 'POST', headers: { Authorization: `Bearer ${control.token}` }, signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error('Parada local recusada.');
    console.log(action === 'seed' ? 'Contas fictícias preparadas novamente; trabalho existente preservado.' : 'Parada solicitada ao supervisor local. Dados fictícios preservados.');
    return;
  }
  mkdirSync(root, { recursive: true });
  writeFileSync(lockFile, String(process.pid), { flag: 'wx' });
  let postgres: EmbeddedPostgres | undefined;
  const children: ChildProcess[] = [];
  let server: ReturnType<typeof createServer> | undefined;
  let stopped = false;
  let starting = true;
  let stopRequested = false;
  const stop = async () => {
    if (starting) { stopRequested = true; return; }
    if (stopped) return;
    stopped = true;
    for (const child of children.reverse()) {
      if (child.exitCode !== null || child.signalCode !== null || !child.pid) continue;
      const exit = once(child, 'exit');
      if (process.platform === 'win32') spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
      else process.kill(-child.pid, 'SIGTERM');
      await Promise.race([exit, new Promise<void>((done) => setTimeout(done, 5000))]);
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }
    await postgres?.stop();
    server?.close();
    if (existsSync(controlFile)) unlinkSync(controlFile);
    unlinkSync(lockFile);
    console.log('Web, worker e PostgreSQL locais encerrados. Dados preservados.');
  };
  try {
    process.once('SIGINT', () => { void stop(); });
    process.once('SIGTERM', () => { void stop(); });
    if (!existsSync(settingsFile)) writeFileSync(settingsFile, JSON.stringify({
      password: randomBytes(32).toString('hex'), authSecret: randomBytes(32).toString('hex'),
    }), { mode: 0o600, flag: 'wx' });
    const settings = JSON.parse(readFileSync(settingsFile, 'utf8')) as { password: string; authSecret: string;
      tokenKey?: string; webhookSecret?: string; webhookVerifyToken?: string };
    if (!/^[a-f0-9]{64}$/.test(settings.password) || !/^[a-f0-9]{64}$/.test(settings.authSecret)) throw new Error('Configuração local inválida.');
    if (!settings.tokenKey || !settings.webhookSecret || !settings.webhookVerifyToken) {
      settings.tokenKey ??= randomBytes(32).toString('hex');
      settings.webhookSecret ??= randomBytes(32).toString('hex');
      settings.webhookVerifyToken ??= randomBytes(32).toString('hex');
      writeFileSync(settingsFile, JSON.stringify(settings), { mode: 0o600 });
    }
    if (![settings.tokenKey, settings.webhookSecret, settings.webhookVerifyToken].every((value) => /^[a-f0-9]{64}$/.test(value!))) throw new Error('Configuração local inválida.');
    const dbPort = await availablePort();
    const webPort = await availablePort(Number(process.env.DEMO_PORT ?? 3000));
    const env: NodeJS.ProcessEnv = { ...process.env,
      DATABASE_URL: parseDatabaseUrl(`postgresql://persona_demo:${settings.password}@127.0.0.1:${dbPort}/personaflow_demo`),
      PERSONAFLOW_MODE: 'local-demo', PERSONAFLOW_BIND_HOST: '127.0.0.1',
      BETTER_AUTH_URL: `http://127.0.0.1:${webPort}`, BETTER_AUTH_SECRET: settings.authSecret,
      OPERATOR_ALLOWLIST: 'local-demo:demo-operator-001', NODE_ENV: 'development',
      PERSONAFLOW_TOKEN_KEY: settings.tokenKey, PERSONAFLOW_WEBHOOK_SECRET: settings.webhookSecret,
      PERSONAFLOW_WEBHOOK_VERIFY_TOKEN: settings.webhookVerifyToken,
    };
    parseAuthConfig(env);
    postgres = new EmbeddedPostgres({ databaseDir: resolve(root, 'data'), user: 'persona_demo', password: settings.password,
      port: dbPort, persistent: true, postgresFlags: ['-c', 'listen_addresses=127.0.0.1', '-c', 'timezone=UTC'],
      onLog: () => undefined, onError: () => undefined,
    });
    if (!existsSync(resolve(root, 'data/PG_VERSION'))) await postgres.initialise();
    await postgres.start();
    const client = postgres.getPgClient();
    await client.connect();
    const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', ['personaflow_demo']);
    await client.end();
    if (!exists.rowCount) await postgres.createDatabase('personaflow_demo');
    const migrated = spawnSync(process.execPath, [resolve('node_modules/tsx/dist/cli.mjs'), 'scripts/migrate.ts'], { env, stdio: 'pipe', windowsHide: true });
    if (migrated.status !== 0) throw new Error('Migração da demonstração falhou; detalhes omitidos.');
    const seeded = spawnSync(process.execPath, [resolve('node_modules/tsx/dist/cli.mjs'), 'scripts/seed-demo.ts'], { env, stdio: 'pipe', windowsHide: true });
    if (seeded.status !== 0) throw new Error('Seed da demonstração falhou; detalhes omitidos.');
    const run = (args: string[]) => {
      const child = spawn(process.execPath, args, { env, stdio: 'ignore', windowsHide: true, detached: process.platform !== 'win32' });
      children.push(child);
      child.on('error', () => { console.error('Falha em processo local; detalhes omitidos.'); void stop(); });
      child.on('exit', () => { if (!stopped) { console.error('Processo local encerrou inesperadamente.'); void stop(); } });
      return child;
    };
    run([resolve('node_modules/next/dist/bin/next'), 'dev', '--hostname', '127.0.0.1', '--port', String(webPort)]);
    run(['--import', 'tsx', resolve('src/jobs/worker.ts')]);
    const token = randomBytes(32).toString('hex');
    server = createServer((request, response) => {
      const candidate = Buffer.from(request.headers.authorization?.replace(/^Bearer /, '') ?? '');
      const expected = Buffer.from(token);
      if (request.method !== 'POST' || !['/stop', '/seed'].includes(request.url ?? '') || candidate.length !== expected.length || !timingSafeEqual(candidate, expected)) {
        response.writeHead(403).end(); return;
      }
      if (request.url === '/seed') {
        const result = spawnSync(process.execPath, [resolve('node_modules/tsx/dist/cli.mjs'), 'scripts/seed-demo.ts'], { env, stdio: 'pipe', windowsHide: true });
        response.writeHead(result.status === 0 ? 200 : 503).end(); return;
      }
      response.writeHead(202).end();
      setImmediate(() => { void stop(); });
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Controle indisponível.');
    writeFileSync(controlFile, JSON.stringify({ port: address.port, token }), { mode: 0o600 });
    starting = false;
    if (stopRequested) { await stop(); return; }
    console.log(`Simulação local em ${env.BETTER_AUTH_URL}. Aguarde a web iniciar. Parar: npm run demo:stop ou Ctrl+C.`);
  } catch {
    starting = false;
    await stop();
    throw new Error('Não foi possível iniciar a demonstração local; detalhes omitidos.');
  }
}

main().catch(() => { console.error('Demonstração local indisponível. Confira portas/processos locais; nenhum segredo exibido.'); process.exitCode = 1; });
