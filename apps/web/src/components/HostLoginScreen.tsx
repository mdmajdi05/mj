'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, LockKeyhole, ShieldCheck } from 'lucide-react';
import { useDuo } from '@/hooks/useDuoApp';
import { Button, Field } from '@/components/ui';

export function HostLoginScreen() {
  const { loginHost } = useDuo();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [loginError, setLoginError] = useState('');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!password) return;
    setBusy(true);
    setLoginError('');
    try {
      await loginHost(password);
      setPassword('');
    } catch (cause) {
      setLoginError(cause instanceof Error ? cause.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-shell">
      <div className="login-glow login-glow-one" />
      <div className="login-glow login-glow-two" />
      <form onSubmit={submit} className="panel login-card relative z-10 w-full max-w-md p-7 md:p-9">
        <Link href="/" className="muted mb-6 inline-flex items-center gap-1 text-xs hover:text-white">
          <ArrowLeft size={14} /> Back to app
        </Link>

        <div className="mb-7 text-center">
          <div className="logo-mark mx-auto">
            <svg viewBox="0 0 64 56" className="h-9 w-9" aria-hidden="true">
              <defs>
                <linearGradient id="host-wing" x1="0" x2="1" y1="0" y2="1">
                  <stop offset="0%" stopColor="#7dd3fc" />
                  <stop offset="55%" stopColor="#c084fc" />
                  <stop offset="100%" stopColor="#f472b6" />
                </linearGradient>
              </defs>
              <path
                d="M30 27C18 8 4 5 3 16c-1 10 9 17 24 18-12 5-17 14-9 18 7 4 14-5 14-12Zm4 0C46 8 60 5 61 16c1 10-9 17-24 18 12 5 17 14 9 18-7 4-14-5-14-12Z"
                fill="url(#host-wing)"
              />
              <ellipse cx="32" cy="29" rx="2.4" ry="10" fill="#f5d0fe" />
            </svg>
          </div>
          <h2 className="mt-4 text-2xl font-semibold tracking-tight">Host Access</h2>
          <p className="muted mt-1 text-sm">Enter the host password to continue</p>
        </div>

        <Field
          label="Password"
          type="password"
          autoComplete="current-password"
          placeholder="Host password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />

        {loginError && (
          <p className="mt-3 rounded-xl border border-rose-400/20 bg-rose-950/30 p-3 text-sm text-rose-200">
            {loginError}
          </p>
        )}

        <Button variant="primary" className="mt-5 w-full" disabled={busy || !password}>
          <LockKeyhole size={17} />
          {busy ? 'Checking…' : 'Enter host dashboard'}
        </Button>

        <div className="muted mt-5 flex items-start justify-center gap-2 text-center text-xs leading-5">
          <ShieldCheck size={15} className="mt-0.5 shrink-0 text-emerald-300" />
          <span>Host-only page. The password can be changed later in Settings.</span>
        </div>
      </form>
    </main>
  );
}
