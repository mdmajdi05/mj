'use client';

import { Brain, Inbox, Keyboard, Play, Sparkles, Star } from 'lucide-react';
import { useDuo } from '@/hooks/useDuoApp';
import { Badge, Button, SectionTitle } from '@/components/ui';

const games = [
  {
    slug: 'word-typing',
    name: 'Word Typing',
    description: 'Words appear on screen. Type them before the clock runs out and watch them break.',
    icon: <Keyboard size={26} />,
    tone: 'from-fuchsia-500/20 to-purple-500/5',
    tag: 'Score · Timer · Accuracy'
  },
  {
    slug: 'falling-words',
    name: 'Falling Words',
    description: 'Clear words as they fall. The pace increases, so stay sharp.',
    icon: <Star size={26} />,
    tone: 'from-sky-500/20 to-cyan-500/5',
    tag: 'Lives · Speed · Score'
  },
  {
    slug: 'memory-match',
    name: 'Color Sequence',
    description: 'Watch the glowing sequence and repeat it. One wrong tap ends the round.',
    icon: <Brain size={26} />,
    tone: 'from-emerald-500/20 to-teal-500/5',
    tag: 'Rounds · Memory · Score'
  }
];

export function GamesScreen() {
  const duo = useDuo();
  return (
    <>
      <SectionTitle
        eyebrow="Play together"
        title="Mini Games"
        description="Three quick games for a small break. Scores are stored per account."
        action={
          <Button onClick={() => duo.navigate('INBOX')}>
            <Inbox size={16} />
            Game Inbox
            {duo.inboxUnread > 0 && (
              <span className="rounded-full bg-pink-500 px-1.5 text-[10px]">{duo.inboxUnread}</span>
            )}
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        {games.map((game) => (
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
          <p className="font-medium">Send-to-Game</p>
          <p className="muted mt-1 text-sm leading-6">
            Inside a game, switch SEND-TO-GAME ON to send a message to the Game Inbox. OFF sends it
            to the normal private Chat. The active destination is always visible.
          </p>
        </div>
        <Button onClick={() => duo.navigate('INBOX')}>
          <Inbox size={16} />
          Open Incoming Game Messages
        </Button>
      </div>
    </>
  );
}
