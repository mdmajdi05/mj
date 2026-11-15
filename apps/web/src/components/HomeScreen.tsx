'use client';

import { Bell, BookOpen, Gamepad2, Play, Sparkles } from 'lucide-react';
import { useDuo } from '@/hooks/useDuoApp';
import { gameCatalog } from '@/components/gameCatalog';
import { Badge, Button } from '@/components/ui';

/**
 * Home shows two clear modes — Study and Games — with game shortcuts on top
 * and the full arcade underneath.
 */
export function HomeScreen() {
  const duo = useDuo();

  return (
    <>
      <div className="home-notify-row">
        <div
          className="home-notify"
          role="status"
          aria-label={`${duo.notifiedPeople} people messaged you`}
          title="Message notification"
        >
          <Bell size={18} />
          {duo.notifiedPeople > 0 && (
            <span className="home-notify-count">{duo.notifiedPeople}</span>
          )}
        </div>
        <p className="muted text-[11px]">
          {duo.notifiedPeople > 0
            ? `${duo.notifiedPeople} ${duo.notifiedPeople === 1 ? 'person has' : 'people have'} messaged you`
            : 'No new messages'}
        </p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2">
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
