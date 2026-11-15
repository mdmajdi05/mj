-- Last seen presence, private media attachments, and per-user emergency
-- (game) messages.

ALTER TABLE "User" ADD COLUMN "lastSeenAt" TIMESTAMP(3);

ALTER TABLE "Message"
  ADD COLUMN "attachmentId" TEXT,
  ADD COLUMN "attachmentKind" TEXT,
  ADD COLUMN "attachmentMime" TEXT,
  ADD COLUMN "attachmentName" TEXT,
  ADD COLUMN "attachmentSize" INTEGER;

CREATE TABLE "ChatMedia" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileName" TEXT,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMedia_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ChatMedia_ownerId_idx" ON "ChatMedia"("ownerId");
