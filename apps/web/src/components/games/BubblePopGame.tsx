'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Circle, RotateCcw } from 'lucide-react';
import { Button, Panel } from '@/components/ui';

const COLORS = ['bg-cyan-400', 'bg-pink-400', 'bg-amber-400', 'bg-emerald-400', 'bg-violet-400'];
const ROWS = 8;
const COLS = 8;

type Bubble = { id: number; color: number };

function buildRows(startId: number): Bubble[] {
  return Array.from({ length: ROWS * 6 }, (_, index) => ({
    id: startId + index,
    color: Math.floor(Math.random() * COLORS.length)
  }));
}

export function BubblePopGame({ onScore }: { onScore: (score: number) => void }) {
  const [bubbles, setBubbles] = useState<Bubble[]>(() => buildRows(0));
  const [score, setScore] = useState(0);
  const [seconds, setSeconds] = useState(45);
  const [running, setRunning] = useState(false);
  const idRef = useRef(1000);

  const reset = useCallback(() => {
    setBubbles(buildRows(idRef.current));
    idRef.current += ROWS * 6;
    setScore(0);
    setSeconds(45);
    setRunning(true);
  }, []);

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
      setBubbles((current) => {
        if (!current.length) return current;
        const index = Math.floor(Math.random() * Math.min(COLS, current.length));
        return [...current.slice(index + 1), ...current.slice(0, index)];
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [running]);

  useEffect(() => {
    if (!running && seconds === 0) onScore(score);
  }, [running, seconds, score, onScore]);

  function pop(id: number) {
    if (!running) return;
    setBubbles((current) => current.filter((bubble) => bubble.id !== id));
    setScore((value) => value + 5);
  }

  return (
    <Panel className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow flex items-center gap-1">
            <Circle size={13} /> Bubble Pop
          </p>
          <p className="muted mt-1 text-xs">
            Score {score} · {seconds}s left
          </p>
        </div>
        <Button variant={running ? 'ghost' : 'primary'} onClick={reset}>
          <RotateCcw size={15} /> {running ? 'Restart' : 'Play'}
        </Button>
      </div>

      <div className="mt-4 grid grid-cols-8 gap-1.5 rounded-2xl border border-white/10 bg-black/25 p-2">
        {Array.from({ length: ROWS * COLS }, (_, index) => {
          const bubble = bubbles[index];
          return (
            <button
              key={index}
              type="button"
              onClick={() => bubble && pop(bubble.id)}
              className={`aspect-square rounded-full transition ${
                bubble ? COLORS[bubble.color] : 'bg-white/[0.04]'
              } ${bubble ? 'hover:scale-110' : ''}`}
              aria-label={bubble ? 'Pop bubble' : 'Empty slot'}
            />
          );
        })}
      </div>
    </Panel>
  );
}
