import { test, expect, type Page } from '@playwright/test';
import { DEMO_ACCOUNTS } from '../../src/shared/demo-data';
const [a, b] = DEMO_ACCOUNTS;
async function recipe(page: Page, name: string, reel: string) {
  await page.goto('/'); await page.getByRole('button', { name: 'Entrar como operador fictício' }).click(); await page.getByRole('link', { name: /Aurora/ }).click();
  await page.getByLabel('Nome da automação').fill(name);
  await page.getByLabel('Reel fictício', { exact: true }).selectOption(reel);
  await page.getByLabel('Palavras ou expressões').fill('sequência');
  await page.getByLabel('DM de apresentação').fill(`Introdução de ${name}`);
  await page.getByLabel('Usar botão para continuar', { exact: true }).check();
  await page.getByLabel('Texto do botão').fill('Continuar configurado');
  await page.getByLabel('Pedir para seguir antes do link', { exact: true }).check();
  await page.getByLabel('Pedido para seguir').fill('Pedido editável para seguir');
  await page.getByLabel('Mensagem final', { exact: true }).fill(`Link final de ${name}`);
  await page.getByRole('textbox', { name: 'Link final', exact: true }).fill('https://example.invalid/sequence-ui');
  await page.getByRole('button', { name: 'Salvar rascunho' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Rascunho salvo' })).toBeVisible();
  await page.getByRole('button', { name: 'Ativar localmente' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Automação ativa' })).toBeVisible();
  await page.getByLabel('Comentário para simular').fill('Quero a sequência');
  const received = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith(`/api/accounts/${a.id}/simulate-event`));
  await page.getByRole('button', { name: 'Simular comentário assinado' }).click();
  const receipt = await received; expect(receipt.status()).toBe(200);
  expect(receipt.request().postDataJSON().mediaId).toBe(reel);
  expect(await receipt.json()).toMatchObject({ inserted: 1, duplicate: 0 });
  await expect(page.getByRole('status').filter({ hasText: 'Comentário fictício recebido' })).toBeVisible();
  const card = page.locator('.sequence-card').filter({ has: page.getByRole('heading', { name, exact: true }) });
  await expect.poll(async () => {
    const current = await (await page.request.get(`/api/accounts/${a.id}/sequences`)).json();
    return current.sequences.find((run: { automationName: string; canInteract: boolean }) => run.automationName === name)?.canInteract ?? false;
  }).toBe(true);
  await page.getByRole('button', { name: 'Atualizar sequências' }).click();
  await expect(card.getByRole('button', { name: 'Simular nova interação no botão' })).toBeEnabled();
  return { card, id: (await card.getAttribute('data-run-id'))!, origin: new URL(page.url()).origin };
}
async function view(page: Page, id: string) {
  return (await (await page.request.get(`/api/accounts/${a.id}/sequences`)).json()).sequences.find((run: { id: string }) => run.id === id);
}
test('PF-104-L: false/consentimento/rechecagem true na UI, seguir sozinho não envia; link único', async ({ page }) => {
  const issues: string[] = []; page.on('pageerror', () => issues.push('pageerror'));
  page.on('console', (message) => { if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) issues.push('console_error'); });
  const { card, id, origin } = await recipe(page, 'Sequência com seguir', 'synthetic-reel-2');
  expect((await page.request.post(`/api/accounts/${b.id}/sequences`, { headers: { Origin: origin }, data: { action: 'profile', runId: id, state: 'true' } })).status()).toBe(404);
  expect((await page.request.post(`/api/accounts/${a.id}/sequences`, { data: { action: 'profile', runId: id, state: 'true' } })).status()).toBe(401);
  await card.getByLabel('Estado fictício do perfil', { exact: true }).selectOption('false'); await card.getByRole('button', { name: 'Definir perfil fictício' }).click();
  await expect(card.getByText('Fixture salva: Não segue')).toBeVisible();
  const before = await view(page, id); expect(before.profileChecks).toBe(0); expect(before.linkStatus).toBeNull();
  await card.getByRole('button', { name: 'Simular nova interação no botão' }).click();
  await expect.poll(async () => (await view(page, id)).state).toBe('consent_required');
  expect((await view(page, id)).profileChecks).toBe(0);
  await card.getByLabel('Simular consentimento nesta interação para consultar o perfil').check();
  await card.getByRole('button', { name: 'Simular nova interação no botão' }).click();
  await expect.poll(async () => (await view(page, id)).state).toBe('follow_false');
  await page.getByRole('button', { name: 'Atualizar sequências' }).click();
  await expect(card.getByText('Ainda não segue · aguardando nova interação')).toBeVisible();
  const threadBefore = await (await page.request.get(`/api/accounts/${a.id}/inbox/${before.conversationId}`)).json();
  await card.getByLabel('Estado fictício do perfil', { exact: true }).selectOption('true'); await card.getByRole('button', { name: 'Definir perfil fictício' }).click();
  await expect(card.getByText('Fixture salva: Segue')).toBeVisible();
  const changed = await view(page, id); expect(changed.profileChecks).toBe(1); expect(changed.linkStatus).toBeNull();
  expect((await (await page.request.get(`/api/accounts/${a.id}/inbox/${before.conversationId}`)).json()).conversation.lastEligibleInboundAt).toBe(threadBefore.conversation.lastEligibleInboundAt);
  await card.getByRole('button', { name: 'Simular nova interação no botão' }).click();
  await expect.poll(async () => (await view(page, id)).linkStatus).toBe('accepted');
  await page.getByRole('button', { name: 'Atualizar sequências' }).click(); await expect(card.getByText('Link aceito pela simulação', { exact: true })).toBeVisible();
  await card.getByRole('button', { name: 'Repetir mesma interação' }).click(); await expect(card.getByText('Interação repetida sem novo efeito.')).toBeVisible();
  expect((await view(page, id)).profileChecks).toBe(3);
  const thread = await (await page.request.get(`/api/accounts/${a.id}/inbox/${before.conversationId}`)).json();
  expect(thread.intents.filter((intent: { effect: string; body: { text: string } }) => intent.effect === 'link' && intent.body.text.includes('Link final de Sequência com seguir'))).toHaveLength(1);
  await page.screenshot({ path: '.local-tools/qa/sequence.png', fullPage: true }); expect(issues).toEqual([]);
});
test('PF-104-L: unknown e erro retêm link, nova interação após true consulta e envia', async ({ page }) => {
  const { card, id } = await recipe(page, 'Sequência com leitura incerta', 'synthetic-reel-3');
  await card.getByLabel('Simular consentimento nesta interação para consultar o perfil').check();
  for (const state of ['unknown', 'error']) {
    await card.getByLabel('Estado fictício do perfil', { exact: true }).selectOption(state); await card.getByRole('button', { name: 'Definir perfil fictício' }).click();
    await card.getByRole('button', { name: 'Simular nova interação no botão' }).click();
    await expect.poll(async () => (await view(page, id)).profileChecks).toBe(state === 'unknown' ? 1 : 2);
    expect((await view(page, id)).linkStatus).toBeNull();
    await page.getByRole('button', { name: 'Atualizar sequências' }).click(); await expect(card.getByText('Leitura desconhecida · link retido')).toBeVisible();
  }
  await page.screenshot({ path: '.local-tools/qa/sequence-unknown.png', fullPage: true });
  await card.getByLabel('Estado fictício do perfil', { exact: true }).selectOption('true'); await card.getByRole('button', { name: 'Definir perfil fictício' }).click();
  expect((await view(page, id)).linkStatus).toBeNull();
  await card.getByRole('button', { name: 'Simular nova interação no botão' }).click();
  await expect.poll(async () => (await view(page, id)).linkStatus).toBe('accepted');
  expect((await view(page, id)).profileChecks).toBe(4);
});
