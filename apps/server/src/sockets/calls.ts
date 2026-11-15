import type { Server, Socket } from 'socket.io';
import { CallStatus, PermissionStatus, Role } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { writeAudit } from '../lib/audit';
import type { AuthUser } from '../middleware/auth';
import { emitToUser, notifyUser } from '../services/notifier';
import { peerFor } from '../services/peer';

type SignalPayload = { callId?: string; kind?: string; signal?: unknown };

/**
 * Privacy cleanup for a socket that drops (refresh, tab close, network loss,
 * screen lock). The call is ended for both sides instead of silently staying
 * alive with a disconnected participant.
 */
export async function endCallsForDisconnect(userId: string, username: string) {
  const calls = await prisma.call.findMany({
    where: {
      status: { in: [CallStatus.RINGING, CallStatus.ACTIVE] },
      participants: { some: { userId } }
    },
    include: { participants: true }
  });

  for (const call of calls) {
    await prisma.callParticipant.updateMany({
      where: { callId: call.id, userId },
      data: { leftAt: new Date() }
    });
    await prisma.call.update({
      where: { id: call.id },
      data: { status: CallStatus.ENDED, endedAt: new Date() }
    });
    for (const participant of call.participants) {
      if (participant.userId === userId) {
        emitToUser(participant.userId, 'call:left', { callId: call.id });
      } else {
        emitToUser(participant.userId, 'call:participant-left', {
          callId: call.id,
          userId,
          username
        });
        emitToUser(participant.userId, 'call:ended', {
          callId: call.id,
          reason: 'participant-left'
        });
      }
    }
  }
}

