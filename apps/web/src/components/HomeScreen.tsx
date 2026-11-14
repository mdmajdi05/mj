'use client';

import { Gamepad2, Play, Sparkles } from 'lucide-react';
import { useDuo } from '@/hooks/useDuoApp';
import { gameCatalog } from '@/components/gameCatalog';
import { Badge, Button } from '@/components/ui';

/**
 * Games-only home. There is deliberately no Chat, Inbox, call or private
 * conversation entry point anywhere on this screen.
 */
export function HomeScreen() {
  const duo = useDuo();

  return (
    <>
      <section className="mb-5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow">Private arcade</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Games</h1>
        </div>
        <span className="home-hero-orb game-orb shrink-0">
          <Gamepad2 size={26} className="text-fuchsia-100" />
        </span>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        {gameCatalog.map((game, index) => (
          <div
            key={game.slug}
            className={`quick-card game-card bg-gradient-to-br ${game.tone} flex flex-col`}
          >
            <div className="flex items-start justify-between gap-3">
              <span className="quick-icon">{game.icon}</span>
              <span className="game-rank">0{index + 1}</span>
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
    </>
  );
}
