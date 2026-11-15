'use client';

import { useState } from 'react';
import { Ticket, VolumeX } from 'lucide-react';
import { useDuo } from '@/hooks/useDuoApp';
import { Button, Modal } from '@/components/ui';

/**
 * The small offer control in Chat and Study. It deliberately never looks or
 * reads like a call: tapping it opens a purchase confirmation, and the session
 * only starts after "Buy".
 *
 * During a session the same control opens the session options, so either side
 * can control their own mic, their own speaker and the other side's mic.
 */
export function CallOrb() {
  const duo = useDuo();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
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
  const isHost = duo.user?.role === 'HOST';
  const peerMicMuted = duo.remoteMicOn === false;
  const canRequest = duo.micMutedByPeer || duo.remoteSpeakerOn === false;

  return (
    <>
      <button
        type="button"
        className={`call-orb ${cls}`}
        title="Offer"
        aria-label="Offer"
        onClick={() => {
          if (inCall) setOptionsOpen(true);
          else setConfirmOpen(true);
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

      <Modal
        open={optionsOpen}
        title="Session options"
        onClose={() => setOptionsOpen(false)}
      >
        <div className="call-options">
          <button
            type="button"
            className={`call-option ${duo.callMuted ? '' : 'is-on'}`}
            onClick={() => (duo.callMuted ? duo.resumeListening() : duo.setMySpeaker(false))}
          >
            <span className="call-option-label">
              {duo.callMuted ? 'Unmute speaker' : 'Mute speaker'}
            </span>
            <span className="call-option-hint">
              {duo.callMuted
                ? 'Start hearing the other side again'
                : 'Stop hearing the other side until you allow it'}
            </span>
          </button>

          <button
            type="button"
            className={`call-option ${!duo.micOn ? 'is-on' : ''}`}
            onClick={duo.toggleMic}
            disabled={duo.micMutedByPeer}
          >
            <span className="call-option-label">
              {duo.micMutedByPeer
                ? 'Your mic is muted by the other side'
                : duo.micOn
                  ? 'Mute my mic'
                  : 'Unmute my mic'}
            </span>
            <span className="call-option-hint">
              {duo.micMutedByPeer
                ? 'Only they can restore it — send a request'
                : duo.micOn
                  ? 'Stop sending your voice'
                  : 'Start sending your voice'}
            </span>
          </button>

          <button
            type="button"
            className={`call-option ${peerMicMuted ? 'is-on' : ''}`}
            onClick={duo.togglePeerMic}
          >
            <span className="call-option-label">
              {peerMicMuted ? 'Unmute their mic' : 'Mute their mic'}
            </span>
            <span className="call-option-hint">
              {peerMicMuted
                ? 'Only you can restore it'
                : 'Stop their voice reaching you'}
            </span>
          </button>

          {canRequest && (
            <button
              type="button"
              className="call-option"
              onClick={() => {
                duo.requestHostAudioPermission();
                setOptionsOpen(false);
              }}
            >
              <span className="call-option-label">Request audio</span>
              <span className="call-option-hint">
                The other side must accept before audio changes
              </span>
            </button>
          )}

          <div className="call-option-row">
            <button
              type="button"
              className={`call-panel-btn ${duo.audioOutput === 'SPEAKER' ? 'is-on' : ''}`}
              onClick={() => duo.setAudioOutput('SPEAKER')}
            >
              Loudspeaker
            </button>
            <button
              type="button"
              className={`call-panel-btn ${duo.audioOutput === 'EARPIECE' ? 'is-on' : ''}`}
              onClick={() => duo.setAudioOutput('EARPIECE')}
            >
              Earpiece
            </button>
          </div>

          {isHost && (
            <Button
              variant="danger"
              className="mt-1 w-full"
              onClick={() => {
                setOptionsOpen(false);
                duo.hangup();
              }}
            >
              End
            </Button>
          )}
        </div>
      </Modal>
    </>
  );
}

/**
 * Compact in-session panel. No call wording anywhere.
 * - Big Mute button = stop hearing the other side (your speaker).
 * - "Mute mic" = stop sending your own voice.
 * - "Mute their mic" = stop their voice reaching you (only you can undo it).
 */
export function CallPanel() {
  const duo = useDuo();
  const state = duo.callState;
  const active =
    state === 'ACTIVE' || state === 'CONNECTING' || state === 'RECONNECTING';
  if (!active) return null;

  const isHost = duo.user?.role === 'HOST';
  const peerMicMuted = duo.remoteMicOn === false;

  return (
    <div className="call-panel" role="group" aria-label="Session controls">
      {state === 'RECONNECTING' && (
        <span className="call-panel-status">Reconnecting…</span>
      )}

      {!duo.callMuted && duo.remoteMicOn !== false && (
        <button
          type="button"
          className="call-panel-mute-big"
          onClick={() => duo.setMySpeaker(false)}
        >
          <VolumeX size={18} /> Mute speaker
        </button>
      )}

      <div className="call-panel-actions">
        <button
          type="button"
          className={`call-panel-btn ${!duo.micOn ? 'is-on' : ''}`}
          onClick={duo.toggleMic}
          disabled={duo.micMutedByPeer}
          title={
            duo.micMutedByPeer
              ? 'The other side muted your mic. Only they can restore it.'
              : undefined
          }
        >
          {duo.micMutedByPeer
            ? 'Mic muted'
            : duo.micOn
              ? 'Mute mic'
              : 'Unmute mic'}
        </button>
        <button
          type="button"
          className={`call-panel-btn ${peerMicMuted ? 'is-on' : ''}`}
          onClick={duo.togglePeerMic}
        >
          {peerMicMuted ? 'Unmute their mic' : 'Mute their mic'}
        </button>
        {duo.callMuted && (
          <button
            type="button"
            className="call-panel-btn is-on"
            onClick={() => duo.resumeListening()}
          >
            Unmute speaker
          </button>
        )}
        {(duo.micMutedByPeer || duo.remoteSpeakerOn === false) && (
          <button
            type="button"
            className="call-panel-btn is-on"
            onClick={duo.requestHostAudioPermission}
          >
            Request audio
          </button>
        )}
        <button
          type="button"
          className={`call-panel-btn ${duo.audioOutput === 'SPEAKER' ? 'is-on' : ''}`}
          onClick={() => duo.setAudioOutput('SPEAKER')}
        >
          Loudspeaker
        </button>
        <button
          type="button"
          className={`call-panel-btn ${duo.audioOutput === 'EARPIECE' ? 'is-on' : ''}`}
          onClick={() => duo.setAudioOutput('EARPIECE')}
        >
          Earpiece
        </button>
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

/**
 * The other side asked for audio. Answering here is the only way their voice
 * or microphone state changes; nothing is forced.
 */
export function MicRequestBar() {
  const duo = useDuo();
  if (!duo.incomingMicRequest) return null;

  return (
    <div className="incoming-call-bar incoming-offer" role="dialog" aria-label="Offer">
      <span className="call-bar-dot" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">Best deal $10</p>
        <p className="muted truncate text-[11px]">Accept to continue</p>
      </div>
      <div className="incoming-actions">
        <Button variant="danger" onClick={duo.declineMicRequest}>
          Reject
        </Button>
        <Button variant="primary" onClick={duo.acceptMicRequest}>
          Accept
        </Button>
      </div>
    </div>
  );
}
