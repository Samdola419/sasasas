import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  deleteDoc,
  where,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import type { MediaItem, UserPreferences, WatchProgressEntry } from '../types/media';

export const STORE_MY_LIST = 'animestream.mylist.v1';
export const STORE_CONTINUE = 'animestream.continue.v1';
export const STORE_PROGRESS = 'animestream.progress.v1';
export const STORE_MANGA_PROGRESS = 'animestream.manga.progress.v1';
export const STORE_LANG = 'animestream.lang';
export const STORE_AUTONEXT = 'animestream.autonext';
export const STORE_MANGA_SAVER = 'animestream.manga.saver';
export const STORE_LOCAL_VOLUME = 'animestream.room.volume';

const SAVEABLE_TYPES = new Set(['anime', 'movie', 'tv']);
const RICH_FIELDS: (keyof MediaItem)[] = [
  '_poster',
  '_posterFallback',
  '_backdrop',
  'bannerImage',
  'summary',
  'description',
  '_sub',
  'seasonYear',
  'averageScore',
  'episodes',
  'genres',
];

export function isSaveableType(type?: string): boolean {
  return SAVEABLE_TYPES.has(String(type || 'anime').toLowerCase());
}

export function mediaKeyOf(item: Partial<MediaItem> | null | undefined): string {
  const m = item || {};
  return `${m._type || 'anime'}:${m.id || m.imdb || m.tmdb || m.tvmaze || m._title || m.title || ''}`.toLowerCase();
}

export function safeDocIdFromKey(key: string): string {
  const cleaned = String(key || '')
    .replace(/[^a-zA-Z0-9_:.-]/g, '_')
    .slice(0, 150);
  if (!cleaned) return 'item';
  return cleaned.length < 2 ? `k_${cleaned}` : cleaned;
}

export function serializeMedia(item: Partial<MediaItem>): MediaItem {
  const m = item || {};
  const rawType = String(m._type || 'anime').toLowerCase();
  const type = (SAVEABLE_TYPES.has(rawType) ? rawType : 'anime') as MediaItem['_type'];
  const title = String(m._title || m.title || 'Untitled').trim().slice(0, 240) || 'Untitled';
  const cleanGenres = (Array.isArray(m.genres) ? m.genres : Array.isArray(m._genres) ? m._genres : [])
    .filter((g): g is string => typeof g === 'string' && g.trim().length > 0)
    .slice(0, 8);
  const out: MediaItem = {
    _type: type,
    id: m.id ?? m.ani_id ?? m.tmdb ?? m.imdb ?? m.tvmaze ?? '',
    idMal: Math.max(0, Number(m.idMal || m.mal_id) || 0),
    ani_id: Math.max(0, Number(m.ani_id || m.id) || 0),
    mal_id: Math.max(0, Number(m.mal_id || m.idMal) || 0),
    imdb: String(m.imdb || ''),
    tmdb: m.tmdb ?? '',
    tvmaze: m.tvmaze ?? '',
    _title: title,
    title,
    _poster: String(m._poster || ''),
    _posterFallback: String(m._posterFallback || ''),
    _backdrop: String(m._backdrop || m.bannerImage || m._poster || ''),
    bannerImage: String(m.bannerImage || m._backdrop || ''),
    summary: String(m.summary || m.description || '').slice(0, 1000),
    description: String(m.description || m.summary || '').slice(0, 1000),
    _sub: String(m._sub || ''),
    episodes: Math.max(0, Number(m.episodes) || 0),
    seasonYear: m.seasonYear ?? '',
    averageScore: typeof m.averageScore === 'number' && Number.isFinite(m.averageScore) ? m.averageScore : null,
    genres: cleanGenres,
    _src: String(m._src || ''),
  };
  if (typeof m._savedAt === 'number' && Number.isFinite(m._savedAt) && m._savedAt >= 0) {
    out._savedAt = m._savedAt;
  }
  if (typeof m._updatedAt === 'number' && Number.isFinite(m._updatedAt) && m._updatedAt >= 0) {
    out._updatedAt = m._updatedAt;
  }
  return out;
}

export function mergeRichMedia(fresh: MediaItem, stored?: Partial<MediaItem>): MediaItem {
  const out: MediaItem = { ...(stored || {}), ...fresh };
  for (const field of RICH_FIELDS) {
    const v = fresh[field];
    const was = stored?.[field];
    const empty = Array.isArray(v) ? !v.length : v === '' || v == null || v === 0;
    if (empty && was != null) {
      if (Array.isArray(was)) (out as any)[field] = [...was];
      else (out as any)[field] = was;
    }
  }
  if (!out.episodes || out.episodes < 0) out.episodes = 0;
  return out;
}

