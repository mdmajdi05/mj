import type { Server, Socket } from 'socket.io';
import {
  ConversationStatus,
  MessageDestination,
  PermissionStatus,
  Role
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import { writeAudit } from '../lib/audit';
import type { AuthUser } from '../middleware/auth';
import {
  getConversationForNewMessage,
  findRestorableConversation
} from '../services/conversations';
import { pairFor, peerFor } from '../services/peer';
import { emitToUser, notifyUser } from '../services/notifier';
import { isOnline } from '../services/presence';

type ChatPayload = { content?: string; destination?: MessageDestination };

const screenAllowed = new Set([
  'HOME',
  'CHAT',
  'STUDY',
  'GAMES',
  'GAME',
  'INBOX',
  'PROMO',
  'RESTORE',
  'SETTINGS',
  'ADMIN'
]);

async function setScreen(userId: string, screen: string, chatVisible: boolean) {
  return prisma.screenPreference.upsert({
    where: { userId },
    create: { userId, screen, chatVisible },
    update: { screen, chatVisible }
  });
}

async function chatUnlocked(user: AuthUser) {
  if (user.role === Role.HOST) return true;
  const account = await prisma.user.findUnique({
    where: { id: user.id },
    select: { chatUnlocked: true }
  });
  return Boolean(account?.chatUnlocked);
}

async function otherUser(userId: string) {
  return peerFor(userId);
}

export function registerChatSocketHandlers(io: Server, socket: Socket) {
  const user = socket.data.user as AuthUser;
  let messageTimestamps: number[] = [];

  const emitError = (message: string) => socket.emit('message:error', { error: message });

  const sendMessage = async (payload: ChatPayload) => {
    const now = Date.now();
    messageTimestamps = messageTimestamps.filter((value) => now - value < 10_000);
    if (messageTimestamps.length >= 30) {
      emitError('Too many messages. Please slow down.');
      return;
    }
    messageTimestamps.push(now);

    if (typeof payload?.content !== 'string') return;
    const content = payload.content.trim();
    if (!content || content.length > 5000) return;

    const destination =
      payload.destination === MessageDestination.GAME
        ? MessageDestination.GAME
        : MessageDestination.CHAT;

    const other = await otherUser(user.id);
    if (!other) {
      emitError('No chat partner is configured.');
      return;
    }

    if (destination === MessageDestination.CHAT && !(await chatUnlocked(user))) {
      emitError('Unlock Chat with your promo code first.');
      return;
    }

    if (destination === MessageDestination.GAME) {
      const message = await prisma.gameMessage.create({
        data: { senderId: user.id, recipientId: other.id, content },
        include: { sender: { select: { username: true, role: true, displayName: true } } }
      });
      emitToUser(user.id, 'game:message:new', message);
      emitToUser(other.id, 'game:message:new', message);
      await notifyUser({
        userId: other.id,
        actorId: user.id,
        eventType: 'GAME_MESSAGE',
        payload: { gameMessageId: message.id },
        butterfly: true,
        push: true,
        dedupeKey: `game:${message.id}:${other.id}`
      });
      return;
    }

    let conversation;
    try {
      conversation = await getConversationForNewMessage(user.id);
    } catch (error) {
      emitError(
        (error as Error & { code?: string }).code === 'CONVERSATION_ARCHIVED'
          ? 'Conversation is archived. Use RESTORE to reopen it.'
          : 'Message could not be sent.'
      );
      return;
    }

    const delivered = isOnline(other.id);
    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderId: user.id,
        content,
        destination: MessageDestination.CHAT,
        deliveredAt: delivered ? new Date() : null
      },
      include: { sender: { select: { username: true, role: true, displayName: true } } }
    });

    emitToUser(user.id, 'message:new', message);
    emitToUser(other.id, 'message:new', message);
    if (delivered) emitToUser(user.id, 'message:delivered', { id: message.id });

    await notifyUser({
      userId: other.id,
      actorId: user.id,
      eventType: 'NEW_MESSAGE',
      payload: { messageId: message.id },
      butterfly: true,
      push: true,
      dedupeKey: `message:${message.id}:${other.id}`
    });
  };

  socket.on('message:send', (payload: ChatPayload) => {
    void sendMessage(payload).catch((error) => {
      console.error('Socket message send failed', error);
      emitError('Message could not be sent');
    });
  });

  socket.on('game:message:send', (payload: ChatPayload) => {
    void sendMessage({ ...payload, destination: MessageDestination.GAME }).catch((error) => {
      console.error('Socket game message send failed', error);
      emitError('Game message could not be sent');
    });
  });

  socket.on('message:read', async (id: unknown) => {
    if (typeof id !== 'string') return;
    const readAt = new Date();
    const result = await prisma.message.updateMany({
      where: { id, deletedAt: null, senderId: { not: user.id } },
      data: { readAt }
    });
    if (result.count > 0) {
      emitToUser(user.id, 'message:read', { id, readAt });
      const message = await prisma.message.findUnique({ where: { id }, select: { senderId: true } });
      if (message) emitToUser(message.senderId, 'message:read', { id, readAt });
    }
  });

  socket.on('chat:hide', async () => {
    await setScreen(user.id, 'STUDY', false);
    socket.emit('chat:state', { screen: 'STUDY', visible: false });
  });

  socket.on('chat:open', async () => {
    if (!(await chatUnlocked(user))) {
      socket.emit('chat:state', { error: 'Unlock Chat with your promo code first.' });
      return;
    }
    await setScreen(user.id, 'CHAT', true);
    socket.emit('chat:state', { screen: 'CHAT', visible: true });
  });

  socket.on('chat:archive', async () => {
    if (user.role !== Role.HOST) {
      socket.emit('chat:state', { error: 'Host access only' });
      return;
    }
    const pair = await pairFor(user.id);
    if (!pair) {
      socket.emit('chat:state', { error: 'No active conversation to archive.' });
      return;
    }
    const conversation = await prisma.conversation.findUnique({
      where: { hostId_guestId: { hostId: pair.host.id, guestId: pair.guest.id } }
    });
    if (!conversation) {
      socket.emit('chat:state', { error: 'No active conversation to archive.' });
      return;
    }
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { status: ConversationStatus.ARCHIVED }
    });
    await prisma.archivedConversation.upsert({
      where: { conversationId: conversation.id },
      create: { conversationId: conversation.id, archivedBy: user.id },
      update: { archivedAt: new Date(), archivedBy: user.id }
    });
    await writeAudit(user.id, 'ARCHIVE_CONVERSATION', conversation.id);
    const payload = { status: ConversationStatus.ARCHIVED };
    emitToUser(user.id, 'chat:state', payload);
    emitToUser(pair.guest.id, 'chat:state', payload);
  });

  socket.on('chat:restore', async () => {
    const pair = await pairFor(user.id);
    const conversation = pair
      ? await findRestorableConversation(pair.host.id, pair.guest.id)
      : null;
    if (!conversation || conversation.status === ConversationStatus.DELETED) {
      socket.emit('chat:restore:failed', {
        error: 'Previous conversation is no longer available.'
      });
      return;
    }
    if (conversation.status === ConversationStatus.ARCHIVED) {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { status: ConversationStatus.ACTIVE }
      });
    }
    await prisma.user.update({ where: { id: user.id }, data: { chatUnlocked: true } });
    await setScreen(user.id, 'CHAT', true);
    await prisma.restoreEvent.create({ data: { userId: user.id, result: 'RESTORED' } });
    socket.emit('chat:restore:success', { conversationId: conversation.id });
    const other = await otherUser(user.id);
    if (other) emitToUser(other.id, 'chat:state', { status: ConversationStatus.ACTIVE });
  });

  socket.on('chat:delete', async () => {
    if (user.role !== Role.HOST) {
      socket.emit('chat:state', { error: 'Host access only' });
      return;
    }
    const conversations = await prisma.conversation.findMany({
      where: { status: { in: [ConversationStatus.ACTIVE, ConversationStatus.ARCHIVED] } }
    });
    const ids = conversations.map((conversation) => conversation.id);
    if (ids.length > 0) {
      await prisma.$transaction([
        prisma.message.deleteMany({ where: { conversationId: { in: ids } } }),
        prisma.conversation.updateMany({
          where: { id: { in: ids } },
          data: { status: ConversationStatus.DELETED }
        }),
        prisma.adminAuditLog.create({
          data: {
            actorId: user.id,
            action: 'DELETE_CONVERSATION_HISTORY',
            metadata: { conversationCount: ids.length }
          }
        })
      ]);
    }
    const others = await prisma.user.findMany({
      where: { id: { not: user.id } },
      select: { id: true }
    });
    emitToUser(user.id, 'chat:deleted', { permanently: true });
    for (const other of others) emitToUser(other.id, 'chat:deleted', { permanently: true });
  });

  socket.on('screen:set', async (payload: { screen?: string }) => {
    if (typeof payload?.screen !== 'string' || !screenAllowed.has(payload.screen)) return;
    if (payload.screen === 'ADMIN' && user.role !== Role.HOST) return;
    if (payload.screen === 'CHAT' && !(await chatUnlocked(user))) return;
    await setScreen(user.id, payload.screen, payload.screen === 'CHAT');
    socket.emit('chat:state', {
      screen: payload.screen,
      visible: payload.screen === 'CHAT'
    });
  });
}

export function registerPermissionSocketHandlers(io: Server, socket: Socket) {
  const user = socket.data.user as AuthUser;

  socket.on('permission:notify', async () => {
    if (user.role !== Role.GUEST) return;
    const pending = await prisma.permission.findFirst({
      where: { requestedBy: user.id, status: PermissionStatus.REQUESTED }
    });
    if (!pending) return;
    const host = await peerFor(user.id);
    if (!host) return;
    await notifyUser({
      userId: host.id,
      actorId: user.id,
      eventType: 'PERMISSION_REQUEST',
      payload: { permission: pending.name, permissionId: pending.id },
      push: true
    });
    emitToUser(host.id, 'permission:new', { permissionId: pending.id });
  });

  socket.on('permission:changed', async () => {
    const other = await otherUser(user.id);
    if (!other) return;
    await notifyUser({
      userId: other.id,
      actorId: user.id,
      eventType: 'PERMISSION_UPDATED',
      payload: {}
    });
    emitToUser(other.id, 'permission:updated', {});
  });

  socket.on('permission:status', async () => {
    const permissions = await prisma.permission.findMany({ orderBy: { createdAt: 'desc' } });
    socket.emit('permission:status', permissions);
  });
}
