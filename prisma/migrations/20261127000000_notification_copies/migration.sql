-- Admin-configurable notification copy and incoming call button labels.

ALTER TABLE "NotificationSetting" ADD COLUMN "notificationTexts" JSONB;
ALTER TABLE "NotificationSetting" ADD COLUMN "callAcceptText" TEXT;
ALTER TABLE "NotificationSetting" ADD COLUMN "callRejectText" TEXT;
