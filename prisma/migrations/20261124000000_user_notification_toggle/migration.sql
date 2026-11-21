-- Per-user master switch that the account itself controls from Settings.
-- The Host grant (UserPreference.chatNotifications) remains authoritative:
-- notifications are delivered only when BOTH switches are on.

ALTER TABLE "UserPreference"
  ADD COLUMN "notificationsEnabled" BOOLEAN NOT NULL DEFAULT true;
