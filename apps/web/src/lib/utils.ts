export function formatTime(value?: string | null) {
  if (!value) return '';
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatDateTime(value?: string | null) {
  if (!value) return '';
  return new Date(value).toLocaleString([], {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function formatDuration(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function eventLabel(eventType: string) {
  return eventType
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

/** Human last-seen line for chat headers. */
export function formatLastSeen(value?: string | null) {
  if (!value) return 'last seen recently';
  const seen = new Date(value).getTime();
  if (!Number.isFinite(seen)) return 'last seen recently';
  const diff = Date.now() - seen;
  if (diff < 60_000) return 'last seen just now';
  if (diff < 60 * 60_000) return `last seen ${Math.floor(diff / 60_000)}m ago`;
  if (diff < 24 * 60 * 60_000) return `last seen ${Math.floor(diff / 3_600_000)}h ago`;
  return `last seen ${new Date(value).toLocaleDateString([], {
    day: '2-digit',
    month: 'short'
  })}`;
}

export function formatFileSize(bytes?: number | null) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
