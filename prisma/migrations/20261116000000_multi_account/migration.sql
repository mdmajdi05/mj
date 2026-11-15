-- Multi-account support: each Guest has a private one-to-one conversation
-- with the Host. Existing two-account data is attached to the first pair.

ALTER TABLE "User" ADD COLUMN "displayName" TEXT;
ALTER TABLE "Conversation" ADD COLUMN "hostId" TEXT;
ALTER TABLE "Conversation" ADD COLUMN "guestId" TEXT;
ALTER TABLE "GameMessage" ADD COLUMN "recipientId" TEXT;
ALTER TABLE "UserPreference" ADD COLUMN "activePeerId" TEXT;

-- Attach the original conversation to the original host/guest pair.
UPDATE "Conversation"
SET "hostId" = (
      SELECT "id" FROM "User" WHERE "role" = 'HOST' ORDER BY "createdAt" ASC LIMIT 1
    ),
    "guestId" = (
      SELECT "id" FROM "User" WHERE "role" = 'GUEST' ORDER BY "createdAt" ASC LIMIT 1
    )
WHERE "id" = (SELECT "id" FROM "Conversation" ORDER BY "createdAt" ASC LIMIT 1);

-- Existing game messages were exchanged between the original pair.
UPDATE "GameMessage"
SET "recipientId" = (
  SELECT "id" FROM "User" WHERE "role" = 'HOST' ORDER BY "createdAt" ASC LIMIT 1
)
WHERE "senderId" IN (SELECT "id" FROM "User" WHERE "role" = 'GUEST');

UPDATE "GameMessage"
SET "recipientId" = (
  SELECT "id" FROM "User" WHERE "role" = 'GUEST' ORDER BY "createdAt" ASC LIMIT 1
)
WHERE "recipientId" IS NULL;

UPDATE "User" SET "displayName" = 'Host' WHERE "role" = 'HOST' AND "displayName" IS NULL;
UPDATE "User" SET "displayName" = "username" WHERE "displayName" IS NULL;

CREATE UNIQUE INDEX "Conversation_hostId_guestId_key" ON "Conversation"("hostId", "guestId");
CREATE INDEX "GameMessage_recipientId_readAt_idx" ON "GameMessage"("recipientId", "readAt");
