-- Replies, edits, and admin-controlled chat notification feature.

ALTER TABLE "Message"
  ADD COLUMN "replyToId" TEXT,
  ADD COLUMN "editedAt" TIMESTAMP(3);

ALTER TABLE "Message"
  ADD CONSTRAINT "Message_replyToId_fkey"
  FOREIGN KEY ("replyToId") REFERENCES "Message"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Message_replyToId_idx" ON "Message"("replyToId");

ALTER TABLE "UserPreference"
  ADD COLUMN "chatNotifications" BOOLEAN NOT NULL DEFAULT true;
