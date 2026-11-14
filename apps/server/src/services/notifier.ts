import type { Server } from 'socket.io';
import { prisma } from '../lib/prisma';
import { sendGenericPush } from './push';

let ioRef: Server | null = null;

export function bindRealtime(io: Server) {
  ioRef = io;
}

type NotifyInput = {
  userId: string;
  actorId?: string | null;
  eventType: string;
  payload?: Record<string, unknown>;
  butterfly?: boolean;
  push?: boolean;
  dedupeKey?: string;
};

/**
 * Creates a persisted notification and sends only non-sensitive metadata over
 * Socket.IO. Message text and access codes must never be put in payloads.
 */
export async function notifyUser(input: NotifyInput) {
  const notification = await prisma.notification.create({
    data: {
      userId: input.userId,
      actorId: input.actorId ?? null,
      eventType: input.eventType,
      payload: (input.payload ?? {}) as object
    }
  });

  const safe = {
    id: notification.id,
    eventType: notification.eventType,
    payload: notification.payload,
    createdAt: notification.createdAt,
    readAt: notification.readAt
  };

  ioRef?.to(`user:${input.userId}`).emit('notification:new', safe);

  if (input.butterfly) {
    const preference = await prisma.notificationPreference.findUnique({
      where: { userId: input.userId }
    });
    if (preference?.butterfly !== false) {
      let allowed = true;
      if (input.dedupeKey) {
        try {
          await prisma.butterflyNotificationEvent.create({
            data: { userId: input.userId, dedupeKey: input.dedupeKey }
          });
        } catch {
          allowed = false; // unique constraint: duplicate event
        }
      }
      if (allowed) {
        ioRef?.to(`user:${input.userId}`).emit('notification:butterfly', {
          id: notification.id,
          eventType: notification.eventType,
          createdAt: notification.createdAt
        });
      }
    }
  }

  if (input.push) {
    await sendGenericPush(input.userId).catch((error) =>
      console.error('Push notification failed', error)
    );
  }

  const count = await prisma.notification.count({
    where: { userId: input.userId, readAt: null }
  });
  ioRef?.to(`user:${input.userId}`).emit('notification:count', { count });

  return notification;
}

export function emitToUser(userId: string, event: string, payload: unknown) {
  ioRef?.to(`user:${userId}`).emit(event, payload);
}
