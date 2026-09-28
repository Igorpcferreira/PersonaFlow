import { test, expect } from '@playwright/test';
import { DEMO_ACCOUNTS } from '../../src/shared/demo-data';

const [a, b] = DEMO_ACCOUNTS;
test('PF-024-L: story/DM configuráveis, replay único, PARAR persistido sem afetar A', async ({ page }) => {
  const issues: string[] = [];
  page.on('pageerror', () => issues.push('pageerror'));
  page.on('console', (message) => { if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) issues.push('console_error'); });
  await page.goto('/'); await page.getByRole('button', { name: 'Entrar como operador fictício' }).click();
  await page.getByRole('link', { name: /Jardim/ }).click();
  const origin = new URL(page.url()).origin;
  const list = await (await page.request.get(`/api/accounts/${b.id}/inbox`)).json();
  let conversationId = list.conversations.find((item: { contact: { igScopedUserId: string } }) => item.contact.igScopedUserId === 'synthetic-visitor')?.id;
  if (conversationId) expect((await page.request.post(`/api/accounts/${b.id}/inbox/${conversationId}`, { headers: { Origin: origin }, data: { action: 'resume' } })).status()).toBe(200);
  const aBefore = await (await page.request.get(`/api/accounts/${a.id}/inbox`)).json();
  for (const trigger of ['story', 'message']) {
    await page.getByRole('button', { name: 'Nova automação' }).click();
    await page.getByLabel('Nome da automação').fill(`Texto de ${trigger}`);
    await page.getByLabel('Gatilho fictício', { exact: true }).selectOption(trigger);
    await expect(page.getByLabel('Reel fictício', { exact: true })).toHaveCount(0);
    await page.getByLabel('Palavras ou expressões').fill('ajuda');
    await page.getByLabel('Resposta textual', { exact: true }).fill(`Resposta editável ${trigger}`);
    await page.getByRole('button', { name: 'Salvar rascunho' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Rascunho salvo' })).toBeVisible();
    await page.getByRole('button', { name: 'Ativar localmente' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Automação ativa' })).toBeVisible();
    await page.getByLabel('Texto para simular').fill('Quero AJUDA!');
    await page.getByRole('button', { name: trigger === 'story' ? 'Simular story assinada' : 'Simular DM assinada' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Texto fictício recebido' })).toBeVisible();
    await expect.poll(async () => {
      const current = await (await page.request.get(`/api/accounts/${b.id}/inbox`)).json();
      conversationId = current.conversations.find((item: { contact: { igScopedUserId: string } }) => item.contact.igScopedUserId === 'synthetic-visitor')?.id;
      if (!conversationId) return 0;
      const thread = await (await page.request.get(`/api/accounts/${b.id}/inbox/${conversationId}`)).json();
      return thread.intents.filter((item: { body: { text: string }; status: string }) => item.body.text === `Resposta editável ${trigger}` && item.status === 'accepted').length;
    }).toBe(1);
    await page.getByRole('button', { name: 'Repetir mesmo evento', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Evento repetido' })).toBeVisible();
    const thread = await (await page.request.get(`/api/accounts/${b.id}/inbox/${conversationId}`)).json();
    expect(thread.intents.filter((item: { body: { text: string } }) => item.body.text === `Resposta editável ${trigger}`)).toHaveLength(1);
  }
  const baseline = await (await page.request.get(`/api/accounts/${b.id}/inbox/${conversationId}`)).json();
  await page.getByLabel('Texto para simular').fill(' PARAR! ');
  await page.getByRole('button', { name: 'Simular DM assinada' }).click();
  await expect.poll(async () => (await (await page.request.get(`/api/accounts/${b.id}/inbox/${conversationId}`)).json()).conversation.contact.suppressedAt).not.toBeNull();
  await page.getByLabel('Texto para simular').fill('ajuda');
  await page.getByRole('button', { name: 'Simular DM assinada' }).click();
  await expect.poll(async () => {
    const thread = await (await page.request.get(`/api/accounts/${b.id}/inbox/${conversationId}`)).json();
    return thread.messages.filter((item: { body: string }) => item.body === 'ajuda').length;
  }).toBe(1);
  const after = await (await page.request.get(`/api/accounts/${b.id}/inbox/${conversationId}`)).json();
  expect(after.intents).toHaveLength(baseline.intents.length);
  const aAfter = await (await page.request.get(`/api/accounts/${a.id}/inbox`)).json();
  expect(aAfter.conversations.map((item: { contact: unknown }) => item.contact)).toEqual(aBefore.conversations.map((item: { contact: unknown }) => item.contact));
  await page.getByRole('button', { name: 'Atualizar inbox' }).click(); await page.getByRole('button', { name: /Visitante fictício/ }).click();
  await expect(page.getByText('Automações suprimidas por PARAR/SAIR. Novas mensagens não removem essa preferência.')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Texto de story · Ativa' }).click();
  await expect(page.getByLabel('Gatilho fictício', { exact: true })).toHaveValue('story');
  await expect(page.getByLabel('Resposta textual', { exact: true })).toHaveValue('Resposta editável story');
  await page.screenshot({ path: '.local-tools/qa/text-recipes.png', fullPage: true });
  expect(issues).toEqual([]);
});
