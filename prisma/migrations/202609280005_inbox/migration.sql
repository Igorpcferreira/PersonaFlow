-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "lastActivityAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_accountId_contactId_key" ON "Conversation"("accountId", "contactId");
