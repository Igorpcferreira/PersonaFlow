import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

test('operador fictício entra, recarrega sessão persistida e sai; API protegida', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Entrar como operador fictício' })).toBeVisible();
  expect((await page.request.get('/api/operator')).status()).toBe(401);
  mkdirSync('.local-tools/qa', { recursive: true });
  await page.screenshot({ path: '.local-tools/qa/login.png', fullPage: true });
  const started = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/auth/sign-in/social');
  await page.getByRole('button', { name: 'Entrar como operador fictício' }).click();
  const startResponse = await started;
  expect(startResponse.status()).toBe(200);
  await expect(page.getByText('Olá, Operador fictício. Sua sessão está ativa.')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Sair', exact: true })).toBeVisible();
  expect((await page.request.get('/api/operator')).status()).toBe(200);
  await page.getByRole('button', { name: 'Sair', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Entrar como operador fictício' })).toBeVisible();
  expect((await page.request.get('/api/operator')).status()).toBe(401);
});

test('carregamento e erro da sessão são visíveis e recuperáveis', async ({ page }) => {
  let release: () => void = () => undefined;
  const pending = new Promise<void>((done) => { release = done; });
  await page.route('**/api/operator', async (route) => {
    await pending;
    await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
  });
  await page.goto('/');
  await expect(page.getByRole('status')).toHaveText('Consultando sessão…');
  release();
  await expect(page.getByRole('alert').filter({ hasText: 'Não foi possível consultar' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Entrar como operador fictício' })).toBeEnabled();
});
