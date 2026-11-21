-- The Settings screen now uses independent butterfly / sound / Chrome push
-- switches, so the unused per-user master column is removed. The earlier
-- migration that added it is kept so databases that already applied it stay
-- consistent; this migration simply drops the column afterwards.

ALTER TABLE "UserPreference" DROP COLUMN IF EXISTS "notificationsEnabled";
