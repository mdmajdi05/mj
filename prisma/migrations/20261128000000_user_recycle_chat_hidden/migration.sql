-- Soft-deleted accounts (Users recycle bin) and Host-hidden chats.

ALTER TABLE "User" ADD COLUMN "deletedAt" TIMESTAMP(3);
CREATE INDEX "User_role_deletedAt_idx" ON "User"("role", "deletedAt");

ALTER TABLE "Conversation" ADD COLUMN "hostHiddenAt" TIMESTAMP(3);
CREATE INDEX "Conversation_hostId_hostHiddenAt_idx" ON "Conversation"("hostId", "hostHiddenAt");
