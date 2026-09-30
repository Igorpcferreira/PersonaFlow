-- Add the timestamp used only for note-content retention. Existing notes are
-- conservatively treated as edited when this migration is applied.
ALTER TABLE "Conversation" ADD COLUMN "noteUpdatedAt" TIMESTAMPTZ(3);

UPDATE "Conversation"
SET "noteUpdatedAt" = CURRENT_TIMESTAMP
WHERE "note" IS NOT NULL;

CREATE INDEX "Conversation_accountId_noteUpdatedAt_idx" ON "Conversation"("accountId", "noteUpdatedAt");
CREATE INDEX "Message_accountId_receivedAt_idx" ON "Message"("accountId", "receivedAt");
CREATE INDEX "InboundEvent_accountId_receivedAt_idx" ON "InboundEvent"("accountId", "receivedAt");
CREATE INDEX "DeliveryIntent_accountId_createdAt_idx" ON "DeliveryIntent"("accountId", "createdAt");
