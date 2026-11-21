import express, { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import {
  ConversationStatus,
  MessageDestination,
  PermissionStatus,
  Role
} from '@prisma/client';
import { asyncHandler } from '../lib/async-handler';
import { HttpError } from '../lib/http-error';
import { prisma, requireAuth, requireHost, type AuthRequest } from '../middleware/auth';
import {
  destinationOf,
  findConversationFor,
  findRestorableConversation,
  getConversationForNewMessage,
  getConversationSummary
} from '../services/conversations';
import { contactsFor, pairFor, peerFor, selectPeer } from '../services/peer';
import { notifyUser, emitToUser } from '../services/notifier';
import { onlineUserIds } from '../services/presence';
import {
  getNotificationFeatureState,
  isGlobalNotificationsEnabled,
  isPushConfigured,
  setGlobalNotificationsEnabled
} from '../services/notificationSettings';

export const chatRouter = Router();
chatRouter.use(requireAuth);

// Ten wrong code attempts per 30 seconds. Successful checks are skipped so a
// legitimate user is never locked out after entering the correct code.
const codeLimit = rateLimit({
  windowMs: 30 * 1000,
  limit: 1000,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many wrong attempts. Please wait 30 seconds and try again.' }
});

const screenNames = [
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
] as const;
type ScreenName = (typeof screenNames)[number];

const requireChatUnlock = asyncHandler(async (req: AuthRequest, _res, next) => {
  if (req.user?.role === Role.HOST) return next();
  const account = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { chatUnlocked: true }
  });
  if (!account?.chatUnlocked) {
    throw new HttpError(403, 'Unlock Chat with your promo code first.');
  }
  return next();
});

async function otherUser(userId: string) {
  const peer = await peerFor(userId);
  if (!peer) throw new HttpError(500, 'No chat partner is configured.');
  return peer;
}

/** Host can switch chat notifications off for any account. */
async function wantsChatNotifications(userId: string) {
  const preference = await prisma.userPreference.findUnique({
    where: { userId },
    select: { chatNotifications: true }
  });
  return preference?.chatNotifications ?? true;
}

/** Tells every connected client that the Study Assistant content changed. */
async function broadcastStudyUpdate() {
  const users = await prisma.user.findMany({ select: { id: true } });
  for (const user of users) emitToUser(user.id, 'study:updated', {});
}

async function pairOrThrow(userId: string) {
  const pair = await pairFor(userId);
  if (!pair) throw new HttpError(500, 'No chat partner is configured.');
  return pair;
}

async function audit(actorId: string, action: string, targetId?: string, metadata?: object) {
  await prisma.adminAuditLog.create({
    data: { actorId, action, targetId: targetId ?? null, metadata: metadata ?? undefined }
  });
}

async function setScreen(userId: string, screen: ScreenName, chatVisible: boolean) {
  return prisma.screenPreference.upsert({
    where: { userId },
    create: { userId, screen, chatVisible },
    update: { screen, chatVisible }
  });
}

async function notifyPreferenceChange(userId: string, activitySharing: boolean | undefined) {
  if (activitySharing === undefined) return;
  const other = await otherUser(userId);
  const existing = await prisma.permission.findFirst({
    where: { name: 'SHARED_GAME_ACTIVITY', requestedBy: userId }
  });
  const data = {
    status: activitySharing ? PermissionStatus.GRANTED : PermissionStatus.REVOKED,
    grantedBy: activitySharing ? userId : null,
    grantedAt: activitySharing ? new Date() : null,
    rejectedAt: null,
    revokedAt: activitySharing ? null : new Date()
  };
  if (existing) {
    await prisma.permission.update({ where: { id: existing.id }, data });
  } else {
    await prisma.permission.create({
      data: {
        name: 'SHARED_GAME_ACTIVITY',
        description: 'Share game-start activity with the other participant.',
        requestedBy: userId,
        ...data
      }
    });
  }
  await notifyUser({
    userId: other.id,
    actorId: userId,
    eventType: 'PERMISSION_UPDATED',
    payload: { permission: 'SHARED_GAME_ACTIVITY', enabled: activitySharing }
  });
}

/* ------------------------------------------------------------------ */
/* Conversation state and messages                                     */
/* ------------------------------------------------------------------ */

chatRouter.get(
  '/summary',
  asyncHandler(async (req: AuthRequest, res) => {
    const [summary, activeCall, contacts] = await Promise.all([
      getConversationSummary(req.user!.id),
      prisma.call.findFirst({
        where: {
          status: { in: ['RINGING', 'ACTIVE'] },
          participants: { some: { userId: req.user!.id } }
        },
        orderBy: { startedAt: 'desc' },
        include: { participants: { include: { user: { select: { username: true } } } } }
      }),
      contactsFor(req.user!.id, onlineUserIds())
    ]);
    res.json({
      ...summary,
      activeCall,
      onlineUserIds: onlineUserIds(),
      contacts,
      chatUnlocked: req.user!.chatUnlocked
    });
  })
);

chatRouter.get(
  '/contacts',
  asyncHandler(async (req: AuthRequest, res) => {
    res.json(await contactsFor(req.user!.id, onlineUserIds()));
  })
);

