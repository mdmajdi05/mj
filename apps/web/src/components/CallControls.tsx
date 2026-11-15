'use client';

import { useState } from 'react';
import { Ticket } from 'lucide-react';
import { useDuo } from '@/hooks/useDuoApp';
import { Button, Modal } from '@/components/ui';

/**
 * The small offer control in Chat and Study. It deliberately never looks or
 * reads like a call: tapping it opens a purchase confirmation, and the session
 * only starts after "Buy".
 */
export function CallOrb() {
  const duo = useDuo();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const state = duo.callState;
  const inCall =
    state === 'ACTIVE' || state === 'CONNECTING' || state === 'RECONNECTING';
  const cls =
    state === 'ACTIVE'
      ? 'call-orb-active'
      : state === 'RECONNECTING'
        ? 'call-orb-reconnecting'
        : inCall
          ? 'call-orb-ringing'
          : '';

  return (
    <>
      <button
        type="button"
        className={`call-orb ${cls}`}
        title="Offer"
        aria-label="Offer"
        onClick={() => {
          if (inCall) return;
          setConfirmOpen(true);
        }}
      >
        <span className="call-orb-ring" aria-hidden="true" />
        <Ticket size={20} />
      </button>

      <Modal
        open={confirmOpen}
        title="Are you sure you want to buy this?"
        onClose={() => setConfirmOpen(false)}
      >
        <p className="muted text-sm leading-6">
          This unlocks the private session for this conversation.
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
            Buy
          </Button>
        </div>
      </Modal>
    </>
  );
}

/**
 * Compact in-session panel. No call wording anywhere: just mute, speaker and
 * earpiece controls, plus an unmute action when the Host audio is paused.
 */
export function CallPanel() {
  const duo = useDuo();
  const state = duo.callState;
  const active =
    state === 'ACTIVE' || state === 'CONNECTING' || state === 'RECONNECTING';
  if (!active) return null;

  const isHost = duo.user?.role === 'HOST';

  return (
    <div className="call-panel" role="group" aria-label="Session controls">
      {state === 'RECONNECTING' && (
        <span className="call-panel-status">Reconnecting…</span>
      )}
      <div className="call-panel-actions">
        <button
          type="button"
          className={`call-panel-btn ${!duo.micOn ? 'is-on' : ''}`}
          onClick={duo.toggleMic}
        >
          {duo.micOn ? 'Mute' : 'Unmute'}
        </button>
        <button
          type="button"
          className={`call-panel-btn ${duo.audioOutput === 'SPEAKER' ? 'is-on' : ''}`}
          onClick={() => duo.setAudioOutput('SPEAKER')}
        >
          Speaker
        </button>
        <button
          type="button"
          className={`call-panel-btn ${duo.audioOutput === 'EARPIECE' ? 'is-on' : ''}`}
          onClick={() => duo.setAudioOutput('EARPIECE')}
        >
          Earpiece
        </button>
        {!isHost && (duo.callMuted || duo.remoteMicOn === false) && (
          <button
            type="button"
            className="call-panel-btn is-on"
            onClick={() => duo.requestHostAudio(true)}
          >
            Unmute
          </button>
        )}
        {isHost && (
          <button type="button" className="call-panel-btn is-end" onClick={duo.hangup}>
            End
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Incoming offer shown as a small bottom popup. "Pay" accepts, "Reject"
 * declines. Nothing here reveals what the session actually is.
 */
export function IncomingCallBar() {
  const duo = useDuo();
  if (!duo.incomingCall) return null;

  return (
    <div className="incoming-call-bar incoming-offer" role="dialog" aria-label="Offer">
      <span className="call-bar-dot" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">Best deal $10</p>
        <p className="muted truncate text-[11px]">Pay to unlock this offer</p>
      </div>
      <div className="incoming-actions">
        <Button variant="danger" onClick={duo.declineIncoming}>
          Reject
        </Button>
        <Button variant="primary" onClick={() => void duo.acceptCall()}>
          Pay
        </Button>
      </div>
    </div>
  );
}
