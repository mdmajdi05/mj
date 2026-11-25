-- Admin-managed global upload ceiling plus durable media storage.
--
-- New attachments stream to the private media volume and are referenced by
-- "storageKey"; "data" becomes optional so old BYTEA rows keep working.
-- "size" becomes a double so multi-GB files fit.

CREATE TABLE "MediaSetting" (
    "id" TEXT NOT NULL,
    "maxUploadMb" INTEGER NOT NULL DEFAULT 2048,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaSetting_pkey" PRIMARY KEY ("id")
);

INSERT INTO "MediaSetting" ("id", "maxUploadMb", "updatedAt")
VALUES ('global', 2048, CURRENT_TIMESTAMP);

ALTER TABLE "ChatMedia" ALTER COLUMN "data" DROP NOT NULL;
ALTER TABLE "ChatMedia" ALTER COLUMN "size" TYPE DOUBLE PRECISION;
ALTER TABLE "ChatMedia" ADD COLUMN "storageKey" TEXT;

CREATE UNIQUE INDEX "ChatMedia_storageKey_key" ON "ChatMedia"("storageKey");

-- The denormalised attachment size on messages must also hold multi-GB files.
ALTER TABLE "Message" ALTER COLUMN "attachmentSize" TYPE DOUBLE PRECISION;
