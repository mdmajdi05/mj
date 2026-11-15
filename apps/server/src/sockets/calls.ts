import type { Server, Socket } from 'socket.io';
import { CallStatus, Role } from '@prisma/client';
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

    if (call.status === CallStatus.RINGING) {
      await prisma.call.update({
        where: { id: call.id },
        data: { status: CallStatus.DECLINED, endedAt: new Date() }
      });
      for (const participant of call.participants) {
        if (participant.userId === userId) {
          emitToUser(participant.userId, 'call:left', { callId: call.id });
        } else {
          emitToUser(participant.userId, 'call:ended', {
            callId: call.id,
            reason: 'no-answer'
          });
        }
      }
      continue;
    }

    // An active session survives a dropped network, a refresh or a locked
    // screen. The other side shows "reconnecting" and the session resumes as
    // soon as the participant is back. Only the Host can end it.
    for (const participant of call.participants) {
      if (participant.userId !== userId) {
        emitToUser(participant.userId, 'call:peer-offline', {
          callId: call.id,
          userId,
          username
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
      const abandoned = existing.participants.every((participant) => participant.leftAt);
      if (!abandoned) {
        emitError(
          existing.participants.some((participant) => participant.userId === other.id)
            ? 'The other participant is already in a call.'
            : 'You are already in a call.'
        );
        return;
      }
      // Nobody is connected to it any more; retire the stale session.
      await prisma.call.update({
        where: { id: existing.id },
        data: { status: CallStatus.ENDED, endedAt: new Date() }
      });
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

    // Leaving the private surface pauses the session: it does not end it. The
    // other side is told the participant went offline so the UI can show a
    // reconnecting state without dropping the session.
    await prisma.callParticipant.updateMany({
      where: { callId: call.id, userId: user.id },
      data: { leftAt: new Date() }
    });
    for (const participant of call.participants) {
      if (participant.userId !== user.id) {
        emitToUser(participant.userId, 'call:peer-offline', {
          callId: call.id,
          userId: user.id,
          username: user.username
        });
      }
    }
  });

  socket.on('call:end', async (payload: { callId?: string }) => {
    const call = await callFor(payload?.callId);
    if (!call || !isParticipant(call)) return;

    // Only the Host can end a session for good. A Guest leaving only pauses
    // their side, so the Host keeps the session open.
    if (user.role !== Role.HOST) {
      await prisma.callParticipant.updateMany({
        where: { callId: call.id, userId: user.id },
        data: { leftAt: new Date() }
      });
      for (const participant of call.participants) {
        if (participant.userId !== user.id) {
          emitToUser(participant.userId, 'call:peer-offline', {
            callId: call.id,
            userId: user.id,
            username: user.username
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
      emitError('No active session.');
      return;
    }

    const target = call.participants.find((participant) => participant.userId !== user.id);
    if (!target) return;

    // The Guest owns what they hear: they may mute or unmute the Host at any
    // time. The Host's microphone stays off by default until that happens.
    const enabled = Boolean(payload?.enabled);
    // The Host can never switch their own microphone back on. Only the Guest
    // can allow it again.
    if (user.role === Role.HOST && enabled) {
      emitError('The other participant controls this.');
      return;
    }
    emitToUser(target.userId, 'call:remote-mic', { enabled, by: user.id });
    emitToUser(target.userId, 'call:mic-status', { enabled, userId: target.userId });
    emitToUser(user.id, 'call:mic-status', { enabled, userId: target.userId });
    emitToUser(user.id, 'call:remote-mic:sent', { enabled, targetUserId: target.userId });
  });

  /** Host asks the Guest whether their microphone may be switched on. */
  socket.on('call:mic-request', async () => {
    const call = await prisma.call.findFirst({
      where: {
        status: CallStatus.ACTIVE,
        participants: { some: { userId: user.id } }
      },
      include: { participants: true }
    });
    if (!call) {
      emitError('No active session.');
      return;
    }
    const target = call.participants.find((participant) => participant.userId !== user.id);
    if (!target) return;
    emitToUser(target.userId, 'call:mic-request', {
      callId: call.id,
      from: user.username
    });
  });

  /** Guest's answer to that request. Accepting enables the Host microphone. */
  socket.on('call:mic-request:answer', async (payload: { accepted?: boolean }) => {
    const call = await prisma.call.findFirst({
      where: {
        status: CallStatus.ACTIVE,
        participants: { some: { userId: user.id } }
      },
      include: { participants: true }
    });
    if (!call) return;
    const target = call.participants.find((participant) => participant.userId !== user.id);
    if (!target) return;
    const accepted = Boolean(payload?.accepted);
    if (accepted && user.role === Role.GUEST) {
      emitToUser(target.userId, 'call:remote-mic', { enabled: true, by: user.id });
      emitToUser(target.userId, 'call:mic-status', { enabled: true, userId: target.userId });
      emitToUser(user.id, 'call:mic-status', { enabled: true, userId: target.userId });
    }
    emitToUser(target.userId, 'call:mic-request:result', { accepted });
  });
}