// ---- Local Storage Helpers ----

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore private browsing quota errors
  }
}

export function getLocalMyList(): MediaItem[] {
  const list = readJson<MediaItem[]>(STORE_MY_LIST, []);
  return Array.isArray(list) ? list.filter((x) => isSaveableType(x?._type)) : [];
}

export function getLocalContinueList(): MediaItem[] {
  const list = readJson<MediaItem[]>(STORE_CONTINUE, []);
  return Array.isArray(list) ? list.filter((x) => isSaveableType(x?._type)) : [];
}

export function getLocalWatchProgress(): Record<string, WatchProgressEntry> {
  const map = readJson<Record<string, WatchProgressEntry>>(STORE_PROGRESS, {});
  return map && typeof map === 'object' && !Array.isArray(map) ? map : {};
}

export function getLocalMangaProgress(): Record<string, { chapterId: string; updatedAt: number }> {
  const raw = readJson<Record<string, string | { chapterId: string; updatedAt: number }>>(STORE_MANGA_PROGRESS, {});
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, { chapterId: string; updatedAt: number }> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === 'string') out[k] = { chapterId: v, updatedAt: 0 };
    else if (v && typeof v === 'object' && v.chapterId) out[k] = { chapterId: String(v.chapterId), updatedAt: Number(v.updatedAt) || 0 };
  }
  return out;
}

export function getLocalPreferences(): UserPreferences {
  let lang: 'sub' | 'dub' = 'sub';
  let autoNext = true;
  let mangaSaver = false;
  let localVolume = 0.8;
  try {
    lang = localStorage.getItem(STORE_LANG) === 'dub' ? 'dub' : 'sub';
    autoNext = localStorage.getItem(STORE_AUTONEXT) !== '0';
    mangaSaver = localStorage.getItem(STORE_MANGA_SAVER) === '1';
    const vol = Number(localStorage.getItem(STORE_LOCAL_VOLUME));
    if (Number.isFinite(vol) && vol >= 0 && vol <= 1) localVolume = vol;
  } catch {
    // ignore
  }
  return { lang, autoNext, mangaSaver, localVolume, updatedAt: Date.now() };
}

export function saveLocalPreferences(prefs: UserPreferences): void {
  try {
    localStorage.setItem(STORE_LANG, prefs.lang);
    localStorage.setItem(STORE_AUTONEXT, prefs.autoNext ? '1' : '0');
    localStorage.setItem(STORE_MANGA_SAVER, prefs.mangaSaver ? '1' : '0');
    localStorage.setItem(STORE_LOCAL_VOLUME, String(prefs.localVolume));
  } catch {
    // ignore
  }
}

export function clearLocalSyncedAccountData(): void {
  try {
    localStorage.removeItem(STORE_MY_LIST);
    localStorage.removeItem(STORE_CONTINUE);
    localStorage.removeItem(STORE_PROGRESS);
    localStorage.removeItem(STORE_MANGA_PROGRESS);
  } catch {
    // ignore
  }
}

// ---- Cloud Library Sync Manager ----

export interface LibrarySnapshot {
  myList: MediaItem[];
  continueWatching: MediaItem[];
  watchProgress: Record<string, WatchProgressEntry>;
  mangaProgress: Record<string, { chapterId: string; updatedAt: number }>;
  preferences: UserPreferences;
}

