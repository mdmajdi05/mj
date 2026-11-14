'use client';

import { useState } from 'react';
import { ArrowLeft, History, RotateCcw, ShieldAlert } from 'lucide-react';
import { useDuo } from '@/hooks/useDuoApp';
import { Button, Panel } from '@/components/ui';

export function RestoreScreen() {
  const duo = useDuo();
  const [command, setCommand] = useState('');
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState('');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setLocalError('');
    try {
      await duo.restoreChat(command.trim());
      setCommand('');
    } catch (cause) {
      setLocalError(
        cause instanceof Error ? cause.message : 'Previous conversation is no longer available.'
      );
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
        <ArrowLeft size={14} /> Back to games
      </button>

      <div className="mx-auto max-w-lg">
        <Panel className="overflow-hidden">
          <div className="restore-banner">
            <span className="quick-icon">
              <History size={24} />
            </span>
            <div>
              <p className="eyebrow">Upgrade · restore access</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">Restore Your Chat</h1>
            </div>
          </div>

          <div className="p-5 md:p-6">
            <p className="muted text-sm leading-6">
              Enter the restore command below. It is case-insensitive. RESTORE reopens an existing
              conversation that was hidden or archived and preserves original timestamps and
              senders.
            </p>

            <form onSubmit={submit} className="mt-5">
              <input
                className="field text-center text-lg font-semibold uppercase tracking-[0.25em]"
                value={command}
                onChange={(event) => setCommand(event.target.value)}
                placeholder="RESTORE"
                maxLength={20}
                autoComplete="off"
                autoCapitalize="characters"
                autoFocus
              />
              <Button variant="primary" className="mt-3 w-full" disabled={busy}>
                <RotateCcw size={16} />
                {busy ? 'Restoring…' : 'Continue'}
              </Button>
            </form>

            {(localError || duo.error) && (
              <p className="mt-3 rounded-xl border border-rose-400/20 bg-rose-950/30 p-3 text-sm text-rose-200">
                {localError || duo.error}
              </p>
            )}

            <div className="mt-5 rounded-xl border border-amber-400/15 bg-amber-950/15 p-3">
              <p className="flex items-center gap-2 text-xs font-medium text-amber-100">
                <ShieldAlert size={14} /> If Host permanently deleted the conversation
              </p>
              <p className="muted mt-1 text-xs leading-5">
                The app will show “Previous conversation is no longer available.” It never pretends
                deleted messages were restored.
              </p>
            </div>

            <div className="muted mt-4 flex items-start gap-2 text-xs leading-5">
              <History size={15} className="mt-0.5 shrink-0 text-fuchsia-300" />
              <span>
                Hide and Archive preserve message data. Permanent Delete is a separate Host-only
                action that cannot be undone.
              </span>
            </div>
          </div>
        </Panel>
      </div>
    </>
  );
}
