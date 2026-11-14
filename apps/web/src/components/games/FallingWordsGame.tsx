'use client';

import { useEffect, useRef, useState } from 'react';
import { Heart, Keyboard, RotateCcw, Star, Timer } from 'lucide-react';
import { Button, Panel } from '@/components/ui';

const wordBank = [
  'FOCUS',
  'LEARN',
  'DREAM',
  'CREATE',
  'GROW',
  'THINK',
  'BRIGHT',
  'ENERGY',
  'MEMORY',
  'PRACTICE',
  'STUDY',
  'IMAGINE',
  'BALANCE',
  'COURAGE',
  'CURIOUS',
  'DETAIL',
  'EXPLORE',
  'FUTURE',
  'GOAL',
  'HABIT',
  'IDEA',
  'JOURNEY',
  'KIND',
  'LISTEN',
  'MOTION',
  'NOTICE',
  'OPEN',
  'PROGRESS',
  'QUIET',
  'SHINE',
  'TRY',
  'VALUE',
  'WONDER'
];

type FallingWord = {
  id: string;
  word: string;
  left: number;
  duration: number;
};

export function FallingWordsGame({ onScore }: { onScore: (score: number) => void }) {
  const [words, setWords] = useState<FallingWord[]>([]);
  const [input, setInput] = useState('');
  const [score, setScore] = useState(0);
  const [cleared, setCleared] = useState(0);
  const [lives, setLives] = useState(5);
  const [seconds, setSeconds] = useState(60);
  const [running, setRunning] = useState(true);
  const secondsRef = useRef(60);
  const runningRef = useRef(true);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    onScore(score);
  }, [score, onScore]);

  useEffect(() => {
    secondsRef.current = seconds;
  }, [seconds]);

  useEffect(() => {
    runningRef.current = running;
    if (!running) setWords([]);
  }, [running]);

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      setSeconds((value) => {
        if (value <= 1) {
          setRunning(false);
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [running]);

  useEffect(() => {
    if (!running) return;
    let timeout: ReturnType<typeof setTimeout>;
    let spawnTimer: ReturnType<typeof setTimeout>;

    const spawn = () => {
      if (!runningRef.current) return;
      const elapsed = 60 - secondsRef.current;
      const delay = Math.max(650, 1900 - elapsed * 18);
      const duration = Math.max(3.4, 7 - elapsed * 0.05);
      const word = wordBank[Math.floor(Math.random() * wordBank.length)];
      setWords((current) => [
        ...current,
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          word,
          left: 5 + Math.floor(Math.random() * 72),
          duration
        }
      ]);
      spawnTimer = setTimeout(spawn, delay);
    };

    timeout = setTimeout(spawn, 800);
    return () => {
      clearTimeout(timeout);
      clearTimeout(spawnTimer);
    };
  }, [running]);

  useEffect(() => {
    if (running) inputRef.current?.focus();
  }, [running]);

  function miss(id: string) {
    if (!runningRef.current) return;
    setWords((current) => current.filter((word) => word.id !== id));
    setLives((current) => {
      const next = Math.max(0, current - 1);
      if (next === 0) setRunning(false);
      return next;
    });
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!running) return;
    const value = input.trim().toUpperCase();
    if (!value) return;
    const match = words.find((word) => word.word === value);
    if (!match) {
      setInput('');
      return;
    }
    setWords((current) => current.filter((word) => word.id !== match.id));
    setScore((current) => current + 10);
    setCleared((current) => current + 1);
    setInput('');
  }

  function restart() {
    setWords([]);
    setInput('');
    setScore(0);
    setCleared(0);
    setLives(5);
    setSeconds(60);
    setRunning(true);
    secondsRef.current = 60;
    runningRef.current = true;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_240px]">
      <Panel className="relative p-5 md:p-6">
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Score" value={String(score)} icon={<Star size={13} />} />
          <Stat label="Time" value={`${seconds}s`} icon={<Timer size={13} />} />
          <Stat label="Cleared" value={String(cleared)} icon={<Keyboard size={13} />} />
        </div>
        <div className="progress-bar mt-3">
          <span style={{ width: `${Math.min(100, Math.round(((60 - seconds) / 60) * 100))}%` }} />
        </div>

        <div className="falling-field mt-4">
          {words.map((word) => (
            <span
              key={word.id}
              className="falling-word"
              style={{ left: `${word.left}%`, animationDuration: `${word.duration}s` }}
              onAnimationEnd={() => miss(word.id)}
            >
              {word.word}
            </span>
          ))}
          {!words.length && running && (
            <p className="muted absolute inset-0 grid place-items-center text-sm">
              Words are starting to fall…
            </p>
          )}
        </div>

        <form onSubmit={submit} className="mx-auto mt-4 flex max-w-md gap-2">
          <input
            ref={inputRef}
            className="field text-center uppercase tracking-[0.18em]"
            value={input}
            onChange={(event) => setInput(event.target.value.toUpperCase())}
            placeholder="Type a falling word"
            maxLength={30}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            disabled={!running}
          />
          <Button variant="primary" type="submit" disabled={!running}>
            <Keyboard size={17} />
          </Button>
        </form>

        <div className="mt-4 flex items-center justify-center gap-1 text-pink-300">
          {Array.from({ length: 5 }).map((_, index) => (
            <Heart
              key={index}
              size={18}
              fill={index < lives ? 'currentColor' : 'transparent'}
              className={index < lives ? '' : 'opacity-25'}
            />
          ))}
        </div>

        {!running && (
          <div className="game-overlay">
            <div className="panel max-w-sm p-6 text-center">
              <p className="eyebrow">Game over</p>
              <h3 className="mt-2 text-2xl font-semibold">{score} points</h3>
              <p className="muted mt-2 text-sm">{cleared} words cleared</p>
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
          <li>• Words fall from the top.</li>
          <li>• Type a visible word and press Enter.</li>
          <li>• Each cleared word gives 10 points.</li>
          <li>• Missed words cost one life.</li>
          <li>• Speed increases gradually.</li>
        </ul>
        <Button className="mt-5 w-full" onClick={restart}>
          <RotateCcw size={15} /> Restart
        </Button>
      </Panel>
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="panel-soft p-3">
      <p className="muted flex items-center justify-center gap-1 text-[10px] uppercase tracking-wider">
        {icon}
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}