export function registerCallSocketHandlers(_io: Server, socket: Socket) {
  const user = socket.data.user as AuthUser;

  const emitError = (message: string) => socket.emit('call:error', { error: message });

  const otherUser = () => peerFor(user.id);

  const callFor = async (callId?: string) => {
    if (!callId) return null;
    return prisma.call.findUnique({
      where: { id: callId },
      include: {
        participants: {
          include: { user: { select: { username: true, role: true } } }
        }
      }
    });
  };

  const isParticipant = (call: Awaited<ReturnType<typeof callFor>>) =>
    Boolean(call?.participants.some((participant) => participant.userId === user.id));

  const endForBoth = async (callId: string, reason: string) => {
    const call = await callFor(callId);
    if (!call) return;
    await prisma.call.update({
      where: { id: call.id },
      data: { status: CallStatus.ENDED, endedAt: new Date() }
    });
    for (const participant of call.participants) {
      emitToUser(participant.userId, 'call:ended', { callId: call.id, reason });
    }
  };

  socket.on('call:invite', async () => {
    const other = await otherUser();
    if (!other) {
      emitError('The second account is not configured.');
      return;
    }

    const existing = await prisma.call.findFirst({
      where: {
        status: { in: [CallStatus.RINGING, CallStatus.ACTIVE] },
        participants: { some: { userId: { in: [user.id, other.id] } } }
      },
      include: { participants: true }
    });
    if (existing) {
      emitError(
        existing.participants.some((participant) => participant.userId === other.id)
          ? 'The other participant is already in a call.'
          : 'You are already in a call.'
      );
      return;
    }

    const call = await prisma.call.create({
      data: {
        status: CallStatus.RINGING,
        participants: { create: [{ userId: user.id }, { userId: other.id }] }
      }
    });

    await notifyUser({
      userId: other.id,
      actorId: user.id,
      eventType: 'CALL_INCOMING',
      payload: { callId: call.id },
      push: true
    });
    emitToUser(other.id, 'call:incoming', {
      callId: call.id,
      from: user.username,
      createdAt: call.startedAt
    });
    socket.emit('call:created', { callId: call.id, startedAt: call.startedAt });

    const timer = setTimeout(async () => {
      const current = await prisma.call.findUnique({ where: { id: call.id } });
      if (current?.status !== CallStatus.RINGING) return;
      await prisma.call.update({
        where: { id: call.id },
        data: { status: CallStatus.DECLINED, endedAt: new Date() }
      });
      await endForBoth(call.id, 'no-answer');
    }, 60_000);
    timer.unref?.();
  });

  socket.on('call:start', () => {
    socket.emit('call:status', { hint: 'Use call:invite' });
  });

  socket.on('call:accept', async (payload: { callId?: string }) => {
    const call = await callFor(payload?.callId);
    if (!call || !isParticipant(call)) return;
    if (call.status !== CallStatus.RINGING && call.status !== CallStatus.ACTIVE) return;

    await prisma.call.update({
      where: { id: call.id },
      data: { status: CallStatus.ACTIVE }
    });
    await prisma.callParticipant.updateMany({
      where: { callId: call.id, userId: user.id },
      data: { joinedAt: new Date() }
    });
    for (const participant of call.participants) {
      emitToUser(participant.userId, 'call:accepted', { callId: call.id, startedAt: call.startedAt });
      emitToUser(participant.userId, 'call:status', {
        callId: call.id,
        status: 'ACTIVE',
        startedAt: call.startedAt
      });
    }
  });

  socket.on('call:decline', async (payload: { callId?: string }) => {
    const call = await callFor(payload?.callId);
    if (!call || !isParticipant(call)) return;
    if (call.status !== CallStatus.RINGING) return;
    await prisma.call.update({
      where: { id: call.id },
      data: { status: CallStatus.DECLINED, endedAt: new Date() }
    });
    for (const participant of call.participants) {
      emitToUser(participant.userId, 'call:ended', {
        callId: call.id,
        reason: 'declined'
      });
    }
  });

  socket.on('call:leave', async (payload: { callId?: string }) => {
    const call = await callFor(payload?.callId);
    if (!call || !isParticipant(call)) return;

    await prisma.callParticipant.updateMany({
      where: { callId: call.id, userId: user.id },
      data: { leftAt: new Date() }
    });
    await prisma.call.update({
      where: { id: call.id },
      data: { status: CallStatus.ENDED, endedAt: new Date() }
    });

    for (const participant of call.participants) {
      if (participant.userId === user.id) {
        emitToUser(participant.userId, 'call:left', { callId: call.id });
      } else {
        emitToUser(participant.userId, 'call:participant-left', {
          callId: call.id,
          userId: user.id,
          username: user.username
        });
        emitToUser(participant.userId, 'call:ended', {
          callId: call.id,
          reason: 'participant-left'
        });
      }
    }
  });

  socket.on('call:end', async (payload: { callId?: string }) => {
    const call = await callFor(payload?.callId);
    if (!call || !isParticipant(call)) return;

    if (user.role !== Role.HOST) {
      // A Guest can leave independently but cannot force-end the Host's client.
      await prisma.callParticipant.updateMany({
        where: { callId: call.id, userId: user.id },
        data: { leftAt: new Date() }
      });
      await prisma.call.update({
        where: { id: call.id },
        data: { status: CallStatus.ENDED, endedAt: new Date() }
      });
      for (const participant of call.participants) {
        if (participant.userId === user.id) {
          emitToUser(participant.userId, 'call:left', { callId: call.id });
        } else {
          emitToUser(participant.userId, 'call:participant-left', {
            callId: call.id,
            userId: user.id,
            username: user.username
          });
          emitToUser(participant.userId, 'call:ended', {
            callId: call.id,
            reason: 'participant-left'
          });
        }
      }
      return;
    }

    await prisma.call.update({
      where: { id: call.id },
      data: { status: CallStatus.ENDED, endedAt: new Date() }
    });
    await writeAudit(user.id, 'END_AUDIO_CALL', call.id);
    for (const participant of call.participants) {
      emitToUser(participant.userId, 'call:ended', {
        callId: call.id,
        reason: 'host-ended'
      });
    }
  });

  socket.on('call:reconnect', async (payload: { callId?: string }) => {
    const call = await callFor(payload?.callId);
    if (!call || !isParticipant(call)) return;
    socket.emit('call:status', {
      callId: call.id,
      status: call.status,
      startedAt: call.startedAt
    });
  });

  /**
   * Used after a transient in-call WebRTC reset. Disconnects, refreshes and
   * page hides end the call (see endCallsForDisconnect), so no private chat
   * session is restored silently.
   */
  socket.on('call:rejoin', async (payload: { callId?: string }) => {
    const call = payload?.callId
      ? await callFor(payload.callId)
      : await prisma.call.findFirst({
          where: {
            status: { in: [CallStatus.RINGING, CallStatus.ACTIVE] },
            participants: { some: { userId: user.id } }
          },
          orderBy: { startedAt: 'desc' },
          include: {
            participants: {
              include: { user: { select: { username: true, role: true } } }
            }
          }
        });
    if (!call || !isParticipant(call)) {
      socket.emit('call:status', { status: 'ENDED' });
      return;
    }
    if (call.status !== CallStatus.RINGING && call.status !== CallStatus.ACTIVE) {
      socket.emit('call:status', { callId: call.id, status: 'ENDED' });
      return;
    }

    await prisma.callParticipant.updateMany({
      where: { callId: call.id, userId: user.id },
      data: { joinedAt: new Date(), leftAt: null }
    });

    socket.emit('call:status', {
      callId: call.id,
      status: call.status,
      startedAt: call.startedAt
    });

    const target = call.participants.find((participant) => participant.userId !== user.id);
    if (target) {
      emitToUser(target.userId, 'call:peer-rejoined', {
        callId: call.id,
        userId: user.id,
        username: user.username
      });
    }
  });

  socket.on('call:signal', async (payload: SignalPayload) => {
    if (!payload?.callId || !payload.signal) return;
    if (!['offer', 'answer', 'ice'].includes(String(payload.kind))) return;
    const call = await callFor(payload.callId);
    if (!call || !isParticipant(call)) return;
    if (call.status !== CallStatus.RINGING && call.status !== CallStatus.ACTIVE) return;

    const target = call.participants.find((participant) => participant.userId !== user.id);
    if (!target) return;
    emitToUser(target.userId, 'call:signal', {
      callId: call.id,
      fromUserId: user.id,
      kind: payload.kind,
      signal: payload.signal
    });
  });

  socket.on('call:mic-status', async (payload: { callId?: string; enabled?: boolean }) => {
    if (!payload?.callId) return;
    const call = await callFor(payload.callId);
    if (!call || !isParticipant(call)) return;
    const target = call.participants.find((participant) => participant.userId !== user.id);
    if (!target) return;
    emitToUser(target.userId, 'call:mic-status', {
      enabled: Boolean(payload.enabled),
      userId: user.id
    });
  });

  socket.on('call:remote-mic', async (payload: { enabled?: boolean }) => {
    const call = await prisma.call.findFirst({
      where: {
        status: CallStatus.ACTIVE,
        participants: { some: { userId: user.id } }
      },
      include: {
        participants: { include: { user: { select: { role: true } } } }
      }
    });
    if (!call) {
      emitError('No active call.');
      return;
    }

    const target = call.participants.find((participant) => participant.userId !== user.id);
    if (!target) return;

    const permission = await prisma.permission.findFirst({
      where: {
        name: 'REMOTE_MIC_CONTROL',
        requestedBy: user.id,
        grantedBy: target.userId,
        status: PermissionStatus.GRANTED
      }
    });
    const enabled = Boolean(payload?.enabled);
    // A Guest may always mute the Host microphone (the Done button sends this
    // request through the backend). Unmuting still needs the Host's consent.
    const guestMute = user.role === Role.GUEST && enabled === false;
    const permitted = user.role === Role.HOST
      ? Boolean(permission)
      : guestMute || Boolean(permission);

    if (!permitted) {
      emitError('The other participant has not granted microphone control.');
      return;
    }

    emitToUser(target.userId, 'call:remote-mic', { enabled, by: user.id });
    emitToUser(user.id, 'call:remote-mic:sent', { enabled, targetUserId: target.userId });
  });
}
