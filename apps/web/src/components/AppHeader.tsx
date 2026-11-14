'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Bell,
  BookOpen,
  ChevronDown,
  Gamepad2,
  Home,
  Inbox,
  LogOut,
  MessageCircle,
  Settings,
  Shield,
  Ticket,
  Wifi,
  WifiOff
} from 'lucide-react';
import { useDuo } from '@/hooks/useDuoApp';
import type { Screen } from '@/lib/types';
import { formatDateTime, eventLabel } from '@/lib/utils';
import { Badge, Button } from '@/components/ui';

export function AppHeader() {
  const duo = useDuo();
  const [profileOpen, setProfileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement | null>(null);
  const notificationsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function close(event: MouseEvent) {
      const target = event.target as Node;
      if (profileRef.current && !profileRef.current.contains(target)) setProfileOpen(false);
      if (notificationsRef.current && !notificationsRef.current.contains(target)) {
        setNotificationsOpen(false);
      }
    }
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  function go(screen: Screen) {
    setProfileOpen(false);
    setNotificationsOpen(false);
    duo.navigate(screen);
  }

  return (
    <header className="mb-5 flex items-center justify-between gap-3 py-2">
      <button className="flex items-center gap-3 text-left" onClick={() => go('HOME')}>
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
        <span>
          <span className="block text-sm font-semibold tracking-[0.18em] text-white">
            PRIVATE DUO
          </span>
          <span className="muted flex items-center gap-1.5 text-[11px]">
            {duo.otherOnline ? <Wifi size={12} className="text-emerald-300" /> : <WifiOff size={12} />}
            {duo.otherOnline ? 'Other participant online' : 'Other participant offline'}
          </span>
        </span>
      </button>

      <div className="flex items-center gap-2">
        <div className="relative" ref={notificationsRef}>
          <button
            className="icon-btn relative"
            aria-label="Notifications"
            onClick={() => setNotificationsOpen((value) => !value)}
          >
            <Bell size={18} />
            {duo.totalNotifications > 0 && (
              <span className="notification-dot">
                {Math.min(duo.totalNotifications, 99)}
              </span>
            )}
          </button>
          {notificationsOpen && (
            <div className="panel dropdown-panel w-[min(92vw,22rem)] p-3">
              <div className="flex items-center justify-between px-2 pb-2">
                <p className="text-sm font-semibold">Notifications</p>
                <button
                  className="text-xs text-fuchsia-300 hover:text-fuchsia-200"
                  onClick={() => void duo.markNotificationsRead()}
                >
                  Mark all read
                </button>
              </div>
              <div className="max-h-80 space-y-1 overflow-auto">
                {duo.notifications.slice(0, 12).map((notification) => (
                  <button
                    key={notification.id}
                    className="w-full rounded-xl px-3 py-2 text-left transition hover:bg-white/5"
                    onClick={() => {
                      if (notification.eventType === 'NEW_MESSAGE') go('CHAT');
                      else if (notification.eventType === 'GAME_MESSAGE') go('INBOX');
                      else go('HOME');
                    }}
                  >
                    <p className="flex items-center gap-2 text-sm">
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          notification.readAt ? 'bg-white/20' : 'bg-fuchsia-400'
                        }`}
                      />
                      {eventLabel(notification.eventType)}
                    </p>
                    <p className="muted mt-0.5 text-[11px]">
                      {notification.actor?.username || 'System'} ·{' '}
                      {formatDateTime(notification.createdAt)}
                    </p>
                  </button>
                ))}
                {!duo.notifications.length && (
                  <p className="muted px-3 py-6 text-center text-sm">No notifications yet.</p>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="relative" ref={profileRef}>
          <button
            className="btn btn-profile"
            onClick={() => setProfileOpen((value) => !value)}
            aria-expanded={profileOpen}
          >
            <span className="avatar">{duo.user?.role === 'HOST' ? 'H' : 'G'}</span>
            <span className="hidden text-sm sm:inline">{duo.user?.username}</span>
            <ChevronDown size={14} />
          </button>

          {profileOpen && (
            <div className="panel dropdown-panel w-64 p-2">
              <div className="px-3 py-2">
                <p className="text-sm font-semibold">{duo.user?.username}</p>
                <p className="muted mt-0.5 text-xs">
                  {duo.user?.role === 'HOST' ? 'Host / Administrator' : 'Guest'}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <Badge tone={duo.user?.role === 'HOST' || duo.user?.chatUnlocked ? 'good' : 'warn'}>
                    {duo.user?.role === 'HOST' || duo.user?.chatUnlocked
                      ? 'Chat unlocked'
                      : 'Chat locked'}
                  </Badge>
                  <Badge tone="accent">Two-person space</Badge>
                </div>
              </div>
              <div className="my-1 h-px bg-white/10" />
              <MenuItem icon={<Gamepad2 size={16} />} label="Go to Game" onClick={() => go('GAMES')} />
              <MenuItem icon={<Ticket size={16} />} label="Enter Promo Code" onClick={() => go('PROMO')} />
              <MenuItem icon={<Settings size={16} />} label="Settings" onClick={() => go('SETTINGS')} />
              {duo.user?.role === 'HOST' && (
                <MenuItem icon={<Shield size={16} />} label="Admin Dashboard" onClick={() => go('ADMIN')} />
              )}
              <div className="my-1 h-px bg-white/10" />
              <button
                className="nav-item flex w-full items-center gap-3 text-left text-rose-200"
                onClick={() => void duo.logout()}
              >
                <LogOut size={16} />
                Logout
              </button>
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

const navItems: Array<{ screen: Screen; label: string; icon: React.ReactNode }> = [
  { screen: 'HOME', label: 'Home', icon: <Home size={16} /> },
  { screen: 'CHAT', label: 'Chat', icon: <MessageCircle size={16} /> },
  { screen: 'STUDY', label: 'Study', icon: <BookOpen size={16} /> },
  { screen: 'GAMES', label: 'Games', icon: <Gamepad2 size={16} /> },
  { screen: 'INBOX', label: 'Inbox', icon: <Inbox size={16} /> }
];

export function AppSidebar() {
  const duo = useDuo();
  return (
    <aside className="panel sticky top-4 hidden h-fit p-3 md:block">
      <p className="eyebrow px-3 py-2">Workspace</p>
      {navItems.map((item) => (
        <button
          key={item.screen}
          className={`nav-item flex w-full items-center gap-3 text-left ${
            duo.screen === item.screen ? 'active' : ''
          }`}
          onClick={() => duo.navigate(item.screen)}
        >
          {item.icon}
          {item.label}
          {item.screen === 'CHAT' && duo.unread > 0 && (
            <span className="ml-auto rounded-full bg-pink-500 px-1.5 text-[10px]">
              {duo.unread}
            </span>
          )}
          {item.screen === 'INBOX' && duo.inboxUnread > 0 && (
            <span className="ml-auto rounded-full bg-pink-500 px-1.5 text-[10px]">
              {duo.inboxUnread}
            </span>
          )}
        </button>
      ))}
      {duo.user?.role === 'HOST' && (
        <button
          className={`nav-item flex w-full items-center gap-3 text-left ${
            duo.screen === 'ADMIN' ? 'active' : ''
          }`}
          onClick={() => duo.navigate('ADMIN')}
        >
          <Shield size={16} />
          Admin
        </button>
      )}

      <div className="mt-4 rounded-2xl border border-white/5 bg-black/20 p-3">
        <div className="flex items-center gap-2 text-xs">
          <span
            className={`h-2 w-2 rounded-full ${
              duo.otherOnline ? 'bg-emerald-400' : 'bg-slate-500'
            }`}
          />
          {duo.otherOnline ? 'Participant online' : 'Waiting for participant'}
        </div>
        <p className="muted mt-1 text-[11px] leading-5">
          Notification previews never contain private message content.
        </p>
      </div>

      {duo.conversationStatus === 'ARCHIVED' && (
        <Button className="mt-3 w-full" onClick={() => duo.navigate('RESTORE')}>
          Restore chat
        </Button>
      )}
    </aside>
  );
}

export function AppMobileNav() {
  const duo = useDuo();
  return (
    <nav className="panel mb-4 grid grid-cols-5 gap-1 p-1 md:hidden">
      {navItems.map((item) => (
        <button
          key={item.screen}
          className={`mobile-nav-item ${duo.screen === item.screen ? 'active' : ''}`}
          onClick={() => duo.navigate(item.screen)}
        >
          {item.icon}
          <span>{item.label}</span>
          {item.screen === 'CHAT' && duo.unread > 0 && (
            <span className="mobile-badge">{duo.unread}</span>
          )}
          {item.screen === 'INBOX' && duo.inboxUnread > 0 && (
            <span className="mobile-badge">{duo.inboxUnread}</span>
          )}
        </button>
      ))}
    </nav>
  );
}
