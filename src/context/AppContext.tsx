import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  clearLocalSyncedAccountData,
  fetchCloudLibrary,
  mediaKeyOf,
  mergeLibrarySnapshots,
  mergeRichMedia,
  pushContinueItemToCloud,
  pushMangaProgressToCloud,
  pushMyListItemToCloud,
  pushPreferencesToCloud,
  pushWatchProgressToCloud,
  readLocalSnapshot,
  removeContinueItemFromCloud,
  removeMyListItemFromCloud,
  removeWatchProgressFromCloud,
  serializeMedia,
  syncSnapshotToCloud,
  applySnapshotToLocal,
  type LibrarySnapshot,
} from '../lib/library';
import { ensureUserProfile, signOutAccount, subscribeAuthState } from '../lib/auth';
import type { MediaItem, UserPreferences, UserProfile, WatchProgressEntry } from '../types/media';

export interface ToastItem {
  id: number;
  message: string;
}

interface AppContextValue {
  // Navigation
  route: string;
  previousRoute: string | null;
  navigate: (path: string, replace?: boolean) => void;
  goBack: (fallbackPath?: string) => void;
  // Auth
  user: User | null;
  profile: UserProfile | null;
  authReady: boolean;
  setProfile: React.Dispatch<React.SetStateAction<UserProfile | null>>;
  logout: () => Promise<void>;
  // Library & Preferences (Guest local + Cloud Firestore synced)
  myList: MediaItem[];
  continueWatching: MediaItem[];
  watchProgress: Record<string, WatchProgressEntry>;
  mangaProgress: Record<string, { chapterId: string; updatedAt: number }>;
  preferences: UserPreferences;
  inMyList: (item: Partial<MediaItem> | null | undefined) => boolean;
  toggleMyList: (item: MediaItem) => boolean;
  recordContinueWatching: (item: MediaItem) => void;
  removeContinueWatching: (item: Partial<MediaItem>) => void;
  saveWatchProgress: (key: string, entry: Omit<WatchProgressEntry, 't'>) => void;
  clearWatchProgress: (key: string) => void;
  getWatchProgress: (key: string) => WatchProgressEntry | null;
  saveMangaProgress: (mangaId: string, chapterId: string) => void;
  updatePreferences: (patch: Partial<UserPreferences>) => void;
  // Modals & Search & Notifications
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
  authModalOpen: boolean;
  authModalTab: 'login' | 'signup' | 'reset';
  openAuthModal: (tab?: 'login' | 'signup' | 'reset', onSuccess?: () => void) => void;
  closeAuthModal: () => void;
  triggerAuthSuccess: () => void;
  joinRoomModalOpen: boolean;
  setJoinRoomModalOpen: (open: boolean) => void;
  flashNote: (message: string) => void;
  toasts: ToastItem[];
  // Active room tracking for navigation guards
  activeRoomId: string | null;
  setActiveRoomId: (roomId: string | null) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [route, setRoute] = useState<string>(() => {
    const qs = new URLSearchParams(location.search);
    const t = qs.get('t');
    const id = qs.get('id');
    if (t && id && ['anime', 'movie', 'tv'].includes(t)) {
      return `/t/${encodeURIComponent(t)}/${encodeURIComponent(id)}`;
    }
    return location.pathname + location.search;
  });

  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const initialLocal = useMemo(() => readLocalSnapshot(), []);
  const [myList, setMyList] = useState<MediaItem[]>(initialLocal.myList);
  const [continueWatching, setContinueWatching] = useState<MediaItem[]>(initialLocal.continueWatching);
  const [watchProgress, setWatchProgress] = useState<Record<string, WatchProgressEntry>>(initialLocal.watchProgress);
  const [mangaProgress, setMangaProgress] = useState<Record<string, { chapterId: string; updatedAt: number }>>(
    initialLocal.mangaProgress
  );
  const [preferences, setPreferences] = useState<UserPreferences>(initialLocal.preferences);

  const [searchOpen, setSearchOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalTab, setAuthModalTab] = useState<'login' | 'signup' | 'reset'>('login');
  const pendingAuthCallbackRef = useRef<(() => void) | null>(null);
  const [joinRoomModalOpen, setJoinRoomModalOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);

  const toastSeqRef = useRef(1);
  const debounceTimersRef = useRef<Map<string, number>>(new Map());
  const prevUidRef = useRef<string | null>(null);
  const navStackRef = useRef<string[]>([route]);
  const navCursorRef = useRef<number>(0);
  const [previousRoute, setPreviousRoute] = useState<string | null>(null);

