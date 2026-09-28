-- AlterTable
ALTER TABLE "DeliveryIntent" ADD COLUMN     "sequenceRunId" UUID;

-- CreateTable
CREATE TABLE "SequenceRun" (
    "accountId" UUID NOT NULL,
    "id" UUID NOT NULL,
    "commentEventId" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "automationId" UUID NOT NULL,
    "automationRevision" INTEGER NOT NULL,
    "connectionGeneration" INTEGER NOT NULL,
    "controlVersion" INTEGER NOT NULL,
    "followRequired" BOOLEAN NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'waiting',
    "followState" TEXT NOT NULL DEFAULT 'unknown',
    "lastEligibleEventId" UUID,
    "consentedAt" TIMESTAMPTZ(3),
    "profileChecks" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SequenceRun_pkey" PRIMARY KEY ("accountId","id")
);

-- CreateTable
CREATE TABLE "SyntheticProfile" (
    "accountId" UUID NOT NULL,
    "contactId" UUID NOT NULL,
    "follows" TEXT NOT NULL DEFAULT 'unknown',
    "simulateError" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SyntheticProfile_pkey" PRIMARY KEY ("accountId","contactId")
);

-- CreateIndex
CREATE UNIQUE INDEX "SequenceRun_accountId_commentEventId_key" ON "SequenceRun"("accountId", "commentEventId");

-- AddForeignKey
ALTER TABLE "DeliveryIntent" ADD CONSTRAINT "DeliveryIntent_accountId_sequenceRunId_fkey" FOREIGN KEY ("accountId", "sequenceRunId") REFERENCES "SequenceRun"("accountId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SequenceRun" ADD CONSTRAINT "SequenceRun_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "InstagramAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SequenceRun" ADD CONSTRAINT "SequenceRun_accountId_conversationId_fkey" FOREIGN KEY ("accountId", "conversationId") REFERENCES "Conversation"("accountId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SequenceRun" ADD CONSTRAINT "SequenceRun_accountId_automationId_fkey" FOREIGN KEY ("accountId", "automationId") REFERENCES "Automation"("accountId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SequenceRun" ADD CONSTRAINT "SequenceRun_accountId_commentEventId_fkey" FOREIGN KEY ("accountId", "commentEventId") REFERENCES "InboundEvent"("accountId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SequenceRun" ADD CONSTRAINT "SequenceRun_accountId_lastEligibleEventId_fkey" FOREIGN KEY ("accountId", "lastEligibleEventId") REFERENCES "InboundEvent"("accountId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyntheticProfile" ADD CONSTRAINT "SyntheticProfile_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "InstagramAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyntheticProfile" ADD CONSTRAINT "SyntheticProfile_accountId_contactId_fkey" FOREIGN KEY ("accountId", "contactId") REFERENCES "Contact"("accountId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
