'use client';

import { ArrowRight, Gamepad2, Inbox, Play, Sparkles, Trophy, Users, Wifi, Zap } from 'lucide-react';
import { useDuo } from '@/hooks/useDuoApp';
import { gameCatalog } from '@/components/gameCatalog';
import { Badge, Button, Panel } from '@/components/ui';

export function HomeScreen() {
  const duo = useDuo();

  return (
    <>
      <section className="home-hero game-hero">
        <div className="min-w-0">
          <p className="eyebrow">Private arcade</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
            Game Lounge
          </h1>
          <p className="muted mt-2 max-w-xl text-sm leading-6">
            Quick games, friendly competition aur ek private scoreboard. Pick a game and start
            playing — no feed, no noise.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Badge tone={duo.otherOnline ? 'good' : 'neutral'}>
              <Wifi size={11} className="mr-1 inline" />
              {duo.otherOnline ? 'Player online' : 'Waiting for player'}
            </Badge>
            <Badge tone="accent">
              <Trophy size={11} className="mr-1 inline" /> {gameCatalog.length} games ready
            </Badge>
            <Badge tone="neutral">
              <Zap size={11} className="mr-1 inline" /> Instant play
            </Badge>
          </div>
        </div>
        <div className="home-hero-orb game-orb">
          <Gamepad2 size={44} className="text-fuchsia-100" />
        </div>
      </section>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <StudioStat
          icon={<Gamepad2 size={16} />}
          label="Games"
          value={String(gameCatalog.length)}
          hint="Ready to play"
        />
        <StudioStat
          icon={<Inbox size={16} />}
          label="Game inbox"
          value={String(duo.inboxUnread)}
          hint={duo.inboxUnread ? 'New messages' : 'All clear'}
        />
        <StudioStat
          icon={<Users size={16} />}
          label="Players"
          value="2"
          hint={duo.otherOnline ? 'Both online' : 'One online'}
        />
      </div>

      <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Choose your challenge</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">All games</h2>
        </div>
        <Button onClick={() => duo.navigate('INBOX')}>
          <Inbox size={16} /> Game Inbox
          {duo.inboxUnread > 0 && (
            <span className="rounded-full bg-pink-500 px-1.5 text-[10px]">{duo.inboxUnread}</span>
          )}
        </Button>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {gameCatalog.map((game, index) => (
          <div
            key={game.slug}
            className={`quick-card game-card bg-gradient-to-br ${game.tone} flex flex-col`}
          >
            <div className="flex items-start justify-between gap-3">
              <span className="quick-icon">{game.icon}</span>
              <span className="game-rank">0{index + 1}</span>
            </div>
            <h3 className="mt-5 text-xl font-semibold">{game.name}</h3>
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
              <Play size={16} /> Play now
            </Button>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1.15fr_.85fr]">
        <Panel className="p-5">
          <div className="flex items-start gap-3">
            <span className="quick-icon shrink-0">
              <Trophy size={22} />
            </span>
            <div>
              <p className="eyebrow">Game Inbox</p>
              <h3 className="mt-1 text-lg font-semibold">Messages from the games</h3>
              <p className="muted mt-1 text-sm leading-6">
                When SEND-TO-GAME is on, your game messages land in a separate inbox. Nothing is
                mixed into the main conversation.
              </p>
            </div>
          </div>
          <Button className="mt-4" onClick={() => duo.navigate('INBOX')}>
            Open Game Inbox <ArrowRight size={15} />
          </Button>
        </Panel>

        <Panel className="p-5">
          <p className="eyebrow">How it works</p>
          <div className="mt-3 space-y-3 text-sm">
            <Step number="1" title="Pick a game" text="Choose any card above to start a round." />
            <Step number="2" title="Beat your score" text="Every score is saved to your account." />
            <Step number="3" title="Send a note" text="Use Send-to-Game after a round if you like." />
          </div>
        </Panel>
      </div>
    </>
  );
}

function StudioStat({
  icon,
  label,
  value,
  hint
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="panel-soft flex items-center gap-3 p-4">
      <span className="rounded-xl bg-white/5 p-2 text-fuchsia-200">{icon}</span>
      <div className="min-w-0">
        <p className="muted text-[11px] uppercase tracking-wider">{label}</p>
        <p className="text-lg font-semibold leading-tight">{value}</p>
        <p className="muted truncate text-[11px]">{hint}</p>
      </div>
    </div>
  );
}

function Step({ number, title, text }: { number: string; title: string; text: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-white/10 bg-white/5 text-[11px] font-semibold text-fuchsia-200">
        {number}
      </span>
      <div>
        <p className="font-medium leading-tight">{title}</p>
        <p className="muted mt-0.5 text-xs leading-5">{text}</p>
      </div>
    </div>
  );
}
