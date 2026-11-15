'use client';

import { useState } from 'react';
import { ArrowLeft, ArrowRight, Gamepad2, GraduationCap, LogIn, UserPlus } from 'lucide-react';
import { useDuo } from '@/hooks/useDuoApp';
import { Button, Field } from '@/components/ui';

type Mode = 'login' | 'signup';

export function LoginScreen() {
  const duo = useDuo();
  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [loginError, setLoginError] = useState('');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setLoginError('');
    try {
      if (mode === 'login') {
        await duo.loginAccount(username.trim(), password);
      } else {
        await duo.signupAccount(name.trim(), username.trim(), password);
      }
      setPassword('');
    } catch (cause) {
      setLoginError(cause instanceof Error ? cause.message : 'Could not continue');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-shell">
      <div className="login-glow login-glow-one" />
      <div className="login-glow login-glow-two" />
      <div className="relative z-10 grid w-full max-w-4xl items-center gap-10 lg:grid-cols-[1.05fr_.95fr]">
        <section className="hidden lg:block">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-[#d8cfe8]">
            <GraduationCap size={14} className="text-sky-300" />
            Study, focus and play
          </div>
          <h1 className="max-w-xl text-5xl font-semibold leading-[1.05] tracking-tight">
            Study smarter.{' '}
            <span className="bg-gradient-to-r from-sky-300 via-purple-300 to-fuchsia-300 bg-clip-text text-transparent">
              Play better.
            </span>
          </h1>
          <p className="muted mt-5 max-w-lg text-base leading-7">
            A calm place for study sessions, quick brain breaks and a growing arcade of games.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {[
              ['Study Assistant', 'Ask questions and revise at your own pace.'],
              ['Game arcade', 'Racing, puzzles, bubbles, snake and more.'],
              ['Your own space', 'Every account keeps its own progress.']
            ].map(([title, description]) => (
              <div className="panel-soft p-4" key={title}>
                <p className="text-sm font-semibold">{title}</p>
                <p className="muted mt-1 text-xs leading-5">{description}</p>
              </div>
            ))}
          </div>
        </section>

        <form onSubmit={submit} className="panel login-card w-full p-7 md:p-9">
          <button
            type="button"
            onClick={duo.closeAuth}
            className="muted mb-4 inline-flex items-center gap-1 text-xs hover:text-white"
          >
            <ArrowLeft size={14} /> Back to games
          </button>

          <div className="mb-6 text-center">
            <div className="logo-mark mx-auto">
              <svg viewBox="0 0 64 56" className="h-9 w-9" aria-hidden="true">
                <defs>
                  <linearGradient id="login-wing" x1="0" x2="1" y1="0" y2="1">
                    <stop offset="0%" stopColor="#7dd3fc" />
                    <stop offset="55%" stopColor="#c084fc" />
                    <stop offset="100%" stopColor="#f472b6" />
                  </linearGradient>
                </defs>
                <path
                  d="M30 27C18 8 4 5 3 16c-1 10 9 17 24 18-12 5-17 14-9 18 7 4 14-5 14-12Zm4 0C46 8 60 5 61 16c1 10-9 17-24 18 12 5 17 14 9 18-7 4-14-5-14-12Z"
                  fill="url(#login-wing)"
                />
                <ellipse cx="32" cy="29" rx="2.4" ry="10" fill="#f5d0fe" />
              </svg>
            </div>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight">Study with Game</h2>
            <p className="muted mt-1 text-sm">
              {mode === 'login' ? 'Log in to continue' : 'Create your account'}
            </p>
          </div>

          <div className="mb-5 grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-black/20 p-1">
            <button
              type="button"
              className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                mode === 'login' ? 'bg-white/10 text-white' : 'muted'
              }`}
              onClick={() => {
                setMode('login');
                setLoginError('');
              }}
            >
              <LogIn size={14} className="mr-1 inline" /> Log in
            </button>
            <button
              type="button"
              className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                mode === 'signup' ? 'bg-white/10 text-white' : 'muted'
              }`}
              onClick={() => {
                setMode('signup');
                setLoginError('');
              }}
            >
              <UserPlus size={14} className="mr-1 inline" /> Sign up
            </button>
          </div>

          <div className="space-y-3">
            {mode === 'signup' && (
              <Field
                label="Name"
                type="text"
                autoComplete="name"
                placeholder="Your name"
                maxLength={40}
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
            )}
            <Field
              label="Username"
              type="text"
              autoComplete="username"
              placeholder="e.g. studybuddy"
              maxLength={24}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
            <Field
              label="Password"
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              placeholder="Any length you like"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>

          {loginError && (
            <p className="mt-3 rounded-xl border border-rose-400/20 bg-rose-950/30 p-3 text-sm text-rose-200">
              {loginError}
            </p>
          )}

          <Button
            variant="primary"
            className="mt-5 w-full"
            disabled={busy || !username.trim() || !password || (mode === 'signup' && !name.trim())}
          >
            <Gamepad2 size={17} />
            {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}
          </Button>

          <div className="muted mt-5 flex items-center justify-center gap-2 text-center text-xs leading-5">
            <span>{mode === 'login' ? 'New here?' : 'Already have an account?'}</span>
            <button
              type="button"
              className="inline-flex items-center gap-1 text-sky-300 hover:text-sky-200"
              onClick={() => {
                setMode(mode === 'login' ? 'signup' : 'login');
                setLoginError('');
              }}
            >
              {mode === 'login' ? 'Create one' : 'Log in'} <ArrowRight size={12} />
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
