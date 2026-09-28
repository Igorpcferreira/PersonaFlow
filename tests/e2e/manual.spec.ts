import { test, expect } from '@playwright/test';
import { DEMO_ACCOUNTS } from '../../src/shared/demo-data';

const [a, b] = DEMO_ACCOUNTS;
test('PF-022-L: assumir/enviar/retomar, replay único e aceito/incerto/falhou sem retry de unknown', async ({ page }) => {
  const browserIssues: string[] = [];
  page.on('pageerror', () => browserIssues.push('uncaught_page_error'));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (text.startsWith('Failed to load resource:')) return; // Status negativos são testados explicitamente abaixo.
    browserIssues.push(/hydrat/i.test(text) ? 'hydration' : /key.*prop/i.test(text) ? 'react_key' : /update.*component/i.test(text) ? 'react_state_update' : 'other_browser_error');
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Entrar como operador fictício' }).click();
  await page.getByRole('link', { name: /Jardim/ }).click();
  const origin = new URL(page.url()).origin;
  const initial = await page.request.post(`/api/accounts/${b.id}/simulate-event`, { headers: { Origin: origin },
    data: { kind: 'message', text: 'Entrada elegível de Jardim', externalId: crypto.randomUUID() } });
  expect(initial.status()).toBe(200);
  await expect.poll(async () => (await (await page.request.get(`/api/accounts/${b.id}/inbox`)).json()).conversations.length).toBe(1);
  await page.getByRole('button', { name: 'Atualizar inbox' }).click();
  await page.getByRole('button', { name: /Visitante fictício/ }).click();
  await page.getByLabel('Rascunho de mensagem').fill('Resposta manual de Jardim');
  await expect(page.getByRole('button', { name: 'Enviar simulado' })).toBeDisabled();
  await page.getByRole('button', { name: 'Assumir conversa' }).click();
  await expect(page.getByText('Controle manual', { exact: true })).toBeVisible();
  await expect(page.locator('.conversation-item').getByText('Manual · Aberta', { exact: true })).toBeVisible();
  const sending = page.waitForRequest((request) => request.method() === 'POST' && request.url().includes('/inbox/') && request.postDataJSON()?.action === 'send');
  await page.getByRole('button', { name: 'Enviar simulado' }).click();
  const sent = await sending;
  const body = sent.postDataJSON();
  await expect.poll(async () => {
    await page.getByRole('button', { name: 'Atualizar conversa' }).click();
    return page.locator('.messages').getByText('Aceito pela simulação', { exact: true }).count();
  }).toBe(1);
  expect((await page.request.post(sent.url(), { headers: { Origin: origin }, data: body })).status()).toBe(202);
  const thread = await (await page.request.get(sent.url())).json();
  expect(thread.intents.filter((intent: { source: string }) => intent.source === 'manual')).toHaveLength(1);
  expect((await page.request.post(sent.url(), { headers: { Origin: 'http://invalid.example' }, data: { action: 'resume' } })).status()).toBe(401);
  expect((await page.request.post(`/api/accounts/${a.id}/inbox/${thread.conversation.id}`, { headers: { Origin: origin }, data: { action: 'assume' } })).status()).toBe(404);
  for (const [outcome, text, label] of [['timeout', 'Resposta incerta fictícia', 'Incerto · não será reenviado'], ['rejected', 'Falha fictícia', 'Falhou na simulação']]) {
    await page.getByLabel('Resultado fictício').selectOption(outcome);
    await page.getByLabel('Rascunho de mensagem').fill(text);
    await page.getByRole('button', { name: 'Enviar simulado' }).click();
    await expect.poll(async () => {
      await page.getByRole('button', { name: 'Atualizar conversa' }).click();
      return page.locator('.messages').getByText(label, { exact: true }).count();
    }).toBe(1);
  }
  await expect(page.getByRole('button', { name: /Tentar novamente|Reenviar/i })).toHaveCount(0);
  await expect(page.getByText('Há um resultado incerto nesta conversa. A simulação não reenviará esse pedido.')).toBeVisible();
  await page.screenshot({ path: '.local-tools/qa/manual.png', fullPage: true });
  await page.getByRole('button', { name: 'Retomar automação' }).click();
  await expect(page.getByRole('button', { name: 'Assumir conversa' })).toBeVisible();
  const final = await (await page.request.get(sent.url())).json();
  expect(final.intents).toHaveLength(3);
  expect(final.intents.map((intent: { status: string }) => intent.status).sort()).toEqual(['accepted', 'rejected', 'unknown']);
  expect(browserIssues).toEqual([]);
});

test('PF-022-L: resposta perdida depois do commit conserva requestId; retry da UI cria um único envio', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Entrar como operador fictício' }).click();
  await page.getByRole('link', { name: /Jardim/ }).click();
  const origin = new URL(page.url()).origin;
  await page.request.post(`/api/accounts/${b.id}/simulate-event`, { headers: { Origin: origin }, data: {
    kind: 'message', text: 'Entrada para teste de resposta perdida', externalId: crypto.randomUUID(),
  } });
  await expect.poll(async () => (await (await page.request.get(`/api/accounts/${b.id}/inbox`)).json()).conversations.length).toBe(1);
  await page.getByRole('button', { name: 'Atualizar inbox' }).click();
  await page.getByRole('button', { name: /Visitante fictício/ }).click();
  await page.getByRole('button', { name: 'Assumir conversa' }).click();
  await expect(page.getByText('Controle manual', { exact: true })).toBeVisible();
  let lost = false;
  const requestIds: string[] = [];
  await page.route('**/api/accounts/*/inbox/*', async (route) => {
    const request = route.request();
    if (request.method() !== 'POST' || request.postDataJSON()?.action !== 'send') { await route.continue(); return; }
    requestIds.push(request.postDataJSON().clientRequestId);
    if (!lost) {
      lost = true;
      const confirmed = await route.fetch();
      expect(confirmed.status()).toBe(202);
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Resposta fictícia perdida após o commit.' }) });
    } else await route.continue();
  });
  const text = 'Pedido único apesar de resposta perdida';
  await page.getByLabel('Rascunho de mensagem').fill(text);
  await page.getByRole('button', { name: 'Enviar simulado' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Resposta fictícia perdida' })).toBeVisible();
  await expect(page.getByLabel('Rascunho de mensagem')).toHaveValue(text);
  await page.getByRole('button', { name: 'Enviar simulado' }).click();
  await expect(page.getByLabel('Rascunho de mensagem')).toHaveValue('');
  expect(requestIds).toHaveLength(2); expect(requestIds[0]).toBe(requestIds[1]);
  const list = await (await page.request.get(`/api/accounts/${b.id}/inbox`)).json();
  const thread = await (await page.request.get(`/api/accounts/${b.id}/inbox/${list.conversations[0].id}`)).json();
  expect(thread.intents.filter((intent: { body: { text: string } }) => intent.body.text === text)).toHaveLength(1);
});