export function mergeLibrarySnapshots(local: LibrarySnapshot, cloud: LibrarySnapshot): LibrarySnapshot {
  // 1. Merge My List by mediaKey, keeping most recently saved/updated + merged rich metadata
  const listMap = new Map<string, MediaItem>();
  for (const item of [...cloud.myList, ...local.myList]) {
    if (!item || !isSaveableType(item._type)) continue;
    const k = mediaKeyOf(item);
    const prev = listMap.get(k);
    if (!prev) {
      listMap.set(k, item);
    } else {
      const prevTs = Number(prev._savedAt || prev._updatedAt || 0);
      const currTs = Number(item._savedAt || item._updatedAt || 0);
      listMap.set(k, currTs >= prevTs ? mergeRichMedia(item, prev) : mergeRichMedia(prev, item));
    }
  }
  const myList = Array.from(listMap.values())
    .sort((a, b) => (Number(b._savedAt || 0) - Number(a._savedAt || 0)))
    .slice(0, 300);

  // 2. Merge Continue Watching by mediaKey, keeping most recent _updatedAt
  const contMap = new Map<string, MediaItem>();
  for (const item of [...cloud.continueWatching, ...local.continueWatching]) {
    if (!item || !isSaveableType(item._type)) continue;
    const k = mediaKeyOf(item);
    const prev = contMap.get(k);
    if (!prev) {
      contMap.set(k, item);
    } else {
      const prevTs = Number(prev._updatedAt || 0);
      const currTs = Number(item._updatedAt || 0);
      contMap.set(k, currTs >= prevTs ? mergeRichMedia(item, prev) : mergeRichMedia(prev, item));
    }
  }
  const continueWatching = Array.from(contMap.values())
    .sort((a, b) => (Number(b._updatedAt || 0) - Number(a._updatedAt || 0)))
    .slice(0, 40);

  // 3. Merge Watch Progress by key, keeping newest timestamp `t`
  const watchProgress: Record<string, WatchProgressEntry> = { ...cloud.watchProgress };
  for (const [k, entry] of Object.entries(local.watchProgress)) {
    const existing = watchProgress[k];
    if (!existing || (entry.t || 0) >= (existing.t || 0)) {
      watchProgress[k] = entry;
    }
  }
  const sortedProgress = Object.entries(watchProgress)
    .sort((a, b) => (b[1].t || 0) - (a[1].t || 0))
    .slice(0, 200);

  // 4. Merge Manga Progress by mangaId, keeping newest updatedAt
  const mangaProgress: Record<string, { chapterId: string; updatedAt: number }> = { ...cloud.mangaProgress };
  for (const [k, entry] of Object.entries(local.mangaProgress)) {
    const existing = mangaProgress[k];
    if (!existing || (entry.updatedAt || 0) >= (existing.updatedAt || 0)) {
      mangaProgress[k] = entry;
    }
  }

  // 5. Merge Preferences
  const preferences: UserPreferences =
    (local.preferences.updatedAt || 0) > (cloud.preferences.updatedAt || 0)
      ? local.preferences
      : cloud.preferences;

  return {
    myList,
    continueWatching,
    watchProgress: Object.fromEntries(sortedProgress),
    mangaProgress,
    preferences,
  };
}

export async function fetchCloudLibrary(uid: string): Promise<LibrarySnapshot> {
  const base = `users/${uid}`;
  try {
    const [myListSnap, contSnap, progSnap, mangaSnap, prefSnap] = await Promise.all([
      getDocs(query(collection(db, base, 'myList'), where('uid', '==', uid))),
      getDocs(query(collection(db, base, 'continueWatching'), where('uid', '==', uid))),
      getDocs(query(collection(db, base, 'watchProgress'), where('uid', '==', uid))),
      getDocs(query(collection(db, base, 'mangaProgress'), where('uid', '==', uid))),
      getDoc(doc(db, base, 'preferences', 'main')),
    ]);

    const myList: MediaItem[] = myListSnap.docs
      .map((d) => d.data().payload as MediaItem)
      .filter((x) => x && isSaveableType(x._type));

    const continueWatching: MediaItem[] = contSnap.docs
      .map((d) => d.data().payload as MediaItem)
      .filter((x) => x && isSaveableType(x._type));

    const watchProgress: Record<string, WatchProgressEntry> = {};
    for (const d of progSnap.docs) {
      const data = d.data();
      const key = String(data.progressKey || d.id);
      watchProgress[key] = {
        e: data.episodeIndex ?? undefined,
        s: data.season ?? undefined,
        ani: data.aniId ?? undefined,
        p: data.positionSeconds ?? undefined,
        dur: data.durationSeconds ?? undefined,
        t: Number(data.clientUpdatedAt) || 0,
      };
    }

    const mangaProgress: Record<string, { chapterId: string; updatedAt: number }> = {};
    for (const d of mangaSnap.docs) {
      const data = d.data();
      mangaProgress[String(data.mangaId || d.id)] = {
        chapterId: String(data.chapterId || ''),
        updatedAt: Number(data.clientUpdatedAt) || 0,
      };
    }

    const prefData = prefSnap.exists() ? prefSnap.data() : null;
    const preferences: UserPreferences = prefData
      ? {
          lang: prefData.lang === 'dub' ? 'dub' : 'sub',
          autoNext: prefData.autoNext !== false,
          mangaSaver: !!prefData.mangaSaver,
          localVolume: typeof prefData.localVolume === 'number' ? prefData.localVolume : 0.8,
          updatedAt: prefSnap.data()?.updatedAt?.toMillis?.() || 0,
        }
      : { ...getLocalPreferences(), updatedAt: 0 };

    return { myList, continueWatching, watchProgress, mangaProgress, preferences };
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, base);
  }
}

