import type { Server, Socket } from 'socket.io';
import { prisma, resolveSession, type AuthUser } from '../middleware/auth';
import { addConnection, onlineUserIds, removeConnection } from '../services/presence';
import { bindRealtime, emitToUser } from '../services/notifier';
import { registerCallSocketHandlers, endCallsForDisconnect } from './calls';
import { registerChatSocketHandlers, registerPermissionSocketHandlers } from './chat';
import { registerGameSocketHandlers } from './games';

function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  const match = header
    .split(';')
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${name}=`));
  if (!match) return undefined;
  const raw = match.slice(name.length + 1);
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function broadcastPresence(io: Server) {
  const ids = onlineUserIds();
  io.emit('presence:list', { onlineUserIds: ids });
  for (const id of ids) {
    io.emit('presence:update', { userId: id, online: true });
  }
}

export function attachSocketHandlers(io: Server) {
  bindRealtime(io);

  io.use(async (socket: Socket, next) => {
    try {
      const token = readCookie(socket.handshake.headers.cookie, 'duo_session');
      const user = await resolveSession(token);
      if (!user) return next(new Error('unauthorized'));
      socket.data.user = user;
      return next();
    } catch {
      return next(new Error('unauthorized'));
    }
  });

  io.on('connection', async (socket: Socket) => {
    const user = socket.data.user as AuthUser;
    socket.join(`user:${user.id}`);

    addConnection(user.id, socket.id);
    broadcastPresence(io);
    socket.emit('presence:list', { onlineUserIds: onlineUserIds() });

    // Any message that arrived while this participant was offline is now delivered.
    try {
      const undelivered = await prisma.message.findMany({
        where: { senderId: { not: user.id }, deliveredAt: null, deletedAt: null },
        select: { id: true, senderId: true },
        take: 500
      });
      if (undelivered.length > 0) {
        await prisma.message.updateMany({
          where: { id: { in: undelivered.map((message) => message.id) } },
          data: { deliveredAt: new Date() }
        });
        for (const message of undelivered) {
          emitToUser(message.senderId, 'message:delivered', { id: message.id });
        }
      }
    } catch (error) {
      console.error('Delivery receipt refresh failed', error);
    }

    const unreadNotifications = await prisma.notification
      .count({ where: { userId: user.id, readAt: null } })
      .catch(() => 0);
    socket.emit('notification:count', { count: unreadNotifications });

    registerChatSocketHandlers(io, socket);
    registerPermissionSocketHandlers(io, socket);
    registerGameSocketHandlers(io, socket);
    registerCallSocketHandlers(io, socket);

    socket.on('disconnect', () => {
      const lastConnection = removeConnection(user.id, socket.id);
      broadcastPresence(io);
      if (lastConnection) {
        // Persist last seen for the chat header and tell everyone they left.
        prisma.user
          .update({ where: { id: user.id }, data: { lastSeenAt: new Date() } })
          .then((account) => {
            io.emit('presence:update', {
              userId: user.id,
              online: false,
              lastSeenAt: account.lastSeenAt?.toISOString() ?? null
            });
          })
          .catch(() => undefined);
        // Only tidy up calls when this was the participant's final live socket.
        void endCallsForDisconnect(user.id, user.username).catch((error) =>
          console.error('Call cleanup on disconnect failed', error)
        );
      }
    });
  });
}
