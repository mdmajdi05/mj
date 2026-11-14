'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { io, type Socket } from 'socket.io-client';
import { API, api, ApiError } from '@/lib/api';
import type {
  AdminActivity,
  CallRecord,
  CallState,
  ConversationStatus,
  GameMessage,
  IncomingCall,
  Message,
  MessageDestination,
  Notification,
  Permission,
  Preferences,
  Screen,
  Summary,
  User
} from '@/lib/types';

const iceServers = [
  { urls: 'stun:stun.l.google.com:19302' },
  ...(process.env.NEXT_PUBLIC_TURN_URL
    ? [
        {
          urls: process.env.NEXT_PUBLIC_TURN_URL,
          username: process.env.NEXT_PUBLIC_TURN_USERNAME || '',
          credential: process.env.NEXT_PUBLIC_TURN_PASSWORD || ''
        }
      ]
    : [])
];

const defaultPreferences: Preferences = {
  butterfly: true,
  sound: false,
  browser: false,
  activitySharing: false,
  reducedMotion: false
};

export function useDuoApp() {
  const [user, setUser] = useState<User | null>(null);
  const [booting, setBooting] = useState(true);
  const [screen, setScreenState] = useState<Screen>('HOME');
  const [menuOpen, setMenuOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [gameMessages, setGameMessages] = useState<GameMessage[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [unread, setUnread] = useState(0);
  const [inboxUnread, setInboxUnread] = useState(0);
  const [activityUnread, setActivityUnread] = useState(0);
  const [otherOnline, setOtherOnline] = useState(false);
  const [butterflies, setButterflies] = useState<string[]>([]);
  const [prefs, setPrefs] = useState<Preferences>(defaultPreferences);
  const [conversationStatus, setConversationStatus] = useState<ConversationStatus>('NONE');
  const [activeGame, setActiveGame] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [callState, setCallState] = useState<CallState>('IDLE');
  const [callId, setCallId] = useState('');
  const [micOn, setMicOn] = useState(true);
  const [remoteMicOn, setRemoteMicOn] = useState<boolean | null>(null);
  const [callMuted, setCallMuted] = useState(false);
  const [callHidden, setCallHidden] = useState(false);
  const [callSeconds, setCallSeconds] = useState(0);
  const [callStartedAt, setCallStartedAt] = useState<number | null>(null);
  const [restoredCall, setRestoredCall] = useState<CallRecord | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const userRef = useRef<User | null>(null);
  const screenRef = useRef<Screen>('HOME');
  const prefsRef = useRef<Preferences>(defaultPreferences);
  const butterflyIds = useRef(new Set<string>());
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const pendingSignalsRef = useRef<any[]>([]);
  const callIdRef = useRef('');
  const callStateRef = useRef<CallState>('IDLE');
  const callTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const callHiddenRef = useRef(false);
  const lastOfferAtRef = useRef(0);
  const resumedCallRef = useRef('');
  const justLoggedInRef = useRef(false);

  userRef.current = user;
  screenRef.current = screen;
  prefsRef.current = prefs;
  callStateRef.current = callState;
  callHiddenRef.current = callHidden;

  const setScreen = useCallback((next: Screen) => {
    screenRef.current = next;
    setScreenState(next);
  }, []);

  const showError = useCallback((message: string) => {
    setError(message);
    setNotice('');
  }, []);

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    setError('');
  }, []);

  const playNotificationSound = useCallback(() => {
    const currentPrefs = prefsRef.current;
    if (!currentPrefs.sound || currentPrefs.reducedMotion) return;
    try {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;
      const context = new AudioContextClass();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.frequency.value = 880;
      gain.gain.value = 0.035;
      oscillator.start();
      oscillator.stop(context.currentTime + 0.14);
      void context.resume().catch(() => undefined);
      setTimeout(() => void context.close().catch(() => undefined), 500);
    } catch {
      // Autoplay policies may block the sound until the user interacts.
    }
  }, []);

  const showBrowserNotification = useCallback(() => {
    const currentPrefs = prefsRef.current;
    if (!currentPrefs.browser) return;
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    try {
      new Notification('Private Duo', {
        body: 'You have a new message.',
        tag: 'private-duo',
        silent: true
      });
    } catch {
      // Some mobile browsers only support service-worker notifications.
    }
  }, []);

  const addButterfly = useCallback((id: string) => {
    if (!prefsRef.current.butterfly || prefsRef.current.reducedMotion) return;
    if (butterflyIds.current.has(id)) return;
    butterflyIds.current.add(id);
    setButterflies((current) => [...current.slice(-9), id]);
    window.setTimeout(() => {
      butterflyIds.current.delete(id);
      setButterflies((current) => current.filter((value) => value !== id));
    }, 5200);
  }, []);

  const loadMessages = useCallback(async () => {
    const current = userRef.current;
    if (!current) return;
    if (current.role === 'GUEST' && !current.chatUnlocked) {
      setMessages([]);
      return;
    }
    const rows = await api<Message[]>('/chat/messages');
    setMessages(rows);
    setUnread(rows.filter((message) => message.senderId !== current.id && !message.readAt).length);
  }, []);

  const loadInbox = useCallback(async () => {
    const current = userRef.current;
    const rows = await api<GameMessage[]>('/chat/inbox');
    setGameMessages(rows);
    if (current) {
      setInboxUnread(rows.filter((message) => message.senderId !== current.id && !message.readAt).length);
    }
  }, []);

  const loadPermissions = useCallback(async () => {
    setPermissions(await api<Permission[]>('/chat/permissions'));
  }, []);

  const loadNotifications = useCallback(async () => {
    const rows = await api<Notification[]>('/chat/notifications');
    setNotifications(rows);
    setActivityUnread(
      rows.filter(
        (notification) =>
          !notification.readAt && !['NEW_MESSAGE', 'GAME_MESSAGE'].includes(notification.eventType)
      ).length
    );
  }, []);

  const loadSummary = useCallback(async () => {
    const summary = await api<Summary>('/chat/summary');
    const current = userRef.current;
    setConversationStatus(summary.status);
    setUnread(summary.unreadMessages);
    setInboxUnread(summary.unreadGameMessages);
    setActivityUnread(summary.unreadNotifications);
    if (current) {
      setOtherOnline(summary.onlineUserIds.some((id) => id !== current.id));
    }
    return summary;
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.allSettled([
      loadMessages(),
      loadInbox(),
      loadPermissions(),
      loadNotifications(),
      loadSummary()
    ]);
  }, [loadMessages, loadInbox, loadPermissions, loadNotifications, loadSummary]);

  const navigate = useCallback(
    (next: Screen) => {
      const current = userRef.current;
      if (!current) return;
      if (next === 'CHAT' && current.role !== 'HOST' && !current.chatUnlocked) {
        setScreen('PROMO');
        setMenuOpen(false);
        void api('/chat/screen', {
          method: 'POST',
          body: JSON.stringify({ screen: 'PROMO' })
        }).catch(() => undefined);
        return;
      }
      if (next === 'ADMIN' && current.role !== 'HOST') {
        showError('Host access only.');
        setMenuOpen(false);
        return;
      }

      setScreen(next);
      setMenuOpen(false);

      if (next === 'CHAT') {
        setUnread(0);
        void api('/chat/open', { method: 'POST' }).catch((cause) =>
          showError(cause instanceof Error ? cause.message : 'Could not open Chat')
        );
      } else if (next === 'STUDY') {
        void api('/chat/hide', { method: 'POST' }).catch(() => undefined);
      } else {
        void api('/chat/screen', {
          method: 'POST',
          body: JSON.stringify({ screen: next })
        }).catch(() => undefined);
      }

      if (next === 'INBOX') {
        setInboxUnread(0);
        void api('/chat/inbox/read', { method: 'POST' }).catch(() => undefined);
      }
      if (next === 'HOME') {
        void loadNotifications().catch(() => undefined);
      }
    },
    [loadNotifications, setScreen, showError]
  );

  const login = useCallback(async (username: 'host' | 'guest', password: string) => {
    const account = await api<User>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    justLoggedInRef.current = true;
    setUser(account);
    userRef.current = account;
    setScreen('HOME');
    void api('/chat/screen', {
      method: 'POST',
      body: JSON.stringify({ screen: 'HOME' })
    }).catch(() => undefined);
  }, [setScreen]);

  const logout = useCallback(async () => {
    const activeId = callIdRef.current;
    if (activeId) socketRef.current?.emit('call:leave', { callId: activeId });
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    socketRef.current?.disconnect();
    socketRef.current = null;
    setUser(null);
    userRef.current = null;
    setScreen('HOME');
    setMessages([]);
    setGameMessages([]);
    setNotifications([]);
    setPermissions([]);
    setIncomingCall(null);
    setCallState('IDLE');
    setCallId('');
    callIdRef.current = '';
  }, [setScreen]);

  const updatePreference = useCallback(
    async (patch: Partial<Preferences>) => {
      setPrefs((current) => ({ ...current, ...patch }));
      prefsRef.current = { ...prefsRef.current, ...patch };
      try {
        await api('/chat/preferences', {
          method: 'POST',
          body: JSON.stringify(patch)
        });
      } catch (cause) {
        showError(cause instanceof Error ? cause.message : 'Could not save preferences');
      }
    },
    [showError]
  );

  const enableBrowserNotifications = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      showError('This browser does not support browser notifications.');
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      showError('Browser notification permission was not granted.');
      return;
    }

    try {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.register('/sw.js');
        const keyResponse = await api<{ publicKey: string | null }>('/chat/push/public-key');
        if (keyResponse.publicKey) {
          const base64 = keyResponse.publicKey.replace(/-/g, '+').replace(/_/g, '/');
          const raw = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
          const applicationServerKey = Uint8Array.from(raw, (character) =>
            character.charCodeAt(0)
          );
          const existing = await registration.pushManager.getSubscription();
          const subscription =
            existing ??
            (await registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey
            }));
          await api('/chat/push/subscribe', {
            method: 'POST',
            body: JSON.stringify(subscription.toJSON())
          });
        }
      }
      await updatePreference({ browser: true });
      showNotice(
        'Browser notifications enabled. Background delivery depends on browser and OS support.'
      );
    } catch (cause) {
      await updatePreference({ browser: true });
      showError(
        `Foreground notifications are enabled. Background push could not be configured: ${
          cause instanceof Error ? cause.message : 'unknown error'
        }`
      );
    }
  }, [showError, showNotice, updatePreference]);

  const disableBrowserNotifications = useCallback(async () => {
    try {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.getRegistration();
        const subscription = await registration?.pushManager.getSubscription();
        if (subscription) {
          await api('/chat/push/subscribe', {
            method: 'DELETE',
            body: JSON.stringify({ endpoint: subscription.endpoint })
          }).catch(() => undefined);
          await subscription.unsubscribe().catch(() => undefined);
        }
      }
    } finally {
      await updatePreference({ browser: false });
    }
  }, [updatePreference]);

  /* ------------------------------------------------------------------ */
  /* Authentication boot and screen restoration                          */
  /* ------------------------------------------------------------------ */

  useEffect(() => {
    let alive = true;
    api<User>('/auth/me')
      .then((account) => {
        if (alive) setUser(account);
      })
      .catch(() => undefined)
      .finally(() => {
        if (alive) setBooting(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    (async () => {
      try {
        const [preference, summary] = await Promise.all([
          api<{ screen: Screen; chatVisible: boolean }>('/chat/screen'),
          api<Summary>('/chat/summary')
        ]);
        if (!alive) return;

        let next = preference.screen || 'HOME';
        if (next === 'CHAT' && user.role === 'GUEST' && !user.chatUnlocked) next = 'PROMO';
        if (next === 'ADMIN' && user.role !== 'HOST') next = 'HOME';
        if (next === 'GAME') next = 'GAMES';
        if (preference.chatVisible === false && next === 'CHAT') next = 'STUDY';
        if (justLoggedInRef.current) {
          justLoggedInRef.current = false;
          next = 'HOME';
          void api('/chat/screen', {
            method: 'POST',
            body: JSON.stringify({ screen: 'HOME' })
          }).catch(() => undefined);
        }
        setScreen(next);
        setConversationStatus(summary.status);
        setUnread(summary.unreadMessages);
        setInboxUnread(summary.unreadGameMessages);
        setActivityUnread(summary.unreadNotifications);
        setOtherOnline(summary.onlineUserIds.some((id) => id !== user.id));
        if (summary.activeCall) {
          setRestoredCall(summary.activeCall);
        }
      } catch {
        // A missing preference is not fatal; the app still starts on HOME.
        if (alive) setScreen('HOME');
      }

      const [prefsResult] = await Promise.allSettled([api<Preferences>('/chat/preferences')]);
      if (alive && prefsResult.status === 'fulfilled') {
        setPrefs(prefsResult.value);
        prefsRef.current = prefsResult.value;
      }
    })();
    return () => {
      alive = false;
    };
  }, [user?.id, setScreen, showNotice]);

  useEffect(() => {
    if (!user) return;
    void refreshAll();
  }, [user?.id, refreshAll]);

  useEffect(() => {
    if (!user) return;
    if (screen !== 'CHAT') return;
    const current = userRef.current;
    if (!current) return;
    for (const message of messages) {
      if (message.senderId !== current.id && !message.readAt) {
        socketRef.current?.emit('message:read', message.id);
      }
    }
    setUnread(0);
  }, [screen, messages, user]);

  useEffect(() => {
    if (remoteAudioRef.current) remoteAudioRef.current.muted = callMuted;
  }, [callMuted]);

  /* ------------------------------------------------------------------ */
  /* WebRTC                                                              */
  /* ------------------------------------------------------------------ */

  const attachPeerHandlers = useCallback((peer: RTCPeerConnection) => {
    peer.ontrack = (event) => {
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = event.streams[0];
        void remoteAudioRef.current.play().catch(() => undefined);
      }
    };
    peer.onicecandidate = (event) => {
      if (event.candidate && callIdRef.current) {
        socketRef.current?.emit('call:signal', {
          callId: callIdRef.current,
          kind: 'ice',
          signal: event.candidate
        });
      }
    };
    peer.onconnectionstatechange = () => {
      const state = peer.connectionState;
      if (state === 'connected') {
        setCallState('ACTIVE');
      } else if (state === 'disconnected') {
        setCallState('RECONNECTING');
      } else if (state === 'failed') {
        setCallState('RECONNECTING');
        if (userRef.current?.role === 'HOST') {
          peer.restartIce();
          void peer
            .createOffer({ iceRestart: true })
            .then(async (offer) => {
              await peer.setLocalDescription(offer);
              socketRef.current?.emit('call:signal', {
                callId: callIdRef.current,
                kind: 'offer',
                signal: offer
              });
            })
            .catch(() => undefined);
        } else if (callIdRef.current) {
          socketRef.current?.emit('call:rejoin', { callId: callIdRef.current });
        }
      }
    };
  }, []);

  const closeLocalCall = useCallback(() => {
    pendingSignalsRef.current = [];
    callIdRef.current = '';
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
    setCallState('IDLE');
    setCallId('');
    setIncomingCall(null);
    setRemoteMicOn(null);
    setCallSeconds(0);
    setCallStartedAt(null);
    setRestoredCall(null);
    resumedCallRef.current = '';
    lastOfferAtRef.current = 0;
    setCallHidden(false);
    setCallMuted(false);
    setMicOn(true);
  }, []);

  const handleSignal = useCallback(
    async (payload: any) => {
      try {
        if (payload.callId) {
          callIdRef.current = payload.callId;
          setCallId(payload.callId);
        }
        const peer = pcRef.current;
        if (!peer || (payload.kind === 'ice' && !peer.remoteDescription)) {
          pendingSignalsRef.current.push(payload);
          return;
        }
        if (payload.kind === 'offer') {
          await peer.setRemoteDescription(payload.signal);
          const answer = await peer.createAnswer();
          await peer.setLocalDescription(answer);
          socketRef.current?.emit('call:signal', {
            callId: callIdRef.current,
            kind: 'answer',
            signal: answer
          });
        } else if (payload.kind === 'answer') {
          await peer.setRemoteDescription(payload.signal);
        } else if (payload.kind === 'ice') {
          await peer.addIceCandidate(payload.signal);
        }

        if (peer.remoteDescription) {
          const queued = pendingSignalsRef.current.splice(0);
          for (const item of queued) {
            if (item.kind === 'ice') {
              await peer.addIceCandidate(item.signal).catch(() => undefined);
            }
          }
        }
      } catch (cause) {
        console.error('WebRTC signalling error', cause);
      }
    },
    []
  );

  const ensurePeer = useCallback(async () => {
    if (pcRef.current && localStreamRef.current) return pcRef.current;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true }
    });
    localStreamRef.current = stream;
    setMicOn(stream.getAudioTracks().every((track) => track.enabled));
    const peer = new RTCPeerConnection({ iceServers });
    pcRef.current = peer;
    stream.getTracks().forEach((track) => peer.addTrack(track, stream));
    attachPeerHandlers(peer);
    return peer;
  }, [attachPeerHandlers]);

  const sendOffer = useCallback(async (iceRestart = false) => {
    const peer = pcRef.current;
    const id = callIdRef.current;
    if (!peer || !id) return;
    const now = Date.now();
    if (now - lastOfferAtRef.current < 900) return;
    lastOfferAtRef.current = now;
    try {
      if (iceRestart) peer.restartIce();
      const offer = await peer.createOffer({ iceRestart });
      await peer.setLocalDescription(offer);
      socketRef.current?.emit('call:signal', {
        callId: id,
        kind: 'offer',
        signal: offer
      });
    } catch (cause) {
      console.error('Could not create call offer', cause);
    }
  }, []);

  const startCall = useCallback(async () => {
    try {
      if (pcRef.current || localStreamRef.current) closeLocalCall();
      lastOfferAtRef.current = 0;
      await ensurePeer();
      setMicOn(true);
      setCallMuted(false);
      setCallHidden(false);
      setCallStartedAt(null);
      setCallState('CONNECTING');
      socketRef.current?.emit('call:invite');
    } catch (cause) {
      showError(
        `Microphone access is required to start a call: ${
          cause instanceof Error ? cause.message : 'permission denied'
        }`
      );
    }
  }, [closeLocalCall, ensurePeer, showError]);

  const acceptCall = useCallback(async () => {
    if (!incomingCall) return;
    try {
      await ensurePeer();
      setMicOn(true);
      setCallMuted(false);
      setCallHidden(false);
      lastOfferAtRef.current = 0;

      callIdRef.current = incomingCall.callId;
      setCallId(incomingCall.callId);
      const startedAt = incomingCall.createdAt
        ? new Date(incomingCall.createdAt).getTime()
        : Date.now();
      setCallStartedAt(Number.isFinite(startedAt) ? startedAt : Date.now());
      socketRef.current?.emit('call:accept', { callId: incomingCall.callId });
      socketRef.current?.emit('call:mic-status', {
        callId: incomingCall.callId,
        enabled: true
      });
      setIncomingCall(null);
      setCallState('ACTIVE');

      const queued = pendingSignalsRef.current.splice(0);
      for (const item of queued) await handleSignal(item);
    } catch (cause) {
      showError(
        `Microphone permission is required: ${
          cause instanceof Error ? cause.message : 'permission denied'
        }`
      );
    }
  }, [ensurePeer, handleSignal, incomingCall, showError]);

  const restoreCallSession = useCallback(
    async (call: CallRecord) => {
      const startedAt = new Date(call.startedAt).getTime();
      callIdRef.current = call.id;
      setCallId(call.id);
      setCallStartedAt(Number.isFinite(startedAt) ? startedAt : Date.now());

      if (call.status === 'RINGING') {
        if (userRef.current?.role === 'GUEST') {
          const other = call.participants.find(
            (participant) => participant.userId !== userRef.current?.id
          );
          setIncomingCall({
            callId: call.id,
            from: other?.user?.username || 'Host',
            createdAt: call.startedAt
          });
          setCallState('RINGING');
        } else {
          setCallState('CONNECTING');
          setRestoredCall(call);
          try {
            await ensurePeer();
          } catch {
            // Host will retry when the guest accepts.
          }
        }
        return;
      }

      if (call.status !== 'ACTIVE') {
        closeLocalCall();
        return;
      }

      setCallState('RECONNECTING');
      setRestoredCall(call);
      try {
        await ensurePeer();
        if (userRef.current?.role === 'HOST' && screenRef.current === 'STUDY') {
          localStreamRef.current?.getAudioTracks().forEach((track) => {
            track.enabled = false;
          });
          setMicOn(false);
          socketRef.current?.emit('call:mic-status', { callId: call.id, enabled: false });
        }
        socketRef.current?.emit('call:rejoin', { callId: call.id });
        if (userRef.current?.role === 'HOST') await sendOffer(true);
      } catch {
        showNotice(
          'The call is still connected. Tap the day/night toggle so the browser can restore your microphone.'
        );
      }
    },
    [closeLocalCall, ensurePeer, sendOffer, showNotice]
  );

  const resumeCall = useCallback(async () => {
    const id = callIdRef.current;
    if (!id) {
      await startCall();
      return;
    }
    try {
      await ensurePeer();
      setCallState('RECONNECTING');
      socketRef.current?.emit('call:rejoin', { callId: id });
      if (userRef.current?.role === 'HOST') await sendOffer(true);
    } catch (cause) {
      setCallState('RECONNECTING');
      showError(
        `Tap the call toggle again to reconnect: ${
          cause instanceof Error ? cause.message : 'microphone unavailable'
        }`
      );
    }
  }, [ensurePeer, sendOffer, showError, startCall]);

  const declineIncoming = useCallback(() => {
    if (incomingCall) {
      socketRef.current?.emit('call:decline', { callId: incomingCall.callId });
    }
    closeLocalCall();
  }, [closeLocalCall, incomingCall]);

  const hangup = useCallback(() => {
    const activeId = callIdRef.current;
    if (activeId) {
      if (userRef.current?.role === 'HOST') {
        socketRef.current?.emit('call:end', { callId: activeId });
      } else {
        socketRef.current?.emit('call:leave', { callId: activeId });
      }
    }
    closeLocalCall();
  }, [closeLocalCall]);

  const setLocalMic = useCallback((enabled: boolean) => {
    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = enabled;
    });
    setMicOn(enabled);
    if (callIdRef.current) {
      socketRef.current?.emit('call:mic-status', {
        callId: callIdRef.current,
        enabled
      });
    }
  }, []);

  const toggleMic = useCallback(() => {
    setLocalMic(!micOn);
  }, [micOn, setLocalMic]);

  const hideCall = useCallback(() => {
    setCallHidden(true);
    setCallMuted(true);
    setLocalMic(false);
  }, [setLocalMic]);

  const returnToCall = useCallback(() => {
    setCallHidden(false);
    setCallMuted(false);
    if (!micOn) setLocalMic(true);
  }, [micOn, setLocalMic]);

  const callAction = useCallback(async () => {
    const state = callStateRef.current;
    if (state === 'ACTIVE') {
      toggleMic();
      return;
    }
    if (state === 'RECONNECTING') {
      await resumeCall();
      return;
    }
    if (state === 'CONNECTING' || state === 'RINGING') return;
    await startCall();
  }, [resumeCall, startCall, toggleMic]);

  const enterStudyMode = useCallback(() => {
    const inCall =
      callStateRef.current === 'ACTIVE' ||
      callStateRef.current === 'RECONNECTING' ||
      callStateRef.current === 'CONNECTING';
    // Requirement: Host keeps the call alive but mutes their microphone.
    if (inCall && userRef.current?.role === 'HOST' && micOn) {
      setLocalMic(false);
    }
    navigate('STUDY');
  }, [micOn, navigate, setLocalMic]);

  const playRemoteAudio = useCallback(() => {
    if (!remoteAudioRef.current) return;
    remoteAudioRef.current.muted = callMuted;
    void remoteAudioRef.current
      .play()
      .catch(() => showNotice('Tap the day/night toggle once, then the timer, to enable call sound.'));
  }, [callMuted, showNotice]);

  const remoteMic = useCallback(
    (enabled: boolean) => {
      socketRef.current?.emit('call:remote-mic', { enabled });
    },
    []
  );

  useEffect(() => {
    if (!restoredCall || !user) return;
    if (resumedCallRef.current === restoredCall.id) return;
    resumedCallRef.current = restoredCall.id;
    void restoreCallSession(restoredCall);
  }, [restoredCall, restoreCallSession, user]);

  useEffect(() => {
    if (!callStartedAt) {
      if (callTimerRef.current) clearInterval(callTimerRef.current);
      return;
    }
    const tick = () =>
      setCallSeconds(Math.max(0, Math.floor((Date.now() - callStartedAt) / 1000)));
    tick();
    callTimerRef.current = setInterval(tick, 1000);
    return () => {
      if (callTimerRef.current) clearInterval(callTimerRef.current);
    };
  }, [callStartedAt]);

  useEffect(() => {
    if (callState !== 'RECONNECTING' || !callId) return;
    const retry = setInterval(() => {
      socketRef.current?.emit('call:rejoin', { callId: callIdRef.current });
    }, 5000);
    return () => clearInterval(retry);
  }, [callState, callId]);

  /* ------------------------------------------------------------------ */
  /* Real-time socket                                                    */
  /* ------------------------------------------------------------------ */

  useEffect(() => {
    if (!user) return;
    const socket = io(API || window.location.origin, {
      withCredentials: true,
      transports: ['websocket', 'polling']
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      if (callIdRef.current) {
        socket.emit('call:rejoin', { callId: callIdRef.current });
        if (userRef.current?.role === 'HOST') void sendOffer(true);
      }
    });

    socket.on('disconnect', () => {
      if (callStateRef.current === 'ACTIVE' || callStateRef.current === 'CONNECTING') {
        setCallState('RECONNECTING');
      }
    });

    socket.on('connect_error', () =>
      showError('Live connection unavailable. Check the API and network configuration.')
    );
    socket.on('message:error', (payload: any) => showError(payload?.error || 'Message failed'));
    socket.on('game:error', (payload: any) => showError(payload?.error || 'Game event failed'));

    socket.on('message:new', (message: Message) => {
      setMessages((current) =>
        current.some((item) => item.id === message.id) ? current : [...current, message]
      );
      const current = userRef.current;
      if (current && message.senderId !== current.id && screenRef.current !== 'CHAT') {
        setUnread((value) => value + 1);
      }
    });

    socket.on('message:delivered', (payload: { id: string }) => {
      setMessages((current) =>
        current.map((message) =>
          message.id === payload.id
            ? { ...message, deliveredAt: message.deliveredAt || new Date().toISOString() }
            : message
        )
      );
    });

    socket.on('message:read', (payload: { id: string; readAt: string }) => {
      setMessages((current) =>
        current.map((message) =>
          message.id === payload.id ? { ...message, readAt: payload.readAt } : message
        )
      );
    });

    socket.on('message:deleted', (payload: { id: string }) => {
      setMessages((current) => current.filter((message) => message.id !== payload.id));
    });

    socket.on('game:message:new', (message: GameMessage) => {
      setGameMessages((current) =>
        current.some((item) => item.id === message.id) ? current : [...current, message]
      );
      const current = userRef.current;
      if (current && message.senderId !== current.id) {
        if (screenRef.current === 'INBOX') {
          void api(`/chat/inbox/${message.id}/read`, { method: 'POST' }).catch(() => undefined);
        } else {
          setInboxUnread((value) => value + 1);
        }
      }
    });

    socket.on('game:messages:cleared', () => {
      void loadInbox().catch(() => undefined);
      showNotice('Game Inbox messages were cleared by Host.');
    });

    socket.on('notification:butterfly', (payload: { id: string }) => {
      addButterfly(String(payload.id));
      playNotificationSound();
      showBrowserNotification();
    });

    socket.on('notification:new', () => {
      void loadNotifications().catch(() => undefined);
    });

    socket.on('notification:count', (payload: { count?: number }) => {
      // This count includes message notifications, so it cannot be used as the
      // activity badge. Only a cleared count is safe to apply here.
      if (payload?.count === 0) setActivityUnread(0);
    });

    socket.on('presence:list', (payload: { onlineUserIds: string[] }) => {
      const current = userRef.current;
      setOtherOnline(
        payload.onlineUserIds.some((id) => (current ? id !== current.id : true))
      );
    });

    socket.on('presence:update', (payload: { userId: string; online: boolean }) => {
      const current = userRef.current;
      if (current && payload.userId !== current.id) setOtherOnline(payload.online);
    });

    socket.on('permission:new', () => {
      void loadPermissions().catch(() => undefined);
      void loadNotifications().catch(() => undefined);
    });
    socket.on('permission:updated', () => {
      void loadPermissions().catch(() => undefined);
      void loadNotifications().catch(() => undefined);
    });
    socket.on('permission:status', (rows: Permission[]) => setPermissions(rows));

    socket.on('chat:state', (payload: any) => {
      if (payload?.status) setConversationStatus(payload.status);
      if (payload?.error) showError(payload.error);
    });
    socket.on('chat:deleted', () => {
      setMessages([]);
      setConversationStatus('DELETED');
      showNotice('The conversation history was permanently deleted by Host.');
    });
    socket.on('chat:restore:success', () => {
      if (userRef.current) {
        userRef.current = { ...userRef.current, chatUnlocked: true };
        setUser(userRef.current);
      }
      setConversationStatus('ACTIVE');
      void loadMessages().catch(() => undefined);
      showNotice('Conversation restored.');
    });
    socket.on('chat:restore:failed', (payload: any) =>
      showError(payload?.error || 'Previous conversation is no longer available.')
    );

    socket.on('game:activity', () => void loadNotifications().catch(() => undefined));

    socket.on('call:incoming', (payload: IncomingCall) => {
      callIdRef.current = payload.callId;
      setIncomingCall(payload);
      setCallState('RINGING');
      void loadNotifications().catch(() => undefined);
    });

    socket.on('call:created', async (payload: { callId: string; startedAt?: string }) => {
      callIdRef.current = payload.callId;
      setCallId(payload.callId);
      lastOfferAtRef.current = 0;
      const startedAt = payload.startedAt ? new Date(payload.startedAt).getTime() : Date.now();
      setCallStartedAt(Number.isFinite(startedAt) ? startedAt : Date.now());
      setCallState('CONNECTING');
      socket.emit('call:mic-status', {
        callId: payload.callId,
        enabled: localStreamRef.current?.getAudioTracks().some((track) => track.enabled) ?? false
      });
      await sendOffer(false);
    });

    socket.on('call:accepted', () => {
      setCallState('ACTIVE');
      if (!callIdRef.current) return;
      if (!lastOfferAtRef.current && userRef.current?.role === 'HOST') {
        void sendOffer(false);
      }
    });
    socket.on('call:peer-rejoined', async (payload: { callId?: string }) => {
      if (userRef.current?.role !== 'HOST') return;
      if (payload?.callId) {
        callIdRef.current = payload.callId;
        setCallId(payload.callId);
      }
      setCallState((current) => (current === 'ACTIVE' ? 'ACTIVE' : 'RECONNECTING'));
      await sendOffer(true);
    });
    socket.on('call:status', (payload: any) => {
      if (payload?.callId) {
        callIdRef.current = payload.callId;
        setCallId(payload.callId);
      }
      if (payload?.startedAt) {
        const startedAt = new Date(payload.startedAt).getTime();
        if (Number.isFinite(startedAt)) setCallStartedAt((current) => current ?? startedAt);
      }
      if (payload?.status === 'ACTIVE') setCallState('ACTIVE');
      else if (payload?.status === 'RINGING') {
        setCallState((current) => (current === 'RECONNECTING' ? 'CONNECTING' : current));
      } else if (payload?.status === 'ENDED' || payload?.status === 'DECLINED') closeLocalCall();
    });
    socket.on('call:mic-status', (payload: { enabled?: boolean }) =>
      setRemoteMicOn(Boolean(payload?.enabled))
    );
    socket.on('call:remote-mic', (payload: { enabled?: boolean }) => {
      const enabled = Boolean(payload?.enabled);
      localStreamRef.current?.getAudioTracks().forEach((track) => {
        track.enabled = enabled;
      });
      setMicOn(enabled);
      if (callIdRef.current) {
        socket.emit('call:mic-status', { callId: callIdRef.current, enabled });
      }
      showNotice(
        enabled
          ? 'The other participant unmuted your microphone.'
          : 'The other participant muted your microphone.'
      );
    });
    socket.on('call:remote-mic:sent', (payload: { enabled?: boolean }) =>
      showNotice(payload?.enabled ? 'Remote unmute request sent.' : 'Remote mute request sent.')
    );
    socket.on('call:ended', (payload: { reason?: string }) => {
      closeLocalCall();
      if (payload?.reason === 'host-ended') showNotice('Host ended the call for both participants.');
      else if (payload?.reason === 'declined') showNotice('Call declined.');
      else if (payload?.reason === 'no-answer') showNotice('Call was not answered.');
      else if (payload?.reason === 'participant-left') showNotice('The other participant left the call.');
    });
    socket.on('call:participant-left', (payload: { username?: string }) => {
      showNotice(`${payload?.username || 'The other participant'} left the call.`);
    });
    socket.on('call:left', () => closeLocalCall());
    socket.on('call:error', (payload: any) => {
      showError(payload?.error || 'Call could not be started.');
      if (callStateRef.current === 'CONNECTING' && !callIdRef.current) closeLocalCall();
    });
    socket.on('call:signal', (payload: any) => void handleSignal(payload));

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [
    user?.id,
    addButterfly,
    closeLocalCall,
    handleSignal,
    loadMessages,
    loadNotifications,
    loadPermissions,
    playNotificationSound,
    sendOffer,
    showBrowserNotification,
    showError,
    showNotice
  ]);

  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => {
      void loadSummary().catch(() => undefined);
    }, 60_000);
    return () => clearInterval(interval);
  }, [user?.id, loadSummary]);

  /* ------------------------------------------------------------------ */
  /* Actions                                                             */
  /* ------------------------------------------------------------------ */

  const sendMessage = useCallback(
    (content: string, destination: MessageDestination = 'CHAT') => {
      const value = content.trim();
      if (!value) return false;
      const current = userRef.current;
      if (destination === 'CHAT' && current?.role === 'GUEST' && !current.chatUnlocked) {
        showError('Unlock private Chat before sending to normal Chat.');
        navigate('PROMO');
        return false;
      }
      const socket = socketRef.current;
      if (!socket?.connected) {
        showError('Live connection is not ready. Your message was not sent.');
        return false;
      }
      socket.emit('message:send', { content: value, destination });
      return true;
    },
    [navigate, showError]
  );

  const unlockWithPromo = useCallback(
    async (code: string) => {
      await api('/chat/promo/validate', {
        method: 'POST',
        body: JSON.stringify({ code })
      });
      if (userRef.current) {
        userRef.current = { ...userRef.current, chatUnlocked: true };
        setUser(userRef.current);
      }
      await loadMessages();
      setConversationStatus('ACTIVE');
      navigate('CHAT');
      showNotice('Chat unlocked.');
    },
    [loadMessages, navigate, showNotice]
  );

  const restoreChat = useCallback(
    async (command: string) => {
      await api('/chat/restore', {
        method: 'POST',
        body: JSON.stringify({ command })
      });
      if (userRef.current) {
        userRef.current = { ...userRef.current, chatUnlocked: true };
        setUser(userRef.current);
      }
      setConversationStatus('ACTIVE');
      await loadMessages();
      navigate('CHAT');
      showNotice('Previous conversation restored.');
    },
    [loadMessages, navigate, showNotice]
  );

  const deleteMessage = useCallback(
    async (id: string) => {
      await api(`/chat/messages/${id}`, { method: 'DELETE' });
      setMessages((current) => current.filter((message) => message.id !== id));
    },
    []
  );

  const archiveChat = useCallback(async () => {
    await api('/chat/archive', { method: 'POST' });
    setConversationStatus('ARCHIVED');
    showNotice('Conversation archived. Use RESTORE to reopen it.');
  }, [showNotice]);

  const deleteHistory = useCallback(async () => {
    await api('/chat/history', { method: 'DELETE' });
    setMessages([]);
    setConversationStatus('DELETED');
    showNotice('Conversation permanently deleted.');
  }, [showNotice]);

  const startGame = useCallback(
    (slug: string) => {
      setActiveGame(slug);
      setScreen('GAME');
      setMenuOpen(false);
      socketRef.current?.emit('game:start', { slug });
      void api('/chat/screen', {
        method: 'POST',
        body: JSON.stringify({ screen: 'GAME' })
      }).catch(() => undefined);
    },
    [setScreen]
  );

  const updateGameScore = useCallback((score: number) => {
    socketRef.current?.emit('game:score:update', { score });
  }, []);

  const endGame = useCallback(
    (score: number) => {
      socketRef.current?.emit('game:end', { score });
      setActiveGame(null);
      navigate('GAMES');
    },
    [navigate]
  );

  const requestPermission = useCallback(
    async (
      name: 'REMOTE_MIC_CONTROL' | 'SHARED_GAME_ACTIVITY' | 'CALL_CONTROLS',
      description: string,
      requestedBySelf = true
    ) => {
      await api('/chat/permissions', {
        method: 'POST',
        body: JSON.stringify({ name, description, requestedBySelf })
      });
      await loadPermissions();
      showNotice(
        requestedBySelf
          ? 'Permission request sent. The other participant can approve or reject it.'
          : 'Consent recorded. You can revoke it at any time.'
      );
    },
    [loadPermissions, showNotice]
  );

  const permissionAction = useCallback(
    async (id: string, action: 'approve' | 'reject' | 'revoke') => {
      await api(`/chat/permissions/${id}/${action}`, { method: 'POST' });
      await loadPermissions();
      socketRef.current?.emit('permission:changed');
    },
    [loadPermissions]
  );

  const markNotificationsRead = useCallback(async () => {
    await api('/chat/notifications/read', { method: 'POST' });
    setNotifications((current) =>
      current.map((notification) => ({ ...notification, readAt: new Date().toISOString() }))
    );
    setActivityUnread(0);
  }, []);

  const markInboxRead = useCallback(async () => {
    await api('/chat/inbox/read', { method: 'POST' });
    setGameMessages((current) =>
      current.map((message) => ({ ...message, readAt: message.readAt || new Date().toISOString() }))
    );
    setInboxUnread(0);
  }, []);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    return api<{ ok: boolean; message: string }>('/auth/password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword })
    });
  }, []);

  const dismissError = useCallback(() => setError(''), []);
  const dismissNotice = useCallback(() => setNotice(''), []);

  const totalNotifications = useMemo(
    () => unread + inboxUnread + activityUnread,
    [unread, inboxUnread, activityUnread]
  );

  return {
    user,
    booting,
    screen,
    menuOpen,
    setMenuOpen,
    messages,
    gameMessages,
    notifications,
    permissions,
    unread,
    inboxUnread,
    activityUnread,
    totalNotifications,
    otherOnline,
    butterflies,
    prefs,
    conversationStatus,
    activeGame,
    error,
    notice,
    incomingCall,
    callState,
    callId,
    micOn,
    remoteMicOn,
    callMuted,
    callHidden,
    callSeconds,
    callStartedAt,
    remoteAudioRef,
    setScreen,
    navigate,
    login,
    logout,
    updatePreference,
    enableBrowserNotifications,
    disableBrowserNotifications,
    startCall,
    acceptCall,
    declineIncoming,
    hangup,
    toggleMic,
    hideCall,
    returnToCall,
    callAction,
    enterStudyMode,
    playRemoteAudio,
    setCallHidden,
    setCallMuted,
    remoteMic,
    sendMessage,
    unlockWithPromo,
    restoreChat,
    deleteMessage,
    archiveChat,
    deleteHistory,
    startGame,
    endGame,
    updateGameScore,
    requestPermission,
    permissionAction,
    markNotificationsRead,
    markInboxRead,
    changePassword,
    loadMessages,
    loadInbox,
    loadPermissions,
    loadNotifications,
    loadSummary,
    refreshAll,
    dismissError,
    dismissNotice,
    setError: showError,
    setNotice: showNotice,
    dismissButterfly: (id: string) =>
      setButterflies((current) => current.filter((value) => value !== id))
  };
}

export type DuoApi = ReturnType<typeof useDuoApp>;

export const DuoContext = createContext<DuoApi | null>(null);

export function useDuo() {
  const context = useContext(DuoContext);
  if (!context) throw new Error('useDuo must be used inside DuoContext.Provider');
  return context;
}

export { ApiError };
