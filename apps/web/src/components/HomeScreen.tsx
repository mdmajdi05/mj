'use client';

import { Bell, BookOpen, Gamepad2, MessageCircle, Sparkles } from 'lucide-react';
import { useDuo } from '@/hooks/useDuoApp';
import { gameCatalog } from '@/components/gameCatalog';
import { formatLastSeen } from '@/lib/utils';

/**
 * A calm home: the two things that matter first (Chats and activity), then the
 * people list, then Study / Games and a compact quick-play row. The old arcade
 * grid duplicated the Games screen and made the page feel cluttered.
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
    <div className="home-clean">
      <section className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => duo.navigate('CHAT')}
          className="panel group flex items-center gap-4 p-4 text-left transition hover:border-fuchsia-300/30"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-fuchsia-400/15 text-fuchsia-200">
            <MessageCircle size={22} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center justify-between gap-2">
              <span className="text-base font-semibold">Chats</span>
              {isHost && hostUnread > 0 && (
                <span className="chat-contact-badge">{hostUnread}</span>
              )}
            </span>
            <span className="muted block text-xs leading-5">
              {isHost
                ? hostUnread > 0
                  ? `${hostUnread} unread message${hostUnread === 1 ? '' : 's'}`
                  : 'All conversations'
                : 'Open your private conversation'}
            </span>
          </span>
        </button>

        <div className="panel flex items-center gap-4 p-4">
          <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sky-400/15 text-sky-200">
            <Bell size={20} />
            {duo.notifiedPeople > 0 && (
              <span className="home-notify-count">{duo.notifiedPeople}</span>
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-base font-semibold">Notifications</span>
            <span className="muted block text-xs leading-5">
              {duo.notifiedPeople > 0
                ? `${duo.notifiedPeople} ${duo.notifiedPeople === 1 ? 'person is' : 'people are'} waiting`
                : 'Nothing new'}
            </span>
          </span>
        </div>
      </section>

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

      <section className="mt-4 grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => duo.navigate('STUDY')}
          className="panel group flex items-center gap-3 p-4 text-left transition hover:border-sky-300/30"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-400/15 text-sky-200">
            <BookOpen size={20} />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold">Study Mode</span>
            <span className="muted block text-xs leading-5">Ask the Study Assistant.</span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => duo.navigate('GAMES')}
          className="panel group flex items-center gap-3 p-4 text-left transition hover:border-fuchsia-300/30"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-fuchsia-400/15 text-fuchsia-200">
            <Gamepad2 size={20} />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold">Games</span>
            <span className="muted block text-xs leading-5">
              {gameCatalog.length} games to play.
            </span>
          </span>
        </button>
      </section>

      <section className="panel mt-4 p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="eyebrow flex items-center gap-1.5">
            <Sparkles size={12} /> Quick play
          </p>
          <button
            type="button"
            className="muted text-[11px] font-medium transition hover:text-white"
            onClick={() => duo.navigate('GAMES')}
          >
            View all
          </button>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {gameCatalog.map((game) => (
            <button
              key={game.slug}
              type="button"
              title={game.name}
              aria-label={game.name}
              onClick={() => duo.startGame(game.slug)}
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${game.tone} text-white/90 transition hover:scale-105`}
            >
              {game.icon}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