  const flashNote = useCallback((message: string) => {
    const id = toastSeqRef.current++;
    setToasts((prev) => [...prev.slice(-2), { id, message }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3600);
  }, []);

  // Persist snapshot to localStorage whenever library state updates
  useEffect(() => {
    applySnapshotToLocal({
      myList,
      continueWatching,
      watchProgress,
      mangaProgress,
      preferences,
    });
  }, [myList, continueWatching, watchProgress, mangaProgress, preferences]);

  useEffect(() => {
    const curState = history.state;
    if (!curState || typeof curState.amIdx !== 'number') {
      history.replaceState({ amIdx: 0, amRoute: route }, '', route);
    } else {
      navCursorRef.current = Math.max(0, curState.amIdx);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Browser navigation listener
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const next = location.pathname + location.search;
      if (e.state && typeof e.state.amIdx === 'number') {
        navCursorRef.current = Math.max(0, e.state.amIdx);
        if (!navStackRef.current[navCursorRef.current]) {
          navStackRef.current[navCursorRef.current] = next;
        }
      } else {
        navCursorRef.current = Math.max(0, navCursorRef.current - 1);
      }
      setPreviousRoute(navCursorRef.current > 0 ? navStackRef.current[navCursorRef.current - 1] || null : null);
      setRoute(next);
      setSearchOpen(false);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((nextPath: string, replace = false) => {
    const clean = nextPath.startsWith('/') ? nextPath : `/${nextPath}`;
    const current = location.pathname + location.search;
    if (replace) {
      navStackRef.current[navCursorRef.current] = clean;
      history.replaceState({ amIdx: navCursorRef.current, amRoute: clean }, '', clean);
    } else if (current !== clean) {
      const nextIdx = navCursorRef.current + 1;
      navStackRef.current = [...navStackRef.current.slice(0, nextIdx), clean];
      navCursorRef.current = nextIdx;
      history.pushState({ amIdx: nextIdx, amRoute: clean }, '', clean);
    }
    setPreviousRoute(navCursorRef.current > 0 ? navStackRef.current[navCursorRef.current - 1] || null : null);
    setRoute(clean);
    setSearchOpen(false);
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, []);

  const goBack = useCallback(
    (fallbackPath = '/') => {
      if (navCursorRef.current > 0) {
        window.history.back();
        return;
      }
      navigate(fallbackPath, true);
    },
    [navigate]
  );

  // Subscribe to Firebase Auth & hydrate merged Cloud Library
  useEffect(() => {
    const unsub = subscribeAuthState(async (nextUser) => {
      setUser(nextUser);
      if (!nextUser) {
        setProfile(null);
        prevUidRef.current = null;
        setAuthReady(true);
        return;
      }

      const justSignedIn = prevUidRef.current !== nextUser.uid;
      prevUidRef.current = nextUser.uid;

      try {
        const prof = await ensureUserProfile(nextUser);
        setProfile(prof);
        const cloud = await fetchCloudLibrary(nextUser.uid);
        const local = readLocalSnapshot();
        const merged = mergeLibrarySnapshots(local, cloud);
        setMyList(merged.myList);
        setContinueWatching(merged.continueWatching);
        setWatchProgress(merged.watchProgress);
        setMangaProgress(merged.mangaProgress);
        setPreferences(merged.preferences);
        applySnapshotToLocal(merged);
        if (justSignedIn) {
          syncSnapshotToCloud(nextUser.uid, merged).catch(() => {});
        }
      } catch (err) {
        console.warn('Cloud library hydration warning:', err);
      } finally {
        setAuthReady(true);
      }
    });
    return () => unsub();
  }, []);

  const openAuthModal = useCallback((tab: 'login' | 'signup' | 'reset' = 'login', onSuccess?: () => void) => {
    setAuthModalTab(tab);
    pendingAuthCallbackRef.current = onSuccess || null;
    setAuthModalOpen(true);
  }, []);

  const closeAuthModal = useCallback(() => {
    setAuthModalOpen(false);
    pendingAuthCallbackRef.current = null;
  }, []);

  const triggerAuthSuccess = useCallback(() => {
    setAuthModalOpen(false);
    const cb = pendingAuthCallbackRef.current;
    pendingAuthCallbackRef.current = null;
    if (cb) window.setTimeout(cb, 50);
  }, []);

  const logout = useCallback(async () => {
    await signOutAccount();
    clearLocalSyncedAccountData();
    setMyList([]);
    setContinueWatching([]);
    setWatchProgress({});
    setMangaProgress({});
    setActiveRoomId(null);
    flashNote('Signed out cleanly.');
  }, [flashNote]);

  const scheduleCloudTask = useCallback((taskKey: string, fn: () => Promise<void>, delayMs = 800) => {
    const existing = debounceTimersRef.current.get(taskKey);
    if (existing) clearTimeout(existing);
    const timer = window.setTimeout(() => {
      debounceTimersRef.current.delete(taskKey);
      fn().catch((err) => console.warn(`Sync task (${taskKey}) failed:`, err));
    }, delayMs);
    debounceTimersRef.current.set(taskKey, timer);
  }, []);

  const inMyList = useCallback(
    (item: Partial<MediaItem> | null | undefined) => {
      if (!item) return false;
      const key = mediaKeyOf(item);
      return myList.some((x) => mediaKeyOf(x) === key);
    },
    [myList]
  );

  const toggleMyList = useCallback(
    (item: MediaItem) => {
      const key = mediaKeyOf(item);
      const exists = myList.some((x) => mediaKeyOf(x) === key);
      if (exists) {
        setMyList((prev) => prev.filter((x) => mediaKeyOf(x) !== key));
        if (user) scheduleCloudTask(`mylist:${key}`, () => removeMyListItemFromCloud(user.uid, key), 250);
        flashNote(`Removed "${item._title || item.title}" from My List`);
        return false;
      }
      const nextItem = serializeMedia({ ...item, _savedAt: Date.now() });
      setMyList((prev) => [nextItem, ...prev.filter((x) => mediaKeyOf(x) !== key)].slice(0, 300));
      if (user) scheduleCloudTask(`mylist:${key}`, () => pushMyListItemToCloud(user.uid, nextItem), 250);
      flashNote(`Saved "${item._title || item.title}" to My List`);
      return true;
    },
    [myList, user, scheduleCloudTask, flashNote]
  );

  const recordContinueWatching = useCallback(
    (item: MediaItem) => {
      const key = mediaKeyOf(item);
      setContinueWatching((prev) => {
        const existing = prev.find((x) => mediaKeyOf(x) === key);
        const merged = serializeMedia({
          ...(existing ? mergeRichMedia(item, existing) : item),
          _updatedAt: Date.now(),
        });
        if (user) scheduleCloudTask(`cont:${key}`, () => pushContinueItemToCloud(user.uid, merged), 900);
        return [merged, ...prev.filter((x) => mediaKeyOf(x) !== key)].slice(0, 40);
      });
    },
    [user, scheduleCloudTask]
  );

  const removeContinueWatching = useCallback(
    (item: Partial<MediaItem>) => {
      const key = mediaKeyOf(item);
      setContinueWatching((prev) => prev.filter((x) => mediaKeyOf(x) !== key));
      if (user) scheduleCloudTask(`cont:${key}`, () => removeContinueItemFromCloud(user.uid, key), 250);
    },
    [user, scheduleCloudTask]
  );

  const saveWatchProgress = useCallback(
    (key: string, entry: Omit<WatchProgressEntry, 't'>) => {
      const full: WatchProgressEntry = { ...entry, t: Date.now() };
      setWatchProgress((prev) => ({ ...prev, [key]: full }));
      if (user) scheduleCloudTask(`prog:${key}`, () => pushWatchProgressToCloud(user.uid, key, full), 1500);
    },
    [user, scheduleCloudTask]
  );

  const clearWatchProgress = useCallback(
    (key: string) => {
      setWatchProgress((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      if (user) scheduleCloudTask(`prog:${key}`, () => removeWatchProgressFromCloud(user.uid, key), 300);
    },
    [user, scheduleCloudTask]
  );

  const getWatchProgress = useCallback(
    (key: string) => watchProgress[key] || null,
    [watchProgress]
  );

  const saveMangaProgress = useCallback(
    (mangaId: string, chapterId: string) => {
      const now = Date.now();
      setMangaProgress((prev) => ({ ...prev, [mangaId]: { chapterId, updatedAt: now } }));
      if (user) scheduleCloudTask(`manga:${mangaId}`, () => pushMangaProgressToCloud(user.uid, mangaId, chapterId, now), 800);
    },
    [user, scheduleCloudTask]
  );

  const updatePreferences = useCallback(
    (patch: Partial<UserPreferences>) => {
      setPreferences((prev) => {
        const next = { ...prev, ...patch, updatedAt: Date.now() };
        if (user) scheduleCloudTask('prefs', () => pushPreferencesToCloud(user.uid, next), 600);
        return next;
      });
    },
    [user, scheduleCloudTask]
  );

  const value: AppContextValue = {
    route,
    previousRoute,
    navigate,
    goBack,
    user,
    profile,
    authReady,
    setProfile,
    logout,
    myList,
    continueWatching,
    watchProgress,
    mangaProgress,
    preferences,
    inMyList,
    toggleMyList,
    recordContinueWatching,
    removeContinueWatching,
    saveWatchProgress,
    clearWatchProgress,
    getWatchProgress,
    saveMangaProgress,
    updatePreferences,
    searchOpen,
    setSearchOpen,
    authModalOpen,
    authModalTab,
    openAuthModal,
    closeAuthModal,
    triggerAuthSuccess,
    joinRoomModalOpen,
    setJoinRoomModalOpen,
    flashNote,
    toasts,
    activeRoomId,
    setActiveRoomId,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
