'use client';

import { useState } from 'react';
import { ArrowLeft, LockKeyhole, ShieldCheck, Ticket } from 'lucide-react';
import { useDuo } from '@/hooks/useDuoApp';
import { Button, Panel } from '@/components/ui';

export function PromoScreen() {
  const duo = useDuo();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState('');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setLocalError('');
    try {
      await duo.unlockWithPromo(code.trim());
      setCode('');
    } catch (cause) {
      setLocalError(cause instanceof Error ? cause.message : 'Access code could not be validated');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        className="muted mb-4 flex items-center gap-1 text-xs hover:text-white"
        onClick={() => duo.navigate('HOME')}
      >
        <ArrowLeft size={14} /> Back home
      </button>

      <div className="mx-auto max-w-lg">
        <div className="coupon">
          <div className="coupon-stub">
            <Ticket size={28} />
            <span>PRIVATE DUO</span>
          </div>
          <div className="coupon-body">
            <p className="eyebrow">Coupon-style access</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">Unlock Your Chat</h1>
            <p className="muted mt-2 text-sm leading-6">
              Enter the shared access code from Host. This code unlocks the Chat interface; it is
              separate from your account password.
            </p>

            <form onSubmit={submit} className="mt-5">
              <input
                className="field coupon-input text-center uppercase tracking-[0.18em]"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="ENTER ACCESS CODE"
                maxLength={100}
                autoComplete="off"
                autoCapitalize="characters"
                autoFocus
              />
              <Button variant="primary" className="mt-3 w-full" disabled={busy}>
                <LockKeyhole size={16} />
                {busy ? 'Checking…' : 'Continue'}
              </Button>
            </form>

            {(localError || duo.error) && (
              <p className="mt-3 rounded-xl border border-rose-400/20 bg-rose-950/30 p-3 text-sm text-rose-200">
                {localError || duo.error}
              </p>
            )}

            <div className="muted mt-5 flex items-start gap-2 text-xs leading-5">
              <ShieldCheck size={15} className="mt-0.5 shrink-0 text-emerald-300" />
              <span>
                Access codes are stored only as a secure hash. Repeated invalid attempts are
                rate-limited on the server.
              </span>
            </div>
          </div>
        </div>

        <Panel className="mt-4 p-4">
          <p className="text-sm font-medium">Promo code is not RESTORE</p>
          <p className="muted mt-1 text-xs leading-5">
            A promo code unlocks Chat. RESTORE returns you to an existing conversation that was
            hidden or archived. Permanently deleted messages cannot be restored.
          </p>
          <Button className="mt-3" onClick={() => duo.navigate('RESTORE')}>
            Open Restore Your Chat
          </Button>
        </Panel>
      </div>
    </>
  );
}
