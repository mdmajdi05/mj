'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Keyboard, RotateCcw, Target, Timer } from 'lucide-react';
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
  'READY',
  'SHINE',
  'TRY',
  'UNLOCK',
  'VALUE',
  'WONDER'
];

function randomWord(current?: string) {
  let next = wordBank[Math.floor(Math.random() * wordBank.length)];
  while (next === current) next = wordBank[Math.floor(Math.random() * wordBank.length)];
  return next;
}

export function WordTypingGame({ onScore }: { onScore: (score: number) => void }) {
  const [word, setWord] = useState(() => randomWord());
  const [input, setInput] = useState('');
  const [score, setScore] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [seconds, setSeconds] = useState(60);
  const [running, setRunning] = useState(true);
  const [hit, setHit] = useState(false);
  const [shake, setShake] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const accuracy = attempts > 0 ? Math.round((correct / attempts) * 100) : 100;

  useEffect(() => {
    onScore(score);
  }, [score, onScore]);

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
    if (running) inputRef.current?.focus();
  }, [running, word]);

  const restart = useCallback(() => {
    setWord(randomWord());
    setInput('');
    setScore(0);
    setAttempts(0);
    setCorrect(0);
    setSeconds(60);
    setRunning(true);
    setHit(false);
    setShake(false);
  }, []);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!running) return;
    const value = input.trim().toUpperCase();
    if (!value) return;
    setAttempts((current) => current + 1);

    if (value === word) {
      setScore((current) => current + 10);
      setCorrect((current) => current + 1);
      setInput('');
      setHit(true);
      setTimeout(() => {
        setHit(false);
        setWord((current) => randomWord(current));
      }, 260);
    } else {
      setShake(true);
      setInput('');
      setTimeout(() => setShake(false), 320);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
      <Panel className="relative overflow-hidden p-5 text-center md:p-8">
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Score" value={String(score)} icon={<Target size={13} />} />
          <Stat label="Time" value={`${seconds}s`} icon={<Timer size={13} />} />
          <Stat label="Accuracy" value={`${accuracy}%`} icon={<Check size={13} />} />
        </div>
        <div className="progress-bar mt-3">
          <span style={{ width: `${Math.min(100, Math.round(((60 - seconds) / 60) * 100))}%` }} />
        </div>

        <p className="eyebrow mt-8">Type this word</p>
        <div className={`game-word mt-2 ${hit ? 'word-hit' : ''} ${shake ? 'word-shake' : ''}`}>
          {word}
        </div>

        <form onSubmit={submit} className="mx-auto mt-7 flex max-w-md gap-2">
          <input
            ref={inputRef}
            className="field text-center text-lg font-semibold uppercase tracking-[0.2em]"
            value={input}
            onChange={(event) => setInput(event.target.value.toUpperCase())}
            placeholder="Type the word"
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
        <p className="muted mt-3 text-xs">
          Correct words break apart. Wrong words reduce accuracy but not your score.
        </p>

        {!running && (
          <div className="game-overlay">
            <div className="panel max-w-sm p-6 text-center">
              <p className="eyebrow">Time complete</p>
              <h3 className="mt-2 text-2xl font-semibold">{score} points</h3>
              <p className="muted mt-2 text-sm">
                Accuracy {accuracy}% · {correct} words typed correctly
              </p>
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
          <li>• One word appears at a time.</li>
          <li>• Type it exactly and press Enter.</li>
          <li>• Each correct word is destroyed for 10 points.</li>
          <li>• 60 seconds on the clock.</li>
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
