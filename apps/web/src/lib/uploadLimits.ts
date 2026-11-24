/**
 * Build-time fallback for the upload ceiling. The authoritative value is
 * fetched from /api/chat/upload-limit at runtime, so this only keeps the app
 * usable before that request completes.
 *
 * Keep the default at 1000 MB: it is comfortably above any reverse-proxy
 * default, below PostgreSQL BYTEA's practical ceiling, and inside Prisma's
 * 32-bit Int size column.
 */
const DEFAULT_MAX_UPLOAD_MB = 1000;
const MIN_MAX_UPLOAD_MB = 100;
const ABSOLUTE_MAX_UPLOAD_MB = 1024;

function parseLimit(value: string | undefined): number {
  const parsed = Number.parseInt(value || '', 10);
  if (!Number.isFinite(parsed)) return DEFAULT_MAX_UPLOAD_MB;
  return Math.min(
    ABSOLUTE_MAX_UPLOAD_MB,
    Math.max(MIN_MAX_UPLOAD_MB, parsed)
  );
}

export const MAX_UPLOAD_MB = parseLimit(process.env.NEXT_PUBLIC_MAX_UPLOAD_MB);
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

export function formatUploadLimitFromMb(mb: number) {
  if (mb >= 1024) return `${Math.floor(mb / 1024)} GB`;
  return `${mb} MB`;
}

export function formatUploadLimit() {
  return formatUploadLimitFromMb(MAX_UPLOAD_MB);
}