chatRouter.post(
  '/peer',
  asyncHandler(async (req: AuthRequest, res) => {
    const parsed = z.object({ peerId: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Invalid account');
    if (req.user!.role !== Role.HOST) throw new HttpError(403, 'Host access only');
    const guest = await selectPeer(req.user!.id, parsed.data.peerId);
    if (!guest) throw new HttpError(404, 'Account not found');
    res.json({ ok: true, peerId: guest.id });
  })
);

chatRouter.get(
  '/messages',
  requireChatUnlock,
  asyncHandler(async (req: AuthRequest, res) => {
    const conversation = await findConversationFor(req.user!.id);
    if (!conversation) {
      res.json([]);
      return;
    }
    const destination = req.query.destination === 'GAME'
      ? MessageDestination.GAME
      : MessageDestination.CHAT;
    const rows = await prisma.message.findMany({
      where: {
        conversationId: conversation.id,
        destination,
        deletedAt: null,
        hides: { none: { userId: req.user!.id } }
      },
      orderBy: { createdAt: 'asc' },
      take: 500,
      include: {
        sender: { select: { username: true, role: true, displayName: true } },
        replyTo: {
          select: {
            id: true,
            content: true,
            senderId: true,
            attachmentKind: true,
            attachmentName: true
          }
        }
      }
    });
    res.json(rows);
  })
);

chatRouter.post(
  '/messages',
  requireChatUnlock,
  asyncHandler(async (req: AuthRequest, res) => {
    const parsed = z
      .object({
        content: z.string().trim().max(5000).default(''),
        destination: z.nativeEnum(MessageDestination).default(MessageDestination.CHAT),
        replyToId: z.string().min(1).nullish(),
        attachmentId: z.string().min(1).nullish()
      })
      .refine((value) => value.content.length > 0 || Boolean(value.attachmentId), {
        message: 'Message is empty'
      })
      .safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Invalid message');

    const other = await otherUser(req.user!.id);
    const destination = parsed.data.destination;

    if (destination === MessageDestination.GAME) {
      if (!parsed.data.content) throw new HttpError(400, 'Game messages need text');
      const message = await prisma.gameMessage.create({
        data: { senderId: req.user!.id, recipientId: other.id, content: parsed.data.content },
        include: { sender: { select: { username: true, role: true, displayName: true } } }
      });
      for (const id of [req.user!.id, other.id]) emitToUser(id, 'game:message:new', message);
      if (await wantsChatNotifications(other.id)) {
        await notifyUser({
          userId: other.id,
          actorId: req.user!.id,
          eventType: 'GAME_MESSAGE',
          payload: { gameMessageId: message.id },
          butterfly: true,
          push: true,
          dedupeKey: `game:${message.id}:${other.id}`
        });
      }
      res.status(201).json(message);
      return;
    }

    const conversation = await getConversationForNewMessage(req.user!.id).catch((error) => {
      if ((error as Error & { code?: string }).code === 'CONVERSATION_ARCHIVED') {
        throw new HttpError(409, 'Conversation is archived. Use RESTORE to reopen it.');
      }
      throw error;
    });
    const replyToId = parsed.data.replyToId ?? null;
    if (replyToId) {
      const quoted = await prisma.message.findFirst({
        where: { id: replyToId, conversationId: conversation.id, deletedAt: null },
        select: { id: true }
      });
      if (!quoted) throw new HttpError(400, 'The message you are replying to no longer exists');
    }

    let attachment:
      | {
          attachmentId: string;
          attachmentKind: string;
          attachmentMime: string;
          attachmentName: string | null;
          attachmentSize: number;
        }
      | undefined;
    if (parsed.data.attachmentId) {
      const media = await prisma.chatMedia.findUnique({
        where: { id: parsed.data.attachmentId }
      });
      if (!media || media.ownerId !== req.user!.id) {
        throw new HttpError(404, 'Attachment not found');
      }
      attachment = {
        attachmentId: media.id,
        attachmentKind: media.kind,
        attachmentMime: media.mimeType,
        attachmentName: media.fileName,
        attachmentSize: media.size
      };
    }

    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderId: req.user!.id,
        content: parsed.data.content,
        destination: MessageDestination.CHAT,
        replyToId,
        ...(attachment ?? {})
      },
      include: {
        sender: { select: { username: true, role: true, displayName: true } },
        replyTo: {
          select: {
            id: true,
            content: true,
            senderId: true,
            attachmentKind: true,
            attachmentName: true
          }
        }
      }
    });
    for (const id of [req.user!.id, other.id]) emitToUser(id, 'message:new', message);
    if (await wantsChatNotifications(other.id)) {
      await notifyUser({
        userId: other.id,
        actorId: req.user!.id,
        eventType: 'NEW_MESSAGE',
        payload: { messageId: message.id },
        butterfly: true,
        push: true,
        dedupeKey: `message:${message.id}:${other.id}`
      });
    }
    res.status(201).json(message);
  })
);

chatRouter.patch(
  '/messages/:id',
  requireChatUnlock,
  asyncHandler(async (req: AuthRequest, res) => {
    const parsed = z.object({ content: z.string().trim().min(1).max(5000) }).safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Invalid message');

    const message = await prisma.message.findUnique({ where: { id: req.params.id } });
    if (!message || message.deletedAt) throw new HttpError(404, 'Message not found');
    if (message.senderId !== req.user!.id) throw new HttpError(403, 'You can only edit your own messages');
    if (Date.now() - message.createdAt.getTime() > 5 * 60 * 1000) {
      throw new HttpError(403, 'Messages can only be edited within 5 minutes.');
    }

    const updated = await prisma.message.update({
      where: { id: message.id },
      data: { content: parsed.data.content, editedAt: new Date() },
      include: {
        sender: { select: { username: true, role: true, displayName: true } },
        replyTo: {
          select: {
            id: true,
            content: true,
            senderId: true,
            attachmentKind: true,
            attachmentName: true
          }
        }
      }
    });
    const other = await otherUser(req.user!.id);
    for (const id of [req.user!.id, other.id]) emitToUser(id, 'message:updated', updated);
    res.json(updated);
  })
);

chatRouter.delete(
  '/messages/:id',
  asyncHandler(async (req: AuthRequest, res) => {
    const message = await prisma.message.findUnique({ where: { id: req.params.id } });
    if (!message || message.deletedAt) throw new HttpError(404, 'Message not found');

    const conversation = await findConversationFor(req.user!.id);
    if (!conversation || conversation.id !== message.conversationId) {
      throw new HttpError(404, 'Message not found');
    }

    // Hiding is per account: the other participant keeps their copy.
    await prisma.messageHide.upsert({
      where: { messageId_userId: { messageId: message.id, userId: req.user!.id } },
      create: { messageId: message.id, userId: req.user!.id },
      update: {}
    });

    if (req.user!.role === Role.HOST) {
      await audit(req.user!.id, 'HIDE_MESSAGE', message.id);
    }

    emitToUser(req.user!.id, 'message:hidden', { ids: [message.id] });
    res.status(204).end();
  })
);

chatRouter.post(
  '/messages/delete',
  requireChatUnlock,
  asyncHandler(async (req: AuthRequest, res) => {
    const parsed = z
      .object({ ids: z.array(z.string().min(1)).min(1).max(500) })
      .safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Select at least one message');

    const conversation = await findConversationFor(req.user!.id);
    if (!conversation) throw new HttpError(404, 'Conversation not found');

    const rows = await prisma.message.findMany({
      where: {
        id: { in: parsed.data.ids },
        conversationId: conversation.id,
        deletedAt: null
      },
      select: { id: true }
    });
    if (rows.length) {
      await prisma.messageHide.createMany({
        data: rows.map((row) => ({ messageId: row.id, userId: req.user!.id })),
        skipDuplicates: true
      });
    }
    const ids = rows.map((row) => row.id);
    emitToUser(req.user!.id, 'message:hidden', { ids });
    res.json({ ok: true, count: ids.length, ids });
  })
);

chatRouter.post(
  '/messages/hide-all',
  requireChatUnlock,
  asyncHandler(async (req: AuthRequest, res) => {
    const conversation = await findConversationFor(req.user!.id);
    if (!conversation) {
      res.json({ ok: true, count: 0 });
      return;
    }

    const rows = await prisma.message.findMany({
      where: {
        conversationId: conversation.id,
        destination: MessageDestination.CHAT,
        deletedAt: null,
        hides: { none: { userId: req.user!.id } }
      },
      select: { id: true }
    });
    if (rows.length) {
      await prisma.messageHide.createMany({
        data: rows.map((row) => ({ messageId: row.id, userId: req.user!.id })),
        skipDuplicates: true
      });
    }
    emitToUser(req.user!.id, 'message:hidden', { all: true });
    res.json({ ok: true, count: rows.length });
  })
);

/* ------------------------------------------------------------------ */
/* Private media (images and short videos)                             */
/* ------------------------------------------------------------------ */

const mediaKindOf = (mimeType: string) =>
  mimeType.startsWith('video/')
    ? 'VIDEO'
    : mimeType.startsWith('image/')
      ? 'IMAGE'
      : mimeType.startsWith('audio/')
        ? 'AUDIO'
        : 'FILE';

