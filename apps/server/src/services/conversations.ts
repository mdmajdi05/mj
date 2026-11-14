import { ConversationStatus, MessageDestination, type Conversation } from '@prisma/client';
import { prisma } from '../lib/prisma';

export async function findActiveConversation(): Promise<Conversation | null> {
  return prisma.conversation.findFirst({
    where: { status: ConversationStatus.ACTIVE },
    orderBy: { createdAt: 'asc' }
  });
}

export async function findArchivedConversation(): Promise<Conversation | null> {
  return prisma.conversation.findFirst({
    where: { status: ConversationStatus.ARCHIVED },
    orderBy: { createdAt: 'desc' }
  });
}

/**
 * Returns the only active conversation or creates the first one.
 * If a conversation exists but is archived, callers must ask the user to
 * restore it instead of silently reviving it. This keeps Archive distinct
 * from Open.
 */
export async function getConversationForNewMessage(): Promise<Conversation> {
  const active = await findActiveConversation();
  if (active) return active;

  const archived = await findArchivedConversation();
  if (archived) {
    const error = new Error('Conversation is archived. Use RESTORE to reopen it.') as Error & {
      code?: string;
    };
    error.code = 'CONVERSATION_ARCHIVED';
    throw error;
  }

  return prisma.conversation.create({ data: {} });
}

export async function findRestorableConversation(): Promise<Conversation | null> {
  const archived = await prisma.conversation.findFirst({
    where: {
      status: ConversationStatus.ARCHIVED,
      messages: { some: { deletedAt: null } }
    },
    orderBy: { createdAt: 'asc' }
  });
  if (archived) return archived;

  return prisma.conversation.findFirst({
    where: {
      status: ConversationStatus.ACTIVE,
      messages: { some: { deletedAt: null } }
    },
    orderBy: { createdAt: 'asc' }
  });
}

export type ConversationSummary = {
  status: ConversationStatus | 'NONE';
  conversationId: string | null;
  unreadMessages: number;
  unreadGameMessages: number;
  unreadNotifications: number;
  chatVisible: boolean;
};

export async function getConversationSummary(userId: string): Promise<ConversationSummary> {
  const [active, screen, unreadGameMessages, unreadNotifications] = await Promise.all([
    findActiveConversation(),
    prisma.screenPreference.findUnique({ where: { userId } }),
    prisma.gameMessage.count({ where: { senderId: { not: userId }, readAt: null } }),
    prisma.notification.count({
      where: {
        userId,
        readAt: null,
        eventType: { notIn: ['NEW_MESSAGE', 'GAME_MESSAGE'] }
      }
    })
  ]);

  const unreadMessages = active
    ? await prisma.message.count({
        where: {
          conversationId: active.id,
          destination: MessageDestination.CHAT,
          senderId: { not: userId },
          readAt: null,
          deletedAt: null
        }
      })
    : 0;

  return {
    status: active?.status ?? (await findArchivedConversation())?.status ?? 'NONE',
    conversationId: active?.id ?? null,
    unreadMessages,
    unreadGameMessages,
    unreadNotifications,
    chatVisible: screen?.chatVisible ?? true
  };
}

export const destinationOf = (value: unknown): MessageDestination =>
  value === 'GAME' ? MessageDestination.GAME : MessageDestination.CHAT;
