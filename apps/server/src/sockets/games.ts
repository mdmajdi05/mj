import type { Server, Socket } from 'socket.io';
import { prisma } from '../lib/prisma';
import type { AuthUser } from '../middleware/auth';
import { emitToUser, notifyUser } from '../services/notifier';
import { peerFor } from '../services/peer';

export function registerGameSocketHandlers(_io: Server, socket: Socket) {
  const user = socket.data.user as AuthUser;

  const otherUser = () => peerFor(user.id);

  socket.on('game:start', async (payload: { slug?: string }) => {
    if (typeof payload?.slug !== 'string') return;
    const game = await prisma.game.findUnique({ where: { slug: payload.slug } });
    if (!game || !game.enabled) {
      socket.emit('game:error', { error: 'That game is not available.' });
      return;
    }

    const session = await prisma.gameSession.create({
      data: { gameId: game.id, userId: user.id }
    });
    socket.data.gameSession = session.id;
    socket.emit('game:started', { sessionId: session.id, slug: game.slug });

    const other = await otherUser();
    if (!other) return;
    const preference = await prisma.notificationPreference.findUnique({
      where: { userId: user.id }
    });
    if (!preference?.activitySharing) return;

    await notifyUser({
      userId: other.id,
      actorId: user.id,
      eventType: 'GAME_STARTED',
      payload: { game: game.name, slug: game.slug }
    });
    emitToUser(other.id, 'game:activity', {
      eventType: 'GAME_STARTED',
      game: game.name,
      slug: game.slug,
      actor: user.username,
      createdAt: new Date()
    });
  });

  socket.on('game:score:update', async (payload: { score?: number }) => {
    const sessionId = socket.data.gameSession;
    if (!sessionId) return;
    const score = Math.max(0, Math.min(1_000_000, Number(payload?.score) || 0));
    await prisma.gameSession
      .updateMany({
        where: { id: String(sessionId), userId: user.id },
        data: { score }
      })
      .catch(() => undefined);
  });

  socket.on('game:end', async (payload: { score?: number }) => {
    const sessionId = socket.data.gameSession;
    if (!sessionId) return;
    const score = Math.max(0, Math.min(1_000_000, Number(payload?.score) || 0));
    await prisma.gameSession
      .updateMany({
        where: { id: String(sessionId), userId: user.id },
        data: { endedAt: new Date(), score }
      })
      .catch(() => undefined);
    socket.data.gameSession = null;

    const other = await otherUser();
    if (!other) return;
    const preference = await prisma.notificationPreference.findUnique({
      where: { userId: user.id }
    });
    if (preference?.activitySharing) {
      emitToUser(other.id, 'game:activity', {
        eventType: 'GAME_ENDED',
        score,
        actor: user.username,
        createdAt: new Date()
      });
    }
  });
}
