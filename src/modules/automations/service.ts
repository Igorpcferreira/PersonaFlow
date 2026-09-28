import { z } from 'zod';
import type { Database } from '../../shared/db';
import { lockAccount } from '../../shared/account-lock';
import { RequestRejected } from '../../shared/operator-context';
import { automationInput, LOCAL_RECIPE_CAPABILITIES, normalizeTerms, readyRecipe, recipeConfig } from './recipe';

export async function saveAutomation(db: Database, accountId: string, value: unknown, automationId?: string, revision?: number) {
  const parsed = automationInput.safeParse(value);
  if (!parsed.success || (automationId && (!z.uuid().safeParse(automationId).success || !Number.isInteger(revision)))) throw new RequestRejected(400, 'Revise os campos da automação.');
  const data = { ...parsed.data, config: { ...parsed.data.config, terms: normalizeTerms(parsed.data.config.terms) } };
  return db.$transaction(async (tx) => {
    await lockAccount(tx, accountId);
    if (!automationId) return tx.automation.create({ data: { accountId, ...data } });
    const existing = await tx.automation.findUnique({ where: { accountId_id: { accountId, id: automationId } } });
    if (!existing) throw new RequestRejected(404);
    if (existing.revision !== revision) throw new RequestRejected(409, 'Esta automação mudou. Recarregue antes de salvar.');
    const automation = await tx.automation.update({ where: { accountId_id: { accountId, id: automationId } },
      data: { ...data, status: 'draft', revision: { increment: 1 } } });
    await tx.deliveryIntent.updateMany({ where: { accountId, automationId, status: 'pending' }, data: { status: 'canceled', reason: 'automation_changed' } });
    return automation;
  });
}
export async function setAutomationStatus(db: Database, accountId: string, automationId: string, status: 'active' | 'paused', revision: number) {
  if (!z.uuid().safeParse(automationId).success || !Number.isInteger(revision)) throw new RequestRejected(400);
  return db.$transaction(async (tx) => {
    await lockAccount(tx, accountId);
    const automation = await tx.automation.findUnique({ where: { accountId_id: { accountId, id: automationId } } });
    if (!automation) throw new RequestRejected(404);
    if (automation.revision !== revision) throw new RequestRejected(409, 'Esta automação mudou. Recarregue antes de continuar.');
    if (status === 'active') {
      const config = recipeConfig.safeParse(automation.config);
      if (!config.success || !readyRecipe(config.data)) throw new RequestRejected(400, 'Preencha palavras, apresentação, mensagem final e link antes de ativar.');
      if ((config.data.publicReplyEnabled && !LOCAL_RECIPE_CAPABILITIES.publicReply) || (config.data.buttonEnabled && !LOCAL_RECIPE_CAPABILITIES.button) ||
          (config.data.followRequired && !LOCAL_RECIPE_CAPABILITIES.follow)) throw new RequestRejected(409, 'Esta sequência opcional ainda não pode ser ativada nesta demonstração. Salve como rascunho.');
      const conflicting = await tx.automation.findFirst({ where: { accountId, trigger: automation.trigger, mediaId: automation.mediaId, status: 'active', id: { not: automationId } }, select: { id: true } });
      if (conflicting) throw new RequestRejected(409, 'Já existe uma automação ativa para este reel nesta conta. Pause a outra antes de ativar.');
    }
    const updated = await tx.automation.update({ where: { accountId_id: { accountId, id: automationId } }, data: { status, revision: { increment: 1 } } });
    await tx.deliveryIntent.updateMany({ where: { accountId, automationId, status: 'pending' }, data: { status: 'canceled', reason: 'automation_changed' } });
    return updated;
  });
}
