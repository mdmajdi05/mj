'use client';

import { Loader2, Mic, MicOff, Moon, PhoneCall, PhoneOff, Sun } from 'lucide-react';
import { useDuo } from '@/hooks/useDuoApp';
import { formatDuration } from '@/lib/utils';
import { Button } from '@/components/ui';

/**
 * The round day/night switch that lives inside Chat.
 * Idle: sun. In a call: moon. Tap to start, rejoin or mute/unmute.
 */
export function CallOrb() {
  const duo = useDuo();
  const state = duo.callState;
  const inCall = state === 'ACTIVE' || state === 'CONNECTING' || state === 'RECONNECTING';
  const cls =
    state === 'ACTIVE'
      ? 'call-orb-active'
      : state === 'RECONNECTING'
        ? 'call-orb-reconnecting'
        : inCall
          ? 'call-orb-ringing'
          : '';

  const label =
    state === 'ACTIVE'
      ? duo.micOn
        ? 'Mute microphone'
        : 'Unmute microphone'
      : state === 'RECONNECTING'
        ? 'Reconnect call'
        : state === 'CONNECTING'
          ? 'Connecting call'
          : state === 'RINGING'
            ? 'Call ringing'
            : 'Start private call';

  return (
    <button
      type="button"
      className={`call-orb ${cls}`}
      title={label}
      aria-label={label}
      onClick={() => void duo.callAction()}
    >
      <span className="call-orb-ring" aria-hidden="true" />
      {state === 'ACTIVE' ? (
        duo.micOn ? (
          <Moon size={22} />
        ) : (
          <MicOff size={22} />
        )
      ) : state === 'RECONNECTING' || state === 'CONNECTING' || state === 'RINGING' ? (
        <Loader2 size={22} className="call-orb-spin" />
      ) : (
        <Sun size={22} />
      )}
    </button>
  );
}

export function CallStatusBar() {
  const duo = useDuo();
  const active =
    duo.callState === 'ACTIVE' ||
    duo.callState === 'CONNECTING' ||
    duo.callState === 'RECONNECTING';

  if (!active) return null;

  const title =
    duo.callState === 'ACTIVE'
      ? 'Free chat'
      : duo.callState === 'RECONNECTING'
        ? 'Reconnecting…'
        : 'Connecting…';

  return (
    <div className={`call-bar ${duo.callState === 'RECONNECTING' ? 'call-bar-warn' : ''}`}>
      <span className="call-bar-dot" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold">{title}</p>
        <p className="muted text-[11px] leading-tight">
          {formatDuration(duo.callSeconds)} · {duo.micOn ? 'mic on' : 'mic muted'}
        </p>
      </div>
      <button
        type="button"
        className="call-bar-btn"
        onClick={duo.toggleMic}
        title={duo.micOn ? 'Mute my microphone' : 'Unmute my microphone'}
        aria-label={duo.micOn ? 'Mute my microphone' : 'Unmute my microphone'}
      >
        {duo.micOn ? <Mic size={16} /> : <MicOff size={16} />}
      </button>
      <button
        type="button"
        className="call-bar-btn call-bar-end"
        onClick={duo.hangup}
        title="End call"
        aria-label="End call"
      >
        <PhoneOff size={16} />
      </button>
    </div>
  );
}

export function IncomingCallBar() {
  const duo = useDuo();
  if (!duo.incomingCall) return null;

  return (
    <div className="incoming-call-bar" role="status" aria-live="polite">
      <span className="call-bar-dot" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">
          {duo.incomingCall.from || 'The other player'} is calling
        </p>
        <p className="muted text-[11px]">Private audio call</p>
      </div>
      <Button variant="danger" className="!px-2.5 !py-1.5" onClick={duo.declineIncoming}>
        <PhoneOff size={15} />
      </Button>
      <Button
        variant="primary"
        className="!px-2.5 !py-1.5"
        onClick={() => void duo.acceptCall()}
      >
        <PhoneCall size={15} /> Accept
      </Button>
    </div>
  );
}
