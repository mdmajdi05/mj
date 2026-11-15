'use client';

import { useState } from 'react';
import { Loader2, MicOff, Moon, PhoneCall, PhoneOff, Sun } from 'lucide-react';
import { useDuo } from '@/hooks/useDuoApp';
import { Button, Modal } from '@/components/ui';

/**
 * The round day/night switch that lives inside Chat.
 * Idle: sun. In a call: moon. Tap to start, rejoin or mute/unmute.
 */
export function CallOrb() {
  const duo = useDuo();
  const [confirmOpen, setConfirmOpen] = useState(false);
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

  function onClick() {
    if (state === 'IDLE' || state === 'ENDED') {
      setConfirmOpen(true);
      return;
    }
    void duo.callAction();
  }

  return (
    <>
      <button
        type="button"
        className={`call-orb ${cls}`}
        title={label}
        aria-label={label}
        onClick={onClick}
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

      <Modal open={confirmOpen} title="Start a call?" onClose={() => setConfirmOpen(false)}>
        <p className="muted text-sm leading-6">
          Are you sure you want to place the call? The chat stays open during the call.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => {
              setConfirmOpen(false);
              void duo.callAction();
            }}
          >
            <PhoneCall size={16} /> OK, call
          </Button>
        </div>
      </Modal>
    </>
  );
}

/**
 * Incoming offer shown as a small bottom popup. "Pay" accepts the call and
 * "Reject" ends it.
 */
export function IncomingCallBar() {
  const duo = useDuo();
  if (!duo.incomingCall) return null;

  return (
    <div className="incoming-call-bar incoming-offer" role="dialog" aria-label="Incoming call">
      <span className="call-bar-dot" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">Best deal $10</p>
        <p className="muted truncate text-[11px]">
          {duo.incomingCall.from || 'The other player'} is calling · Pay to accept
        </p>
      </div>
      <div className="incoming-actions">
        <Button variant="danger" onClick={duo.declineIncoming}>
          <PhoneOff size={15} /> Reject
        </Button>
        <Button variant="primary" onClick={() => void duo.acceptCall()}>
          <PhoneCall size={15} /> Pay
        </Button>
      </div>
    </div>
  );
}
