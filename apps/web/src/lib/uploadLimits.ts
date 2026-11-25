/**
 * Formatting helpers for the Host-managed upload ceiling.
 *
 * The authoritative value is loaded from /api/chat/upload-limit at runtime and
 * pushed to every client through the `media:upload-limit` socket event. There
 * is deliberately no build-time fallback: a stale Next.js build must never
 * reintroduce an old cap.
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
