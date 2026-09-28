import { test, expect } from '@playwright/test';
import { DEMO_ACCOUNTS } from '../../src/shared/demo-data';

const [a, b] = DEMO_ACCOUNTS;
test('PF-021-L: entrada assinada percorre fila e inbox, echo/tipo indisponível/replay; API cruzada e CSRF recusados', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Entrar como operador fictício' }).click();
  await page.getByRole('link', { name: /Aurora/ }).click();
  const initialList = await (await page.request.get(`/api/accounts/${a.id}/inbox`)).json();
  const existing = initialList.conversations.find((item: { contact: { igScopedUserId: string } }) => item.contact.igScopedUserId === 'synthetic-visitor');
  const initialMessages = existing ? (await (await page.request.get(`/api/accounts/${a.id}/inbox/${existing.id}`)).json()).messages.length : 0;
  await page.getByText('Receber mensagem fictícia', { exact: true }).click();
  await page.getByLabel('Mensagem fictícia', { exact: true }).fill('Entrada exclusiva de Aurora');
  await page.getByRole('button', { name: 'Simular entrada de DM' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Mensagem fictícia recebida' })).toBeVisible();
  await expect.poll(async () => {
    await page.getByRole('button', { name: 'Atualizar inbox' }).click();
    return page.getByRole('button', { name: /Visitante fictício/ }).count();
  }).toBe(1);
  await page.getByRole('button', { name: /Visitante fictício/ }).click();
  await expect(page.locator('.messages').getByText('Entrada exclusiva de Aurora')).toBeVisible();
  await expect(page.getByText(/Histórico parcial/)).toBeVisible();
  const origin = new URL(page.url()).origin;
  const list = await (await page.request.get(`/api/accounts/${a.id}/inbox`)).json();
  const conversationId = list.conversations[0].id;
  expect((await page.request.get(`/api/accounts/${b.id}/inbox/${conversationId}`)).status()).toBe(404);
  expect((await page.request.post(`/api/accounts/${a.id}/simulate-event`, { data: { kind: 'message', externalId: crypto.randomUUID(), text: 'CSRF negado' } })).status()).toBe(401);
  const externalId = crypto.randomUUID();
  for (const body of [
    { kind: 'echo', text: 'Echo fictício', externalId }, { kind: 'echo', text: 'Echo fictício', externalId },
    { kind: 'message', text: null, externalId: crypto.randomUUID() },
  ]) expect((await page.request.post(`/api/accounts/${a.id}/simulate-event`, { headers: { Origin: origin }, data: body })).status()).toBe(200);
  await expect.poll(async () => {
    const thread = await (await page.request.get(`/api/accounts/${a.id}/inbox/${conversationId}`)).json();
    return thread.messages.length;
  }).toBe(initialMessages + 3);
  await page.getByRole('button', { name: 'Atualizar inbox' }).click();
  await expect(page.getByText(/Echo · saída identificada/)).toBeVisible();
  await expect(page.getByText('Mensagem sem texto · conteúdo indisponível')).toBeVisible();
  await page.screenshot({ path: '.local-tools/qa/inbox.png', fullPage: true });
  await page.getByRole('link', { name: 'Trocar conta' }).click();
  await page.getByRole('link', { name: /Jardim/ }).click();
  await expect(page.getByText('Entrada exclusiva de Aurora')).toHaveCount(0);
});
