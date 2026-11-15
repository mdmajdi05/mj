'use client';

import { Inbox, Play, Sparkles } from 'lucide-react';
import { useDuo } from '@/hooks/useDuoApp';
import { gameCatalog } from '@/components/gameCatalog';
import { Badge, Button, SectionTitle } from '@/components/ui';

export function GamesScreen() {
  const duo = useDuo();
  return (
    <>
      <SectionTitle
        eyebrow="Play together"
        title="Mini Games"
        description="A growing arcade of quick games for a small break. Scores are stored per account."
        action={
          <Button onClick={() => duo.navigate('INBOX')}>
            <Inbox size={16} />
            Game Chat
            {duo.inboxUnread > 0 && (
              <span className="rounded-full bg-pink-500 px-1.5 text-[10px]">{duo.inboxUnread}</span>
            )}
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
        {gameCatalog.map((game) => (
          <div
            key={game.slug}
            className={`quick-card bg-gradient-to-br ${game.tone} flex flex-col`}
          >
            <span className="quick-icon">{game.icon}</span>
            <h3 className="mt-5 text-lg font-semibold">{game.name}</h3>
            <p className="muted mt-2 flex-1 text-sm leading-6">{game.description}</p>
            <Badge tone="accent">
              <Sparkles size={11} className="mr-1 inline" />
              {game.tag}
            </Badge>
            <Button
              variant="primary"
              className="mt-4 w-full"
              onClick={() => duo.startGame(game.slug)}
            >
              <Play size={15} />
              Play now
            </Button>
          </div>
        ))}
      </div>

      <div className="panel mt-5 flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <p className="font-medium">Game Chat</p>
          <p className="muted mt-1 text-sm leading-6">
            Inside a game, switch GAME CHAT ON to keep messages with that session. Turn it off to
            send to Main Chat instead. The active destination is always visible.
          </p>
        </div>
        <Button onClick={() => duo.navigate('INBOX')}>
          <Inbox size={16} />
          Open Game Chat
        </Button>
      </div>
    </>
  );
}
