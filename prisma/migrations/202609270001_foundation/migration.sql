-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "InstagramAccount" (
    "id" UUID NOT NULL,
    "professionalId" TEXT NOT NULL,
    "appScopedId" TEXT,
    "label" TEXT NOT NULL,

    CONSTRAINT "InstagramAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountCredential" (
    "accountId" UUID NOT NULL,
    "ciphertext" BYTEA NOT NULL,
    "keyVersion" INTEGER NOT NULL,
    "generation" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "AccountCredential_pkey" PRIMARY KEY ("accountId")
);

-- CreateTable
CREATE TABLE "Contact" (
    "accountId" UUID NOT NULL,
    "id" UUID NOT NULL,
    "igScopedUserId" TEXT NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("accountId","id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "accountId" UUID NOT NULL,
    "id" UUID NOT NULL,
    "contactId" UUID NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("accountId","id")
);

-- CreateTable
CREATE TABLE "Message" (
    "accountId" UUID NOT NULL,
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "externalId" TEXT NOT NULL,
    "body" TEXT,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("accountId","id")
);

-- CreateTable
CREATE TABLE "InboundEvent" (
    "accountId" UUID NOT NULL,
    "id" UUID NOT NULL,
    "externalId" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "InboundEvent_pkey" PRIMARY KEY ("accountId","id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InstagramAccount_professionalId_key" ON "InstagramAccount"("professionalId");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_accountId_igScopedUserId_key" ON "Contact"("accountId", "igScopedUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Message_accountId_externalId_key" ON "Message"("accountId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "InboundEvent_accountId_externalId_key" ON "InboundEvent"("accountId", "externalId");

-- AddForeignKey
ALTER TABLE "AccountCredential" ADD CONSTRAINT "AccountCredential_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "InstagramAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "InstagramAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "InstagramAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_accountId_contactId_fkey" FOREIGN KEY ("accountId", "contactId") REFERENCES "Contact"("accountId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "InstagramAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_accountId_conversationId_fkey" FOREIGN KEY ("accountId", "conversationId") REFERENCES "Conversation"("accountId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboundEvent" ADD CONSTRAINT "InboundEvent_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "InstagramAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
