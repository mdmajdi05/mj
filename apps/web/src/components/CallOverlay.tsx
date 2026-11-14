'use client';

import {
  EyeOff,
  Mic,
  MicOff,
  Phone,
  PhoneCall,
  PhoneOff,
  RotateCcw,
  ShieldCheck
} from 'lucide-react';
import { useDuo } from '@/hooks/useDuoApp';
import { formatDuration } from '@/lib/utils';
import { Badge, Button } from '@/components/ui';

export function CallOverlay() {
  const duo = useDuo();
  const active = duo.callState !== 'IDLE' && duo.callState !== 'ENDED';
  const incoming = Boolean(duo.incomingCall);

  const guestCanMuteHost = duo.permissions.some(
    (permission) =>
      permission.name === 'REMOTE_MIC_CONTROL' &&
      permission.status === 'GRANTED' &&
      permission.requestedBy === duo.user?.id
  );
  const hostCanControlGuest = duo.permissions.some(
    (permission) =>
      permission.name === 'REMOTE_MIC_CONTROL' &&
      permission.status === 'GRANTED' &&
      permission.requestedBy === duo.user?.id
  );

  if (!active && !incoming) return null;

  if (duo.callHidden) {
    return (
      <div className="call-pill">
        <span className="call-pill-dot" />
        <span className="text-xs font-medium">
          Call running · {formatDuration(duo.callSeconds)}
        </span>
        <Button className="!px-2 !py-1 text-[11px]" onClick={duo.returnToCall}>
          Return
        </Button>
      </div>
    );
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Audio call">
      <div className="panel call-card w-full max-w-sm p-6 text-center">
        <div className={`call-avatar ${duo.callState === 'ACTIVE' ? 'pulse' : ''}`}>
          <Phone size={26} />
        </div>

        <h3 className="mt-4 text-xl font-semibold">
          {incoming
            ? 'Incoming audio call'
            : duo.callState === 'CONNECTING'
              ? 'Connecting call…'
              : duo.callState === 'RECONNECTING'
                ? 'Reconnecting…'
                : 'Audio call'}
        </h3>

        <p className="muted mt-2 text-sm">
          {incoming
            ? `${duo.incomingCall?.from || 'The other participant'} is calling you.`
            : duo.callState === 'ACTIVE'
              ? `${formatDuration(duo.callSeconds)} · Connected`
              : 'Microphone permission is controlled by your browser and device.'}
        </p>

        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <Badge tone={duo.micOn ? 'good' : 'neutral'}>
            {duo.micOn ? <Mic size={11} className="mr-1 inline" /> : <MicOff size={11} className="mr-1 inline" />}
            Your mic: {duo.micOn ? 'On' : 'Muted'}
          </Badge>
          <Badge tone={duo.remoteMicOn === null ? 'neutral' : duo.remoteMicOn ? 'good' : 'warn'}>
            Other mic: {duo.remoteMicOn === null ? 'Unknown' : duo.remoteMicOn ? 'On' : 'Muted'}
          </Badge>
        </div>

        {incoming ? (
          <div className="mt-5 flex justify-center gap-2">
            <Button variant="danger" onClick={duo.declineIncoming}>
              <PhoneOff size={16} /> Decline
            </Button>
            <Button variant="primary" onClick={() => void duo.acceptCall()}>
              <PhoneCall size={16} /> Accept
            </Button>
          </div>
        ) : (
          <>
            {duo.callState === 'ACTIVE' && (
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <Button onClick={duo.toggleMic}>
                  {duo.micOn ? <MicOff size={15} /> : <Mic size={15} />}
                  {duo.micOn ? 'Mute me' : 'Unmute me'}
                </Button>

                {duo.user?.role === 'GUEST' && guestCanMuteHost && (
                  <Button onClick={() => duo.remoteMic(false)}>
                    <MicOff size={15} /> Mute Host mic
                  </Button>
                )}

                {duo.user?.role === 'HOST' && hostCanControlGuest && (
                  <>
                    <Button onClick={() => duo.remoteMic(false)}>
                      <MicOff size={15} /> Mute Guest mic
                    </Button>
                    <Button onClick={() => duo.remoteMic(true)}>
                      <Mic size={15} /> Unmute Guest mic
                    </Button>
                  </>
                )}

                <Button onClick={duo.hideCall} title="Keep the call running with sound disabled">
                  <EyeOff size={15} /> Hide call
                </Button>
              </div>
            )}

            {duo.callState === 'RECONNECTING' && (
              <Button className="mt-5" onClick={() => window.location.reload()}>
                <RotateCcw size={15} /> Reload if reconnecting fails
              </Button>
            )}

            <Button
              variant="danger"
              className="mt-4 w-full"
              onClick={duo.hangup}
            >
              <PhoneOff size={16} />
              {duo.user?.role === 'HOST' ? 'End call for both' : 'Leave call'}
            </Button>

            <p className="muted mt-3 flex items-center justify-center gap-1.5 text-[11px] leading-5">
              <ShieldCheck size={13} className="text-emerald-300" />
              Remote microphone controls require explicit, revocable consent.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
