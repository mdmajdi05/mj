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
  CallState,
  Contact,
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
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [activePeerId, setActivePeerId] = useState('');
  const [authOpen, setAuthOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [inboxUnread, setInboxUnread] = useState(0);
  const [activityUnread, setActivityUnread] = useState(0);
  const [otherOnline, setOtherOnline] = useState(false);
  const [peerTyping, setPeerTyping] = useState(false);
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
  const [guestMicConsent, setGuestMicConsentState] = useState(false);
  const [chatSessionUnlocked, setChatSessionUnlocked] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const userRef = useRef<User | null>(null);
  const screenRef = useRef<Screen>('HOME');
  const prefsRef = useRef<Preferences>(defaultPreferences);
  const activePeerRef = useRef('');
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
  const autoAnsweredRef = useRef('');
  const typingClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingSentRef = useRef(false);
  const peerTypingClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const privacyOutputRef = useRef<() => Promise<void>>(async () => {});
  const privacyNoticeRef = useRef(false);
  /**
   * Chat access is intentionally memory-only. It is set exclusively by a
   * successful promo-code check and is wiped on refresh, tab hide, screen
   * lock, network loss or leaving Chat. No persisted flag can reopen Chat.
   */
  const chatUnlockedRef = useRef(false);
  const mediaRequestPendingRef = useRef(false);

  userRef.current = user;
  screenRef.current = screen;
  prefsRef.current = prefs;
  activePeerRef.current = activePeerId;
  callStateRef.current = callState;
  callHiddenRef.current = callHidden;

  const setScreen = useCallback((next: Screen) => {
    screenRef.current = next;
    setScreenState(next);
  }, []);

  const unlockChatSession = useCallback(() => {
    chatUnlockedRef.current = true;
    setChatSessionUnlocked(true);
  }, []);

  const lockChatSession = useCallback(() => {
    // Host access is permanent; only Guests re-enter the promo code.
    if (userRef.current?.role === 'HOST') return;
    chatUnlockedRef.current = false;
    setChatSessionUnlocked(false);
    // Drop decrypted chat content from memory as soon as the session closes.
    setMessages([]);
    setUnread(0);
  }, []);

  const showError = useCallback((message: string) => {
    setError(message);
    setNotice('');
  }, []);

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    setError('');
  }, []);

  useEffect(() => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    if (!error && !notice) return;
    toastTimerRef.current = setTimeout(() => {
      setError('');
      setNotice('');
    }, 3200);
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, [error, notice]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      setGuestMicConsentState(localStorage.getItem('private-duo-mic-consent') === '1');
    } catch {
      // Storage can be unavailable in strict privacy modes.
    }
  }, []);

  const setGuestMicConsent = useCallback((enabled: boolean) => {
    setGuestMicConsentState(enabled);
    try {
      localStorage.setItem('private-duo-mic-consent', enabled ? '1' : '0');
    } catch {
      // The in-memory setting still applies for this session.
    }
  }, []);

  const applyPrivateOutput = useCallback(async () => {
    const audio = remoteAudioRef.current as
      | (HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> })
      | null;
    if (!audio) return;
    if (typeof audio.setSinkId !== 'function') {
      if (!privacyNoticeRef.current) {
        privacyNoticeRef.current = true;
        showNotice(
          'For private listening, connect an earpiece or headphones. This browser does not allow a website to force the speaker off.'
        );
      }
      return;
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const outputs = devices.filter((device) => device.kind === 'audiooutput');
      const privateDevice = outputs.find((device) =>
        /earpiece|receiver|headset|headphone|earbud/i.test(device.label)
      );
      if (privateDevice) {
        await audio.setSinkId(privateDevice.deviceId);
        privacyNoticeRef.current = true;
        return;
      }
    } catch {
      // Output routing is not available in every browser.
    }

    if (!privacyNoticeRef.current) {
      privacyNoticeRef.current = true;
      showNotice(
        'For private listening, connect an earpiece or headphones. Mobile browsers usually do not allow a website to force the speaker off.'
      );
    }
  }, [showNotice]);

  useEffect(() => {
    privacyOutputRef.current = applyPrivateOutput;
  }, [applyPrivateOutput]);

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
      new Notification('Study with Game', {
        body: 'You have a new message.',
        tag: 'study-with-game',
        silent: true
      });
    } catch {
      // Some mobile browsers only support service-worker notifications.
    }
  }, []);

  const addButterfly = useCallback((id: string) => {
    // Butterflies are an always-on cue for messages; only reduced-motion
    // users opt out.
    if (prefsRef.current.reducedMotion) return;
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
    // Refresh proof: only an in-memory promo unlock may load private messages.
    if (!chatUnlockedRef.current) {
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

  const loadContacts = useCallback(async () => {
    const rows = await api<Contact[]>('/chat/contacts');
    setContacts(rows);
    return rows;
  }, []);

  const loadSummary = useCallback(async () => {
    const summary = await api<Summary>('/chat/summary');
    const current = userRef.current;
    setConversationStatus(summary.status);
    setUnread(summary.unreadMessages);
    setInboxUnread(summary.unreadGameMessages);
    setActivityUnread(summary.unreadNotifications);
    if (summary.contacts) setContacts(summary.contacts);
    if (summary.peerId !== undefined) setActivePeerId(summary.peerId ?? '');
    if (current) {
      const peerId = summary.peerId;
      setOtherOnline(
        peerId
          ? summary.onlineUserIds.includes(peerId)
          : summary.onlineUserIds.some((id) => id !== current.id)
      );
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

  const openAuth = useCallback(() => {
    setAuthOpen(true);
  }, []);

  const closeAuth = useCallback(() => {
    setAuthOpen(false);
  }, []);

  const notifyTyping = useCallback((typing: boolean) => {
    const socket = socketRef.current;
    const send = (value: boolean) => {
      typingSentRef.current = value;
      socket?.emit('chat:typing', { typing: value });
    };
    if (typingClearRef.current) {
      clearTimeout(typingClearRef.current);
      typingClearRef.current = null;
    }
    if (typing) {
      if (!typingSentRef.current) send(true);
      typingClearRef.current = setTimeout(() => {
        if (typingSentRef.current) send(false);
      }, 2500);
    } else if (typingSentRef.current) {
      send(false);
    }
  }, []);

  const selectPeer = useCallback(
    async (peerId: string) => {
      await api('/chat/peer', {
        method: 'POST',
        body: JSON.stringify({ peerId })
      });
      setActivePeerId(peerId);
      setMessages([]);
      setUnread(0);
      setPeerTyping(false);
      notifyTyping(false);
      await Promise.allSettled([
        loadSummary(),
        loadMessages(),
        loadInbox(),
        loadContacts()
      ]);
    },
    [loadContacts, loadInbox, loadMessages, loadSummary, notifyTyping]
  );

  const navigate = useCallback(
    (next: Screen) => {
      const current = userRef.current;
      if (!current) {
        setAuthOpen(true);
        setMenuOpen(false);
        return;
      }
      // The ONLY way into private Chat is a fresh promo-code check in this
      // browser session. Every other link is redirected to the code screen.
      if (next === 'CHAT' && !chatUnlockedRef.current) {
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

  const loginAccount = useCallback(
    async (username: string, password: string) => {
      const account = await api<User>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });
      setUser(account);
      userRef.current = account;
      if (account.role === 'HOST') {
        chatUnlockedRef.current = true;
        setChatSessionUnlocked(true);
      }
      setAuthOpen(false);
      setScreen('HOME');
      void api('/chat/screen', {
        method: 'POST',
        body: JSON.stringify({ screen: 'HOME' })
      }).catch(() => undefined);
    },
    [setScreen]
  );

  const signupAccount = useCallback(
    async (name: string, username: string, password: string) => {
      const account = await api<User>('/auth/signup', {
        method: 'POST',
        body: JSON.stringify({ name, username, password })
      });
      setUser(account);
      userRef.current = account;
      setAuthOpen(false);
      setScreen('HOME');
      void api('/chat/screen', {
        method: 'POST',
        body: JSON.stringify({ screen: 'HOME' })
      }).catch(() => undefined);
    },
    [setScreen]
  );

  const loginHost = useCallback(
    async (password: string) => {
      const account = await api<User>('/auth/host', {
        method: 'POST',
        body: JSON.stringify({ password })
      });
      setUser(account);
      userRef.current = account;
      chatUnlockedRef.current = true;
      setChatSessionUnlocked(true);
      setScreen('HOME');
      void api('/chat/screen', {
        method: 'POST',
        body: JSON.stringify({ screen: 'HOME' })
      }).catch(() => undefined);
    },
    [setScreen]
  );

  const logout = useCallback(async () => {
    const activeId = callIdRef.current;
    if (activeId) socketRef.current?.emit('call:leave', { callId: activeId });
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    socketRef.current?.disconnect();
    socketRef.current = null;
    setUser(null);
    userRef.current = null;
    lockChatSession();
    setScreen('HOME');
    setMessages([]);
    setGameMessages([]);
    setNotifications([]);
    setPermissions([]);
    setContacts([]);
    setActivePeerId('');
    setAuthOpen(false);
    setIncomingCall(null);
    setCallState('IDLE');
    setCallId('');
    callIdRef.current = '';
  }, [lockChatSession, setScreen]);

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
    // A reload always lands on the games home. Private Chat and any active
    // call are never restored from the server after a refresh.
    // Host access is permanent. Guests must enter the promo code in this
    // browser session before any private chat content is loaded.
    if (user.role === 'HOST') {
      chatUnlockedRef.current = true;
      setChatSessionUnlocked(true);
    } else {
      chatUnlockedRef.current = false;
      setChatSessionUnlocked(false);
      setMessages([]);
      setUnread(0);
    }
    setScreen('HOME');
    void api('/chat/screen', {
      method: 'POST',
      body: JSON.stringify({ screen: 'HOME' })
    }).catch(() => undefined);

    (async () => {
      try {
        const summary = await api<Summary>('/chat/summary');
        if (!alive) return;
        setConversationStatus(summary.status);
        setUnread(0);
        setInboxUnread(summary.unreadGameMessages);
        setActivityUnread(summary.unreadNotifications);
        if (summary.contacts) setContacts(summary.contacts);
        if (summary.peerId !== undefined) setActivePeerId(summary.peerId ?? '');
        setOtherOnline(
          summary.peerId
            ? summary.onlineUserIds.includes(summary.peerId)
            : summary.onlineUserIds.some((id) => id !== user.id)
        );
      } catch {
        // A missing summary is not fatal; the app still starts on HOME.
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
  }, [user?.id, setScreen]);

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
        void privacyOutputRef.current?.();
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
    autoAnsweredRef.current = '';
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
    mediaRequestPendingRef.current = true;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true }
      });
    } finally {
      mediaRequestPendingRef.current = false;
    }
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

  /** Host starts muted; the Guest starts with their mic on. */
  const applyDefaultMic = useCallback(() => {
    const enabled = userRef.current?.role !== 'HOST';
    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = enabled;
    });
    setMicOn(enabled);
    return enabled;
  }, []);

  const startCall = useCallback(async () => {
    try {
      if (pcRef.current || localStreamRef.current) closeLocalCall();
      lastOfferAtRef.current = 0;
      await ensurePeer();
      applyDefaultMic();
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
  }, [applyDefaultMic, closeLocalCall, ensurePeer, showError]);

  const acceptCall = useCallback(async () => {
    if (!incomingCall) return;
    try {
      await ensurePeer();
      const micEnabled = applyDefaultMic();
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
        enabled: micEnabled
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
  }, [applyDefaultMic, ensurePeer, handleSignal, incomingCall, showError]);

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

  /** Explicit Chat close: end the call, forget the chat session, go home. */
  const closePrivateChat = useCallback(() => {
    const activeId = callIdRef.current;
    if (activeId) {
      socketRef.current?.emit(
        userRef.current?.role === 'HOST' ? 'call:end' : 'call:leave',
        { callId: activeId }
      );
    }
    closeLocalCall();
    lockChatSession();
    setScreen('HOME');
    void api('/chat/screen', {
      method: 'POST',
      body: JSON.stringify({ screen: 'HOME' })
    }).catch(() => undefined);
  }, [closeLocalCall, lockChatSession, setScreen]);

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

  /** Guest's Done button: mute both microphones through the backend. */
  const guestDone = useCallback(() => {
    if (callIdRef.current) {
      socketRef.current?.emit('call:remote-mic', { enabled: false });
    }
    setLocalMic(false);
  }, [setLocalMic]);

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
      if (userRef.current?.role === 'HOST') {
        toggleMic();
      }
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
    // Chat stays hidden. Returning to it needs the promo code again.
    lockChatSession();
    navigate('STUDY');
  }, [lockChatSession, micOn, navigate, setLocalMic]);

  const playRemoteAudio = useCallback(() => {
    if (!remoteAudioRef.current) return;
    remoteAudioRef.current.muted = callMuted;
    void remoteAudioRef.current.play().catch(() => undefined);
  }, [callMuted]);

  const remoteMic = useCallback(
    (enabled: boolean) => {
      socketRef.current?.emit('call:remote-mic', { enabled });
    },
    []
  );

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

  useEffect(() => {
    if (callState === 'ACTIVE') void applyPrivateOutput();
  }, [callState, applyPrivateOutput]);

  useEffect(() => {
    if (!incomingCall) autoAnsweredRef.current = '';
  }, [incomingCall]);

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
      // Intentionally empty: no call or chat session is resumed automatically.
    });

    socket.on('disconnect', () => {
      // Privacy rule: losing the live connection closes Chat and ends any call
      // locally instead of leaving a hidden session running in the background.
      closeLocalCall();
      lockChatSession();
      setScreen('HOME');
      void api('/chat/screen', {
        method: 'POST',
        body: JSON.stringify({ screen: 'HOME' })
      }).catch(() => undefined);
    });

    socket.on('connect_error', () =>
      showError('Live connection unavailable. Check the API and network configuration.')
    );
    socket.on('message:error', (payload: any) => showError(payload?.error || 'Message failed'));
    socket.on('game:error', (payload: any) => showError(payload?.error || 'Game event failed'));

    socket.on('message:new', (message: Message) => {
      // Never keep private message content in memory unless Chat was opened
      // with a valid promo code in this session.
      if (!chatUnlockedRef.current) return;
      const current = userRef.current;
      if (
        current?.role === 'HOST' &&
        activePeerRef.current &&
        message.senderId !== current.id &&
        message.senderId !== activePeerRef.current
      ) {
        void loadContacts().catch(() => undefined);
        return;
      }
      setMessages((currentMessages) =>
        currentMessages.some((item) => item.id === message.id)
          ? currentMessages
          : [...currentMessages, message]
      );
      if (current && message.senderId !== current.id) {
        setPeerTyping(false);
        if (peerTypingClearRef.current) clearTimeout(peerTypingClearRef.current);
      }
      if (current && message.senderId !== current.id && screenRef.current !== 'CHAT') {
        setUnread((value) => value + 1);
      }
      void loadContacts().catch(() => undefined);
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

    socket.on('message:hidden', (payload: { ids?: string[]; all?: boolean }) => {
      if (payload?.all) {
        setMessages([]);
        return;
      }
      const ids = payload?.ids ?? [];
      if (!ids.length) return;
      const hidden = new Set(ids);
      setMessages((current) => current.filter((message) => !hidden.has(message.id)));
    });

    socket.on('chat:typing', (payload: { userId?: string; typing?: boolean }) => {
      const current = userRef.current;
      if (!current || !payload?.userId || payload.userId === current.id) return;
      if (
        current.role === 'HOST' &&
        activePeerRef.current &&
        payload.userId !== activePeerRef.current
      ) {
        return;
      }
      setPeerTyping(Boolean(payload.typing));
      if (peerTypingClearRef.current) clearTimeout(peerTypingClearRef.current);
      if (payload.typing) {
        peerTypingClearRef.current = setTimeout(() => setPeerTyping(false), 4000);
      }
    });

    socket.on('game:message:new', (message: GameMessage) => {
      const current = userRef.current;
      if (
        current?.role === 'HOST' &&
        activePeerRef.current &&
        message.senderId !== current.id &&
        message.senderId !== activePeerRef.current
      ) {
        void loadInbox().catch(() => undefined);
        return;
      }
      setGameMessages((currentMessages) =>
        currentMessages.some((item) => item.id === message.id)
          ? currentMessages
          : [...currentMessages, message]
      );
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
      showNotice('Game Chat messages were cleared.');
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
      const peerId = activePeerRef.current;
      setOtherOnline(
        peerId
          ? payload.onlineUserIds.includes(peerId)
          : payload.onlineUserIds.some((id) => (current ? id !== current.id : true))
      );
      void loadContacts().catch(() => undefined);
    });

    socket.on('presence:update', (payload: { userId: string; online: boolean }) => {
      const current = userRef.current;
      const peerId = activePeerRef.current;
      if (peerId) {
        if (payload.userId === peerId) setOtherOnline(payload.online);
      } else if (current && payload.userId !== current.id) {
        setOtherOnline(payload.online);
      }
      void loadContacts().catch(() => undefined);
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
    });
    socket.on('call:remote-mic:sent', () => undefined);
    socket.on('call:ended', () => {
      closeLocalCall();
    });
    socket.on('call:participant-left', () => undefined);
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
    loadContacts,
    loadMessages,
    loadNotifications,
    loadPermissions,
    lockChatSession,
    playNotificationSound,
    sendOffer,
    setScreen,
    showBrowserNotification,
    showError,
    showNotice
  ]);

  /**
   * Privacy guard: refreshing, closing/hiding the tab, locking the screen or
   * switching apps ends the call, forgets the chat session and returns to the
   * games home. Nothing about the private chat survives in memory.
   */
  useEffect(() => {
    if (!user) return;

    const closeForPrivacy = (force = false) => {
      const privateSurface =
        screenRef.current === 'CHAT' ||
        screenRef.current === 'STUDY' ||
        Boolean(callIdRef.current) ||
        chatUnlockedRef.current;
      if (!force && !privateSurface) return;

      const activeId = callIdRef.current;
      if (activeId) {
        socketRef.current?.emit(
          userRef.current?.role === 'HOST' ? 'call:end' : 'call:leave',
          { callId: activeId }
        );
      }
      closeLocalCall();
      lockChatSession();
      setScreen('HOME');
      void api('/chat/screen', {
        method: 'POST',
        body: JSON.stringify({ screen: 'HOME' })
      }).catch(() => undefined);
    };

    const onVisibility = () => {
      if (document.visibilityState !== 'hidden') return;
      // A microphone permission sheet can briefly hide the page. Do not treat
      // that as the user locking their screen.
      if (mediaRequestPendingRef.current) return;
      closeForPrivacy();
    };
    const onPageHide = () => closeForPrivacy(true);

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [user?.id, closeLocalCall, lockChatSession, setScreen]);

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
      if (destination === 'CHAT' && !chatUnlockedRef.current) {
        // Never reveal the code gate: fall back to the game thread.
        destination = 'GAME';
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
      // Memory-only grant. A refresh wipes this, so the code is required again.
      unlockChatSession();
      await loadMessages();
      setConversationStatus('ACTIVE');
      navigate('CHAT');
    },
    [loadMessages, navigate, unlockChatSession]
  );

  const restoreChat = useCallback(
    async (command: string) => {
      if (!chatUnlockedRef.current) {
        navigate('PROMO');
        return;
      }
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
    },
    [loadMessages, navigate]
  );

  const deleteMessage = useCallback(
    async (id: string) => {
      await api(`/chat/messages/${id}`, { method: 'DELETE' });
      setMessages((current) => current.filter((message) => message.id !== id));
    },
    []
  );

  const deleteMessages = useCallback(async (ids: string[]) => {
    if (!ids.length) return 0;
    const result = await api<{ count: number }>('/chat/messages/delete', {
      method: 'POST',
      body: JSON.stringify({ ids })
    });
    const hidden = new Set(ids);
    setMessages((current) => current.filter((message) => !hidden.has(message.id)));
    return result.count;
  }, []);

  /** Clears this account's view only; the other participant keeps their copy. */
  const deleteAllForMe = useCallback(async () => {
    const result = await api<{ count: number }>('/chat/messages/hide-all', {
      method: 'POST'
    });
    setMessages([]);
    return result.count;
  }, []);

  const archiveChat = useCallback(async () => {
    await api('/chat/archive', { method: 'POST' });
    setConversationStatus('ARCHIVED');
  }, []);

  const deleteHistory = useCallback(async () => {
    await api('/chat/history', { method: 'DELETE' });
    setMessages([]);
    setConversationStatus('DELETED');
  }, []);

  const startGame = useCallback(
    (slug: string) => {
      if (!userRef.current) {
        setAuthOpen(true);
        return;
      }
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
    contacts,
    activePeerId,
    authOpen,
    openAuth,
    closeAuth,
    selectPeer,
    loadContacts,
    otherOnline,
    peerTyping,
    notifyTyping,
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
    guestMicConsent,
    chatSessionUnlocked,
    remoteAudioRef,
    setScreen,
    navigate,
    loginAccount,
    signupAccount,
    loginHost,
    logout,
    updatePreference,
    enableBrowserNotifications,
    disableBrowserNotifications,
    startCall,
    acceptCall,
    declineIncoming,
    hangup,
    guestDone,
    closePrivateChat,
    toggleMic,
    hideCall,
    returnToCall,
    callAction,
    enterStudyMode,
    playRemoteAudio,
    setGuestMicConsent,
    setCallHidden,
    setCallMuted,
    remoteMic,
    sendMessage,
    unlockWithPromo,
    restoreChat,
    deleteMessage,
    deleteMessages,
    deleteAllForMe,
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
