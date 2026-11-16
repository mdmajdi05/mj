-- Host-managed Study Assistant seed messages and keyword replies.

CREATE TABLE "StudyMessage" (
    "id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'ASSISTANT',
    "text" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudyMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudyReply" (
    "id" TEXT NOT NULL,
    "keywords" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudyReply_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StudyMessage_sortOrder_idx" ON "StudyMessage"("sortOrder");
CREATE INDEX "StudyReply_sortOrder_idx" ON "StudyReply"("sortOrder");
