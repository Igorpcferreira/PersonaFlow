import type { Database } from '../../shared/db';

export async function getConversation(db: Database, accountId: string, conversationId: string) {
  return db.conversation.findUnique({
    where: { accountId_id: { accountId, id: conversationId } },
    include: { contact: true, messages: true },
  });
}

export async function createConversation(db: Database, accountId: string, contactId: string) {
  const contact = await db.contact.findUnique({ where: { accountId_id: { accountId, id: contactId } } });
  if (!contact) throw new Error('Contato inexistente nesta conta.');
  return db.conversation.create({ data: { accountId, contactId } });
}

export async function createMessage(
  db: Database,
  accountId: string,
  conversationId: string,
  externalId: string,
  body: string,
) {
  const conversation = await getConversation(db, accountId, conversationId);
  if (!conversation) throw new Error('Conversa inexistente nesta conta.');
  return db.message.create({ data: { accountId, conversationId, externalId, body } });
}
