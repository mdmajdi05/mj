'use client';

import {
  ArrowRight,
  Bell,
  BookOpen,
  Gamepad2,
  LockKeyhole,
  MessageCircle,
  Mic,
  Phone,
  ShieldCheck,
  Sparkles,
  Users
} from 'lucide-react';
import { useDuo } from '@/hooks/useDuoApp';
import { Badge, Button, Panel, SectionTitle } from '@/components/ui';
import { formatDateTime, eventLabel } from '@/lib/utils';

export function HomeScreen() {
  const duo = useDuo();
  const locked = duo.user?.role === 'GUEST' && !duo.user.chatUnlocked;

  const cards = [
    {
      title: 'Private Chat',
      description: locked
        ? 'Unlock with your shared promo code to open the conversation.'
        : 'Your one-to-one conversation, always private.',
      icon: <MessageCircle size={24} />,
      action: () => duo.navigate(locked ? 'PROMO' : 'CHAT'),
      label: locked ? 'Unlock chat' : 'Open chat',
      accent: 'from-fuchsia-500/20 to-purple-500/5'
    },
    {
      title: 'Study Mode',
      description: 'A calm space with the Study Assistant and no chat content on screen.',
      icon: <BookOpen size={24} />,
      action: () => duo.navigate('STUDY'),
      label: 'Open study mode',
      accent: 'from-sky-500/20 to-blue-500/5'
    },
    {
      title: 'Games',
      description: 'Three quick games, scores and a private Game Inbox.',
      icon: <Gamepad2 size={24} />,
      action: () => duo.navigate('GAMES'),
      label: 'Choose a game',
      accent: 'from-emerald-500/20 to-teal-500/5'
    }
  ];

  return (
    <>
      <section className="home-hero">
        <div>
          <p className="eyebrow">Your private space</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
            Welcome back, {duo.user?.username}.
          </h1>
          <p className="muted mt-2 max-w-xl text-sm leading-6">
            A quiet place to talk, learn and play together. Everything here is built for exactly
            two people.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Badge tone={duo.otherOnline ? 'good' : 'neutral'}>
              {duo.otherOnline ? 'Other participant online' : 'Other participant offline'}
            </Badge>
            <Badge tone="accent">
              {duo.user?.role === 'HOST' ? 'Host account' : 'Guest account'}
            </Badge>
            {locked && <Badge tone="warn">Chat locked</Badge>}
          </div>
        </div>
        <div className="home-hero-orb">
          <svg viewBox="0 0 64 56" className="h-16 w-16" aria-hidden="true">
            <defs>
              <linearGradient id="home-wing" x1="0" x2="1" y1="0" y2="1">
                <stop offset="0%" stopColor="#c084fc" />
                <stop offset="55%" stopColor="#e879f9" />
                <stop offset="100%" stopColor="#60a5fa" />
              </linearGradient>
            </defs>
            <path
              d="M30 27C18 8 4 5 3 16c-1 10 9 17 24 18-12 5-17 14-9 18 7 4 14-5 14-12Zm4 0C46 8 60 5 61 16c1 10-9 17-24 18 12 5 17 14 9 18-7 4-14-5-14-12Z"
              fill="url(#home-wing)"
            />
            <ellipse cx="32" cy="29" rx="2.4" ry="10" fill="#f5d0fe" />
          </svg>
        </div>
      </section>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {cards.map((card) => (
          <button
            key={card.title}
            className={`quick-card bg-gradient-to-br ${card.accent}`}
            onClick={card.action}
          >
            <span className="quick-icon">{card.icon}</span>
            <h3 className="mt-5 text-lg font-semibold">{card.title}</h3>
            <p className="muted mt-1 text-sm leading-6">{card.description}</p>
            <span className="mt-4 inline-flex items-center gap-1 text-sm text-fuchsia-200">
              {card.label}
              <ArrowRight size={14} />
            </span>
          </button>
        ))}
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1.1fr_.9fr]">
        <Panel className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="eyebrow">Audio calling</p>
              <h3 className="mt-1 text-lg font-semibold">Talk privately</h3>
              <p className="muted mt-1 text-sm leading-6">
                Microphone access is requested only when you start or accept a call. Guest can
                hide a call and keep it running with sound completely disabled.
              </p>
            </div>
            <span className="quick-icon shrink-0">
              <Phone size={22} />
            </span>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              onClick={() => void duo.startCall()}
              disabled={duo.callState !== 'IDLE'}
            >
              <Mic size={16} />
              {duo.callState === 'IDLE' ? 'Start audio call' : `Call ${duo.callState.toLowerCase()}`}
            </Button>
            {duo.permissions.some(
              (permission) =>
                permission.name === 'REMOTE_MIC_CONTROL' &&
                permission.status === 'GRANTED' &&
                (permission.requestedBy === duo.user?.id || permission.grantedBy === duo.user?.id)
            ) && <Badge tone="good">Remote mic consent active</Badge>}
          </div>
        </Panel>

        <Panel className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="eyebrow">Recent activity</p>
              <h3 className="mt-1 text-lg font-semibold">Little signals</h3>
            </div>
            <Button className="text-xs" onClick={() => void duo.markNotificationsRead()}>
              Mark read
            </Button>
          </div>
          <div className="mt-3 space-y-2">
            {duo.notifications.slice(0, 5).map((notification) => (
              <div
                key={notification.id}
                className="flex items-start gap-3 rounded-xl border border-white/5 bg-black/15 px-3 py-2.5"
              >
                <span className="mt-0.5 rounded-lg bg-white/5 p-1.5 text-fuchsia-200">
                  <Bell size={13} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{eventLabel(notification.eventType)}</p>
                  <p className="muted mt-0.5 text-[11px]">
                    {notification.actor?.username || 'System'} ·{' '}
                    {formatDateTime(notification.createdAt)}
                  </p>
                </div>
                {!notification.readAt && <span className="mt-1 h-1.5 w-1.5 rounded-full bg-fuchsia-400" />}
              </div>
            ))}
            {!duo.notifications.length && (
              <p className="muted py-6 text-center text-sm">No recent activity yet.</p>
            )}
          </div>
        </Panel>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <MiniStat
          icon={<MessageCircle size={16} />}
          label="Unread chat"
          value={String(duo.unread)}
        />
        <MiniStat icon={<Bell size={16} />} label="Game inbox" value={String(duo.inboxUnread)} />
        <MiniStat
          icon={<ShieldCheck size={16} />}
          label="Permissions"
          value={String(
            duo.permissions.filter((permission) => permission.status === 'GRANTED').length
          )}
        />
      </div>

      {locked && (
        <Panel className="mt-5 flex flex-wrap items-center justify-between gap-3 p-5">
          <div className="flex items-start gap-3">
            <span className="quick-icon">
              <LockKeyhole size={20} />
            </span>
            <div>
              <p className="font-medium">Your Chat is locked</p>
              <p className="muted mt-1 text-sm">
                Enter the shared promo code from Host. It is separate from your account password.
              </p>
            </div>
          </div>
          <Button variant="primary" onClick={() => duo.navigate('PROMO')}>
            Enter promo code
          </Button>
        </Panel>
      )}

      <Panel className="mt-5 flex flex-wrap items-center justify-between gap-3 p-5">
        <div className="flex items-center gap-3">
          <span className="quick-icon">
            <Users size={20} />
          </span>
          <div>
            <p className="font-medium">Exactly two accounts</p>
            <p className="muted mt-1 text-xs">
              Host and Guest. No public signup, no hidden monitoring, no message previews in
              notifications.
            </p>
          </div>
        </div>
        <Badge tone="accent">
          <Sparkles size={12} className="mr-1 inline" />
          Private by design
        </Badge>
      </Panel>
    </>
  );
}

function MiniStat({
  icon,
  label,
  value
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="panel-soft flex items-center gap-3 p-4">
      <span className="rounded-xl bg-white/5 p-2 text-fuchsia-200">{icon}</span>
      <div>
        <p className="muted text-[11px] uppercase tracking-wider">{label}</p>
        <p className="text-lg font-semibold">{value}</p>
      </div>
    </div>
  );
}
