-- Admin-controlled per-type notification grants for an account.
-- The Host can disable push, butterfly or sound notifications individually.

ALTER TABLE "UserPreference" ADD COLUMN "adminPushNotifications" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "UserPreference" ADD COLUMN "adminButterflyNotifications" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "UserPreference" ADD COLUMN "adminSoundNotifications" BOOLEAN NOT NULL DEFAULT true;
