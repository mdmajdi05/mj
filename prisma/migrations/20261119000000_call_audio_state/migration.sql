-- Per-participant audio state so a session can be restored after a refresh or
-- a dropped network without silently muting anyone.
ALTER TABLE "CallParticipant"
  ADD COLUMN "selfMuted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "mutedByPeer" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "speakerOn" BOOLEAN NOT NULL DEFAULT true;
