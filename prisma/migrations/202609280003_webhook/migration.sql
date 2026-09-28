-- AlterTable
ALTER TABLE "InstagramAccount" ADD COLUMN     "webhookAppAlias" TEXT,
ADD COLUMN     "webhookFields" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "webhookGeneration" INTEGER;

-- AlterTable
ALTER TABLE "InboundEvent" ADD COLUMN     "generation" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'foundation',
ADD COLUMN     "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "payload" JSONB,
ADD COLUMN     "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