chatRouter.post(
  '/media',
  requireChatUnlock,
  express.raw({ type: () => true, limit: '1gb' }),
  asyncHandler(async (req: AuthRequest, res) => {
    const body = req.body as unknown;
    if (!Buffer.isBuffer(body) || body.length === 0) {
      throw new HttpError(400, 'Choose a file or a photo to send');
    }
    const mimeType = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    const kind = mediaKindOf(mimeType || 'application/octet-stream');
    if (kind === 'IMAGE' && body.length > 50 * 1024 * 1024) {
      throw new HttpError(413, 'Images must be 50 MB or smaller');
    }
    if (kind === 'VIDEO' && body.length > 900 * 1024 * 1024) {
      throw new HttpError(413, 'Videos must be 900 MB or smaller');
    }
    if (kind === 'AUDIO' && body.length > 25 * 1024 * 1024) {
      throw new HttpError(413, 'Voice messages must be 25 MB or smaller');
    }
    if (kind === 'FILE' && body.length > 50 * 1024 * 1024) {
      throw new HttpError(413, 'Files must be 50 MB or smaller');
    }

    const rawName = String(req.headers['x-file-name'] || '');
    let fileName: string | null = null;
    try {
      fileName = rawName ? decodeURIComponent(rawName).slice(0, 160) : null;
    } catch {
      fileName = rawName.slice(0, 160) || null;
    }
    const media = await prisma.chatMedia.create({
      data: {
        ownerId: req.user!.id,
        kind,
        mimeType,
        fileName,
        size: body.length,
        data: new Uint8Array(body)
      },
      select: { id: true, kind: true, mimeType: true, fileName: true, size: true }
    });
    res.status(201).json(media);
  })
);

chatRouter.get(
  '/media/:id',
  asyncHandler(async (req: AuthRequest, res) => {
    const media = await prisma.chatMedia.findUnique({ where: { id: req.params.id } });
    if (!media) throw new HttpError(404, 'Attachment not found');

    // Only the uploader or their current chat partner may read the bytes.
    const pair = await pairFor(req.user!.id);
    const allowed =
      media.ownerId === req.user!.id ||
      (pair && (pair.host.id === media.ownerId || pair.guest.id === media.ownerId));
    if (!allowed) throw new HttpError(404, 'Attachment not found');

    res.setHeader('Content-Type', media.mimeType);
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    res.send(Buffer.from(media.data));
  })
);

chatRouter.delete(
  '/history',
  requireHost,
  asyncHandler(async (req: AuthRequest, res) => {
    // Soft delete for the Host only. The Guest keeps their copy and the Host
    // can recover everything from the Admin dashboard.
    const rows = await prisma.message.findMany({
      where: {
        destination: MessageDestination.CHAT,
        deletedAt: null,
        hides: { none: { userId: req.user!.id } }
      },
      select: { id: true }
    });
    if (rows.length) {
      await prisma.messageHide.createMany({
        data: rows.map((row) => ({ messageId: row.id, userId: req.user!.id })),
        skipDuplicates: true
      });
    }
    await audit(req.user!.id, 'HIDE_CONVERSATION_HISTORY', undefined, {
      count: rows.length
    });
    emitToUser(req.user!.id, 'message:hidden', { all: true });
    res.json({ ok: true, count: rows.length });
  })
);

/* ------------------------------------------------------------------ */
/* Screen, hide, archive, restore, promo                               */
/* ------------------------------------------------------------------ */

chatRouter.get(
  '/screen',
  asyncHandler(async (req: AuthRequest, res) => {
    const preference = await prisma.screenPreference.findUnique({
      where: { userId: req.user!.id }
    });
    res.json(preference ?? { screen: 'HOME', chatVisible: true });
  })
);

chatRouter.post(
  '/screen',
  asyncHandler(async (req: AuthRequest, res) => {
    const parsed = z.object({ screen: z.enum(screenNames) }).safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Invalid screen');
    const screen = parsed.data.screen;

    if (screen === 'ADMIN' && req.user!.role !== Role.HOST) {
      throw new HttpError(403, 'Host access only');
    }
    if (screen === 'CHAT' && req.user!.role !== Role.HOST) {
      const account = await prisma.user.findUnique({
        where: { id: req.user!.id },
        select: { chatUnlocked: true }
      });
      if (!account?.chatUnlocked) throw new HttpError(403, 'Unlock Chat first.');
    }

    const preference = await setScreen(req.user!.id, screen, screen === 'CHAT');
    res.json(preference);
  })
);

chatRouter.post(
  '/hide',
  asyncHandler(async (req: AuthRequest, res) => {
    await setScreen(req.user!.id, 'STUDY', false);
    res.json({ ok: true });
  })
);

chatRouter.post(
  '/open',
  requireChatUnlock,
  asyncHandler(async (req: AuthRequest, res) => {
    await setScreen(req.user!.id, 'CHAT', true);
    res.json({ ok: true });
  })
);

chatRouter.post(
  '/archive',
  requireHost,
  asyncHandler(async (req: AuthRequest, res) => {
    const pair = await pairOrThrow(req.user!.id);
    const conversation = await prisma.conversation.findUnique({
      where: { hostId_guestId: { hostId: pair.host.id, guestId: pair.guest.id } }
    });
    if (!conversation) throw new HttpError(404, 'There is no active conversation to archive.');
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { status: ConversationStatus.ARCHIVED }
    });
    await prisma.archivedConversation.upsert({
      where: { conversationId: conversation.id },
      create: { conversationId: conversation.id, archivedBy: req.user!.id },
      update: { archivedAt: new Date(), archivedBy: req.user!.id }
    });
    await audit(req.user!.id, 'ARCHIVE_CONVERSATION', conversation.id);
    for (const id of [req.user!.id, pair.guest.id, pair.host.id]) {
      emitToUser(id, 'chat:state', { status: ConversationStatus.ARCHIVED });
    }
    res.json({ ok: true });
  })
);

chatRouter.post(
  '/restore',
  codeLimit,
  asyncHandler(async (req: AuthRequest, res) => {
    const command = String(req.body?.command ?? '').trim().toUpperCase();
    if (command !== 'RESTORE') throw new HttpError(400, 'Enter RESTORE');

    const pair = await pairOrThrow(req.user!.id);
    const conversation = await findRestorableConversation(pair.host.id, pair.guest.id);
    if (!conversation || conversation.status === ConversationStatus.DELETED) {
      await prisma.restoreEvent.create({
        data: { userId: req.user!.id, result: 'UNAVAILABLE' }
      });
      throw new HttpError(404, 'Previous conversation is no longer available.');
    }

    if (conversation.status === ConversationStatus.ARCHIVED) {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { status: ConversationStatus.ACTIVE }
      });
    }
    await prisma.user.update({
      where: { id: req.user!.id },
      data: { chatUnlocked: true }
    });
    await setScreen(req.user!.id, 'CHAT', true);
    await prisma.restoreEvent.create({
      data: { userId: req.user!.id, result: 'RESTORED' }
    });
    res.json({ ok: true, conversationId: conversation.id });
  })
);

chatRouter.post(
  '/promo/validate',
  codeLimit,
  asyncHandler(async (req: AuthRequest, res) => {
    const code = String(req.body?.code ?? '').trim();
    if (!code || code.length > 100) throw new HttpError(400, 'Enter a valid access code');

    const rows = await prisma.accessCode.findMany({
      where: { purpose: 'PROMO', enabled: true }
    });
    let valid = false;
    for (const row of rows) {
      if (await bcrypt.compare(code, row.codeHash)) {
        valid = true;
        break;
      }
    }
    if (!valid) throw new HttpError(403, 'Incorrect access code');

    await prisma.user.update({
      where: { id: req.user!.id },
      data: { chatUnlocked: true }
    });
    await setScreen(req.user!.id, 'CHAT', true);
    res.json({ ok: true, unlocked: true });
  })
);

