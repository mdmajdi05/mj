'use client';

import { AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { DuoContext, useDuo, useDuoApp } from '@/hooks/useDuoApp';
import { LoginScreen } from '@/components/LoginScreen';
import { AppHeader, AppMobileNav, AppSidebar } from '@/components/AppHeader';
import { HomeScreen } from '@/components/HomeScreen';
import { ChatScreen } from '@/components/ChatScreen';
import { StudyScreen } from '@/components/StudyScreen';
import { GamesScreen } from '@/components/GamesScreen';
import { GameScreen } from '@/components/GameScreen';
import { InboxScreen } from '@/components/InboxScreen';
import { PromoScreen } from '@/components/PromoScreen';
import { RestoreScreen } from '@/components/RestoreScreen';
import { SettingsScreen } from '@/components/SettingsScreen';
import { AdminScreen } from '@/components/AdminScreen';
import { ButterflyLayer } from '@/components/ButterflyLayer';
import { CallOverlay } from '@/components/CallOverlay';
import { Spinner } from '@/components/ui';

export default function DuoApp() {
  const duo = useDuoApp();
  return (
    <DuoContext.Provider value={duo}>
      <DuoShell />
    </DuoContext.Provider>
  );
}

function DuoShell() {
  const duo = useDuo();

  if (duo.booting) {
    return (
      <main className="login-shell">
        <div className="panel px-8 py-7">
          <Spinner label="Opening your private space…" />
        </div>
      </main>
    );
  }

  if (!duo.user) return <LoginScreen />;

  return (
    <div className="shell">
      <div className="mx-auto min-h-screen max-w-7xl px-3 pb-24 pt-2 md:px-6 md:pb-8">
        <AppHeader />
        <AppMobileNav />

        <div className="grid gap-4 md:grid-cols-[220px_1fr]">
          <AppSidebar />
          <main className="min-w-0">
            {duo.screen === 'HOME' && <HomeScreen />}
            {duo.screen === 'CHAT' && <ChatScreen />}
            {duo.screen === 'STUDY' && <StudyScreen />}
            {duo.screen === 'GAMES' && <GamesScreen />}
            {duo.screen === 'GAME' && <GameScreen />}
            {duo.screen === 'INBOX' && <InboxScreen />}
            {duo.screen === 'PROMO' && <PromoScreen />}
            {duo.screen === 'RESTORE' && <RestoreScreen />}
            {duo.screen === 'SETTINGS' && <SettingsScreen />}
            {duo.screen === 'ADMIN' &&
              (duo.user.role === 'HOST' ? <AdminScreen /> : <HomeScreen />)}
          </main>
        </div>
      </div>

      <ButterflyLayer
        ids={duo.butterflies}
        onOpen={() => duo.navigate('CHAT')}
        onDismiss={duo.dismissButterfly}
      />

      {/* Remote WebRTC audio only. No audio or message content is rendered. */}
      <audio ref={duo.remoteAudioRef} autoPlay playsInline className="hidden" />

      <CallOverlay />

      <div className="toast-stack" aria-live="polite">
        {duo.error && (
          <div className="toast toast-error" role="alert">
            <AlertTriangle size={17} className="shrink-0" />
            <p className="flex-1 text-sm leading-5">{duo.error}</p>
            <button className="icon-btn" aria-label="Dismiss error" onClick={duo.dismissError}>
              <X size={15} />
            </button>
          </div>
        )}
        {duo.notice && (
          <div className="toast toast-notice" role="status">
            <CheckCircle2 size={17} className="shrink-0" />
            <p className="flex-1 text-sm leading-5">{duo.notice}</p>
            <button className="icon-btn" aria-label="Dismiss notice" onClick={duo.dismissNotice}>
              <X size={15} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
