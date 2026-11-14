'use client';

import { useEffect, useState } from 'react';
import {
  Bell,
  BellOff,
  Check,
  Clock,
  KeyRound,
  LogOut,
  Mic,
  Phone,
  ShieldCheck,
  Smartphone,
  Volume2,
  X
} from 'lucide-react';
import { api } from '@/lib/api';
import { useDuo } from '@/hooks/useDuoApp';
import type { CallRecord } from '@/lib/types';
import { formatDateTime, formatDuration, eventLabel } from '@/lib/utils';
import { Badge, Button, Field, Panel, SectionTitle, Toggle } from '@/components/ui';

export function SettingsScreen() {
  const duo = useDuo();
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState('');
  const [permissionBusy, setPermissionBusy] = useState('');

  useEffect(() => {
    let alive = true;
    api<CallRecord[]>('/chat/calls')
      .then((rows) => {
        if (alive) setCalls(rows);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    setPasswordBusy(true);
    setPasswordMessage('');
    try {
      const result = await duo.changePassword(currentPassword, newPassword);
      setPasswordMessage(result.message);
      setCurrentPassword('');
      setNewPassword('');
    } catch (cause) {
      setPasswordMessage(cause instanceof Error ? cause.message : 'Password change failed');
    } finally {
      setPasswordBusy(false);
    }
  }

  async function act(id: string, action: 'approve' | 'reject' | 'revoke') {
    setPermissionBusy(id + action);
    try {
      await duo.permissionAction(id, action);
    } catch (cause) {
      duo.setError(cause instanceof Error ? cause.message : 'Permission update failed');
    } finally {
      setPermissionBusy('');
    }
  }

  const incomingRequests = duo.permissions.filter(
    (permission) =>
      permission.status === 'REQUESTED' && permission.requestedBy !== duo.user?.id
  );

  return (
    <>
      <SectionTitle
        eyebrow="Your preferences"
        title="Settings & Permissions"
        description="Notifications, privacy, account security and consent-based microphone controls."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel className="p-5">
          <p className="eyebrow">Notifications</p>
          <h3 className="mt-1 text-lg font-semibold">Butterfly & sound</h3>
          <div className="mt-2 divide-y divide-white/5">
            <Toggle
              label="Butterfly notifications"
              description="A discreet butterfly flies across the screen. It never shows message text or sender details."
              checked={duo.prefs.butterfly}
              onChange={() => void duo.updatePreference({ butterfly: !duo.prefs.butterfly })}
            />
            <Toggle
              label="Notification sound"
              description="A short soft tone when a new message arrives. Browser autoplay rules can delay sound until you interact with the page."
              checked={duo.prefs.sound}
              onChange={() => void duo.updatePreference({ sound: !duo.prefs.sound })}
            />
            <Toggle
              label="Reduced motion"
              description="Disables butterfly flight and shortens animations. The Study Assistant response appears without the long streaming animation."
              checked={duo.prefs.reducedMotion}
              onChange={() => void duo.updatePreference({ reducedMotion: !duo.prefs.reducedMotion })}
            />
          </div>

          <div className="mt-4 rounded-xl border border-white/10 bg-black/15 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Browser notifications</p>
                <p className="muted mt-1 text-xs leading-5">
                  Generic copy only: “You have a new message.” Background push depends on browser,
                  HTTPS, OS and installed service worker support.
                </p>
              </div>
              <Badge tone={duo.prefs.browser ? 'good' : 'neutral'}>
                {duo.prefs.browser ? 'Enabled' : 'Off'}
              </Badge>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {duo.prefs.browser ? (
                <Button onClick={() => void duo.disableBrowserNotifications()}>
                  <BellOff size={15} /> Disable browser notifications
                </Button>
              ) : (
                <Button variant="primary" onClick={() => void duo.enableBrowserNotifications()}>
                  <Bell size={15} /> Enable browser notifications
                </Button>
              )}
            </div>
          </div>
        </Panel>

        <Panel className="p-5">
          <p className="eyebrow">Account</p>
          <h3 className="mt-1 text-lg font-semibold">Profile & security</h3>
          <div className="mt-3 rounded-xl border border-white/10 bg-black/15 p-3 text-sm">
            <p>
              <span className="muted">Username:</span> {duo.user?.username}
            </p>
            <p className="mt-1">
              <span className="muted">Role:</span>{' '}
              {duo.user?.role === 'HOST' ? 'Host / Administrator' : 'Guest'}
            </p>
            <p className="mt-1">
              <span className="muted">Chat access:</span>{' '}
              {duo.user?.role === 'HOST' || duo.user?.chatUnlocked ? 'Unlocked' : 'Locked'}
            </p>
            <p className="mt-1">
              <span className="muted">Session:</span> HttpOnly cookie, expires automatically
            </p>
          </div>

          <form onSubmit={changePassword} className="mt-4 space-y-3">
            <p className="flex items-center gap-2 text-sm font-medium">
              <KeyRound size={15} /> Change password
            </p>
            <Field
              label="Current password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
            />
            <Field
              label="New password"
              type="password"
              autoComplete="new-password"
              minLength={10}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              hint="At least 10 characters. Other sessions will be signed out."
              required
            />
            <Button variant="primary" disabled={passwordBusy}>
              {passwordBusy ? 'Saving…' : 'Update password'}
            </Button>
            {passwordMessage && (
              <p className="muted text-xs leading-5" role="status">
                {passwordMessage}
              </p>
            )}
          </form>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.05fr_.95fr]">
        <Panel className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="eyebrow">Permissions</p>
              <h3 className="mt-1 text-lg font-semibold">Consent-based controls</h3>
            </div>
            <ShieldCheck size={22} className="text-emerald-300" />
          </div>

          {incomingRequests.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-sm font-medium text-amber-100">Waiting for your decision</p>
              {incomingRequests.map((permission) => (
                <div key={permission.id} className="rounded-xl border border-amber-400/20 bg-amber-950/15 p-3">
                  <p className="text-sm font-medium">{permission.name.replaceAll('_', ' ')}</p>
                  <p className="muted mt-1 text-xs leading-5">{permission.description}</p>
                  <p className="muted mt-1 text-[11px]">
                    Requested by {permission.requester?.username || 'participant'} ·{' '}
                    {formatDateTime(permission.createdAt)}
                  </p>
                  <div className="mt-2 flex gap-2">
                    <Button
                      variant="primary"
                      onClick={() => void act(permission.id, 'approve')}
                      disabled={permissionBusy !== ''}
                    >
                      <Check size={14} /> Approve
                    </Button>
                    <Button
                      variant="danger"
                      onClick={() => void act(permission.id, 'reject')}
                      disabled={permissionBusy !== ''}
                    >
                      <X size={14} /> Reject
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 space-y-2">
            {duo.permissions.map((permission) => (
              <div key={permission.id} className="rounded-xl border border-white/5 bg-black/15 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">{permission.name.replaceAll('_', ' ')}</p>
                  <Badge
                    tone={
                      permission.status === 'GRANTED'
                        ? 'good'
                        : permission.status === 'REQUESTED'
                          ? 'warn'
                          : permission.status === 'REJECTED'
                            ? 'bad'
                            : 'neutral'
                    }
                  >
                    {permission.status}
                  </Badge>
                </div>
                <p className="muted mt-1 text-xs leading-5">{permission.description}</p>
                <p className="muted mt-1 text-[11px]">
                  Requested by {permission.requester?.username || 'participant'}
                  {permission.grantor?.username ? ` · Granted by ${permission.grantor.username}` : ''}
                  {permission.grantedAt ? ` · ${formatDateTime(permission.grantedAt)}` : ''}
                  {permission.rejectedAt ? ` · Rejected ${formatDateTime(permission.rejectedAt)}` : ''}
                  {permission.revokedAt ? ` · Revoked ${formatDateTime(permission.revokedAt)}` : ''}
                </p>
                {permission.status === 'GRANTED' &&
                  (permission.requestedBy === duo.user?.id ||
                    permission.grantedBy === duo.user?.id ||
                    duo.user?.role === 'HOST') && (
                    <Button
                      className="mt-2"
                      variant="danger"
                      onClick={() => void act(permission.id, 'revoke')}
                      disabled={permissionBusy !== ''}
                    >
                      <X size={14} /> Revoke
                    </Button>
                  )}
              </div>
            ))}
            {!duo.permissions.length && (
              <p className="muted py-4 text-sm">No permission records yet.</p>
            )}
          </div>

          <div className="mt-4 rounded-xl border border-white/10 bg-black/15 p-3">
            <p className="flex items-center gap-2 text-sm font-medium">
              <Mic size={15} /> Microphone consent
            </p>
            <p className="muted mt-1 text-xs leading-5">
              Browser microphone permission is controlled by your device and OS. The app never
              activates a microphone silently.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {duo.user?.role === 'GUEST' ? (
                <>
                  <Button
                    onClick={() =>
                      void duo.requestPermission(
                        'REMOTE_MIC_CONTROL',
                        'Allow Host to request remote microphone mute/unmute during an active call.',
                        false
                      )
                    }
                  >
                    <Mic size={15} /> Allow Host mic control
                  </Button>
                  <Button
                    onClick={() =>
                      void duo.requestPermission(
                        'REMOTE_MIC_CONTROL',
                        'Ask Host for permission to mute the Host microphone during a call.',
                        true
                      )
                    }
                  >
                    Request Host mic permission
                  </Button>
                </>
              ) : (
                <Button
                  onClick={() =>
                    void duo.requestPermission(
                      'REMOTE_MIC_CONTROL',
                      'Allow Host to request remote microphone mute/unmute during an active call.',
                      true
                    )
                  }
                >
                  <Mic size={15} /> Ask Guest for mic control
                </Button>
              )}
            </div>
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel className="p-5">
            <p className="eyebrow">Activity privacy</p>
            <div className="mt-2">
              <Toggle
                label="Share game activity with Host"
                description="Only when enabled: Host receives a generic event that you started or finished a game. Clear and revocable."
                checked={duo.prefs.activitySharing}
                onChange={() =>
                  void duo.updatePreference({ activitySharing: !duo.prefs.activitySharing })
                }
              />
            </div>
            <p className="muted mt-2 text-xs leading-5">
              This does not share message content, keystrokes or microphone audio.
            </p>
          </Panel>

          <Panel className="p-5">
            <p className="eyebrow">Call history</p>
            <h3 className="mt-1 text-lg font-semibold">Recent audio calls</h3>
            <div className="mt-3 space-y-2">
              {calls.slice(0, 6).map((call) => (
                <div
                  key={call.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-black/15 p-3"
                >
                  <div className="flex items-center gap-2">
                    <span className="rounded-lg bg-white/5 p-1.5 text-fuchsia-200">
                      <Phone size={13} />
                    </span>
                    <div>
                      <p className="text-sm">{eventLabel(call.status)}</p>
                      <p className="muted text-[11px]">
                        {formatDateTime(call.startedAt)}
                        {call.endedAt ? ` · ${callDuration(call)}` : ''}
                      </p>
                    </div>
                  </div>
                  <Badge
                    tone={
                      call.status === 'ACTIVE'
                        ? 'good'
                        : call.status === 'RINGING'
                          ? 'warn'
                          : 'neutral'
                    }
                  >
                    {call.status}
                  </Badge>
                </div>
              ))}
              {!calls.length && <p className="muted py-3 text-sm">No calls yet.</p>}
            </div>
          </Panel>

          <Panel className="p-5">
            <p className="eyebrow">Device note</p>
            <div className="muted mt-2 flex items-start gap-2 text-xs leading-5">
              <Smartphone size={16} className="mt-0.5 shrink-0 text-sky-300" />
              <span>
                Audio calling needs HTTPS outside localhost and microphone permission. A reachable
                TURN service improves calls across restrictive mobile networks.
              </span>
            </div>
            <div className="muted mt-3 flex items-center gap-2 text-xs">
              <Volume2 size={15} /> Sound follows your notification preference and browser autoplay
              rules.
            </div>
            <Button className="mt-4 w-full" variant="danger" onClick={() => void duo.logout()}>
              <LogOut size={15} /> Logout
            </Button>
          </Panel>
        </div>
      </div>

      <div className="muted mt-4 flex items-center gap-2 text-xs">
        <Clock size={14} /> Permission timestamps and status are recorded server-side.
      </div>
    </>
  );
}

function callDuration(call: CallRecord) {
  if (!call.endedAt) return 'In progress';
  const seconds = Math.max(
    0,
    Math.round(
      (new Date(call.endedAt).getTime() - new Date(call.startedAt).getTime()) / 1000
    )
  );
  return formatDuration(seconds);
}
