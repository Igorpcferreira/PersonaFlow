-- AlterTable
ALTER TABLE "InstagramAccount" ADD COLUMN     "pausedAt" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "suppressedAt" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "control" TEXT NOT NULL DEFAULT 'automatic',
ADD COLUMN     "controlVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastEligibleInboundAt" TIMESTAMPTZ(3),
ADD COLUMN     "note" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'open';

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "direction" TEXT NOT NULL DEFAULT 'inbound',
ADD COLUMN     "echo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'text',
ADD COLUMN     "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "Automation" (
    "accountId" UUID NOT NULL,
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "trigger" TEXT NOT NULL DEFAULT 'comment',
    "mediaId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "config" JSONB NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Automation_pkey" PRIMARY KEY ("accountId","id")
);

-- CreateTable
CREATE TABLE "DeliveryIntent" (
    "accountId" UUID NOT NULL,
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "eventId" UUID,
    "automationId" UUID,
    "automationRevision" INTEGER,
    "controlVersion" INTEGER NOT NULL,
    "connectionGeneration" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "effect" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "body" JSONB NOT NULL,
    "deadline" TIMESTAMPTZ(3) NOT NULL,
    "nextAttemptAt" TIMESTAMPTZ(3),
    "reservedUntil" TIMESTAMPTZ(3),
    "acceptedId" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DeliveryIntent_pkey" PRIMARY KEY ("accountId","id")
);

-- CreateTable
CREATE TABLE "DeliveryAttempt" (
    "accountId" UUID NOT NULL,
    "id" UUID NOT NULL,
    "intentId" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'started',
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMPTZ(3),

    CONSTRAINT "DeliveryAttempt_pkey" PRIMARY KEY ("accountId","id")
);

-- CreateTable
CREATE TABLE "SyntheticEffect" (
    "accountId" UUID NOT NULL,
    "id" UUID NOT NULL,
    "intentId" UUID NOT NULL,
    "attemptId" UUID NOT NULL,
    "acceptedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyntheticEffect_pkey" PRIMARY KEY ("accountId","id")
);

-- CreateTable
CREATE TABLE "AccountLimit" (
    "accountId" UUID NOT NULL,
    "quota" INTEGER NOT NULL DEFAULT 30,
    "used" INTEGER NOT NULL DEFAULT 0,
    "windowStartedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cooldownUntil" TIMESTAMPTZ(3),

    CONSTRAINT "AccountLimit_pkey" PRIMARY KEY ("accountId")
);

-- CreateTable
CREATE TABLE "WorkerHeartbeat" (
    "accountId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "seenAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "WorkerHeartbeat_pkey" PRIMARY KEY ("accountId","kind")
);

-- CreateIndex
CREATE INDEX "DeliveryIntent_accountId_status_nextAttemptAt_idx" ON "DeliveryIntent"("accountId", "status", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryIntent_accountId_idempotencyKey_key" ON "DeliveryIntent"("accountId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryAttempt_accountId_intentId_number_key" ON "DeliveryAttempt"("accountId", "intentId", "number");

-- AddForeignKey
ALTER TABLE "Automation" ADD CONSTRAINT "Automation_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "InstagramAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryIntent" ADD CONSTRAINT "DeliveryIntent_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "InstagramAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryIntent" ADD CONSTRAINT "DeliveryIntent_accountId_conversationId_fkey" FOREIGN KEY ("accountId", "conversationId") REFERENCES "Conversation"("accountId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryIntent" ADD CONSTRAINT "DeliveryIntent_accountId_eventId_fkey" FOREIGN KEY ("accountId", "eventId") REFERENCES "InboundEvent"("accountId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryIntent" ADD CONSTRAINT "DeliveryIntent_accountId_automationId_fkey" FOREIGN KEY ("accountId", "automationId") REFERENCES "Automation"("accountId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryAttempt" ADD CONSTRAINT "DeliveryAttempt_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "InstagramAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryAttempt" ADD CONSTRAINT "DeliveryAttempt_accountId_intentId_fkey" FOREIGN KEY ("accountId", "intentId") REFERENCES "DeliveryIntent"("accountId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyntheticEffect" ADD CONSTRAINT "SyntheticEffect_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "InstagramAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyntheticEffect" ADD CONSTRAINT "SyntheticEffect_accountId_intentId_fkey" FOREIGN KEY ("accountId", "intentId") REFERENCES "DeliveryIntent"("accountId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyntheticEffect" ADD CONSTRAINT "SyntheticEffect_accountId_attemptId_fkey" FOREIGN KEY ("accountId", "attemptId") REFERENCES "DeliveryAttempt"("accountId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountLimit" ADD CONSTRAINT "AccountLimit_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "InstagramAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerHeartbeat" ADD CONSTRAINT "WorkerHeartbeat_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "InstagramAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
