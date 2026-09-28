import { randomBytes } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import { createPrisma } from '../../src/shared/db';
import { seedSyntheticAccounts } from '../../src/modules/accounts/seed';
import { TokenVault } from '../../src/modules/accounts/token-vault';
import { DEMO_ACCOUNTS } from '../../src/shared/demo-data';

const db = createPrisma();
afterAll(() => db.$disconnect());
it('PF-020-L: seed repetido preserva pausa, geração, credenciais e rascunho da conta A; B independente', async () => {
  const vault = new TokenVault(new Map([[1, randomBytes(32)]]), 1);
  await seedSyntheticAccounts(db, vault);
  const [a, b] = DEMO_ACCOUNTS;
  const beforeB = await db.accountCredential.findUniqueOrThrow({ where: { accountId: b.id } });
  await db.instagramAccount.update({ where: { id: a.id }, data: { pausedAt: new Date(), connectionGeneration: 2 } });
  await db.automation.create({ data: { accountId: a.id, name: 'Rascunho preservado', config: { text: 'Conteúdo fictício do usuário' } } });
  await seedSyntheticAccounts(db, vault);
  const afterA = await db.instagramAccount.findUniqueOrThrow({ where: { id: a.id } });
  expect(afterA.pausedAt).not.toBeNull(); expect(afterA.connectionGeneration).toBe(2);
  expect(await db.automation.count({ where: { accountId: a.id, name: 'Rascunho preservado' } })).toBe(1);
  const afterB = await db.accountCredential.findUniqueOrThrow({ where: { accountId: b.id } });
  expect(Buffer.from(afterB.ciphertext).equals(Buffer.from(beforeB.ciphertext))).toBe(true);
  expect(await db.automation.count({ where: { accountId: b.id } })).toBe(0);
});
