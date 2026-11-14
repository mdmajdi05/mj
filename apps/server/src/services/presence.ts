const connections = new Map<string, Set<string>>();

export function addConnection(userId: string, socketId: string): boolean {
  const existing = connections.get(userId) ?? new Set<string>();
  const firstConnection = existing.size === 0;
  existing.add(socketId);
  connections.set(userId, existing);
  return firstConnection;
}

export function removeConnection(userId: string, socketId: string): boolean {
  const existing = connections.get(userId);
  if (!existing) return false;
  existing.delete(socketId);
  if (existing.size === 0) {
    connections.delete(userId);
    return true;
  }
  connections.set(userId, existing);
  return false;
}

export function isOnline(userId: string): boolean {
  return (connections.get(userId)?.size ?? 0) > 0;
}

export function onlineUserIds(): string[] {
  return [...connections.keys()];
}
