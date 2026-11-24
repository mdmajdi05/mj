/**
 * Build-time upload limit shared by every web attachment path.
 *
 * The value comes from NEXT_PUBLIC_MAX_UPLOAD_MB so Docker builds and Vercel
 * style deployments can raise it without touching the sending flow. Keep the
 * ceiling at 1 GB because Prisma stores attachment sizes as 32-bit integers and
 * the bundled Nginx proxy allows at most 1 GB request bodies.
 */
const DEFAULT_MAX_UPLOAD_MB = 1024;
const MIN_MAX_UPLOAD_MB = 1;
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

export function formatUploadLimit() {
  if (MAX_UPLOAD_MB >= 1024) return `${Math.floor(MAX_UPLOAD_MB / 1024)} GB`;
  return `${MAX_UPLOAD_MB} MB`;
}