function sanitizeWatchProgressFields(entry: WatchProgressEntry) {
  const clampNum = (val: unknown, min: number, max: number): number | null => {
    if (val == null || val === '') return null;
    const n = Number(val);
    if (!Number.isFinite(n)) return null;
    return Math.max(min, Math.min(max, n));
  };
  return {
    episodeIndex: clampNum(entry.e, 0, 5000),
    season: entry.s != null && Number(entry.s) >= 1 ? clampNum(entry.s, 1, 200) : null,
    aniId: clampNum(entry.ani, 0, Number.MAX_SAFE_INTEGER),
    positionSeconds: clampNum(entry.p, 0, 86400),
    durationSeconds: clampNum(entry.dur, 0, 86400),
    clientUpdatedAt: Math.max(0, Number(entry.t) || Date.now()),
  };
}

export async function pushMyListItemToCloud(uid: string, item: MediaItem): Promise<void> {
  if (!isSaveableType(item?._type)) return;
  const payload = serializeMedia(item);
  const key = mediaKeyOf(payload);
  const docId = safeDocIdFromKey(key);
  const path = `users/${uid}/myList/${docId}`;
  try {
    await setDoc(doc(db, 'users', uid, 'myList', docId), {
      uid,
      mediaKey: key.slice(0, 160),
      mediaType: payload._type,
      title: payload._title,
      payload,
      clientUpdatedAt: Math.max(0, Number(item._savedAt) || Date.now()),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function removeMyListItemFromCloud(uid: string, key: string): Promise<void> {
  const docId = safeDocIdFromKey(key);
  const path = `users/${uid}/myList/${docId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'myList', docId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function pushContinueItemToCloud(uid: string, item: MediaItem): Promise<void> {
  if (!isSaveableType(item?._type)) return;
  const payload = serializeMedia(item);
  const key = mediaKeyOf(payload);
  const docId = safeDocIdFromKey(key);
  const path = `users/${uid}/continueWatching/${docId}`;
  try {
    await setDoc(doc(db, 'users', uid, 'continueWatching', docId), {
      uid,
      mediaKey: key.slice(0, 160),
      mediaType: payload._type,
      title: payload._title,
      payload,
      clientUpdatedAt: Math.max(0, Number(item._updatedAt) || Date.now()),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function removeContinueItemFromCloud(uid: string, key: string): Promise<void> {
  const docId = safeDocIdFromKey(key);
  const path = `users/${uid}/continueWatching/${docId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'continueWatching', docId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function pushWatchProgressToCloud(
  uid: string,
  progressKey: string,
  entry: WatchProgressEntry
): Promise<void> {
  const docId = safeDocIdFromKey(progressKey);
  const path = `users/${uid}/watchProgress/${docId}`;
  const clean = sanitizeWatchProgressFields(entry);
  try {
    await setDoc(doc(db, 'users', uid, 'watchProgress', docId), {
      uid,
      progressKey: progressKey.slice(0, 160),
      ...clean,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function removeWatchProgressFromCloud(uid: string, progressKey: string): Promise<void> {
  const docId = safeDocIdFromKey(progressKey);
  const path = `users/${uid}/watchProgress/${docId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'watchProgress', docId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function pushMangaProgressToCloud(
  uid: string,
  mangaId: string,
  chapterId: string,
  clientUpdatedAt: number
): Promise<void> {
  const cleanMangaId = String(mangaId || '').trim().slice(0, 128);
  const cleanChapterId = String(chapterId || '').trim().slice(0, 128);
  if (!cleanMangaId || !cleanChapterId) return;
  const docId = safeDocIdFromKey(cleanMangaId);
  const path = `users/${uid}/mangaProgress/${docId}`;
  try {
    await setDoc(doc(db, 'users', uid, 'mangaProgress', docId), {
      uid,
      mangaId: cleanMangaId,
      chapterId: cleanChapterId,
      clientUpdatedAt: Math.max(0, Number(clientUpdatedAt) || Date.now()),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function pushPreferencesToCloud(uid: string, prefs: UserPreferences): Promise<void> {
  const path = `users/${uid}/preferences/main`;
  try {
    await setDoc(doc(db, 'users', uid, 'preferences', 'main'), {
      uid,
      lang: prefs.lang === 'dub' ? 'dub' : 'sub',
      autoNext: Boolean(prefs.autoNext),
      mangaSaver: Boolean(prefs.mangaSaver),
      localVolume: Math.max(0, Math.min(1, Number.isFinite(prefs.localVolume) ? prefs.localVolume : 0.8)),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function syncSnapshotToCloud(uid: string, snapshot: LibrarySnapshot): Promise<void> {
  const batch = writeBatch(db);
  let ops = 0;

  for (const item of snapshot.myList.slice(0, 120)) {
    if (!isSaveableType(item?._type)) continue;
    const payload = serializeMedia(item);
    const key = mediaKeyOf(payload);
    const docId = safeDocIdFromKey(key);
    batch.set(doc(db, 'users', uid, 'myList', docId), {
      uid,
      mediaKey: key.slice(0, 160),
      mediaType: payload._type,
      title: payload._title,
      payload,
      clientUpdatedAt: Math.max(0, Number(item._savedAt) || Date.now()),
      updatedAt: serverTimestamp(),
    });
    ops++;
  }

  for (const item of snapshot.continueWatching.slice(0, 40)) {
    if (!isSaveableType(item?._type)) continue;
    const payload = serializeMedia(item);
    const key = mediaKeyOf(payload);
    const docId = safeDocIdFromKey(key);
    batch.set(doc(db, 'users', uid, 'continueWatching', docId), {
      uid,
      mediaKey: key.slice(0, 160),
      mediaType: payload._type,
      title: payload._title,
      payload,
      clientUpdatedAt: Math.max(0, Number(item._updatedAt) || Date.now()),
      updatedAt: serverTimestamp(),
    });
    ops++;
  }

  for (const [key, entry] of Object.entries(snapshot.watchProgress).slice(0, 100)) {
    if (!key || key.length < 2) continue;
    const docId = safeDocIdFromKey(key);
    batch.set(doc(db, 'users', uid, 'watchProgress', docId), {
      uid,
      progressKey: key.slice(0, 160),
      ...sanitizeWatchProgressFields(entry),
      updatedAt: serverTimestamp(),
    });
    ops++;
  }

  for (const [mangaId, entry] of Object.entries(snapshot.mangaProgress).slice(0, 100)) {
    const cleanMangaId = String(mangaId || '').trim().slice(0, 128);
    const cleanChapterId = String(entry?.chapterId || '').trim().slice(0, 128);
    if (!cleanMangaId || !cleanChapterId) continue;
    const docId = safeDocIdFromKey(cleanMangaId);
    batch.set(doc(db, 'users', uid, 'mangaProgress', docId), {
      uid,
      mangaId: cleanMangaId,
      chapterId: cleanChapterId,
      clientUpdatedAt: Math.max(0, Number(entry.updatedAt) || Date.now()),
      updatedAt: serverTimestamp(),
    });
    ops++;
  }

  batch.set(doc(db, 'users', uid, 'preferences', 'main'), {
    uid,
    lang: snapshot.preferences.lang === 'dub' ? 'dub' : 'sub',
    autoNext: Boolean(snapshot.preferences.autoNext),
    mangaSaver: Boolean(snapshot.preferences.mangaSaver),
    localVolume: Math.max(0, Math.min(1, Number.isFinite(snapshot.preferences.localVolume) ? snapshot.preferences.localVolume : 0.8)),
    updatedAt: serverTimestamp(),
  });
  ops++;

  if (ops > 0) {
    try {
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${uid}/batchSync`);
    }
  }
}

export function applySnapshotToLocal(snapshot: LibrarySnapshot): void {
  writeJson(STORE_MY_LIST, snapshot.myList);
  writeJson(STORE_CONTINUE, snapshot.continueWatching);
  writeJson(STORE_PROGRESS, snapshot.watchProgress);
  writeJson(STORE_MANGA_PROGRESS, snapshot.mangaProgress);
  saveLocalPreferences(snapshot.preferences);
}

export function readLocalSnapshot(): LibrarySnapshot {
  return {
    myList: getLocalMyList(),
    continueWatching: getLocalContinueList(),
    watchProgress: getLocalWatchProgress(),
    mangaProgress: getLocalMangaProgress(),
    preferences: getLocalPreferences(),
  };
}