/* ------------------------------------------------------------------ */
/* Game inbox                                                          */
/* ------------------------------------------------------------------ */

chatRouter.get(
  '/inbox',
  asyncHandler(async (req: AuthRequest, res) => {
    // Inbox only shows messages addressed to this account. A sender never sees
    // their own emergency message, and other Guests can never read it.
    const rows = await prisma.gameMessage.findMany({
      where: {
        recipientId: req.user!.id,
        senderId: { not: req.user!.id }
      },
      orderBy: { createdAt: 'asc' },
      include: { sender: { select: { username: true, role: true, displayName: true } } },
      take: 500
    });
    res.json(rows);
  })
);

chatRouter.post(
  '/inbox/read',
  asyncHandler(async (req: AuthRequest, res) => {
    await prisma.gameMessage.updateMany({
      where: { recipientId: req.user!.id, readAt: null, senderId: { not: req.user!.id } },
      data: { readAt: new Date() }
    });
    res.json({ ok: true });
  })
);

chatRouter.post(
  '/inbox/:id/read',
  asyncHandler(async (req: AuthRequest, res) => {
    await prisma.gameMessage.updateMany({
      where: {
        id: req.params.id,
        recipientId: req.user!.id,
        senderId: { not: req.user!.id }
      },
      data: { readAt: new Date() }
    });
    res.json({ ok: true });
  })
);

/* ------------------------------------------------------------------ */
/* Preferences, notifications, permissions, call history               */
/* ------------------------------------------------------------------ */

chatRouter.get(
  '/preferences',
  asyncHandler(async (req: AuthRequest, res) => {
    const [notifications, userPreferences, feature] = await Promise.all([
      prisma.notificationPreference.findUnique({ where: { userId: req.user!.id } }),
      prisma.userPreference.findUnique({ where: { userId: req.user!.id } }),
      getNotificationFeatureState()
    ]);
    res.json({
      butterfly: notifications?.butterfly ?? true,
      sound: notifications?.sound ?? false,
      browser: notifications?.browser ?? false,
      activitySharing: notifications?.activitySharing ?? false,
      reducedMotion: userPreferences?.reducedMotion ?? false,
      defaultPeerMicOn: userPreferences?.defaultPeerMicOn ?? true,
      chatNotifications: userPreferences?.chatNotifications ?? true,
      // The Host's global switch and server push availability are exposed so
      // the Settings screen can hide every notification option when disabled.
      notificationsAvailable: feature.enabled,
      pushConfigured: feature.pushConfigured
    });
  })
);

chatRouter.post(
  '/preferences',
  asyncHandler(async (req: AuthRequest, res) => {
    const parsed = z
      .object({
        butterfly: z.boolean().optional(),
        sound: z.boolean().optional(),
        browser: z.boolean().optional(),
        activitySharing: z.boolean().optional(),
        reducedMotion: z.boolean().optional(),
        defaultPeerMicOn: z.boolean().optional()
      })
      .safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Invalid preferences');

    const { reducedMotion, defaultPeerMicOn, ...notificationPreferences } = parsed.data;
    const enablingNotifications = Object.values(notificationPreferences).some(
      (value) => value === true
    );
    if (enablingNotifications && !(await isGlobalNotificationsEnabled())) {
      throw new HttpError(
        403,
        'Notifications are disabled by the Host for everyone. Ask the Host to turn them back on first.'
      );
    }
    if (enablingNotifications && !(await wantsChatNotifications(req.user!.id))) {
      throw new HttpError(
        403,
        'Chat notifications are disabled by the Host. Ask the Host to grant notification access first.'
      );
    }
    if (Object.keys(notificationPreferences).length > 0) {
      await prisma.notificationPreference.upsert({
        where: { userId: req.user!.id },
        create: { userId: req.user!.id, ...notificationPreferences },
        update: notificationPreferences
      });
    }
    if (reducedMotion !== undefined) {
      await prisma.userPreference.upsert({
        where: { userId: req.user!.id },
        create: { userId: req.user!.id, reducedMotion },
        update: { reducedMotion }
      });
    }
    if (defaultPeerMicOn !== undefined) {
      await prisma.userPreference.upsert({
        where: { userId: req.user!.id },
        create: { userId: req.user!.id, defaultPeerMicOn },
        update: { defaultPeerMicOn }
      });
    }
    if (notificationPreferences.activitySharing !== undefined) {
      await notifyPreferenceChange(req.user!.id, notificationPreferences.activitySharing);
    }
    res.json({ ok: true });
  })
);

/* ------------------------------------------------------------------ */
/* Study Assistant content (Host managed)                              */
/* ------------------------------------------------------------------ */

chatRouter.get(
  '/study',
  asyncHandler(async (_req: AuthRequest, res) => {
    const [messages, replies] = await Promise.all([
      prisma.studyMessage.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
      prisma.studyReply.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] })
    ]);
    res.json({ messages, replies });
  })
);

