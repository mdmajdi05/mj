'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, BookOpen, Check, Sparkles } from 'lucide-react';
import { useDuo } from '@/hooks/useDuoApp';
import { studyAnswer, studyQuestion } from '@/lib/study';
import { Badge, Button, Panel } from '@/components/ui';

export function StudyScreen() {
  const duo = useDuo();
  const words = useMemo(() => studyAnswer.split(/\s+/), []);
  const [shown, setShown] = useState(0);
  const [typing, setTyping] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const key = `private-duo-study-complete-${duo.user?.id || 'local'}`;
    if (duo.prefs.reducedMotion || localStorage.getItem(key) === '1') {
      setShown(words.length);
      setTyping(false);
      return;
    }

    setShown(0);
    setTyping(true);
    const startedAt = Date.now();
    timerRef.current = setInterval(() => {
      const progress = Math.min(1, (Date.now() - startedAt) / 60_000);
      setShown(Math.ceil(words.length * progress));
      if (progress >= 1) {
        if (timerRef.current) clearInterval(timerRef.current);
        setTyping(false);
        localStorage.setItem(key, '1');
      }
    }, 120);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [duo.prefs.reducedMotion, duo.user?.id, words]);

  const completed = !typing && shown >= words.length;
  const progress = Math.min(100, Math.round((shown / words.length) * 100));

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">Focus space</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight md:text-3xl">
            <BookOpen size={24} className="text-sky-300" />
            Study Assistant
          </h1>
          <p className="muted mt-1 text-sm">
            Chat is hidden, not deleted. Incoming messages still arrive as butterflies.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="accent">
            <Sparkles size={12} className="mr-1 inline" />
            Prewritten guidance
          </Badge>
          <Button variant="primary" onClick={() => duo.navigate('RESTORE')}>
            UPGRADE
            <ArrowUpRight size={15} />
          </Button>
        </div>
      </div>

      <div className="study-shell mx-auto max-w-4xl">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="muted flex items-center gap-2 text-xs">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            Study session
          </div>
          <span className="muted text-xs">
            {completed ? 'Complete' : typing ? `${progress}%` : 'Ready'}
          </span>
        </div>
        <div className="study-progress mb-6">
          <span style={{ width: `${progress}%` }} />
        </div>

        <div className="study-thread">
          <div className="bubble bubble-sent study-question">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest opacity-70">
              Your question
            </p>
            <p className="whitespace-pre-line text-sm leading-7">{studyQuestion}</p>
          </div>

          <div className="assistant-card">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm">
                <span className="assistant-avatar">✦</span>
                <div>
                  <b>Study Assistant</b>
                  <p className="muted text-[11px]">
                    {typing ? 'Writing a structured answer…' : 'Educational guidance'}
                  </p>
                </div>
              </div>
              {typing && (
                <span className="typing-dots" aria-label="Assistant is typing">
                  <span />
                  <span />
                  <span />
                </span>
              )}
              {completed && (
                <Badge tone="good">
                  <Check size={11} className="mr-1 inline" /> Complete
                </Badge>
              )}
            </div>

            <p className="study-answer whitespace-pre-line" aria-live="polite">
              {words.slice(0, shown).join(' ')}
              {typing && <span className="typing-caret" />}
            </p>

            {completed && (
              <p className="muted mt-5 border-t border-white/10 pt-4 text-xs leading-5">
                This is a predefined educational response animated locally. It is not a live AI
                model, and this study conversation is never stored in private Chat.
              </p>
            )}
          </div>
        </div>

        <Panel className="mt-5 flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <p className="text-sm font-medium">Need to return to your conversation?</p>
            <p className="muted mt-1 text-xs">
              Opening Chat is an explicit action. Messages were never deleted while you studied.
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => duo.navigate('GAMES')}>Take a break</Button>
            <Button variant="primary" onClick={() => duo.navigate('CHAT')}>
              Open Chat
            </Button>
          </div>
        </Panel>
      </div>
    </>
  );
}
