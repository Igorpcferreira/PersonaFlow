import { randomBytes, randomUUID } from 'node:crypto';
import type { Database } from '../../src/shared/db';
import { TokenVault } from '../../src/modules/accounts/token-vault';
import { LOCAL_META_SCOPES } from '../../src/integrations/meta/oauth-contract';

export async function deliveryFixture(db: Database, occurredAt = new Date(), kind = 'comment') {
  const key = randomBytes(32);
  const vault = new TokenVault(new Map([[1, key]]), 1);
  const account = await db.instagramAccount.create({ data: { label: 'Entrega fictícia', professionalId: `synthetic-${randomUUID()}`, connectionGeneration: 1 } });
  await db.accountCredential.create({ data: { accountId: account.id, ...vault.encrypt(account.id, 1, 'synthetic-token'), generation: 1,
    scopes: [...LOCAL_META_SCOPES], issuedAt: new Date(), expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60_000) } });
  const contact = await db.contact.create({ data: { accountId: account.id, igScopedUserId: 'synthetic-contact' } });
  const conversation = await db.conversation.create({ data: { accountId: account.id, contactId: contact.id, lastEligibleInboundAt: occurredAt } });
  const automation = await db.automation.create({ data: { accountId: account.id, name: 'Regra fictícia', status: 'active', mediaId: 'synthetic-reel', config: {} } });
  const event = await db.inboundEvent.create({ data: { accountId: account.id, externalId: `${kind}:${randomUUID()}`, kind, generation: 1, occurredAt,
    payload: { actorId: contact.igScopedUserId, text: 'site', echo: false, mediaId: 'synthetic-reel', buttonPayload: null } } });
  return { account, contact, conversation, automation, event, vault, key };
}
