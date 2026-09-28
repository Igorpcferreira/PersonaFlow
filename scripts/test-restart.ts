import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { createPrisma } from '../src/shared/db';
import { parseDatabaseUrl } from '../src/shared/config';
import { DEMO_ACCOUNTS } from '../src/shared/demo-data';
import { emptyRecipe } from '../src/modules/automations/recipe';
import type { ThreadData } from '../src/app/inbox-panel';
import type { SequenceView } from '../src/modules/automations/sequence-contract';
import type { AccountDiagnostics } from '../src/modules/accounts/diagnostic-contract';

let stage = 'preparação';
async function freePort() {
  const server = createServer().listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert(address && typeof address !== 'string');
  await new Promise<void>((done) => server.close(() => done())); return address.port;
}
async function main() {
  const namespace = `e2e-${randomUUID()}`, root = resolve('.local-postgres', namespace), webPort = await freePort();
  const origin = `http://127.0.0.1:${webPort}`;
  const env = { ...process.env, PERSONAFLOW_DEMO_NAMESPACE: namespace, DEMO_PORT: String(webPort), PLAYWRIGHT_BROWSERS_PATH: resolve('.local-tools/playwright') };
  process.env.PLAYWRIGHT_BROWSERS_PATH = env.PLAYWRIGHT_BROWSERS_PATH;
  const { chromium, expect: baseExpect } = await import('@playwright/test');
  const expect = baseExpect.configure({ timeout: 15_000 });
  const command = (action: '--stop' | '--seed') => {
    const result = spawnSync(process.execPath, ['--import', 'tsx', resolve('scripts/demo.ts'), action], { env, stdio: 'ignore', windowsHide: true });
    assert.equal(result.status, 0);
  };
  let supervisor: ChildProcess | undefined;
  async function start() {
    supervisor = spawn(process.execPath, ['--import', 'tsx', resolve('scripts/demo.ts')], { env, stdio: 'ignore', windowsHide: true });
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      assert.equal(supervisor.exitCode, null); assert.equal(supervisor.signalCode, null);
      try { if ((await fetch(origin, { signal: AbortSignal.timeout(3000) })).ok) return; } catch { /* Web iniciando. */ }
      await new Promise((done) => setTimeout(done, 300));
    }
    throw new Error('Prazo da web local.');
  }
  async function stop() {
    if (!supervisor || supervisor.exitCode !== null || supervisor.signalCode !== null) return;
    const exited = once(supervisor, 'exit'); command('--stop');
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { await Promise.race([exited, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Prazo de parada.')), 15_000); })]); }
    finally { if (timer) clearTimeout(timer); }
    assert.equal(existsSync(resolve(root, 'run.lock')), false);
    assert.equal(existsSync(resolve(root, 'control.json')), false);
  }
  // Apenas namespace criado por este ensaio, destino loopback validado; nenhum valor privado sai do processo.
  async function proof() {
    const lines = readFileSync(resolve(root, 'data/postmaster.pid'), 'utf8').split(/\r?\n/);
    const pgPid = Number(lines[0]), pgPort = Number(lines[3]);
    assert(Number.isInteger(pgPid) && pgPid > 0 && Number.isInteger(pgPort) && pgPort > 0 && pgPort < 65536);
    const settings = JSON.parse(readFileSync(resolve(root, 'settings.json'), 'utf8')) as { password: string };
    assert.match(settings.password, /^[a-f0-9]{64}$/);
    const previousURL = process.env.DATABASE_URL;
    process.env.DATABASE_URL = parseDatabaseUrl(`postgresql://persona_demo:${settings.password}@127.0.0.1:${pgPort}/personaflow_demo`);
    const db = createPrisma();
    if (previousURL === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousURL;
    const accountId = { in: DEMO_ACCOUNTS.map((account) => account.id) };
    try {
      const accounts = await db.instagramAccount.findMany({ where: { id: accountId }, orderBy: { id: 'asc' }, select: { id: true, pausedAt: true, connectionGeneration: true, webhookGeneration: true } });
      const conversations = await db.conversation.findMany({ where: { accountId }, orderBy: { id: 'asc' }, select: { id: true, accountId: true, status: true, note: true, organizationVersion: true, control: true, controlVersion: true, lastEligibleInboundAt: true } });
      const rules = await db.automation.findMany({ where: { accountId }, orderBy: { id: 'asc' }, select: { id: true, accountId: true, revision: true, status: true, mediaId: true, config: true } });
      const runs = await db.sequenceRun.findMany({ where: { accountId }, orderBy: { id: 'asc' }, select: { id: true, accountId: true, state: true, followState: true, profileChecks: true } });
      const intents = await db.deliveryIntent.findMany({ where: { accountId }, orderBy: { id: 'asc' }, select: { id: true, accountId: true, status: true, effect: true, idempotencyKey: true } });
      const effects = await db.syntheticEffect.count({ where: { accountId } });
      const attempts = await db.deliveryAttempt.count({ where: { accountId } });
      const messages = await db.message.count({ where: { accountId } });
      const pending = await db.inboundEvent.count({ where: { accountId, processedAt: null } });
      assert.equal(pending, 0);
      return { pgPid, data: { accounts, conversations, rules, runs, intents, effects, attempts, messages } };
    } finally { await db.$disconnect(); }
  }
  stage = 'navegador'; const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ baseURL: origin, locale: 'pt-BR' });
  context.setDefaultTimeout(15_000); context.setDefaultNavigationTimeout(30_000);
  let page = await context.newPage();
  const issues: string[] = []; let externalRequests = 0;
  function observe(target: Page) {
    target.on('pageerror', () => issues.push('pageerror'));
    target.on('console', (message) => { if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) issues.push(message.text().includes('WebSocket') ? 'websocket_error' : 'console_error'); });
  }
  observe(page);
  await context.route('**/*', async (route) => {
    if (new URL(route.request().url()).origin !== origin) { externalRequests++; await route.abort(); } else await route.continue();
  });
  const [a, b] = DEMO_ACCOUNTS;
  const api = (accountId: string, path: string) => `/api/accounts/${accountId}/${path}`;
  async function get<T>(path: string): Promise<T> { const response = await page.request.get(path); assert.equal(response.status(), 200); return response.json() as Promise<T>; }
  async function post<T = unknown>(path: string, data: unknown, status = 200): Promise<T> {
    const response = await page.request.post(path, { headers: { Origin: origin }, data }); assert.equal(response.status(), status); return response.json() as Promise<T>;
  }
  async function conversation(accountId: string) {
    const list = await get<{ conversations: { id: string }[] }>(api(accountId, 'inbox')); assert.equal(list.conversations.length, 1); return list.conversations[0].id;
  }
  const sequences = () => get<{ sequences: SequenceView[] }>(api(a.id, 'sequences'));
  try {
    stage = 'início e login'; await start(); console.log('Primeira inicialização local confirmada.');
    await page.goto('/'); await page.getByRole('button', { name: 'Entrar como operador fictício' }).click();
    await page.getByRole('link', { name: /Aurora/ }).click();
    stage = 'receita pela interface';
    await page.getByLabel('Nome da automação').fill('Receita persistente do ensaio');
    await page.getByLabel('Reel fictício', { exact: true }).selectOption('synthetic-reel-1');
    await page.getByLabel('Palavras ou expressões').fill('reinício');
    await page.getByLabel('DM de apresentação', { exact: true }).fill('Introdução persistente');
    await page.getByLabel('Usar botão para continuar').check(); await page.getByLabel('Texto do botão').fill('Continuar ensaio');
    await page.getByLabel('Pedir para seguir antes do link').check(); await page.getByLabel('Pedido para seguir').fill('Pedido fictício editável');
    await page.getByLabel('Mensagem final', { exact: true }).fill('Final persistente'); await page.getByLabel('Link final', { exact: true }).fill('https://example.invalid/restart');
    await page.getByRole('button', { name: 'Salvar rascunho' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Rascunho salvo' })).toBeVisible();
    await page.getByLabel('DM de apresentação', { exact: true }).fill('Introdução revisada persistente');
    await page.getByRole('button', { name: 'Salvar rascunho' }).click();
    await expect(page.getByLabel('DM de apresentação', { exact: true })).toHaveValue('Introdução revisada persistente');
    await expect(page.getByRole('button', { name: 'Ativar localmente' })).toBeEnabled();
    await page.getByRole('button', { name: 'Ativar localmente' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Automação ativa' })).toBeVisible();
    const commentId = randomUUID();
    stage = 'comentário assinado, fila e sequência';
    await post(api(a.id, 'simulate-event'), { kind: 'comment', text: 'Quero reinício', mediaId: 'synthetic-reel-1', externalId: commentId });
    await expect.poll(async () => (await sequences()).sequences[0]?.canInteract, { timeout: 15_000 }).toBe(true);
    const runId = (await sequences()).sequences[0].id, aConversation = await conversation(a.id);
    const profile = (state: string) => post(api(a.id, 'sequences'), { action: 'profile', runId, state });
    const interact = () => post(api(a.id, 'sequences'), { action: 'interact', runId, consent: true, clientRequestId: randomUUID() });
    await profile('unknown'); await interact();
    await expect.poll(async () => (await sequences()).sequences[0]?.state, { timeout: 15_000 }).toBe('follow_unknown');
    await profile('false'); await interact();
    await expect.poll(async () => (await sequences()).sequences[0]?.state, { timeout: 15_000 }).toBe('follow_false');
    await expect.poll(async () => (await get<ThreadData>(api(a.id, `inbox/${aConversation}`))).intents.filter((item) => item.effect === 'automatic_dm' && item.status === 'accepted').length, { timeout: 15_000 }).toBe(1);
    const beforeProfile = await get<ThreadData>(api(a.id, `inbox/${aConversation}`));
    await profile('true');
    const afterProfile = await get<ThreadData>(api(a.id, `inbox/${aConversation}`));
    assert.equal(afterProfile.conversation.lastEligibleInboundAt, beforeProfile.conversation.lastEligibleInboundAt);
    assert.equal(afterProfile.intents.length, beforeProfile.intents.length);
    await interact();
    await expect.poll(async () => (await sequences()).sequences[0]?.linkStatus, { timeout: 15_000 }).toBe('accepted');
    stage = 'B manual incerto e nota';
    await post(api(b.id, 'simulate-event'), { kind: 'message', text: 'Entrada persistente Jardim', externalId: randomUUID() });
    await expect.poll(async () => (await get<{ conversations: unknown[] }>(api(b.id, 'inbox'))).conversations.length, { timeout: 15_000 }).toBe(1);
    const bConversation = await conversation(b.id), requestId = randomUUID();
    await post(api(b.id, `inbox/${bConversation}`), { action: 'assume' });
    const manual = { action: 'send', clientRequestId: requestId, text: 'Pedido incerto persistente', simulationOutcome: 'timeout' };
    await post(api(b.id, `inbox/${bConversation}`), manual, 202);
    await expect.poll(async () => (await get<ThreadData>(api(b.id, `inbox/${bConversation}`))).intents[0]?.status, { timeout: 15_000 }).toBe('unknown');
    await post(api(b.id, `inbox/${bConversation}`), { action: 'organize', version: 0, status: 'resolved', note: 'Nota persistente de Jardim' });
    await post(api(a.id, 'diagnostics'), { action: 'pause' });
    const bRule = await post<{ automation: { id: string } }>(api(b.id, 'automations'), { name: 'Rascunho exclusivo Jardim', trigger: 'message', mediaId: null, config: { ...emptyRecipe, terms: ['ajuda'], introduction: 'Texto persistente Jardim' } }, 201);
    assert(bRule.automation.id);
    stage = 'seed preserva dados'; command('--seed'); command('--seed');
    const before = await proof(), oldSupervisor = supervisor!.pid;
    const oldHeartbeat = (await get<AccountDiagnostics>(api(b.id, 'diagnostics'))).worker.seenAt;
    assert.equal(before.data.intents.filter((item) => item.accountId === b.id && item.status === 'unknown').length, 1);
    assert.equal(before.data.effects, 5); assert.equal(before.data.attempts, 5);
    // Fechar a página evita erros esperados do HMR durante indisponibilidade deliberada; cookies continuam no contexto.
    assert.deepEqual(issues, []); await page.close();
    stage = 'stop/start persistente'; console.log('Dados conferidos; iniciando stop/start do supervisor e banco.'); await stop(); await start();
    page = await context.newPage(); observe(page);
    assert.notEqual(supervisor!.pid, oldSupervisor);
    const restarted = await proof(); assert.notEqual(restarted.pgPid, before.pgPid); assert.deepEqual(restarted.data, before.data);
    assert.equal((await page.request.get('/api/operator')).status(), 200);
    await expect.poll(async () => {
      const state = await get<AccountDiagnostics>(api(b.id, 'diagnostics'));
      return state.worker.state === 'active' && Boolean(state.worker.seenAt && state.worker.seenAt !== oldHeartbeat);
    }, { timeout: 15_000 }).toBe(true);
    stage = 'replay pós-restart e seed';
    await post(api(a.id, 'simulate-event'), { kind: 'comment', text: 'Quero reinício', mediaId: 'synthetic-reel-1', externalId: commentId });
    await post(api(b.id, `inbox/${bConversation}`), manual, 202); command('--seed');
    assert.deepEqual((await proof()).data, before.data);
    assert.equal((await get<AccountDiagnostics>(api(a.id, 'diagnostics'))).paused, true);
    assert.equal((await get<AccountDiagnostics>(api(b.id, 'diagnostics'))).connection.status, 'connected');
    stage = 'UI Aurora restaurada'; console.log('Restart, sessão e replay conferidos; verificando UI restaurada.'); await page.goto(`/accounts/${a.id}`);
    await page.getByRole('button', { name: 'Receita persistente do ensaio · Ativa' }).click();
    await expect(page.getByLabel('DM de apresentação', { exact: true })).toHaveValue('Introdução revisada persistente');
    stage = 'UI sequência restaurada'; await page.getByRole('button', { name: 'Atualizar sequências' }).click();
    await expect(page.getByText('Link aceito pela simulação', { exact: true })).toBeVisible();
    await page.screenshot({ path: '.local-tools/qa/restart-aurora.png', fullPage: true });
    stage = 'UI Jardim restaurada'; await page.getByRole('link', { name: 'Trocar conta' }).click(); await page.getByRole('link', { name: /Jardim/ }).click();
    await page.getByRole('button', { name: /Visitante fictício/ }).click();
    await page.getByText('Estado e nota da conversa', { exact: true }).click();
    await expect(page.getByLabel('Nota da conversa', { exact: true })).toHaveValue('Nota persistente de Jardim');
    await expect(page.getByText('Incerto · não será reenviado', { exact: true })).toBeVisible();
    await page.screenshot({ path: '.local-tools/qa/restart-jardim.png', fullPage: true });
    stage = 'console e isolamento de rede';
    if (externalRequests || issues.length) console.error(JSON.stringify({ externalRequests, issues }));
    assert.equal(externalRequests, 0); assert.deepEqual(issues, []);
    console.log('Restart validado: PIDs distintos, sessão/dados/seed preservados, 5 tentativas/efeitos fictícios, replay e unknown sem reenvio.');
  } catch {
    if (!page.isClosed()) await page.screenshot({ path: '.local-tools/qa/restart-failed.png', fullPage: true });
    throw new Error('Falha do ensaio.');
  } finally {
    await browser.close(); const previousStage = stage; stage = 'encerramento'; await stop(); stage = previousStage;
  }
}
main().catch(() => { console.error(`Ensaio persistente falhou na etapa ${stage}; detalhes privados omitidos.`); process.exitCode = 1; });
