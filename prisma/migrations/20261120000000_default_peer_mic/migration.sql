-- Default microphone state for the other participant, applied when a new call
-- starts. Guests default the Host to muted (privacy), Hosts default the Guest
-- to unmuted.
ALTER TABLE "UserPreference"
  ADD COLUMN "defaultPeerMicOn" BOOLEAN NOT NULL DEFAULT true;

UPDATE "UserPreference" AS up
SET "defaultPeerMicOn" = false
FROM "User" AS u
WHERE u."id" = up."userId" AND u."role" = 'GUEST';
