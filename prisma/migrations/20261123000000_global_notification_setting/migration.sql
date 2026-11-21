-- Global Host-managed switch for chat/browser notifications.
-- When disabled, no notification is created or pushed for any account and the
-- notification options are hidden from Settings for every user.

CREATE TABLE "NotificationSetting" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationSetting_pkey" PRIMARY KEY ("id")
);

INSERT INTO "NotificationSetting" ("id", "enabled", "updatedAt")
VALUES ('global', true, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
