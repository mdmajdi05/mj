'use client';

import { useState } from 'react';
import { Mic, MicOff, Ticket, VolumeX } from 'lucide-react';
import { useDuo } from '@/hooks/useDuoApp';
import { Button, Modal } from '@/components/ui';

const otherName = (role?: string) => (role === 'HOST' ? 'User' : 'Host');

/**
 * Controls the other participant's microphone.
 * - Allowed + active: a large red Mute button.
 * - Disabled by this side: a small UNMUTE button (confirmation required).
 * - Allowed but self-muted by them: a neutral status, no action needed.
 */
function RemoteMicControl({ compact = false }: { compact?: boolean }) {
  const duo = useDuo();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const name = otherName(duo.user?.role);

  if (!duo.remotePermissionOn) {
    return (
      <>
        <button
          type="button"
          className="call-panel-btn is-on"
          onClick={() => setConfirmOpen(true)}
        >
          UNMUTE {name}
        </button>
        <Modal
          open={confirmOpen}
          title={`Turn on ${name}'s microphone?`}
          onClose={() => setConfirmOpen(false)}
        >
          <p className="muted text-sm leading-6">
            This switches {name}&apos;s microphone ON. They can then mute or unmute
            their own microphone independently.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                setConfirmOpen(false);
                duo.setPeerMic(true);
              }}
            >
              Turn on
            </Button>
          </div>
        </Modal>
      </>
    );
  }

  if (duo.remoteMicOn === false) {
    return (
      <span className="call-panel-status">{name} mic: Muted</span>
    );
  }

  return (
    <button
      type="button"
      className={compact ? 'call-panel-btn is-end' : 'call-panel-mute-big'}
      onClick={() => duo.setPeerMic(false)}
      title={`Mute ${name}'s microphone`}
    >
      <VolumeX size={compact ? 14 : 18} /> Mute {name}&apos;s mic
    </button>
  );
}

/**
 * The small offer control in Chat and Study. It deliberately never looks or
 * reads like a call: tapping it opens a purchase confirmation, and the session
 * only starts after "Buy".
 *
 * During a session the same control opens the same three controls in a sheet.
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
  const name = otherName(duo.user?.role);
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
            className={`call-option ${duo.micMutedByPeer ? 'is-on' : ''}`}
            onClick={duo.toggleMic}
            disabled={duo.micMutedByPeer}
          >
            <span className="call-option-label">
              {duo.micMutedByPeer
                ? `Your mic is disabled by ${name}`
                : duo.micOn
                  ? 'Mute my mic'
                  : 'Unmute my mic'}
            </span>
            <span className="call-option-hint">
              {duo.micMutedByPeer
                ? 'Only they can grant it again — send a request'
                : duo.micOn
                  ? 'Stop sending your voice'
                  : 'Start sending your voice'}
            </span>
          </button>

          <div className="call-option">
            <span className="call-option-label">Speaker</span>
            <div className="call-option-row mt-1">
              <button
                type="button"
                className={`call-panel-btn ${duo.audioOutput === 'EARPIECE' ? 'is-on' : ''}`}
                onClick={() => duo.setAudioOutput('EARPIECE')}
              >
                Earpiece
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
                className={`call-panel-btn ${duo.audioOutput === 'BLUETOOTH' ? 'is-on' : ''}`}
                onClick={() => duo.setAudioOutput('BLUETOOTH')}
              >
                Bluetooth
              </button>
            </div>
          </div>

          <div className="call-option">
            <span className="call-option-label">
              {name}&apos;s microphone:{' '}
              {!duo.remotePermissionOn
                ? 'Disabled by you'
                : duo.remoteMicOn === false
                  ? 'Muted'
                  : 'Active'}
            </span>
            <div className="call-option-row mt-1">
              <RemoteMicControl compact />
            </div>
          </div>

          {duo.callMuted && (
            <button type="button" className="call-option" onClick={duo.resumeListening}>
              <span className="call-option-label">Unmute audio</span>
              <span className="call-option-hint">Start hearing the session again</span>
            </button>
          )}

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
 * In-session panel with exactly three controls on both sides:
 * 1. Mic — this side's own microphone.
 * 2. Speaker — output routing (Earpiece / Speaker / Bluetooth).
 * 3. Remote mic control — allow or disable the other participant's mic.
 */
export function CallPanel() {
  const duo = useDuo();
  const state = duo.callState;
  const active =
    state === 'ACTIVE' || state === 'CONNECTING' || state === 'RECONNECTING';
  if (!active) return null;

  const isHost = duo.user?.role === 'HOST';
  const name = otherName(duo.user?.role);
  const ownStatus = duo.micMutedByPeer ? `Disabled by ${name}` : duo.micOn ? 'Active' : 'Muted';
  const remoteStatus = !duo.remotePermissionOn
    ? 'Disabled by you'
    : duo.remoteMicOn === false
      ? 'Muted'
      : 'Active';

  return (
    <div className="call-panel" role="group" aria-label="Session controls">
      <div className="call-panel-status-row">
        <span>Your mic: {ownStatus}</span>
        <span>
          {name} mic: {remoteStatus}
        </span>
        {state === 'RECONNECTING' && <span className="call-panel-status">Reconnecting…</span>}
      </div>

      <div className="call-panel-actions">
        <button
          type="button"
          className={`call-panel-btn ${!duo.micOn ? 'is-on' : ''}`}
          onClick={duo.toggleMic}
          disabled={duo.micMutedByPeer}
          title={
            duo.micMutedByPeer
              ? `${name} disabled your microphone. Only they can grant it again.`
              : undefined
          }
        >
          {duo.micOn ? <Mic size={14} /> : <MicOff size={14} />}
          {duo.micMutedByPeer ? 'Mic disabled' : duo.micOn ? 'Mute mic' : 'Unmute mic'}
        </button>

        <span className="call-panel-speaker" role="group" aria-label="Speaker output">
          <button
            type="button"
            className={`call-panel-btn ${duo.audioOutput === 'EARPIECE' ? 'is-on' : ''}`}
            onClick={() => duo.setAudioOutput('EARPIECE')}
          >
            Earpiece
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
            className={`call-panel-btn ${duo.audioOutput === 'BLUETOOTH' ? 'is-on' : ''}`}
            onClick={() => duo.setAudioOutput('BLUETOOTH')}
          >
            Bluetooth
          </button>
        </span>

        <RemoteMicControl />

        {duo.callMuted && (
          <button
            type="button"
            className="call-panel-btn is-on"
            onClick={duo.resumeListening}
          >
            Unmute audio
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
 * The other side asked for audio. Answering here is the only way their audio
 * state changes; nothing is forced.
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
