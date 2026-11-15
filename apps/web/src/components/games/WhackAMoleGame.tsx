'use client';

import { useCallback, useEffect, useState } from 'react';
import { Hammer, RotateCcw } from 'lucide-react';
import { Button, Panel } from '@/components/ui';

const HOLES = 9;

export function WhackAMoleGame({ onScore }: { onScore: (score: number) => void }) {
  const [active, setActive] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [misses, setMisses] = useState(0);
  const [seconds, setSeconds] = useState(30);
  const [running, setRunning] = useState(false);

  const reset = useCallback(() => {
    setScore(0);
    setMisses(0);
    setSeconds(30);
    setActive(null);
    setRunning(true);
  }, []);

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      setSeconds((value) => {
        if (value <= 1) {
          setRunning(false);
          setActive(null);
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [running]);

  useEffect(() => {
    if (!running) return;
    const speed = Math.max(520, 1100 - score * 8);
    const timer = setInterval(() => {
      setActive(Math.floor(Math.random() * HOLES));
    }, speed);
    return () => clearInterval(timer);
  }, [running, score]);

  useEffect(() => {
    if (!running && seconds === 0) onScore(score);
  }, [running, seconds, score, onScore]);

  function hit(index: number) {
    if (!running) return;
    if (active === index) {
      setScore((value) => value + 10);
      setActive(null);
    } else {
      setMisses((value) => value + 1);
    }
  }

  return (
    <Panel className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow flex items-center gap-1">
            <Hammer size={13} /> Whack a Mole
          </p>
          <p className="muted mt-1 text-xs">
            Score {score} · Misses {misses} · {seconds}s
          </p>
        </div>
        <Button variant={running ? 'ghost' : 'primary'} onClick={reset}>
          <RotateCcw size={15} /> {running ? 'Restart' : 'Play'}
        </Button>
      </div>

      <div className="mx-auto mt-4 grid max-w-[320px] grid-cols-3 gap-2 rounded-2xl border border-white/10 bg-black/25 p-3">
        {Array.from({ length: HOLES }, (_, index) => (
          <button
            key={index}
            type="button"
            onClick={() => hit(index)}
            className={`flex aspect-square items-center justify-center rounded-full text-2xl transition ${
              active === index ? 'scale-105 bg-teal-400/40' : 'bg-white/[0.04]'
            }`}
          >
            {active === index ? '🐹' : ''}
          </button>
        ))}
      </div>
    </Panel>
  );
}
