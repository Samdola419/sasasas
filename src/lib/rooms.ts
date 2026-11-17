import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  setDoc,
  deleteDoc,
} from 'firebase/firestore';
import {
  ref as rtdbRef,
  set as rtdbSet,
  update as rtdbUpdate,
  remove as rtdbRemove,
  onValue as rtdbOnValue,
  onDisconnect as rtdbOnDisconnect,
} from 'firebase/database';
import { auth, db, rtdb, handleFirestoreError, OperationType } from './firebase';
import {
  clearHostKeyFromSession,
  generateHostKeyPair,
  importGuestVerifyKey,
  loadHostPrivateKey,
  saveHostKeyToSession,
  signPlaybackPacket,
  verifyPlaybackPacket,
} from './cryptoSync';
import type {
  PlayerEventMessage,
  RoomMediaSnapshot,
  RoomMember,
  RoomMessage,
  SignedPlaybackPacket,
  WatchRoomState,
} from '../types/media';

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_TTL_MS = 6 * 60 * 60 * 1000;
const HOST_STALE_MS = 120 * 1000;
export const ROOM_MAX_MEMBERS = 4;
export const ROOM_DRIFT_TOLERANCE_SEC = 0.5;
export const ROOM_SEEK_THRESHOLD_SEC = 1.25;
export const ROOM_HOST_NO_PROGRESS_PAUSE_MS = 6000;

export function normalizeRoomCode(raw: string): string {
  return String(raw || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);
}

export function extractRoomCodeInput(raw: string): string {
  const value = String(raw || '').trim();
  const match = value.match(/\/room\/([A-Za-z0-9]{4,12})/i);
  if (match) return normalizeRoomCode(match[1]);
  return normalizeRoomCode(value);
}

function generateRoomCode(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < 8; i++) {
    out += ROOM_CODE_ALPHABET[bytes[i] % ROOM_CODE_ALPHABET.length];
  }
  return out;
}