chatRouter.get(
  '/notifications',
  asyncHandler(async (req: AuthRequest, res) => {
    const rows = await prisma.notification.findMany({
      where: { userId: req.user!.id },
      include: { actor: { select: { username: true, role: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100
    });
    res.json(rows);
  })
);

chatRouter.post(
  '/notifications/read',
  asyncHandler(async (req: AuthRequest, res) => {
    await prisma.notification.updateMany({
      where: { userId: req.user!.id, readAt: null },
      data: { readAt: new Date() }
    });
    emitToUser(req.user!.id, 'notification:count', { count: 0 });
    res.json({ ok: true });
  })
);

chatRouter.get(
  '/permissions',
  asyncHandler(async (req: AuthRequest, res) => {
    const rows = await prisma.permission.findMany({
      where: {
        OR: [
          { requestedBy: req.user!.id },
          { grantedBy: req.user!.id }
        ]
      },
      include: {
        requester: { select: { username: true, role: true } },
        grantor: { select: { username: true, role: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(rows);
  })
);

chatRouter.post(
  '/permissions/remember',
  asyncHandler(async (req: AuthRequest, res) => {
    // Browser-level grants are replayed for whichever account logs in on this
    // browser. The browser owns the consent; the server just records it for
    // this account so a fresh login keeps working without another prompt.
    const parsed = z
      .object({
        names: z
          .array(z.enum(['REMOTE_MIC_CONTROL', 'SHARED_GAME_ACTIVITY', 'CALL_CONTROLS']))
          .min(1)
      })
      .safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Invalid permission list');

    for (const name of parsed.data.names) {
      const existing = await prisma.permission.findFirst({
        where: { name, requestedBy: req.user!.id }
      });
      if (existing) {
        await prisma.permission.update({
          where: { id: existing.id },
          data: {
            status: PermissionStatus.GRANTED,
            grantedBy: req.user!.id,
            grantedAt: new Date(),
            revokedAt: null,
            rejectedAt: null
          }
        });
      } else {
        await prisma.permission.create({
          data: {
            name,
            description: 'Granted in this browser',
            requestedBy: req.user!.id,
            status: PermissionStatus.GRANTED,
            grantedBy: req.user!.id,
            grantedAt: new Date()
          }
        });
      }
    }
    res.json({ ok: true });
  })
);

chatRouter.post(
  '/permissions',
  asyncHandler(async (req: AuthRequest, res) => {
    const parsed = z
      .object({
        name: z.enum(['REMOTE_MIC_CONTROL', 'SHARED_GAME_ACTIVITY', 'CALL_CONTROLS']),
        description: z.string().max(300).default('Permission requested by participant'),
        requestedBySelf: z.boolean().default(true)
      })
      .safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Invalid permission');

    const other = await otherUser(req.user!.id);
    const requesterId = parsed.data.requestedBySelf ? req.user!.id : other.id;

    const existing = await prisma.permission.findFirst({
      where: {
        name: parsed.data.name,
        requestedBy: requesterId,
        status: { in: [PermissionStatus.REQUESTED, PermissionStatus.GRANTED] }
      }
    });
    if (existing) {
      res.status(200).json(existing);
      return;
    }

    const selfGranted = !parsed.data.requestedBySelf;
    const item = await prisma.permission.create({
      data: {
        name: parsed.data.name,
        description: parsed.data.description,
        requestedBy: requesterId,
        status: selfGranted ? PermissionStatus.GRANTED : PermissionStatus.REQUESTED,
        grantedBy: selfGranted ? req.user!.id : null,
        grantedAt: selfGranted ? new Date() : null
      }
    });

    const target = other;
    if (selfGranted) {
      await notifyUser({
        userId: target.id,
        actorId: req.user!.id,
        eventType: 'PERMISSION_GRANTED',
        payload: { permission: item.name, grantedBy: req.user!.username }
      });
    } else {
      await notifyUser({
        userId: target.id,
        actorId: req.user!.id,
        eventType: 'PERMISSION_REQUEST',
        payload: { permission: item.name, permissionId: item.id }
      });
    }
    emitToUser(target.id, selfGranted ? 'permission:updated' : 'permission:new', {
      permissionId: item.id
    });
    emitToUser(req.user!.id, 'permission:updated', { permissionId: item.id });
    res.status(201).json(item);
  })
);

chatRouter.post(
  '/permissions/:id/:action',
  asyncHandler(async (req: AuthRequest, res) => {
    const action = req.params.action;
    if (!['approve', 'reject', 'revoke'].includes(action)) {
      throw new HttpError(400, 'Invalid action');
    }
    const item = await prisma.permission.findUnique({ where: { id: req.params.id } });
    if (!item) throw new HttpError(404, 'Permission not found');

    if (action === 'approve' || action === 'reject') {
      if (item.requestedBy === req.user!.id) {
        throw new HttpError(403, 'The requester cannot approve their own permission.');
      }
      const status = action === 'approve' ? PermissionStatus.GRANTED : PermissionStatus.REJECTED;
      const updated = await prisma.permission.update({
        where: { id: item.id },
        data: {
          status,
          grantedBy: action === 'approve' ? req.user!.id : null,
          grantedAt: action === 'approve' ? new Date() : null,
          rejectedAt: action === 'reject' ? new Date() : null,
          revokedAt: null
        }
      });
      await audit(req.user!.id, `PERMISSION_${action.toUpperCase()}`, item.id);
      await notifyUser({
        userId: item.requestedBy,
        actorId: req.user!.id,
        eventType: `PERMISSION_${action.toUpperCase()}`,
        payload: { permission: item.name, status }
      });
      emitToUser(item.requestedBy, 'permission:updated', { permissionId: item.id });
      emitToUser(req.user!.id, 'permission:updated', { permissionId: item.id });
      res.json(updated);
      return;
    }

    if (
      item.requestedBy !== req.user!.id &&
      item.grantedBy !== req.user!.id &&
      req.user!.role !== Role.HOST
    ) {
      throw new HttpError(403, 'Only the requester, grantor or Host may revoke.');
    }
    const updated = await prisma.permission.update({
      where: { id: item.id },
      data: { status: PermissionStatus.REVOKED, revokedAt: new Date() }
    });
    await audit(req.user!.id, 'PERMISSION_REVOKE', item.id);
    const other = await otherUser(req.user!.id);
    await notifyUser({
      userId: other.id,
      actorId: req.user!.id,
      eventType: 'PERMISSION_REVOKED',
      payload: { permission: item.name }
    });
    emitToUser(other.id, 'permission:updated', { permissionId: item.id });
    emitToUser(req.user!.id, 'permission:updated', { permissionId: item.id });
    res.json(updated);
  })
);

chatRouter.get(
  '/calls',
  asyncHandler(async (req: AuthRequest, res) => {
    const calls = await prisma.call.findMany({
      where: { participants: { some: { userId: req.user!.id } } },
      include: {
        participants: {
          include: { user: { select: { username: true, role: true } } }
        }
      },
      orderBy: { startedAt: 'desc' },
      take: 50
    });
    res.json(calls);
  })
);

/* ------------------------------------------------------------------ */
/* Host administration                                                 */
/* ------------------------------------------------------------------ */

chatRouter.get(
  '/admin/promo/status',
  requireHost,
  asyncHandler(async (_req, res) => {
    const code = await prisma.accessCode.findFirst({
      where: { purpose: 'PROMO', enabled: true },
      select: { enabled: true, updatedAt: true }
    });
    res.json({
      enabled: Boolean(code),
      updatedAt: code?.updatedAt ?? null,
      rateLimit: { attempts: 1000, windowSeconds: 30 }
    });
  })
);

chatRouter.post(
  '/admin/promo',
  requireHost,
  asyncHandler(async (req: AuthRequest, res) => {
    const code = String(req.body?.code ?? '').trim();
    if (code.length < 4 || code.length > 100) {
      throw new HttpError(400, 'Code must be 4–100 characters');
    }
    await prisma.accessCode.updateMany({
      where: { purpose: 'PROMO' },
      data: { enabled: false }
    });
    await prisma.accessCode.create({
      data: { purpose: 'PROMO', codeHash: await bcrypt.hash(code, 12) }
    });
    await audit(req.user!.id, 'ROTATE_PROMO_CODE');
    res.json({ ok: true });
  })
);

chatRouter.post(
  '/admin/promo/disable',
  requireHost,
  asyncHandler(async (req: AuthRequest, res) => {
    await prisma.accessCode.updateMany({
      where: { purpose: 'PROMO' },
      data: { enabled: false }
    });
    await audit(req.user!.id, 'DISABLE_PROMO_CODE');
    res.json({ ok: true });
  })
);

chatRouter.get(
  '/admin/messages',
  requireHost,
  asyncHandler(async (req: AuthRequest, res) => {
    const query = String(req.query.q ?? '').slice(0, 100);
    const rows = await prisma.message.findMany({
      where: {
        deletedAt: null,
        ...(query ? { content: { contains: query, mode: 'insensitive' as const } } : {})
      },
      orderBy: { createdAt: 'desc' },
      take: 250,
      include: {
        sender: { select: { username: true, role: true } },
        conversation: { select: { status: true } }
      }
    });
    res.json(rows);
  })
);

chatRouter.get(
  '/admin/deleted-messages',
  requireHost,
  asyncHandler(async (_req: AuthRequest, res) => {
    const rows = await prisma.message.findMany({
      where: {
        destination: MessageDestination.CHAT,
        OR: [{ deletedAt: { not: null } }, { hides: { some: {} } }]
      },
      orderBy: { createdAt: 'desc' },
      take: 300,
      include: {
        sender: { select: { username: true, role: true, displayName: true } },
        replyTo: { select: { id: true, content: true, attachmentKind: true } },
        hides: {
          include: { user: { select: { id: true, username: true, role: true } } }
        }
      }
    });
    res.json(rows);
  })
);

/**
 * Recover soft-deleted messages: remove the per-account hides so the message
 * becomes visible again. `ids` recovers selected messages; `role` recovers all
 * messages hidden by that role; an empty body recovers everything.
 */
chatRouter.post(
  '/admin/deleted-messages/recover',
  requireHost,
  asyncHandler(async (req: AuthRequest, res) => {
    const parsed = z
      .object({
        ids: z.array(z.string().min(1)).optional(),
        role: z.nativeEnum(Role).optional()
      })
      .safeParse(req.body ?? {});
    if (!parsed.success) throw new HttpError(400, 'Invalid recovery request');

    const ids = parsed.data.ids?.length ? parsed.data.ids : undefined;
    let count = 0;

    if (ids) {
      const result = await prisma.messageHide.deleteMany({ where: { messageId: { in: ids } } });
      await prisma.message.updateMany({
        where: { id: { in: ids }, deletedAt: { not: null } },
        data: { deletedAt: null }
      });
      count = result.count;
    } else if (parsed.data.role) {
      const users = await prisma.user.findMany({
        where: { role: parsed.data.role },
        select: { id: true }
      });
      const result = await prisma.messageHide.deleteMany({
        where: { userId: { in: users.map((user) => user.id) } }
      });
      count = result.count;
    } else {
      const result = await prisma.messageHide.deleteMany({});
      await prisma.message.updateMany({
        where: { deletedAt: { not: null } },
        data: { deletedAt: null }
      });
      count = result.count;
    }

    await audit(req.user!.id, 'RECOVER_DELETED_MESSAGES', undefined, {
      count,
      ids: ids?.length ?? 0,
      role: parsed.data.role ?? 'ALL'
    });
    // Every participant may still have the chat open; refresh their list.
    const recipients = await prisma.user.findMany({ select: { id: true } });
    for (const recipient of recipients) emitToUser(recipient.id, 'messages:recovered', {});
    res.json({ ok: true, count });
  })
);

/** Permanently removes recovered/soft-deleted messages from the database. */
chatRouter.delete(
  '/admin/deleted-messages',
  requireHost,
  asyncHandler(async (req: AuthRequest, res) => {
    const parsed = z
      .object({
        ids: z.array(z.string().min(1)).optional(),
        role: z.nativeEnum(Role).optional()
      })
      .safeParse(req.body ?? {});
    if (!parsed.success) throw new HttpError(400, 'Invalid delete request');

    let where: any;
    if (parsed.data.ids?.length) {
      where = { id: { in: parsed.data.ids } };
    } else if (parsed.data.role) {
      const users = await prisma.user.findMany({
        where: { role: parsed.data.role },
        select: { id: true }
      });
      where = { hides: { some: { userId: { in: users.map((user) => user.id) } } } };
    } else {
      where = {
        OR: [{ deletedAt: { not: null } }, { hides: { some: {} } }]
      };
    }

    const rows = await prisma.message.findMany({
      where,
      select: { id: true, attachmentId: true }
    });
    const messageIds = rows.map((row) => row.id);
    const mediaIds = rows
      .map((row) => row.attachmentId)
      .filter((id): id is string => Boolean(id));

    if (messageIds.length) {
      await prisma.message.deleteMany({ where: { id: { in: messageIds } } });
    }
    if (mediaIds.length) {
      await prisma.chatMedia.deleteMany({ where: { id: { in: mediaIds } } });
    }
    await audit(req.user!.id, 'DELETE_DELETED_MESSAGES_FOREVER', undefined, {
      count: messageIds.length
    });
    const recipients = await prisma.user.findMany({ select: { id: true } });
    for (const recipient of recipients) emitToUser(recipient.id, 'messages:recovered', {});
    res.json({ ok: true, count: messageIds.length });
  })
);

chatRouter.get(
  '/admin/users',
  requireHost,
  asyncHandler(async (_req: AuthRequest, res) => {
    const users = await prisma.user.findMany({
      where: { role: { in: [Role.HOST, Role.GUEST] } },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        username: true,
        displayName: true,
        role: true,
        lastSeenAt: true
      }
    });
    const preferences = await prisma.userPreference.findMany({
      where: { userId: { in: users.map((user) => user.id) } },
      select: { userId: true, chatNotifications: true }
    });
    const preferenceMap = new Map(
      preferences.map((preference) => [preference.userId, preference.chatNotifications])
    );
    res.json(
      users.map((user) => ({
        ...user,
        chatNotifications: preferenceMap.get(user.id) ?? true
      }))
    );
  })
);

chatRouter.post(
  '/admin/features',
  requireHost,
  asyncHandler(async (req: AuthRequest, res) => {
    const parsed = z
      .object({ userId: z.string().min(1), chatNotifications: z.boolean() })
      .safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Invalid feature settings');

    await prisma.userPreference.upsert({
      where: { userId: parsed.data.userId },
      create: {
        userId: parsed.data.userId,
        chatNotifications: parsed.data.chatNotifications
      },
      update: { chatNotifications: parsed.data.chatNotifications }
    });

    // Delivery is gated centrally by chatNotifications, so the account's own
    // preferences and push subscription are kept. Re-enabling restores
    // notifications immediately without another browser prompt.
    await audit(req.user!.id, 'UPDATE_USER_FEATURES', parsed.data.userId, {
      chatNotifications: parsed.data.chatNotifications
    });
    emitToUser(parsed.data.userId, 'notification:access', {
      chatNotifications: parsed.data.chatNotifications
    });
    emitToUser(parsed.data.userId, 'notification:preferences', {
      chatNotifications: parsed.data.chatNotifications
    });
    res.json({ ok: true });
  })
);


/* ------------------------------------------------------------------ */
/* Admin: global notification switch                                  */
/* ------------------------------------------------------------------ */

chatRouter.get(
  '/admin/notification-settings',
  requireHost,
  asyncHandler(async (_req, res) => {
    res.json(await getNotificationFeatureState());
  })
);

chatRouter.post(
  '/admin/notification-settings',
  requireHost,
  asyncHandler(async (req: AuthRequest, res) => {
    const parsed = z.object({ enabled: z.boolean() }).safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Invalid notification setting');

    const state = await setGlobalNotificationsEnabled(parsed.data.enabled, req.user!.id);
    await audit(req.user!.id, 'UPDATE_NOTIFICATION_SETTING', undefined, {
      enabled: parsed.data.enabled
    });

    // Every connected client updates immediately: when disabled the Settings
    // options disappear and any in-page browser notification is suppressed.
    const recipients = await prisma.user.findMany({ select: { id: true } });
    for (const recipient of recipients) {
      emitToUser(recipient.id, 'notification:global', { enabled: state.enabled });
    }

    res.json(state);
  })
);

/* ------------------------------------------------------------------ */
/* Admin: Study Assistant content                                      */
/* ------------------------------------------------------------------ */

const studyRoleSchema = z.enum(['USER', 'ASSISTANT']);

chatRouter.get(
  '/admin/study',
  requireHost,
  asyncHandler(async (_req: AuthRequest, res) => {
    const [messages, replies] = await Promise.all([
      prisma.studyMessage.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
      prisma.studyReply.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] })
    ]);
    res.json({ messages, replies });
  })
);

chatRouter.post(
  '/admin/study/messages',
  requireHost,
  asyncHandler(async (req: AuthRequest, res) => {
    const parsed = z
      .object({
        role: studyRoleSchema.optional(),
        text: z.string().trim().min(1).max(5000).optional(),
        items: z
          .array(
            z.object({
              role: studyRoleSchema.default('ASSISTANT'),
              text: z.string().trim().min(1).max(5000)
            })
          )
          .min(1)
          .max(100)
          .optional()
      })
      .refine((value) => Boolean(value.items?.length || value.text), {
        message: 'Add at least one message'
      })
      .safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Invalid study message');

    const items =
      parsed.data.items ??
      [{ role: parsed.data.role ?? 'ASSISTANT', text: parsed.data.text as string }];
    const last = await prisma.studyMessage.findFirst({
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true }
    });
    const start = (last?.sortOrder ?? -1) + 1;
    const created = await prisma.$transaction(
      items.map((item, index) =>
        prisma.studyMessage.create({
          data: {
            role: item.role,
            text: item.text,
            sortOrder: start + index
          }
        })
      )
    );
    await audit(req.user!.id, 'ADD_STUDY_MESSAGES', undefined, { count: created.length });
    await broadcastStudyUpdate();
    res.status(201).json(created);
  })
);

chatRouter.patch(
  '/admin/study/messages/:id',
  requireHost,
  asyncHandler(async (req: AuthRequest, res) => {
    const parsed = z
      .object({
        role: studyRoleSchema.optional(),
        text: z.string().trim().min(1).max(5000).optional()
      })
      .safeParse(req.body);
    if (!parsed.success || (!parsed.data.role && !parsed.data.text)) {
      throw new HttpError(400, 'Invalid study message');
    }
    const updated = await prisma.studyMessage.update({
      where: { id: req.params.id },
      data: {
        ...(parsed.data.role ? { role: parsed.data.role } : {}),
        ...(parsed.data.text ? { text: parsed.data.text } : {})
      }
    });
    await audit(req.user!.id, 'UPDATE_STUDY_MESSAGE', updated.id);
    await broadcastStudyUpdate();
    res.json(updated);
  })
);

chatRouter.delete(
  '/admin/study/messages/:id',
  requireHost,
  asyncHandler(async (req: AuthRequest, res) => {
    await prisma.studyMessage.deleteMany({ where: { id: req.params.id } });
    await audit(req.user!.id, 'DELETE_STUDY_MESSAGE', req.params.id);
    await broadcastStudyUpdate();
    res.status(204).end();
  })
);

chatRouter.delete(
  '/admin/study/messages',
  requireHost,
  asyncHandler(async (req: AuthRequest, res) => {
    const parsed = z
      .object({ ids: z.array(z.string().min(1)).optional() })
      .safeParse(req.body ?? {});
    if (!parsed.success) throw new HttpError(400, 'Invalid selection');
    const result = await prisma.studyMessage.deleteMany({
      where: parsed.data.ids?.length ? { id: { in: parsed.data.ids } } : {}
    });
    await audit(req.user!.id, 'DELETE_STUDY_MESSAGES', undefined, { count: result.count });
    await broadcastStudyUpdate();
    res.json({ ok: true, count: result.count });
  })
);

chatRouter.post(
  '/admin/study/messages/reorder',
  requireHost,
  asyncHandler(async (req: AuthRequest, res) => {
    const parsed = z
      .object({ ids: z.array(z.string().min(1)).min(1).max(500) })
      .safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Invalid order');
    await prisma.$transaction(
      parsed.data.ids.map((id, index) =>
        prisma.studyMessage.update({ where: { id }, data: { sortOrder: index } })
      )
    );
    await audit(req.user!.id, 'REORDER_STUDY_MESSAGES');
    await broadcastStudyUpdate();
    res.json({ ok: true });
  })
);

chatRouter.post(
  '/admin/study/replies',
  requireHost,
  asyncHandler(async (req: AuthRequest, res) => {
    const parsed = z
      .object({
        keywords: z.string().trim().min(1).max(500).optional(),
        answer: z.string().trim().min(1).max(8000).optional(),
        items: z
          .array(
            z.object({
              keywords: z.string().trim().min(1).max(500),
              answer: z.string().trim().min(1).max(8000)
            })
          )
          .min(1)
          .max(100)
          .optional()
      })
      .refine((value) => Boolean(value.items?.length || (value.keywords && value.answer)), {
        message: 'Add at least one reply'
      })
      .safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Invalid study reply');

    const items =
      parsed.data.items ??
      [
        {
          keywords: parsed.data.keywords as string,
          answer: parsed.data.answer as string
        }
      ];
    const last = await prisma.studyReply.findFirst({
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true }
    });
    const start = (last?.sortOrder ?? -1) + 1;
    const created = await prisma.$transaction(
      items.map((item, index) =>
        prisma.studyReply.create({
          data: { ...item, sortOrder: start + index }
        })
      )
    );
    await audit(req.user!.id, 'ADD_STUDY_REPLIES', undefined, { count: created.length });
    await broadcastStudyUpdate();
    res.status(201).json(created);
  })
);

chatRouter.patch(
  '/admin/study/replies/:id',
  requireHost,
  asyncHandler(async (req: AuthRequest, res) => {
    const parsed = z
      .object({
        keywords: z.string().trim().min(1).max(500).optional(),
        answer: z.string().trim().min(1).max(8000).optional()
      })
      .safeParse(req.body);
    if (!parsed.success || (!parsed.data.keywords && !parsed.data.answer)) {
      throw new HttpError(400, 'Invalid study reply');
    }
    const updated = await prisma.studyReply.update({
      where: { id: req.params.id },
      data: {
        ...(parsed.data.keywords ? { keywords: parsed.data.keywords } : {}),
        ...(parsed.data.answer ? { answer: parsed.data.answer } : {})
      }
    });
    await audit(req.user!.id, 'UPDATE_STUDY_REPLY', updated.id);
    await broadcastStudyUpdate();
    res.json(updated);
  })
);

chatRouter.delete(
  '/admin/study/replies/:id',
  requireHost,
  asyncHandler(async (req: AuthRequest, res) => {
    await prisma.studyReply.deleteMany({ where: { id: req.params.id } });
    await audit(req.user!.id, 'DELETE_STUDY_REPLY', req.params.id);
    await broadcastStudyUpdate();
    res.status(204).end();
  })
);

chatRouter.delete(
  '/admin/study/replies',
  requireHost,
  asyncHandler(async (req: AuthRequest, res) => {
    const parsed = z
      .object({ ids: z.array(z.string().min(1)).optional() })
      .safeParse(req.body ?? {});
    if (!parsed.success) throw new HttpError(400, 'Invalid selection');
    const result = await prisma.studyReply.deleteMany({
      where: parsed.data.ids?.length ? { id: { in: parsed.data.ids } } : {}
    });
    await audit(req.user!.id, 'DELETE_STUDY_REPLIES', undefined, { count: result.count });
    await broadcastStudyUpdate();
    res.json({ ok: true, count: result.count });
  })
);

chatRouter.post(
  '/admin/study/replies/reorder',
  requireHost,
  asyncHandler(async (req: AuthRequest, res) => {
    const parsed = z
      .object({ ids: z.array(z.string().min(1)).min(1).max(500) })
      .safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Invalid order');
    await prisma.$transaction(
      parsed.data.ids.map((id, index) =>
        prisma.studyReply.update({ where: { id }, data: { sortOrder: index } })
      )
    );
    await audit(req.user!.id, 'REORDER_STUDY_REPLIES');
    await broadcastStudyUpdate();
    res.json({ ok: true });
  })
);

chatRouter.get(
  '/admin/game-messages',
  requireHost,
  asyncHandler(async (_req, res) => {
    const rows = await prisma.gameMessage.findMany({
      orderBy: { createdAt: 'desc' },
      take: 250,
      include: { sender: { select: { username: true, role: true } } }
    });
    res.json(rows);
  })
);

chatRouter.delete(
  '/admin/game-messages/:id',
  requireHost,
  asyncHandler(async (req: AuthRequest, res) => {
    await prisma.gameMessage.deleteMany({ where: { id: req.params.id } });
    await audit(req.user!.id, 'DELETE_GAME_MESSAGE', req.params.id);
    res.status(204).end();
  })
);

chatRouter.delete(
  '/admin/game-messages',
  requireHost,
  asyncHandler(async (req: AuthRequest, res) => {
    const result = await prisma.gameMessage.deleteMany({});
    await audit(req.user!.id, 'DELETE_ALL_GAME_MESSAGES', undefined, {
      count: result.count
    });
    const recipients = await prisma.user.findMany({
      where: { id: { not: req.user!.id } },
      select: { id: true }
    });
    for (const recipient of recipients) {
      emitToUser(recipient.id, 'game:messages:cleared', { count: result.count });
    }
    res.json({ ok: true, count: result.count });
  })
);

chatRouter.get(
  '/admin/game-sessions',
  requireHost,
  asyncHandler(async (_req, res) => {
    const rows = await prisma.gameSession.findMany({
      include: {
        game: { select: { name: true, slug: true } }
      },
      orderBy: { startedAt: 'desc' },
      take: 100
    });
    res.json(rows);
  })
);

chatRouter.get(
  '/admin/calls',
  requireHost,
  asyncHandler(async (_req, res) => {
    const rows = await prisma.call.findMany({
      include: {
        participants: {
          include: { user: { select: { username: true, role: true } } }
        }
      },
      orderBy: { startedAt: 'desc' },
      take: 100
    });
    res.json(rows);
  })
);

chatRouter.post(
  '/admin/calls/:id/end',
  requireHost,
  asyncHandler(async (req: AuthRequest, res) => {
    const call = await prisma.call.findUnique({
      where: { id: req.params.id },
      include: { participants: true }
    });
    if (!call) throw new HttpError(404, 'Call not found');
    await prisma.call.update({
      where: { id: call.id },
      data: { status: 'ENDED', endedAt: new Date() }
    });
    await audit(req.user!.id, 'END_AUDIO_CALL', call.id);
    for (const participant of call.participants) {
      emitToUser(participant.userId, 'call:ended', { callId: call.id, reason: 'host-ended' });
    }
    res.json({ ok: true });
  })
);

chatRouter.get(
  '/admin/notifications',
  requireHost,
  asyncHandler(async (_req, res) => {
    const rows = await prisma.notification.findMany({
      include: { actor: { select: { username: true, role: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200
    });
    res.json(rows);
  })
);

chatRouter.get(
  '/admin/audit',
  requireHost,
  asyncHandler(async (_req, res) => {
    const rows = await prisma.adminAuditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200
    });
    res.json(rows);
  })
);

chatRouter.get(
  '/admin/activity',
  requireHost,
  asyncHandler(async (_req, res) => {
    const [notifications, calls, logs, permissions, gameSessions] = await Promise.all([
      prisma.notification.findMany({
        include: { actor: { select: { username: true, role: true } } },
        orderBy: { createdAt: 'desc' },
        take: 100
      }),
      prisma.call.findMany({
        include: {
          participants: {
            include: { user: { select: { username: true, role: true } } }
          }
        },
        orderBy: { startedAt: 'desc' },
        take: 50
      }),
      prisma.adminAuditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }),
      prisma.permission.findMany({
        include: {
          requester: { select: { username: true } },
          grantor: { select: { username: true } }
        },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.gameSession.findMany({
        include: { game: { select: { name: true, slug: true } } },
        orderBy: { startedAt: 'desc' },
        take: 50
      })
    ]);
    res.json({
      notifications,
      calls,
      logs,
      permissions,
      gameSessions,
      presence: onlineUserIds()
    });
  })
);

chatRouter.post(
  '/admin/activity/clear',
  requireHost,
  asyncHandler(async (req: AuthRequest, res) => {
    // Host may wipe activity and audit trails. No audit entry is written for
    // the wipe itself so the trail is genuinely cleared.
    const [notifications, calls, gameSessions, restoreEvents] = await prisma.$transaction([
      prisma.notification.deleteMany({}),
      prisma.callParticipant.deleteMany({}),
      prisma.gameSession.deleteMany({}),
      prisma.restoreEvent.deleteMany({})
    ]);
    await prisma.call.deleteMany({});
    emitToUser(req.user!.id, 'notification:cleared', {});
    res.json({
      ok: true,
      count: notifications.count + calls.count + gameSessions.count + restoreEvents.count
    });
  })
);

chatRouter.post(
  '/admin/audit/clear',
  requireHost,
  asyncHandler(async (_req: AuthRequest, res) => {
    const result = await prisma.adminAuditLog.deleteMany({});
    res.json({ ok: true, count: result.count });
  })
);

/* ------------------------------------------------------------------ */
/* Web Push                                                            */
/* ------------------------------------------------------------------ */

chatRouter.get('/push/public-key', (_req, res) => {
  res.json({
    publicKey: process.env.VAPID_PUBLIC_KEY || null,
    configured: isPushConfigured()
  });
});

chatRouter.post(
  '/push/subscribe',
  asyncHandler(async (req: AuthRequest, res) => {
    if (!(await isGlobalNotificationsEnabled())) {
      throw new HttpError(403, 'Notifications are disabled by the Host.');
    }
    const parsed = z
      .object({
        endpoint: z.string().url().max(3000),
        keys: z.object({
          p256dh: z.string().min(1).max(500),
          auth: z.string().min(1).max(500)
        })
      })
      .safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Invalid push subscription');

    await prisma.pushSubscription.upsert({
      where: { endpoint: parsed.data.endpoint },
      create: {
        userId: req.user!.id,
        endpoint: parsed.data.endpoint,
        p256dh: parsed.data.keys.p256dh,
        auth: parsed.data.keys.auth
      },
      update: {
        userId: req.user!.id,
        p256dh: parsed.data.keys.p256dh,
        auth: parsed.data.keys.auth
      }
    });
    res.json({ ok: true });
  })
);

chatRouter.delete(
  '/push/subscribe',
  asyncHandler(async (req: AuthRequest, res) => {
    const endpoint = String(req.body?.endpoint ?? '');
    await prisma.pushSubscription.deleteMany({
      where: { userId: req.user!.id, ...(endpoint ? { endpoint } : {}) }
    });
    res.status(204).end();
  })
);

export const _destinationOf = destinationOf;
export const _screenNames = screenNames;
