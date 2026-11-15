'use client';

import { Bell, BookOpen, Gamepad2, MessageCircle, Play, Sparkles } from 'lucide-react';
import { useDuo } from '@/hooks/useDuoApp';
import { gameCatalog } from '@/components/gameCatalog';
import { formatLastSeen } from '@/lib/utils';
import { Badge, Button } from '@/components/ui';

/**
 * Home shows two clear modes — Study and Games — with game shortcuts on top
 * and the full arcade underneath.
 */
export function HomeScreen() {
  const duo = useDuo();
  const isHost = duo.user?.role === 'HOST';
  const hostUnread = duo.contacts.reduce((total, contact) => total + contact.unread, 0);

  async function openContact(id: string) {
    await duo.selectPeer(id);
    duo.navigate('CHAT');
  }

  return (
    <>
      {isHost ? (
        <section className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => duo.navigate('CHAT')}
            className="panel group flex items-center gap-4 p-5 text-left transition hover:border-fuchsia-300/30"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-fuchsia-400/15 text-fuchsia-200">
              <MessageCircle size={24} />
            </span>
            <span className="min-w-0">
              <span className="block text-lg font-semibold">Chats</span>
              <span className="muted block text-xs leading-5">
                {hostUnread > 0 ? `${hostUnread} unread message${hostUnread === 1 ? '' : 's'}` : 'All conversations'}
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => duo.navigate('CHAT')}
            className="panel group flex items-center gap-4 p-5 text-left transition hover:border-sky-300/30"
          >
            <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sky-400/15 text-sky-200">
              <Bell size={22} />
              {duo.notifiedPeople > 0 && (
                <span className="home-notify-count">{duo.notifiedPeople}</span>
              )}
            </span>
            <span className="min-w-0">
              <span className="block text-lg font-semibold">Notifications</span>
              <span className="muted block text-xs leading-5">
                {duo.notifiedPeople > 0
                  ? `${duo.notifiedPeople} ${duo.notifiedPeople === 1 ? 'person is' : 'people are'} waiting`
                  : 'Nothing new'}
              </span>
            </span>
          </button>
        </section>
      ) : (
        <div className="home-notify-row">
          <div
            className="home-notify"
            role="status"
            aria-label="Notifications"
            title="Notifications"
          >
            <Bell size={18} />
            {duo.notifiedPeople > 0 && (
              <span className="home-notify-count">{duo.notifiedPeople}</span>
            )}
          </div>
        </div>
      )}

      {isHost && duo.contacts.length > 0 && (
        <section className="panel mt-4 p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="eyebrow">People</p>
            <span className="muted text-[11px]">
              {duo.contacts.filter((contact) => contact.online).length} online
            </span>
          </div>
          <div className="host-people-list">
            {duo.contacts.map((contact) => {
              const name = contact.displayName || contact.username;
              return (
                <button
                  key={contact.id}
                  type="button"
                  className="chat-contact"
                  onClick={() => void openContact(contact.id)}
                >
                  <span className="chat-avatar chat-avatar-sm">
                    {name.charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1 text-left">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{name}</span>
                      {contact.unread > 0 && (
                        <span className="chat-contact-badge">{contact.unread}</span>
                      )}
                    </span>
                    <span className="muted flex items-center gap-1.5 truncate text-[11px]">
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          contact.online ? 'bg-emerald-400' : 'bg-slate-500'
                        }`}
                      />
                      {contact.online ? 'online' : formatLastSeen(contact.lastSeenAt)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section className="mt-5 grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => duo.navigate('STUDY')}
          className="panel group flex items-center gap-4 p-5 text-left transition hover:border-sky-300/30"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sky-400/15 text-sky-200">
            <BookOpen size={24} />
          </span>
          <span className="min-w-0">
            <span className="block text-lg font-semibold">Study Mode</span>
            <span className="muted block text-xs leading-5">
              Ask the Study Assistant and revise with focus.
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => duo.navigate('GAMES')}
          className="panel group flex items-center gap-4 p-5 text-left transition hover:border-fuchsia-300/30"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-fuchsia-400/15 text-fuchsia-200">
            <Gamepad2 size={24} />
          </span>
          <span className="min-w-0">
            <span className="block text-lg font-semibold">Games</span>
            <span className="muted block text-xs leading-5">
              Racing, puzzles, bubbles, snake and more.
            </span>
          </span>
        </button>
      </section>

      <section className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <p className="eyebrow">Quick play</p>
          <span className="muted text-[11px]">{gameCatalog.length} games</span>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {gameCatalog.map((game) => (
            <button
              key={game.slug}
              type="button"
              title={game.name}
              aria-label={game.name}
              onClick={() => duo.startGame(game.slug)}
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${game.tone} text-white/90 transition hover:scale-105`}
            >
              {game.icon}
            </button>
          ))}
        </div>
      </section>

      <section className="mt-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="eyebrow">Arcade</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">Games</h1>
          </div>
          <Button onClick={() => duo.navigate('GAMES')}>
            <Gamepad2 size={15} /> All games
          </Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {gameCatalog.map((game, index) => (
            <div
              key={game.slug}
              className={`quick-card game-card bg-gradient-to-br ${game.tone} flex flex-col`}
            >
              <div className="flex items-start justify-between gap-3">
                <span className="quick-icon">{game.icon}</span>
                <span className="game-rank">{String(index + 1).padStart(2, '0')}</span>
              </div>
              <h3 className="mt-4 text-lg font-semibold">{game.name}</h3>
              <p className="muted mt-1.5 flex-1 text-sm leading-6">{game.description}</p>
              <Badge tone="accent">
                <Sparkles size={11} className="mr-1 inline" />
                {game.tag}
              </Badge>
              <Button
                variant="primary"
                className="mt-4 w-full"
                onClick={() => duo.startGame(game.slug)}
              >
                <Play size={16} /> Play now
              </Button>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
