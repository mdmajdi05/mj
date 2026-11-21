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

  /**
   * Mic = the input the other side hears. Speaker = the output this side
   * hears. `micOn` combines both mute reasons; `speakerOn` is controlled only
   * by its owner.
   */
  const micStatePayload = (call: NonNullable<Awaited<ReturnType<typeof callFor>>>) => ({
    callId: call.id,
    participants: call.participants.map((participant) => ({
      userId: participant.userId,
      micOn: !participant.selfMuted && !participant.mutedByPeer,
      selfMuted: participant.selfMuted,
      mutedByPeer: participant.mutedByPeer,
      speakerOn: participant.speakerOn
    }))
  });

  const broadcastMicState = async (callId: string) => {
    const call = await callFor(callId);
    if (!call) return;
    const payload = micStatePayload(call);
    for (const participant of call.participants) {
      emitToUser(participant.userId, 'call:mic-state', payload);
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

    const [minePref, otherPref] = await Promise.all([
      prisma.userPreference.findUnique({ where: { userId: user.id } }),
      prisma.userPreference.findUnique({ where: { userId: other.id } })
    ]);
    // Each account chooses the default state of the other participant's mic.
    // The Host controls the Guest mic; the Guest controls the Host mic.
    const hostPref = user.role === Role.HOST ? minePref : otherPref;
    const guestPref = user.role === Role.GUEST ? minePref : otherPref;
    const hostMicDenied = !(guestPref?.defaultPeerMicOn ?? false);
    const guestMicDenied = !(hostPref?.defaultPeerMicOn ?? true);

    const call = await prisma.call.create({
      data: {
        status: CallStatus.RINGING,
        participants: {
          create: [
            {
              userId: user.id,
              mutedByPeer: user.role === Role.HOST ? hostMicDenied : guestMicDenied
            },
            {
              userId: other.id,
              mutedByPeer: other.role === Role.HOST ? hostMicDenied : guestMicDenied
            }
          ]
        }
      }
    });

    await notifyUser({
      userId: other.id,
      actorId: user.id,
      eventType: 'CALL_INCOMING',
      payload: { callId: call.id }
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
    await broadcastMicState(call.id);
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
    // Restore every mute/speaker choice so a refresh never silently mutes a
    // microphone or a speaker.
    await broadcastMicState(call.id);
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

  /**
   * A participant's own microphone toggle (their input, heard by the other
   * side). Turning it back on is refused while the other side has muted it:
   * only whoever muted it can restore it.
   */
  socket.on('call:mic-status', async (payload: { callId?: string; enabled?: boolean }) => {
    const call = await callFor(payload?.callId);
    if (!call || !isParticipant(call)) return;
    const me = call.participants.find((participant) => participant.userId === user.id);
    if (!me) return;
    const enabled = Boolean(payload?.enabled);
    if (enabled && me.mutedByPeer) {
      socket.emit('call:mic-locked', { callId: call.id });
      return;
    }
    await prisma.callParticipant.update({
      where: { callId_userId: { callId: call.id, userId: user.id } },
      data: { selfMuted: !enabled }
    });
    await broadcastMicState(call.id);
  });

  /**
   * Remote microphone control: this participant mutes the other side's input
   * so their own speaker stops receiving it. Only the participant who muted it
   * can turn it back on.
   */
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

    const enabled = Boolean(payload?.enabled);
    await prisma.callParticipant.update({
      where: { callId_userId: { callId: call.id, userId: target.userId } },
      // Granting permission also switches the target microphone ON; after that
      // they can mute/unmute their own microphone independently.
      data: enabled
        ? { mutedByPeer: false, selfMuted: false }
        : { mutedByPeer: true }
    });
    await broadcastMicState(call.id);
  });

  /**
   * A participant's own speaker (their listening). Only they can change it;
   * the other side may request it, never force it.
   */
  socket.on('call:speaker-status', async (payload: { callId?: string; enabled?: boolean }) => {
    const call = await callFor(payload?.callId);
    if (!call || !isParticipant(call)) return;
    await prisma.callParticipant.update({
      where: { callId_userId: { callId: call.id, userId: user.id } },
      data: { speakerOn: Boolean(payload?.enabled) }
    });
    await broadcastMicState(call.id);
  });

  /** Either side asks to be audible again. The other side decides. */
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

  /**
   * The requested side accepted: they turn their own speaker back on, and the
   * requester's microphone is released so the request can be heard.
   */
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
    if (accepted) {
      await prisma.callParticipant.update({
        where: { callId_userId: { callId: call.id, userId: target.userId } },
        data: { mutedByPeer: false, selfMuted: false }
      });
      await prisma.callParticipant.update({
        where: { callId_userId: { callId: call.id, userId: user.id } },
        data: { speakerOn: true }
      });
      await broadcastMicState(call.id);
    }
    emitToUser(target.userId, 'call:mic-request:result', { accepted });
  });
}
