/**
 * Runtime upload limit for the private media endpoint.
 *
 * MAX_UPLOAD_MB is read once at process start so the Express raw body limit and
 * the per-kind validation can never disagree. The bundled proxy caps request
 * bodies at 1 GB, which is also the safe upper bound for Prisma's Int size
 * column.
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

export const MAX_UPLOAD_MB = parseLimit(process.env.MAX_UPLOAD_MB);
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;
// bytes.parse() treats a bare "m" as milli, so always use the explicit "mb".
export const RAW_BODY_LIMIT = `${MAX_UPLOAD_MB}mb`;

export function formatUploadLimit() {
  if (MAX_UPLOAD_MB >= 1024) return `${Math.floor(MAX_UPLOAD_MB / 1024)} GB`;
  return `${MAX_UPLOAD_MB} MB`;
}
