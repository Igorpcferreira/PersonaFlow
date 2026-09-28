import { test, expect } from '@playwright/test';
import { DEMO_ACCOUNTS } from '../../src/shared/demo-data';

const [a, b] = DEMO_ACCOUNTS;
test('PF-026-L: conexão/heartbeat/pausa/limite e expiração/reconexão são visíveis e isolados', async ({ page }) => {
  const issues: string[] = [];
  page.on('pageerror', () => issues.push('pageerror'));
  page.on('console', (message) => { if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) issues.push('console_error'); });
  await page.goto('/'); await page.getByRole('button', { name: 'Entrar como operador fictício' }).click();
  const loaded = page.waitForResponse((response) => response.url().endsWith(`/api/accounts/${a.id}/diagnostics`));
  await page.getByRole('link', { name: /Aurora/ }).click(); expect((await loaded).status()).toBe(200);
  const diagnostic = page.locator('#diagnostics');
  await expect(diagnostic.getByText('Conectada à simulação', { exact: true })).toBeVisible();
  await expect(diagnostic.getByText('Worker: Heartbeat recente')).toBeVisible();
  await expect(diagnostic.getByRole('button', { name: 'Renovar token fictício' })).toBeDisabled();
  const beforeB = await (await page.request.get(`/api/accounts/${b.id}/diagnostics`)).json();
  const origin = new URL(page.url()).origin;
  expect((await page.request.post(`/api/accounts/${a.id}/diagnostics`, { data: { action: 'pause' } })).status()).toBe(401);
  expect((await page.request.post(`/api/accounts/${a.id}/diagnostics`, { headers: { Origin: origin }, data: { action: 'pause', accountId: b.id } })).status()).toBe(400);
  expect((await page.request.post(`/api/accounts/33333333-3333-4333-8333-333333333333/diagnostics`, { headers: { Origin: origin }, data: { action: 'reconnect' } })).status()).toBe(404);
  await diagnostic.getByRole('button', { name: 'Simular expiração' }).click();
  await expect(diagnostic.getByText('Expirada · reconecte esta conta', { exact: true })).toBeVisible();
  await diagnostic.getByRole('button', { name: 'Reconectar ficticiamente' }).click();
  await expect(diagnostic.getByText('Conectada à simulação', { exact: true })).toBeVisible();
  await diagnostic.getByRole('button', { name: 'Revogar conexão fictícia' }).click();
  await expect(diagnostic.getByText('Revogada · reconecte esta conta', { exact: true })).toBeVisible();
  await diagnostic.getByRole('button', { name: 'Reconectar ficticiamente' }).click();
  await expect(diagnostic.getByText('Conectada à simulação', { exact: true })).toBeVisible();
  await diagnostic.getByRole('button', { name: 'Pausar conta' }).click();
  await expect(diagnostic.getByText('Conta pausada · novos envios bloqueados')).toBeVisible();
  await diagnostic.getByLabel('Limite fictício por minuto').fill('1');
  await diagnostic.getByRole('button', { name: 'Aplicar limite fictício' }).click();
  await expect.poll(async () => (await (await page.request.get(`/api/accounts/${a.id}/diagnostics`)).json()).limit.quota).toBe(1);
  await diagnostic.getByRole('button', { name: 'Retomar conta' }).click();
  await diagnostic.getByLabel('Limite fictício por minuto').fill('30');
  await diagnostic.getByRole('button', { name: 'Aplicar limite fictício' }).click();
  await expect.poll(async () => (await (await page.request.get(`/api/accounts/${a.id}/diagnostics`)).json()).limit.quota).toBe(30);
  const afterB = await (await page.request.get(`/api/accounts/${b.id}/diagnostics`)).json();
  expect(afterB.connection).toEqual(beforeB.connection); expect(afterB.paused).toBe(beforeB.paused); expect(afterB.limit.quota).toBe(beforeB.limit.quota);
  await page.screenshot({ path: '.local-tools/qa/diagnostics.png', fullPage: true });
  expect(issues).toEqual([]);
});

test('PF-026-L: resultado incerto permanece terminal no diagnóstico sem ação de reenvio', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Entrar como operador fictício' }).click();
  await page.getByRole('link', { name: /Jardim/ }).click();
  const origin = new URL(page.url()).origin;
  expect((await page.request.post(`/api/accounts/${b.id}/simulate-event`, { headers: { Origin: origin }, data: { kind: 'message', text: 'Teste de diagnóstico incerto', externalId: crypto.randomUUID() } })).status()).toBe(200);
  let conversationId = '';
  await expect.poll(async () => {
    const inbox = await (await page.request.get(`/api/accounts/${b.id}/inbox`)).json();
    conversationId = inbox.conversations.find((item: { contact: { igScopedUserId: string } }) => item.contact.igScopedUserId === 'synthetic-visitor')?.id ?? '';
    return Boolean(conversationId);
  }).toBe(true);
  const threadURL = `/api/accounts/${b.id}/inbox/${conversationId}`;
  expect((await page.request.post(threadURL, { headers: { Origin: origin }, data: { action: 'assume' } })).status()).toBe(200);
  const send = await page.request.post(threadURL, { headers: { Origin: origin }, data: { action: 'send', text: 'Incerto do diagnóstico', clientRequestId: crypto.randomUUID(), simulationOutcome: 'timeout' } });
  expect(send.status()).toBe(202); const { intentId } = await send.json();
  await expect.poll(async () => (await (await page.request.get(`/api/accounts/${b.id}/diagnostics`)).json()).results.uncertain.some((intent: { id: string }) => intent.id === intentId)).toBe(true);
  const diagnostic = page.locator('#diagnostics'); await diagnostic.getByRole('button', { name: 'Atualizar diagnóstico' }).click();
  await expect(diagnostic.getByText('Pedidos incertos são terminais e não serão reenviados automaticamente.')).toBeVisible();
  await expect(diagnostic.getByRole('button', { name: /Reenviar|Tentar novamente/i })).toHaveCount(0);
  expect((await page.request.post(`/api/accounts/${b.id}/diagnostics`, { headers: { Origin: origin }, data: { action: 'retry', intentId } })).status()).toBe(400);
  const after = await (await page.request.get(threadURL)).json();
  expect(after.intents.find((intent: { id: string }) => intent.id === intentId).status).toBe('unknown');
  // Devolve o controle para que próximos casos recebam novas entradas automáticas.
  expect((await page.request.post(threadURL, { headers: { Origin: origin }, data: { action: 'resume' } })).status()).toBe(200);
});
