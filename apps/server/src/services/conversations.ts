import {
  ConversationStatus,
  MessageDestination,
  type Conversation
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import { pairFor } from './peer';

function archivedError() {
  const error = new Error('Conversation is archived. Use RESTORE to reopen it.') as Error & {
    code?: string;
  };
  error.code = 'CONVERSATION_ARCHIVED';
  return error;
}

export async function getConversationForPair(
  hostId: string,
  guestId: string
): Promise<Conversation> {
  const existing = await prisma.conversation.findUnique({
    where: { hostId_guestId: { hostId, guestId } }
  });
  if (existing) {
    if (existing.status === ConversationStatus.ARCHIVED) throw archivedError();
    if (existing.status === ConversationStatus.DELETED) {
      return prisma.conversation.update({
        where: { id: existing.id },
        data: { status: ConversationStatus.ACTIVE }
      });
    }
    return existing;
  }
  return prisma.conversation.create({ data: { hostId, guestId } });
}

/** Conversation for the signed-in user with their current peer. */
export async function findConversationFor(userId: string): Promise<Conversation | null> {
  const pair = await pairFor(userId);
  if (!pair) return null;
  return prisma.conversation.findUnique({
    where: { hostId_guestId: { hostId: pair.host.id, guestId: pair.guest.id } }
  });
}

export async function getConversationForNewMessage(userId: string): Promise<Conversation> {
  const pair = await pairFor(userId);
  if (!pair) throw new Error('No peer account is configured.');
  return getConversationForPair(pair.host.id, pair.guest.id);
}

/**
 * A chat removed from the Host's list must come back the moment anyone sends a
 * message in it. Shared by the REST and Socket.IO send paths so both behave
 * identically. Returns true only when a hidden chat was actually restored.
 */
export async function reactivateHiddenConversation(conversation: Conversation): Promise<boolean> {
  if (!conversation.hostHiddenAt) return false;

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { hostHiddenAt: null }
  });

  // Make the returning sender the Host's active peer, otherwise the Host can
  // still ignore the incoming message as belonging to another conversation.
  if (conversation.hostId && conversation.guestId) {
    await prisma.userPreference.upsert({
      where: { userId: conversation.hostId },
      create: { userId: conversation.hostId, activePeerId: conversation.guestId },
      update: { activePeerId: conversation.guestId }
    });
  }

  return true;
}

export async function findRestorableConversation(
  hostId: string,
  guestId: string
): Promise<Conversation | null> {
  return prisma.conversation.findUnique({
    where: { hostId_guestId: { hostId, guestId } }
  });
}

export type ConversationSummary = {
  status: ConversationStatus | 'NONE';
  conversationId: string | null;
  peerId: string | null;
  peerLastSeenAt: string | null;
  unreadMessages: number;
  unreadGameMessages: number;
  unreadNotifications: number;
  chatVisible: boolean;
};

export async function getConversationSummary(userId: string): Promise<ConversationSummary> {
  const pair = await pairFor(userId);
  const conversation = pair
    ? await prisma.conversation.findUnique({
        where: { hostId_guestId: { hostId: pair.host.id, guestId: pair.guest.id } }
      })
    : null;

  const [screen, unreadGameMessages, unreadNotifications] = await Promise.all([
    prisma.screenPreference.findUnique({ where: { userId } }),
    prisma.gameMessage.count({
      where: {
        recipientId: userId,
        senderId: { not: userId },
        readAt: null
      }
    }),
    prisma.notification.count({
      where: {
        userId,
        readAt: null,
        eventType: { notIn: ['NEW_MESSAGE', 'GAME_MESSAGE'] }
      }
    })
  ]);

  const unreadMessages = conversation
    ? await prisma.message.count({
        where: {
          conversationId: conversation.id,
          destination: MessageDestination.CHAT,
          senderId: { not: userId },
          readAt: null,
          deletedAt: null,
          hides: { none: { userId } }
        }
      })
    : 0;

  return {
    status: conversation?.status ?? 'NONE',
    conversationId: conversation?.id ?? null,
    peerId: pair ? (pair.host.id === userId ? pair.guest.id : pair.host.id) : null,
    peerLastSeenAt: pair
      ? (pair.host.id === userId
          ? pair.guest.lastSeenAt?.toISOString() ?? null
          : pair.host.lastSeenAt?.toISOString() ?? null)
      : null,
    unreadMessages,
    unreadGameMessages,
    unreadNotifications,
    chatVisible: screen?.chatVisible ?? true
  };
}

export const destinationOf = (value: unknown): MessageDestination =>
  value === 'GAME' ? MessageDestination.GAME : MessageDestination.CHAT;
