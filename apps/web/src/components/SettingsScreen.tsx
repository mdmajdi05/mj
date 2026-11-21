'use client';

import { useState } from 'react';
import {
  BellOff,
  KeyRound,
  LogOut,
  ShieldCheck,
  Smartphone,
  Volume2
} from 'lucide-react';
import { useDuo } from '@/hooks/useDuoApp';
import { Button, Field, Panel, SectionTitle, Toggle } from '@/components/ui';

export function SettingsScreen() {
  const duo = useDuo();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState('');
  const peerLabel = duo.user?.role === 'HOST' ? 'User' : 'Host';

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

  return (
    <>
      <SectionTitle
        eyebrow="Your preferences"
        title="Settings"
        description="Notifications, appearance and account security."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel className="p-5">
          <p className="eyebrow">Notifications</p>
          <h3 className="mt-1 text-lg font-semibold">Butterfly, sound & Chrome push</h3>
          {!duo.prefs.notificationsAvailable ? (
            <div className="mt-3 rounded-xl border border-white/10 bg-black/15 p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <BellOff size={16} className="text-amber-300" /> Notifications are disabled
              </div>
              <p className="muted mt-2 text-xs leading-5">
                The Host has turned off notifications for every account. No message or update will
                send a notification, and these options stay hidden until the Host enables them
                again.
              </p>
              {duo.user?.role === 'HOST' && (
                <p className="muted mt-2 text-xs leading-5">
                  Turn them back on from Admin Dashboard → User features → Notification
                  availability.
                </p>
              )}
            </div>
          ) : !duo.prefs.chatNotifications ? (
            <div className="mt-3 rounded-xl border border-white/10 bg-black/15 p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <BellOff size={16} className="text-amber-300" /> Notifications are disabled
              </div>
              <p className="muted mt-2 text-xs leading-5">
                The Host has turned off chat notifications for this account. Notification options
                become available again only when the Host grants access.
              </p>
            </div>
          ) : (
            <>
              <div className="divide-y divide-white/5">
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
                  label="Chrome push notifications"
                  description="Get a Chrome notification for every new message or update, even when this tab is closed. Only generic copy is shown — never the message text or sender."
                  checked={duo.prefs.browser}
                  onChange={() =>
                    void (duo.prefs.browser
                      ? duo.disableBrowserNotifications()
                      : duo.enableBrowserNotifications())
                  }
                />
                <Toggle
                  label="Reduced motion"
                  description="Disables butterfly flight and shortens animations. The Study Assistant response appears without the long streaming animation."
                  checked={duo.prefs.reducedMotion}
                  onChange={() => void duo.updatePreference({ reducedMotion: !duo.prefs.reducedMotion })}
                />
              </div>
              {!duo.prefs.pushConfigured && (
                <p className="mt-3 rounded-lg border border-amber-400/20 bg-amber-400/10 p-2 text-xs leading-5 text-amber-200">
                  Background push is not configured on the server (VAPID keys are missing). In-page
                  notifications still work while the tab is open.
                </p>
              )}
            </>
          )}
        </Panel>

        <Panel className="p-5">
          <p className="eyebrow">Account</p>
          <h3 className="mt-1 text-lg font-semibold">Profile & security</h3>
          <div className="mt-3 rounded-xl border border-white/10 bg-black/15 p-3 text-sm">
            <p>
              <span className="muted">Name:</span> {duo.user?.username}
            </p>
            <p className="mt-1">
              <span className="muted">Role:</span>{' '}
              {duo.user?.role === 'HOST' ? 'Host / Administrator' : 'Guest'}
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
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              hint="Any length is accepted. Other sessions will be signed out."
              required
            />
            <Button variant="primary" disabled={passwordBusy || !currentPassword || !newPassword}>
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
          <p className="eyebrow">Activity privacy</p>
          <div className="mt-2">
            <Toggle
              label="Share game activity"
              description="Only when enabled: a generic event is sent when you start or finish a game. Clear and revocable."
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
          <p className="eyebrow">Device note</p>
          <div className="muted mt-2 flex items-start gap-2 text-xs leading-5">
            <Smartphone size={16} className="mt-0.5 shrink-0 text-sky-300" />
            <span>
              Audio and install features need HTTPS outside localhost. A reachable TURN service
              improves connections across restrictive mobile networks.
            </span>
          </div>
          <div className="muted mt-3 flex items-center gap-2 text-xs">
            <Volume2 size={15} /> Sound follows your notification preference and browser autoplay
            rules.
          </div>
          <div className="mt-4 flex items-center gap-2">
            <ShieldCheck size={15} className="text-emerald-300" />
            <span className="muted text-xs">Your session is protected by an HttpOnly cookie.</span>
          </div>
          <Button className="mt-4 w-full" variant="danger" onClick={() => void duo.logout()}>
            <LogOut size={15} /> Logout
          </Button>
        </Panel>
      </div>

      <Panel className="mt-4 p-5">
        <p className="eyebrow">Call defaults</p>
        <h3 className="mt-1 text-lg font-semibold">Microphone at call start</h3>
        <div className="mt-2">
          <Toggle
            label={`${peerLabel}'s microphone starts ON`}
            description={`Applies to every new session. When off, ${peerLabel}'s microphone starts disabled and only you can grant it again.`}
            checked={duo.prefs.defaultPeerMicOn}
            onChange={() =>
              void duo.updatePreference({
                defaultPeerMicOn: !duo.prefs.defaultPeerMicOn
              })
            }
          />
        </div>
        <p className="muted mt-2 text-xs leading-5">
          Your own microphone always starts as you left it and is never muted automatically. You
          can change the other participant&apos;s microphone during a session at any time.
        </p>
      </Panel>
    </>
  );
}
