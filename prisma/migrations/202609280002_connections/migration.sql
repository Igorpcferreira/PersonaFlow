-- AlterTable
ALTER TABLE "InstagramAccount" ADD COLUMN     "connectionGeneration" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "AccountCredential" ADD COLUMN     "expiresAt" TIMESTAMPTZ(3),
ADD COLUMN     "issuedAt" TIMESTAMPTZ(3),
ADD COLUMN     "refreshLease" UUID,
ADD COLUMN     "refreshLeasedUntil" TIMESTAMPTZ(3),
ADD COLUMN     "revokedAt" TIMESTAMPTZ(3),
ADD COLUMN     "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "MetaOAuthState" (
    "stateHash" TEXT NOT NULL,
    "accountId" UUID NOT NULL,
    "sessionId" TEXT NOT NULL,
    "generation" INTEGER NOT NULL,
    "scopes" TEXT[],
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MetaOAuthState_pkey" PRIMARY KEY ("stateHash")
);

-- CreateIndex
CREATE INDEX "MetaOAuthState_accountId_idx" ON "MetaOAuthState"("accountId");

-- CreateIndex
CREATE INDEX "MetaOAuthState_sessionId_idx" ON "MetaOAuthState"("sessionId");

-- AddForeignKey
ALTER TABLE "MetaOAuthState" ADD CONSTRAINT "MetaOAuthState_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "InstagramAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaOAuthState" ADD CONSTRAINT "MetaOAuthState_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
