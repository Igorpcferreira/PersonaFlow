import { test, expect } from '@playwright/test';
import { DEMO_ACCOUNTS } from '../../src/shared/demo-data';

const [a, b] = DEMO_ACCOUNTS;
async function login(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Entrar como operador fictício' }).click();
  await expect(page.getByRole('link', { name: new RegExp(a.label.replace(' · ', '.*')) })).toBeVisible();
}
test('PF-020-L: sessão protege rotas/APIs; A/B e rascunhos permanecem separados após recarga', async ({ page }) => {
  expect((await page.request.get(`/api/accounts/${a.id}`)).status()).toBe(401);
  await page.goto(`/accounts/${a.id}`);
  await expect(page.getByRole('button', { name: 'Entrar como operador fictício' })).toBeVisible();
  await login(page);
  const accounts = await (await page.request.get('/api/accounts')).json();
  expect(accounts.accounts).toHaveLength(2);
  expect((await page.request.get('/api/accounts/33333333-3333-4333-8333-333333333333')).status()).toBe(404);
  await page.getByRole('link', { name: /Aurora/ }).click();
  await expect(page.getByRole('heading', { name: a.label })).toBeVisible();
  await page.getByLabel('Rascunho de mensagem').fill('Texto exclusivo da conta A');
  await page.getByRole('link', { name: 'Trocar conta' }).click();
  await page.getByRole('link', { name: /Jardim/ }).click();
  await expect(page.getByRole('heading', { name: b.label })).toBeVisible();
  await expect(page.getByLabel('Rascunho de mensagem')).toHaveValue('');
  await expect(page.getByText('Nenhuma conversa recebida nesta conta.')).toBeVisible();
  await page.getByLabel('Rascunho de mensagem').fill('Texto exclusivo da conta B');
  await page.goto(`/accounts/${a.id}`);
  await expect(page.getByLabel('Rascunho de mensagem')).toHaveValue('Texto exclusivo da conta A');
  await page.reload();
  await expect(page.getByLabel('Rascunho de mensagem')).toHaveValue('Texto exclusivo da conta A');
  await page.screenshot({ path: '.local-tools/qa/account-shell.png', fullPage: true });
});
test('PF-020-L: troca enquanto A carrega não exibe resposta tardia; erros e loading são visíveis', async ({ page }) => {
  await login(page);
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  await page.route(`**/api/accounts/${a.id}`, async (route) => {
    entered.resolve(); await release.promise;
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ account: { ...a, label: 'Resposta tardia A' } }) }).catch(() => undefined);
  });
  await page.getByRole('link', { name: /Aurora/ }).click();
  await entered.promise;
  await expect(page.getByRole('status')).toHaveText('Carregando conta…');
  await page.getByRole('link', { name: 'Trocar conta' }).click();
  await page.getByRole('link', { name: /Jardim/ }).click();
  await expect(page.getByRole('heading', { name: b.label })).toBeVisible();
  release.resolve();
  await expect(page.getByText('Resposta tardia A')).toHaveCount(0);
  await page.route(`**/api/accounts/${b.id}`, (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
  await page.reload();
  await expect(page.getByRole('alert').filter({ hasText: 'Não foi possível carregar esta conta' })).toBeVisible();
});
