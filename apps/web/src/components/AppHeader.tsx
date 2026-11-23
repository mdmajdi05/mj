'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  Gamepad2,
  LogIn,
  LogOut,
  Mic,
  MicOff,
  Settings,
  Shield,
  Ticket,
  UserPlus
} from 'lucide-react';
import { useDuo } from '@/hooks/useDuoApp';
import { Badge } from '@/components/ui';
import { NotificationBell } from '@/components/NotificationBell';

/**
 * Minimal, mobile-first header. On the games home it contains only the brand
 * and the profile button.
 */
export function AppHeader() {
  const duo = useDuo();
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function close(event: MouseEvent) {
      const target = event.target as Node;
      if (profileRef.current && !profileRef.current.contains(target)) setProfileOpen(false);
    }
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const inPrivateSurface = duo.screen === 'CHAT' || duo.screen === 'STUDY';

  const callActive =
    duo.callState === 'ACTIVE' ||
    duo.callState === 'CONNECTING' ||
    duo.callState === 'RECONNECTING';

  return (
    <header className="app-header mb-4 flex items-center justify-between gap-3 py-2">
      <button
        className="flex items-center gap-3 text-left"
        onClick={() => duo.navigate('HOME')}
        aria-label="Games home"
      >
        <span className="logo-mark small">
          <svg viewBox="0 0 64 56" className="h-6 w-6" aria-hidden="true">
            <defs>
              <linearGradient id="header-wing" x1="0" x2="1" y1="0" y2="1">
                <stop offset="0%" stopColor="#c084fc" />
                <stop offset="55%" stopColor="#e879f9" />
                <stop offset="100%" stopColor="#60a5fa" />
              </linearGradient>
            </defs>
            <path
              d="M30 27C18 8 4 5 3 16c-1 10 9 17 24 18-12 5-17 14-9 18 7 4 14-5 14-12Zm4 0C46 8 60 5 61 16c1 10-9 17-24 18 12 5 17 14 9 18-7 4-14-5-14-12Z"
              fill="url(#header-wing)"
            />
            <ellipse cx="32" cy="29" rx="2.4" ry="10" fill="#f5d0fe" />
          </svg>
        </span>
        <span className="text-sm font-semibold tracking-[0.14em] text-white">
          STUDY WITH GAME
        </span>
      </button>

      <div className="flex items-center gap-2">
        <NotificationBell />
        <div className="relative" ref={profileRef}>
          <button
            className="btn btn-profile"
            onClick={() => setProfileOpen((value) => !value)}
            aria-expanded={profileOpen}
            aria-label="Profile menu"
          >
            <span className="avatar">
              {duo.user
                ? (duo.user.displayName || duo.user.username).charAt(0).toUpperCase()
                : '?'}
            </span>
            <span className="hidden text-sm sm:inline">
              {duo.user ? duo.user.displayName || duo.user.username : 'Log in'}
            </span>
            <ChevronDown size={14} />
          </button>

          {profileOpen && (
            <div className="panel dropdown-panel w-64 p-2">
              {!duo.user ? (
                <>
                  <div className="px-3 py-2">
                    <p className="text-sm font-semibold">Welcome</p>
                    <p className="muted mt-0.5 text-xs">Log in or create an account to save progress and chat.</p>
                  </div>
                  <div className="my-1 h-px bg-white/10" />
                  <MenuItem
                    icon={<LogIn size={16} />}
                    label="Log in"
                    onClick={() => {
                      setProfileOpen(false);
                      duo.openAuth();
                    }}
                  />
                  <MenuItem
                    icon={<UserPlus size={16} />}
                    label="Sign up"
                    onClick={() => {
                      setProfileOpen(false);
                      duo.openAuth();
                    }}
                  />
                </>
              ) : (
                <>
              <div className="px-3 py-2">
                <p className="text-sm font-semibold">
                  {duo.user.displayName || duo.user.username}
                </p>
                <p className="muted mt-0.5 text-xs">
                  @{duo.user.username} · {duo.user.role === 'HOST' ? 'Host / Administrator' : 'Guest'}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <Badge tone="accent">Study + Games</Badge>
                </div>
              </div>
              <div className="my-1 h-px bg-white/10" />
              <MenuItem
                icon={<Ticket size={16} />}
                label="Enter Code"
                onClick={() => {
                  setProfileOpen(false);
                  duo.navigate('PROMO');
                }}
              />
              <MenuItem
                icon={<Gamepad2 size={16} />}
                label="Games"
                onClick={() => {
                  setProfileOpen(false);
                  duo.navigate('HOME');
                }}
              />
              {inPrivateSurface && duo.user?.role === 'GUEST' && (
                <button
                  className="nav-item flex w-full items-center gap-3 text-left"
                  onClick={() => duo.setGuestMicConsent(!duo.guestMicConsent)}
                >
                  {duo.guestMicConsent ? <Mic size={16} /> : <MicOff size={16} />}
                  <span className="flex-1">Allow listening</span>
                  <span
                    className={`rounded-full px-1.5 text-[10px] ${
                      duo.guestMicConsent ? 'bg-emerald-500/20 text-emerald-200' : 'bg-white/10'
                    }`}
                  >
                    {duo.guestMicConsent ? 'ON' : 'OFF'}
                  </span>
                </button>
              )}
              {inPrivateSurface && callActive && duo.user?.role === 'HOST' && (
                <button
                  className="nav-item flex w-full items-center gap-3 text-left text-rose-200"
                  onClick={() => {
                    setProfileOpen(false);
                    duo.hangup();
                  }}
                >
                  <LogOut size={16} />
                  End session
                </button>
              )}
              <MenuItem
                icon={<Settings size={16} />}
                label="Settings"
                onClick={() => {
                  setProfileOpen(false);
                  duo.navigate('SETTINGS');
                }}
              />
              {duo.user?.role === 'HOST' && (
                <MenuItem
                  icon={<Shield size={16} />}
                  label="Admin Dashboard"
                  onClick={() => {
                    setProfileOpen(false);
                    duo.navigate('ADMIN');
                  }}
                />
              )}
              <div className="my-1 h-px bg-white/10" />
              <button
                className="nav-item flex w-full items-center gap-3 text-left text-rose-200"
                onClick={() => void duo.logout()}
              >
                <LogOut size={16} />
                Logout
              </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function MenuItem({
  icon,
  label,
  onClick
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button className="nav-item flex w-full items-center gap-3 text-left" onClick={onClick}>
      {icon}
      {label}
    </button>
  );
}
