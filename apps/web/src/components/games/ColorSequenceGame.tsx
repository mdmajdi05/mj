'use client';

import { useEffect, useRef, useState } from 'react';
import { Brain, RotateCcw, Sparkles, Timer } from 'lucide-react';
import { Button, Panel } from '@/components/ui';

const colors = [
  { name: 'Violet', className: 'sequence-violet' },
  { name: 'Pink', className: 'sequence-pink' },
  { name: 'Blue', className: 'sequence-blue' },
  { name: 'Green', className: 'sequence-green' }
];

function randomColor() {
  return Math.floor(Math.random() * colors.length);
}

function initialSequence() {
  return [randomColor(), randomColor(), randomColor()];
}

export function ColorSequenceGame({ onScore }: { onScore: (score: number) => void }) {
  const [sequence, setSequence] = useState<number[]>(initialSequence);
  const [active, setActive] = useState<number | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [round, setRound] = useState(1);
  const [score, setScore] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(true);
  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  useEffect(() => {
    onScore(score);
  }, [score, onScore]);

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [running]);

  function clearTimers() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }

  function flash(index: number, duration = 420) {
    setActive(index);
    timers.current.push(setTimeout(() => setActive(null), duration));
  }

  function showSequence(next: number[]) {
    clearTimers();
    setAccepting(false);
    setProgress(0);
    let offset = 450;
    next.forEach((color) => {
      timers.current.push(
        setTimeout(() => {
          setActive(color);
          timers.current.push(setTimeout(() => setActive(null), 380));
        }, offset)
      );
      offset += 620;
    });
    timers.current.push(setTimeout(() => setAccepting(true), offset + 150));
  }

  useEffect(() => {
    if (!running) return;
    showSequence(sequence);
    return clearTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sequence, running]);

  useEffect(() => () => clearTimers(), []);

  function choose(color: number) {
    if (!running || !accepting || active !== null) return;
    flash(color, 180);
    if (color !== sequence[progress]) {
      setAccepting(false);
      setRunning(false);
      return;
    }
    if (progress + 1 === sequence.length) {
      setAccepting(false);
      setProgress(sequence.length);
      setScore((current) => current + 10);
      setRound((current) => current + 1);
      const next = [...sequence, randomColor()];
      timers.current.push(setTimeout(() => setSequence(next), 700));
    } else {
      setProgress((current) => current + 1);
    }
  }

  function restart() {
    clearTimers();
    setSequence(initialSequence());
    setActive(null);
    setAccepting(false);
    setProgress(0);
    setRound(1);
    setScore(0);
    setSeconds(0);
    setRunning(true);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_240px]">
      <Panel className="relative p-5 md:p-6">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Score" value={String(score)} />
          <Stat label="Round" value={String(round)} />
          <Stat label="Time" value={`${seconds}s`} icon={<Timer size={11} />} />
          <Stat
            label="Progress"
            value={`${Math.min(progress, sequence.length)}/${sequence.length}`}
          />
        </div>

        <div className="mt-5 flex items-center justify-between">
          <p className="eyebrow">Watch, then repeat</p>
          <span className={`text-xs ${accepting ? 'text-emerald-300' : 'text-fuchsia-300'}`}>
            {accepting ? 'Your turn' : running ? 'Watch…' : 'Round over'}
          </span>
        </div>

        <div className="progress-bar mt-3">
          <span
            style={{
              width: `${Math.min(100, Math.round((progress / sequence.length) * 100))}%`
            }}
          />
        </div>

        <div className="sequence-grid mt-3">
          {colors.map((color, index) => (
            <button
              key={color.name}
              className={`sequence-button ${color.className} ${
                active === index ? 'sequence-active' : ''
              }`}
              onClick={() => choose(index)}
              disabled={!accepting || !running}
              aria-label={color.name}
            >
              <Sparkles size={20} />
              <span>{color.name}</span>
            </button>
          ))}
        </div>

        <p className="muted mt-4 text-center text-xs">
          Repeat {sequence.length} colors in order. Wrong tap ends the round.
        </p>

        {!running && (
          <div className="game-overlay">
            <div className="panel max-w-sm p-6 text-center">
              <p className="eyebrow">Wrong sequence</p>
              <h3 className="mt-2 text-2xl font-semibold">{score} points</h3>
              <p className="muted mt-2 text-sm">You reached round {round}.</p>
              <Button variant="primary" className="mt-5" onClick={restart}>
                <RotateCcw size={16} /> Restart game
              </Button>
            </div>
          </div>
        )}
      </Panel>

      <Panel className="p-5">
        <p className="eyebrow">How it works</p>
        <ul className="muted mt-3 space-y-2 text-sm leading-6">
          <li>• Four colored buttons glow in a pattern.</li>
          <li>• Click them in the same order.</li>
          <li>• Every completed sequence gives 10 points.</li>
          <li>• The sequence grows each round.</li>
        </ul>
        <Button className="mt-5 w-full" onClick={restart}>
          <RotateCcw size={15} /> Restart
        </Button>
        <div className="mt-4 flex items-center gap-2 text-xs text-fuchsia-200">
          <Brain size={14} /> Memory and attention
        </div>
      </Panel>
    </div>
  );
}

function Stat({
  label,
  value,
  icon
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="panel-soft p-3 text-center">
      <p className="muted flex items-center justify-center gap-1 text-[10px] uppercase tracking-wider">
        {icon}
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}
