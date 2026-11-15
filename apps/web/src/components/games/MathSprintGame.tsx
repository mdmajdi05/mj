'use client';

import { useCallback, useEffect, useState } from 'react';
import { Calculator, RotateCcw } from 'lucide-react';
import { Button, Panel } from '@/components/ui';

type Question = { a: number; b: number; op: '+' | '−' | '×'; answer: number };

function makeQuestion(): Question {
  const op = (['+', '−', '×'] as const)[Math.floor(Math.random() * 3)];
  let a = 1 + Math.floor(Math.random() * 20);
  let b = 1 + Math.floor(Math.random() * 20);
  if (op === '×') {
    a = 1 + Math.floor(Math.random() * 10);
    b = 1 + Math.floor(Math.random() * 10);
  }
  const answer = op === '+' ? a + b : op === '−' ? a - b : a * b;
  return { a, b, op, answer };
}

export function MathSprintGame({ onScore }: { onScore: (score: number) => void }) {
  const [question, setQuestion] = useState<Question>(makeQuestion);
  const [value, setValue] = useState('');
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [seconds, setSeconds] = useState(60);
  const [running, setRunning] = useState(false);
  const [feedback, setFeedback] = useState('');

  const reset = useCallback(() => {
    setQuestion(makeQuestion());
    setValue('');
    setScore(0);
    setStreak(0);
    setSeconds(60);
    setFeedback('');
    setRunning(true);
  }, []);

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      setSeconds((valueNow) => {
        if (valueNow <= 1) {
          setRunning(false);
          return 0;
        }
        return valueNow - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [running]);

  useEffect(() => {
    if (!running && seconds === 0) onScore(score);
  }, [running, seconds, score, onScore]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!running || value.trim() === '') return;
    if (Number(value) === question.answer) {
      const gained = 10 + streak * 2;
      setScore((current) => current + gained);
      const nextStreak = streak + 1;
      setStreak(nextStreak);
      setBestStreak((current) => Math.max(current, nextStreak));
      setFeedback(`+${gained}`);
    } else {
      setStreak(0);
      setFeedback(`Answer was ${question.answer}`);
    }
    setQuestion(makeQuestion());
    setValue('');
  }

  return (
    <Panel className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow flex items-center gap-1">
            <Calculator size={13} /> Math Sprint
          </p>
          <p className="muted mt-1 text-xs">
            Score {score} · Streak {streak} · Best {bestStreak} · {seconds}s
          </p>
        </div>
        <Button variant={running ? 'ghost' : 'primary'} onClick={reset}>
          <RotateCcw size={15} /> {running ? 'Restart' : 'Play'}
        </Button>
      </div>

      <div className="mt-6 text-center">
        <p className="text-4xl font-semibold tracking-tight">
          {question.a} {question.op} {question.b}
        </p>
        <form onSubmit={submit} className="mx-auto mt-5 flex max-w-[260px] gap-2">
          <input
            className="field text-center text-lg"
            inputMode="numeric"
            value={value}
            onChange={(event) => setValue(event.target.value.replace(/[^0-9-]/g, ''))}
            placeholder="?"
            disabled={!running}
            autoFocus
          />
          <Button variant="primary" disabled={!running || value.trim() === ''}>
            Go
          </Button>
        </form>
        <p className="muted mt-2 h-5 text-xs">{feedback}</p>
      </div>
    </Panel>
  );
}