function generateId(prefix = 'id'): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${prefix}_${hex}`;
}

function generateChannelToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function tsToMs(value: unknown, fallback = Date.now()): number {
  if (typeof value === 'number') return value;
  if (value && typeof (value as Timestamp).toMillis === 'function') {
    return (value as Timestamp).toMillis();
  }
  return fallback;
}

export function mapFirestoreRoom(data: Record<string, any>): WatchRoomState {
  return {
    roomId: String(data.roomId || ''),
    code: String(data.code || ''),
    hostUid: String(data.hostUid || ''),
    status: data.status === 'ended' ? 'ended' : 'active',
    memberCount: Number(data.memberCount) || 1,
    mediaType: (data.mediaType || data.media?.type || 'anime') as WatchRoomState['mediaType'],
    media: {
      type: (data.media?.type || data.mediaType || 'anime') as RoomMediaSnapshot['type'],
      title: String(data.media?.title || 'Untitled'),
      ani_id: Number(data.media?.ani_id) || 0,
      mal_id: Number(data.media?.mal_id) || 0,
      tmdb: Number(data.media?.tmdb) || 0,
      imdb: String(data.media?.imdb || ''),
      tvmaze: Number(data.media?.tvmaze) || 0,
      episodes: Number(data.media?.episodes) || 0,
      episode_index: Math.max(1, Number(data.media?.episode_index) || 1),
      season: Math.max(1, Number(data.media?.season) || 1),
      language: data.media?.language === 'dub' ? 'dub' : 'sub',
      source_index: Math.max(0, Number(data.media?.source_index) || 0),
      source_name: String(data.media?.source_name || ''),
      position_seconds: Math.max(0, Number(data.media?.position_seconds ?? data.positionSeconds) || 0),
      playback_state: data.media?.playback_state === 'playing' || data.playbackState === 'playing' ? 'playing' : 'paused',
    },
    playbackState: data.playbackState === 'playing' ? 'playing' : 'paused',
    positionSeconds: Math.max(0, Number(data.positionSeconds) || 0),
    playbackSeq: Math.max(0, Number(data.playbackSeq) || 0),
    playbackUpdatedAt: tsToMs(data.playbackUpdatedAt, Date.now()),
    hostSigningPublicKey: data.hostSigningPublicKey || null,
    channelToken: String(data.channelToken || ''),
    revision: Math.max(1, Number(data.revision) || 1),
    createdAt: tsToMs(data.createdAt, Date.now()),
    lastActivityAt: tsToMs(data.lastActivityAt, Date.now()),
    expiresAt: tsToMs(data.expiresAt, Date.now() + ROOM_TTL_MS),
  };
}

export function mapFirestoreMember(data: Record<string, any>): RoomMember {
  return {
    uid: String(data.uid || ''),
    displayName: String(data.displayName || 'AMStream Member').slice(0, 40),
    role: data.role === 'host' ? 'host' : 'guest',
    joinedAt: tsToMs(data.joinedAt, Date.now()),
    lastSeenAt: tsToMs(data.lastSeenAt, Date.now()),
  };
}

export function mapFirestoreMessage(data: Record<string, any>): RoomMessage {
  return {
    id: String(data.id || ''),
    roomId: String(data.roomId || ''),
    senderUid: String(data.senderUid || ''),
    senderName: String(data.senderName || 'AMStream Member').slice(0, 40),
    body: String(data.body || ''),
    createdAt: tsToMs(data.createdAt, Date.now()),
  };
}

export function formatPlaybackTime(seconds: number): string {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (hrs > 0) return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export function parsePlayerMessage(raw: unknown): PlayerEventMessage | null {
  let parsed: any = raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
      const lower = trimmed.toLowerCase();
      if (lower.includes('play') && !lower.includes('pause')) return { kind: 'play' };
      if (lower.includes('pause')) return { kind: 'pause' };
      return null;
    }
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== 'object') return null;

  const eventName = String(
    parsed.event || parsed.type || parsed.action || parsed.name || parsed.status || parsed.data?.event || ''
  )
    .toLowerCase()
    .trim();

  const rawTime =
    parsed.currentTime ??
    parsed.time ??
    parsed.position ??
    parsed.seconds ??
    parsed.data?.currentTime ??
    parsed.data?.time ??
    parsed.data?.position;
  const rawDuration = parsed.duration ?? parsed.total ?? parsed.data?.duration;

  const time = Number.isFinite(Number(rawTime)) && Number(rawTime) >= 0 ? Number(rawTime) : undefined;
  const duration = Number.isFinite(Number(rawDuration)) && Number(rawDuration) > 0 ? Number(rawDuration) : undefined;

  if (['ended', 'complete', 'completed', 'finish', 'finished'].includes(eventName)) {
    return { kind: 'complete', time, duration };
  }
  if (['play', 'playing', 'resumed', 'resume', 'start'].includes(eventName)) {
    return { kind: 'play', time, duration };
  }
  if (['pause', 'paused', 'buffering_paused'].includes(eventName)) {
    return { kind: 'pause', time, duration };
  }
  if (['seek', 'seeked', 'seeking'].includes(eventName)) {
    return { kind: 'seek', time, duration };
  }
  if (['time', 'timeupdate', 'progress'].includes(eventName) || time !== undefined) {
    return { kind: 'time', time, duration };
  }
  return null;
}

export function computeLivePosition(room: WatchRoomState, nowMs = Date.now()): number {
  const base = Math.max(0, Number(room.positionSeconds) || 0);
  if (room.playbackState !== 'playing') return base;
  const elapsed = Math.max(0, (nowMs - (room.playbackUpdatedAt || nowMs)) / 1000);
  return base + Math.min(elapsed, 300);
}

// ---- Cascade Deletion Helper (matches firestore.rules pre-delete checks) ----
async function destroyRoomResources(roomId: string, code: string): Promise<void> {
  // 1. Delete messages first while room doc & member doc still exist
  try {
    const msgsSnap = await getDocs(collection(db, 'rooms', roomId, 'messages'));
    for (let i = 0; i < msgsSnap.docs.length; i += 400) {
      const batch = writeBatch(db);
      msgsSnap.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  } catch {
    // ignore if no messages or already cleared
  }

  // 2. Gather any lingering members
  const membersSnap = await getDocs(collection(db, 'rooms', roomId, 'members')).catch(() => null);

  // 3. Delete roomCodes/{code}, all members/*, and rooms/{roomId} in a single atomic batch
  const finalBatch = writeBatch(db);
  if (code) finalBatch.delete(doc(db, 'roomCodes', code));
  if (membersSnap) {
    membersSnap.docs.forEach((m) => finalBatch.delete(m.ref));
  }
  finalBatch.delete(doc(db, 'rooms', roomId));
  await finalBatch.commit();

  // 4. Clean optional RTDB nodes
  if (rtdb) {
    await Promise.allSettled([
      rtdbRemove(rtdbRef(rtdb, `roomPresence/${roomId}`)),
      rtdbRemove(rtdbRef(rtdb, `roomLive/${roomId}`)),
      rtdbRemove(rtdbRef(rtdb, `roomMeta/${roomId}`)),
      rtdbRemove(rtdbRef(rtdb, `roomAccess/${roomId}`)),
    ]);
  }
  clearHostKeyFromSession(roomId);
}

// ---- Room Lifecycle Operations ----

export async function findActiveHostedRoom(uid: string): Promise<WatchRoomState | null> {
  const q = query(collection(db, 'rooms'), where('hostUid', '==', uid), where('status', '==', 'active'));
  const snap = await getDocs(q);
  const now = Date.now();
  for (const d of snap.docs) {
    const mapped = mapFirestoreRoom(d.data());
    if (mapped.expiresAt <= now) {
      await destroyRoomResources(mapped.roomId, mapped.code).catch(() => {});
      continue;
    }
    return mapped;
  }
  return null;
}

function sanitizeRoomMedia(media: RoomMediaSnapshot): RoomMediaSnapshot {
  const title = String(media?.title || 'Untitled').trim().slice(0, 240) || 'Untitled';
  const type = media?.type === 'movie' || media?.type === 'tv' ? media.type : 'anime';
  return {
    type,
    title,
    ani_id: Math.max(0, Number(media?.ani_id) || 0),
    mal_id: Math.max(0, Number(media?.mal_id) || 0),
    tmdb: Math.max(0, Number(media?.tmdb) || 0),
    imdb: String(media?.imdb || ''),
    tvmaze: Math.max(0, Number(media?.tvmaze) || 0),
    episodes: Math.max(0, Number(media?.episodes) || 0),
    episode_index: Math.max(1, Number(media?.episode_index) || 1),
    season: Math.max(1, Number(media?.season) || 1),
    language: media?.language === 'dub' ? 'dub' : 'sub',
    source_index: Math.max(0, Number(media?.source_index) || 0),
    source_name: String(media?.source_name || ''),
    position_seconds: Math.max(0, Number(media?.position_seconds) || 0),
    playback_state: media?.playback_state === 'playing' ? 'playing' : 'paused',
  };
}

export async function createWatchRoom(
  uid: string,
  displayName: string,
  media: RoomMediaSnapshot
): Promise<{ room: WatchRoomState; cryptoPrivateKey: CryptoKey }> {
  const cleanName = String(displayName || 'AMStream Host').trim().slice(0, 40) || 'AMStream Host';
  const existing = await findActiveHostedRoom(uid);
  if (existing) {
    const err = new Error(
      `You already have an active Watch Room (${existing.code}). Leave or end it before creating another.`
    ) as Error & { existingRoom?: WatchRoomState };
    err.existingRoom = existing;
    throw err;
  }

  const keyPair = await generateHostKeyPair();
  const roomId = generateId('rm');
  const channelToken = generateChannelToken();
  const safeMedia = sanitizeRoomMedia(media);

  let createdCode = '';
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateRoomCode();
    try {
      await runTransaction(db, async (tx) => {
        const codeRef = doc(db, 'roomCodes', code);
        const codeSnap = await tx.get(codeRef);
        if (codeSnap.exists()) {
          throw new Error('CODE_COLLISION');
        }
        const expiresAt = Timestamp.fromMillis(Date.now() + ROOM_TTL_MS);
        const roomRef = doc(db, 'rooms', roomId);
        const memberRef = doc(db, 'rooms', roomId, 'members', uid);

        tx.set(roomRef, {
          roomId,
          code,
          hostUid: uid,
          status: 'active',
          memberCount: 1,
          mediaType: safeMedia.type,
          media: safeMedia,
          playbackState: safeMedia.playback_state,
          positionSeconds: safeMedia.position_seconds,
          playbackSeq: 1,
          playbackUpdatedAt: serverTimestamp(),
          hostSigningPublicKey: keyPair.publicKey,
          channelToken,
          revision: 1,
          createdAt: serverTimestamp(),
          lastActivityAt: serverTimestamp(),
          expiresAt,
        });

        tx.set(codeRef, {
          code,
          roomId,
          hostUid: uid,
          status: 'active',
          memberCount: 1,
          createdAt: serverTimestamp(),
          expiresAt,
        });

        tx.set(memberRef, {
          uid,
          displayName: cleanName,
          role: 'host',
          joinedAt: serverTimestamp(),
          lastSeenAt: serverTimestamp(),
        });
      });
      createdCode = code;
      break;
    } catch (err: any) {
      if (err?.message === 'CODE_COLLISION') continue;
      handleFirestoreError(err, OperationType.CREATE, `rooms/${roomId}`);
    }
  }

  if (!createdCode) {
    throw new Error('Could not allocate a unique room code. Please try again.');
  }

  saveHostKeyToSession(roomId, keyPair.publicKey, keyPair.privateKey);
  const snap = await getDoc(doc(db, 'rooms', roomId));
  const room = mapFirestoreRoom(snap.data() || {});

  if (rtdb) {
    await Promise.allSettled([
      rtdbSet(rtdbRef(rtdb, `roomAccess/${roomId}/${uid}`), { role: 'host', joinedAt: Date.now() }),
      rtdbSet(rtdbRef(rtdb, `roomMeta/${roomId}`), {
        hostUid: uid,
        channelToken,
        hostSigningPublicKey: keyPair.publicKey,
      }),
    ]);
  }

  return { room, cryptoPrivateKey: keyPair.cryptoPrivateKey };
}

export async function joinWatchRoom(uid: string, displayName: string, rawCode: string): Promise<WatchRoomState> {
  const code = extractRoomCodeInput(rawCode);
  if (code.length !== 8) {
    throw new Error('Enter a valid 8-character Watch Room code.');
  }
  const cleanName = String(displayName || 'AMStream Guest').trim().slice(0, 40) || 'AMStream Guest';

  // Server-side rate limit gate (20 attempts per 10 mins)
  const idToken = await auth.currentUser?.getIdToken().catch(() => '');
  if (!idToken) throw new Error('Please sign in to join a Watch Room.');

  const gateRes = await fetch('/api/rooms/join-gate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ code }),
  }).catch(() => null);
  if (gateRes && !gateRes.ok && gateRes.status !== 404 && gateRes.status !== 405) {
    const ct = gateRes.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      const errBody = await gateRes.json().catch(() => ({}));
      throw new Error(errBody.error || 'Could not validate room code right now.');
    }
  }

  const codeSnap = await getDoc(doc(db, 'roomCodes', code));
  if (!codeSnap.exists()) {
    throw new Error('Watch Room not found. Double-check the invite code or ask the host for a new link.');
  }
  const lookup = codeSnap.data();
  const roomId = String(lookup.roomId || '');
  if (!roomId || lookup.status !== 'active') {
    throw new Error('This Watch Room has already ended.');
  }
  if (tsToMs(lookup.expiresAt, 0) <= Date.now()) {
    throw new Error('This Watch Room has expired.');
  }

  // Already a member? Update display name/heartbeat and return
  const existingMemberSnap = await getDoc(doc(db, 'rooms', roomId, 'members', uid)).catch(() => null);
  if (existingMemberSnap?.exists()) {
    await updateDoc(doc(db, 'rooms', roomId, 'members', uid), {
      displayName: cleanName,
      lastSeenAt: serverTimestamp(),
    }).catch(() => {});
    const roomSnap = await getDoc(doc(db, 'rooms', roomId));
    if (!roomSnap.exists() || roomSnap.data()?.status !== 'active') {
      throw new Error('This Watch Room is no longer active.');
    }
    return mapFirestoreRoom(roomSnap.data());
  }

  if ((Number(lookup.memberCount) || 0) >= ROOM_MAX_MEMBERS) {
    throw new Error('This Watch Room is full (maximum 4 viewers).');
  }

  try {
    await runTransaction(db, async (tx) => {
      const codeRef = doc(db, 'roomCodes', code);
      const roomRef = doc(db, 'rooms', roomId);
      const memberRef = doc(db, 'rooms', roomId, 'members', uid);

      const [cSnap, rSnap, mSnap] = await Promise.all([tx.get(codeRef), tx.get(roomRef), tx.get(memberRef)]);
      if (!cSnap.exists() || !rSnap.exists()) {
        throw new Error('This Watch Room is no longer available.');
      }
      const rData = rSnap.data();
      if (rData.status !== 'active') {
        throw new Error('This Watch Room has ended.');
      }
      if (mSnap.exists()) return; // idempotent
      const count = Number(rData.memberCount) || 0;
      if (count >= ROOM_MAX_MEMBERS) {
        throw new Error('This Watch Room is full (maximum 4 viewers).');
      }

      tx.update(codeRef, { memberCount: count + 1 });
      tx.update(roomRef, {
        memberCount: count + 1,
        revision: (Number(rData.revision) || 1) + 1,
        lastActivityAt: serverTimestamp(),
      });
      tx.set(memberRef, {
        uid,
        displayName: cleanName,
        role: 'guest',
        joinedAt: serverTimestamp(),
        lastSeenAt: serverTimestamp(),
      });
    });
  } catch (err: any) {
    if (err instanceof Error && /full|ended|no longer|not found/i.test(err.message)) {
      throw err;
    }
    handleFirestoreError(err, OperationType.WRITE, `rooms/${roomId}/join`);
  }

  const finalRoomSnap = await getDoc(doc(db, 'rooms', roomId));
  const room = mapFirestoreRoom(finalRoomSnap.data() || {});

  if (rtdb) {
    await rtdbSet(rtdbRef(rtdb, `roomAccess/${roomId}/${uid}`), { role: 'guest', joinedAt: Date.now() }).catch(() => {});
  }

  return room;
}

export async function leaveWatchRoom(
  roomId: string,
  uid: string
): Promise<{ ended: boolean; newHostUid: string | null; newChannelToken: string | null }> {
  const roomSnap = await getDoc(doc(db, 'rooms', roomId)).catch(() => null);
  if (!roomSnap || !roomSnap.exists()) {
    clearHostKeyFromSession(roomId);
    return { ended: true, newHostUid: null, newChannelToken: null };
  }

  const roomData = mapFirestoreRoom(roomSnap.data());
  const membersSnap = await getDocs(collection(db, 'rooms', roomId, 'members')).catch(() => null);
  const members = membersSnap
    ? membersSnap.docs.map((d) => mapFirestoreMember(d.data())).sort((a, b) => a.joinedAt - b.joinedAt)
    : [];

  const remaining = members.filter((m) => m.uid !== uid);
  if (remaining.length === 0) {
    await destroyRoomResources(roomId, roomData.code);
    return { ended: true, newHostUid: null, newChannelToken: null };
  }

  const newChannelToken = generateChannelToken();
  const isHostLeaving = roomData.hostUid === uid;
  const successor = isHostLeaving ? remaining[0] : null;
  const nextCount = Math.max(1, remaining.length);

  await runTransaction(db, async (tx) => {
    const rRef = doc(db, 'rooms', roomId);
    const cRef = doc(db, 'roomCodes', roomData.code);
    const selfMemberRef = doc(db, 'rooms', roomId, 'members', uid);

    const [rSnap, cSnap] = await Promise.all([tx.get(rRef), tx.get(cRef)]);
    if (!rSnap.exists()) return;
    const rCurr = rSnap.data();
    const updatedCount = Math.max(1, (Number(rCurr.memberCount) || nextCount + 1) - 1);

    if (isHostLeaving && successor) {
      const nextHostRef = doc(db, 'rooms', roomId, 'members', successor.uid);
      tx.update(nextHostRef, { role: 'host' });
      tx.update(rRef, {
        hostUid: successor.uid,
        hostSigningPublicKey: null,
        channelToken: newChannelToken,
        memberCount: updatedCount,
        revision: (Number(rCurr.revision) || 1) + 1,
        lastActivityAt: serverTimestamp(),
      });
      if (cSnap.exists()) {
        tx.update(cRef, {
          hostUid: successor.uid,
          memberCount: updatedCount,
        });
      }
    } else {
      tx.update(rRef, {
        memberCount: updatedCount,
        channelToken: newChannelToken,
        revision: (Number(rCurr.revision) || 1) + 1,
        lastActivityAt: serverTimestamp(),
      });
      if (cSnap.exists()) {
        tx.update(cRef, { memberCount: updatedCount });
      }
    }

    tx.delete(selfMemberRef);
  });

  if (rtdb) {
    await Promise.allSettled([
      rtdbRemove(rtdbRef(rtdb, `roomAccess/${roomId}/${uid}`)),
      rtdbRemove(rtdbRef(rtdb, `roomPresence/${roomId}/${uid}`)),
      isHostLeaving && successor
        ? rtdbUpdate(rtdbRef(rtdb, `roomMeta/${roomId}`), {
            hostUid: successor.uid,
            channelToken: newChannelToken,
            hostSigningPublicKey: null,
          })
        : rtdbUpdate(rtdbRef(rtdb, `roomMeta/${roomId}`), { channelToken: newChannelToken }),
      isHostLeaving && successor
        ? rtdbUpdate(rtdbRef(rtdb, `roomAccess/${roomId}/${successor.uid}`), { role: 'host' })
        : Promise.resolve(),
    ]);
  }

  clearHostKeyFromSession(roomId);
  return {
    ended: false,
    newHostUid: successor ? successor.uid : roomData.hostUid,
    newChannelToken,
  };
}

export async function endWatchRoom(roomId: string): Promise<void> {
  const snap = await getDoc(doc(db, 'rooms', roomId)).catch(() => null);
  if (!snap || !snap.exists()) return;
  const code = String(snap.data()?.code || '');
  await destroyRoomResources(roomId, code);
}

export async function recoverStaleHostIfNeeded(
  room: WatchRoomState,
  members: RoomMember[],
  myUid: string
): Promise<WatchRoomState | null> {
  if (room.hostUid === myUid) return null;
  const hostMember = members.find((m) => m.uid === room.hostUid);
  const hostAge = hostMember ? Date.now() - hostMember.lastSeenAt : HOST_STALE_MS + 1;
  if (hostMember && hostAge < HOST_STALE_MS) return null;

  const activeCandidates = members
    .filter((m) => m.uid !== room.hostUid)
    .sort((a, b) => a.joinedAt - b.joinedAt);
  if (!activeCandidates.length || activeCandidates[0].uid !== myUid) return null;

  const newChannelToken = generateChannelToken();
  await runTransaction(db, async (tx) => {
    const rRef = doc(db, 'rooms', room.roomId);
    const cRef = doc(db, 'roomCodes', room.code);
    const myRef = doc(db, 'rooms', room.roomId, 'members', myUid);
    const staleHostRef = doc(db, 'rooms', room.roomId, 'members', room.hostUid);

    const [rSnap, cSnap, staleSnap] = await Promise.all([tx.get(rRef), tx.get(cRef), tx.get(staleHostRef)]);
    if (!rSnap.exists()) return;
    const rCurr = rSnap.data();
    if (rCurr.hostUid !== room.hostUid) return;

    const decrement = staleSnap.exists() ? 1 : 0;
    const nextCount = Math.max(1, (Number(rCurr.memberCount) || members.length) - decrement);

    tx.update(myRef, { role: 'host' });
    if (staleSnap.exists()) tx.delete(staleHostRef);
    tx.update(rRef, {
      hostUid: myUid,
      hostSigningPublicKey: null,
      channelToken: newChannelToken,
      memberCount: nextCount,
      revision: (Number(rCurr.revision) || 1) + 1,
      lastActivityAt: serverTimestamp(),
    });
    if (cSnap.exists()) {
      tx.update(cRef, {
        hostUid: myUid,
        memberCount: nextCount,
      });
    }
  });

  const updated = await getDoc(doc(db, 'rooms', room.roomId));
  return updated.exists() ? mapFirestoreRoom(updated.data()) : null;
}

export async function publishHostSigningKey(roomId: string, publicKey: string): Promise<void> {
  await updateDoc(doc(db, 'rooms', roomId), {
    hostSigningPublicKey: publicKey,
    lastActivityAt: serverTimestamp(),
  });
  if (rtdb) {
    await rtdbUpdate(rtdbRef(rtdb, `roomMeta/${roomId}`), { hostSigningPublicKey: publicKey }).catch(() => {});
  }
}

export async function ensureHostCryptoSession(roomId: string): Promise<{ publicKey: string; cryptoPrivateKey: CryptoKey }> {
  const existing = await loadHostPrivateKey(roomId);
  if (existing) return existing;
  const fresh = await generateHostKeyPair();
  saveHostKeyToSession(roomId, fresh.publicKey, fresh.privateKey);
  await publishHostSigningKey(roomId, fresh.publicKey);
  return { publicKey: fresh.publicKey, cryptoPrivateKey: fresh.cryptoPrivateKey };
}

export async function persistHostPlaybackCheckpoint(
  roomId: string,
  payload: {
    media: RoomMediaSnapshot;
    playbackState: 'playing' | 'paused';
    positionSeconds: number;
    playbackSeq: number;
    revision: number;
  }
): Promise<void> {
  const safeMedia = sanitizeRoomMedia(payload.media);
  await updateDoc(doc(db, 'rooms', roomId), {
    mediaType: safeMedia.type,
    media: safeMedia,
    playbackState: payload.playbackState,
    positionSeconds: Math.max(0, Math.min(86400, Number(payload.positionSeconds) || 0)),
    playbackSeq: Math.max(0, Number(payload.playbackSeq) || 0),
    playbackUpdatedAt: serverTimestamp(),
    revision: Math.max(1, Number(payload.revision) || 1),
    lastActivityAt: serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + ROOM_TTL_MS),
  });
}

export async function sendRoomHeartbeat(roomId: string, uid: string, displayName?: string): Promise<void> {
  const memberPatch: Record<string, any> = { lastSeenAt: serverTimestamp() };
  if (displayName) memberPatch.displayName = displayName.slice(0, 40);
  await Promise.allSettled([
    updateDoc(doc(db, 'rooms', roomId, 'members', uid), memberPatch),
    updateDoc(doc(db, 'rooms', roomId), {
      lastActivityAt: serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + ROOM_TTL_MS),
    }),
  ]);
}

export async function sendRoomChatMessage(
  roomId: string,
  uid: string,
  senderName: string,
  rawBody: string
): Promise<void> {
  const body = String(rawBody || '').trim();
  if (!body) throw new Error('Write a message first.');
  if (body.length > 500) throw new Error('Messages must be 500 characters or fewer.');

  const idToken = await auth.currentUser?.getIdToken().catch(() => '');
  if (!idToken) throw new Error('Please sign in to chat.');

  const gateRes = await fetch('/api/rooms/message-gate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ roomId, body }),
  }).catch(() => null);
  if (gateRes && !gateRes.ok && gateRes.status !== 404 && gateRes.status !== 405) {
    const ct = gateRes.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      const errBody = await gateRes.json().catch(() => ({}));
      throw new Error(errBody.error || 'Could not send message.');
    }
  }

  const msgId = generateId('msg');
  await setDoc(doc(db, 'rooms', roomId, 'messages', msgId), {
    id: msgId,
    roomId,
    senderUid: uid,
    senderName: String(senderName || 'AMStream Member').trim().slice(0, 40) || 'AMStream Member',
    body,
    createdAt: serverTimestamp(),
  });
}

export async function trimRoomMessagesIfHost(roomId: string, hostUid: string, myUid: string): Promise<void> {
  if (hostUid !== myUid) return;
  try {
    const q = query(collection(db, 'rooms', roomId, 'messages'), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    if (snap.docs.length <= 500) return;
    const excess = snap.docs.slice(500);
    for (let i = 0; i < excess.length; i += 400) {
      const batch = writeBatch(db);
      excess.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  } catch {
    // ignore trim errors
  }
}

// ---- Real-time Subscriptions (Firestore + /ws/rooms + Optional RTDB) ----

export function subscribeRoomData(
  roomId: string,
  handlers: {
    onRoom: (room: WatchRoomState | null) => void;
    onMembers: (members: RoomMember[]) => void;
    onMessages: (messages: RoomMessage[]) => void;
    onError?: (err: Error) => void;
  }
): () => void {
  const unsubRoom = onSnapshot(
    doc(db, 'rooms', roomId),
    (snap) => {
      if (!snap.exists()) handlers.onRoom(null);
      else handlers.onRoom(mapFirestoreRoom(snap.data()));
    },
    (err) => handlers.onError?.(err)
  );

  const unsubMembers = onSnapshot(
    query(collection(db, 'rooms', roomId, 'members'), orderBy('joinedAt', 'asc')),
    (snap) => {
      handlers.onMembers(snap.docs.map((d) => mapFirestoreMember(d.data())));
    },
    (err) => handlers.onError?.(err)
  );

  const unsubMessages = onSnapshot(
    query(collection(db, 'rooms', roomId, 'messages'), orderBy('createdAt', 'desc'), limit(60)),
    (snap) => {
      const list = snap.docs.map((d) => mapFirestoreMessage(d.data())).reverse();
      handlers.onMessages(list);
    },
    (err) => handlers.onError?.(err)
  );

  return () => {
    unsubRoom();
    unsubMembers();
    unsubMessages();
  };
}

export class RoomRealtimeTransport {
  private ws: WebSocket | null = null;
  private closed = false;
  private reconnectTimer: number | null = null;
  private heartbeatTimer: number | null = null;
  private connectionId = generateId('conn');
  private verifyKeyCache: { raw: string; key: CryptoKey } | null = null;
  private rtdbCleanup: (() => void) | null = null;

  private roomId: string;
  private channelToken: string;
  private role: 'host' | 'guest';
  private uid: string;
  private displayName: string;
  private onPresence: (presence: Record<string, { online: boolean; connections: number; lastSeen: number }>) => void;
  private onSignedHostPacket: (packet: SignedPlaybackPacket) => void;
  private onSignal: (signal: { kind: string; newHostUid?: string | null; newChannelToken?: string | null }) => void;
  private onConnectionChange: (state: 'connecting' | 'live' | 'reconnecting') => void;
  private getExpectedHostUid: () => string;
  private getHostPublicKey: () => string | null;

  constructor(opts: {
    roomId: string;
    channelToken: string;
    role: 'host' | 'guest';
    uid: string;
    displayName: string;
    getExpectedHostUid: () => string;
    getHostPublicKey: () => string | null;
    onPresence: (presence: Record<string, { online: boolean; connections: number; lastSeen: number }>) => void;
    onSignedHostPacket: (packet: SignedPlaybackPacket) => void;
    onSignal: (signal: { kind: string; newHostUid?: string | null; newChannelToken?: string | null }) => void;
    onConnectionChange: (state: 'connecting' | 'live' | 'reconnecting') => void;
  }) {
    this.roomId = opts.roomId;
    this.channelToken = opts.channelToken;
    this.role = opts.role;
    this.uid = opts.uid;
    this.displayName = opts.displayName;
    this.getExpectedHostUid = opts.getExpectedHostUid;
    this.getHostPublicKey = opts.getHostPublicKey;
    this.onPresence = opts.onPresence;
    this.onSignedHostPacket = opts.onSignedHostPacket;
    this.onSignal = opts.onSignal;
    this.onConnectionChange = opts.onConnectionChange;
  }

  start(): void {
    this.closed = false;
    this.connectWs();
    this.attachOptionalRtdb();
    this.heartbeatTimer = window.setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(
          JSON.stringify({
            type: 'heartbeat',
            role: this.role,
            channelToken: this.channelToken,
          })
        );
      }
    }, 10000);
  }

  updateCredentials(opts: { channelToken: string; role: 'host' | 'guest' }): void {
    const tokenChanged = opts.channelToken !== this.channelToken;
    this.channelToken = opts.channelToken;
    this.role = opts.role;
    if (tokenChanged && this.ws?.readyState === WebSocket.OPEN) {
      this.sendJoinChannel();
    } else if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'heartbeat', role: this.role, channelToken: this.channelToken }));
    }
  }

  private async sendJoinChannel(): Promise<void> {
    const idToken = await auth.currentUser?.getIdToken().catch(() => '');
    if (!idToken || this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify({
        type: 'join_channel',
        idToken,
        roomId: this.roomId,
        channelToken: this.channelToken,
        connectionId: this.connectionId,
        role: this.role,
        displayName: this.displayName,
      })
    );
  }

  private connectWs(): void {
    if (this.closed) return;
    this.onConnectionChange('connecting');
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${location.host}/ws/rooms`);
    this.ws = ws;

    ws.onopen = () => {
      this.sendJoinChannel();
    };

    ws.onmessage = async (event) => {
      let msg: any;
      try {
        msg = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'connected') {
        this.onConnectionChange('live');
        return;
      }
      if (msg.type === 'presence' && msg.presence) {
        this.onPresence(msg.presence);
        return;
      }
      if (msg.type === 'room_signal') {
        this.onSignal({
          kind: String(msg.kind || ''),
          newHostUid: msg.newHostUid || null,
          newChannelToken: msg.newChannelToken || null,
        });
        return;
      }
      if (msg.type === 'host_event' && msg.payload) {
        await this.verifyAndEmitHostPacket(msg.payload as SignedPlaybackPacket);
      }
    };

    ws.onclose = () => {
      if (this.closed) return;
      this.onConnectionChange('reconnecting');
      this.reconnectTimer = window.setTimeout(() => this.connectWs(), 1500);
    };
  }

  private async verifyAndEmitHostPacket(packet: SignedPlaybackPacket): Promise<void> {
    if (!packet || packet.room_id !== this.roomId) return;
    const expectedHostUid = this.getExpectedHostUid();
    if (!expectedHostUid || packet.host_uid !== expectedHostUid) return;
    const pubRaw = this.getHostPublicKey();
    if (!pubRaw) return;

    if (!this.verifyKeyCache || this.verifyKeyCache.raw !== pubRaw) {
      const imported = await importGuestVerifyKey(pubRaw);
      if (!imported) return;
      this.verifyKeyCache = { raw: pubRaw, key: imported };
    }

    const ok = await verifyPlaybackPacket(packet, expectedHostUid, this.verifyKeyCache.key);
    if (ok) this.onSignedHostPacket(packet);
  }

  async publishSignedHostEvent(
    unsignedPayload: Omit<SignedPlaybackPacket, 'signature'>,
    privateKey: CryptoKey
  ): Promise<SignedPlaybackPacket> {
    const signed = await signPlaybackPacket(unsignedPayload, privateKey);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'host_event', payload: signed }));
    }
    if (rtdb) {
      rtdbSet(rtdbRef(rtdb, `roomLive/${this.roomId}/playback`), signed).catch(() => {});
    }
    return signed;
  }

  emitRoomSignal(kind: string, extra: { newHostUid?: string | null; newChannelToken?: string | null } = {}): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'room_signal', kind, ...extra }));
    }
  }

  private attachOptionalRtdb(): void {
    if (!rtdb) return;
    const presNode = rtdbRef(rtdb, `roomPresence/${this.roomId}/${this.uid}/connections/${this.connectionId}`);
    rtdbSet(presNode, {
      uid: this.uid,
      displayName: this.displayName,
      online: true,
      lastSeen: Date.now(),
    }).catch(() => {});
    rtdbOnDisconnect(presNode).remove().catch(() => {});

    const unsubPres = rtdbOnValue(rtdbRef(rtdb, `roomPresence/${this.roomId}`), (snap) => {
      const val = snap.val();
      if (!val || typeof val !== 'object') return;
      const mapped: Record<string, { online: boolean; connections: number; lastSeen: number }> = {};
      for (const [memberUid, memberData] of Object.entries<any>(val)) {
        const conns = memberData?.connections ? Object.values<any>(memberData.connections) : [];
        if (conns.length > 0) {
          mapped[memberUid] = {
            online: true,
            connections: conns.length,
            lastSeen: Math.max(...conns.map((c) => Number(c?.lastSeen) || 0)),
          };
        }
      }
      if (Object.keys(mapped).length) this.onPresence(mapped);
    });

    const unsubLive = rtdbOnValue(rtdbRef(rtdb, `roomLive/${this.roomId}/playback`), (snap) => {
      const packet = snap.val();
      if (packet && this.role === 'guest') {
        this.verifyAndEmitHostPacket(packet as SignedPlaybackPacket);
      }
    });

    this.rtdbCleanup = () => {
      unsubPres();
      unsubLive();
      rtdbRemove(presNode).catch(() => {});
    };
  }

  stop(): void {
    this.closed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.rtdbCleanup) this.rtdbCleanup();
    try {
      this.ws?.close();
    } catch {
      // ignore
    }
    this.ws = null;
  }
}
