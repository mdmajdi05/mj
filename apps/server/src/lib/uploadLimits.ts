/**
 * Formatting helpers for the Host-managed upload ceiling.
 *
 * The authoritative value lives in the MediaSetting database row and is read
 * at runtime. There is deliberately no environment/build fallback here: a
 * stale deployment variable must never override the value the Host saved.
 */
export function formatUploadLimitFromMb(mb: number) {
  if (!Number.isFinite(mb) || mb <= 0) return 'Not set';
  if (mb >= 1024) {
    const gb = mb / 1024;
    return `${Number.isInteger(gb) ? gb : Number(gb.toFixed(2))} GB`;
  }
  return `${mb} MB`;
}

export function formatUploadLimit(mb: number) {
  return formatUploadLimitFromMb(mb);
}
