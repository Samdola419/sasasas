import * as crypto from 'crypto';
import * as admin from 'firebase-admin';
import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';

admin.initializeApp();

const db = admin.firestore();
const rtdb = admin.database();

const ROOM_MAX_MEMBERS = 4;
const ROOM_TTL_MS = 6 * 60 * 60 * 1000;
const STALE_MEMBER_MS = 2 * 60 * 1000;
const MESSAGE_MAX_LEN = 500;
const MESSAGE_MAX_RETAIN = 500;
const MESSAGE_RATE_LIMIT = 8;
const MESSAGE_RATE_WINDOW_MS = 10 * 1000;
const JOIN_RATE_LIMIT = 20;
const JOIN_RATE_WINDOW_MS = 10 * 60 * 1000;

function requireUid(req: CallableRequest<unknown>): string {
  if (!req.auth || !req.auth.uid) {
    throw new HttpsError('unauthenticated', 'Sign in to use Watch Rooms.');
  }
  return req.auth.uid;
}

function makeRoomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(8);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

function randomToken(bytes = 24): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

function validMedia(media: unknown): media is Record<string, unknown> {
  if (!media || typeof media !== 'object' || Array.isArray(media)) return false;
  const m = media as Record<string, unknown>;
  return (
    ['anime', 'movie', 'tv'].includes(String(m.type || '')) &&
    typeof m.title === 'string' &&
    m.title.trim().length > 0 &&
    m.title.length <= 240
  );
}

async function getDisplayName(uid: string): Promise<string> {
  const userDoc = await db.collection('users').doc(uid).get();
  const name = userDoc.data()?.displayName;
  if (typeof name === 'string' && name.trim()) return name.trim().slice(0, 40);
  const authUser = await admin.auth().getUser(uid).catch(() => null);
  return (authUser?.displayName || authUser?.email?.split('@')[0] || 'AMStream Member').slice(0, 40);
}

async function deleteRoomCascade(roomId: string, code?: string): Promise<void> {
  const roomRef = db.collection('rooms').doc(roomId);
  const membersSnap = await roomRef.collection('members').get();
  const messagesSnap = await roomRef.collection('messages').get();

  const batch = db.batch();
  membersSnap.docs.forEach((d) => batch.delete(d.ref));
  messagesSnap.docs.forEach((d) => batch.delete(d.ref));
  if (code) batch.delete(db.collection('roomCodes').doc(code));
  batch.delete(roomRef);
  await batch.commit();

  await Promise.all([
    rtdb.ref(`roomPresence/${roomId}`).remove().catch(() => null),
    rtdb.ref(`roomAccess/${roomId}`).remove().catch(() => null),
    rtdb.ref(`roomMeta/${roomId}`).remove().catch(() => null),
    rtdb.ref(`roomLive/${roomId}`).remove().catch(() => null),
  ]);
}

export const createRoom = onCall(async (req) => {
  const uid = requireUid(req);
  const data = (req.data || {}) as Record<string, unknown>;
  const signingKey = String(data.hostSigningPublicKey || '');
  if (!/^[A-Za-z0-9+/]{40,400}={0,2}$/.test(signingKey)) {
    throw new HttpsError('invalid-argument', 'Invalid host playback signing key.');
  }
  if (!validMedia(data.media)) {
    throw new HttpsError('invalid-argument', 'Open an anime, movie, or series before creating a room.');
  }

  const now = admin.firestore.Timestamp.now();
  const activeHosted = await db
    .collection('rooms')
    .where('hostUid', '==', uid)
    .where('status', '==', 'active')
    .where('expiresAt', '>', now)
    .limit(1)
    .get();

  if (!activeHosted.empty) {
    throw new HttpsError('already-exists', 'You already host an active room. End it before creating another.');
  }

  const displayName = await getDisplayName(uid);
  const roomId = db.collection('rooms').doc().id;
  const channelToken = randomToken(24);
  const expiresAt = admin.firestore.Timestamp.fromMillis(Date.now() + ROOM_TTL_MS);

  let createdCode = '';
  for (let i = 0; i < 6; i++) {
    const candidate = makeRoomCode();
    const ok = await db.runTransaction(async (tx) => {
      const codeRef = db.collection('roomCodes').doc(candidate);
      const existing = await tx.get(codeRef);
      if (existing.exists) return false;

      const roomRef = db.collection('rooms').doc(roomId);
      const memberRef = roomRef.collection('members').doc(uid);

      tx.set(roomRef, {
        roomId,
        code: candidate,
        hostUid: uid,
        status: 'active',
        memberCount: 1,
        mediaType: String(data.media.type),
        media: data.media,
        playbackState: data.media.playback_state === 'playing' ? 'playing' : 'paused',
        positionSeconds: Math.max(0, Math.min(86400, Number(data.media.position_seconds) || 0)),
        playbackSeq: 0,
        playbackUpdatedAt: now,
        hostSigningPublicKey: signingKey,
        channelToken,
        revision: 1,
        createdAt: now,
        lastActivityAt: now,
        expiresAt,
      });

      tx.set(codeRef, {
        code: candidate,
        roomId,
        hostUid: uid,
        status: 'active',
        memberCount: 1,
        createdAt: now,
        expiresAt,
      });

      tx.set(memberRef, {
        uid,
        displayName,
        role: 'host',
        joinedAt: now,
        lastSeenAt: now,
      });

      return true;
    });
    if (ok) {
      createdCode = candidate;
      break;
    }
  }

  if (!createdCode) {
    throw new HttpsError('unavailable', 'Could not allocate a unique room code.');
  }

  await Promise.all([
    rtdb.ref(`roomAccess/${roomId}/${uid}`).set(true),
    rtdb.ref(`roomMeta/${roomId}`).set({
      hostUid: uid,
      channelToken,
      status: 'active',
      revision: 1,
    }),
  ]);

  return { roomId, code: createdCode, channelToken };
});

export const joinRoom = onCall(async (req) => {
  const uid = requireUid(req);
  const data = (req.data || {}) as Record<string, unknown>;
  const code = String(data.code || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);

  if (code.length !== 8) {
    throw new HttpsError('invalid-argument', 'Enter a valid 8-character room code.');
  }

  // Server-side join attempt rate limiting
  const rateRef = db.collection('_rateLimits').doc(`join_${uid}`);
  const nowMs = Date.now();
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(rateRef);
    const prev = snap.data() as { attempts?: number[]; } | undefined;
    const recent = (prev?.attempts || []).filter((ts) => nowMs - ts < JOIN_RATE_WINDOW_MS);
    if (recent.length >= JOIN_RATE_LIMIT) {
      throw new HttpsError('resource-exhausted', 'Too many room-code attempts. Wait a few minutes and try again.');
    }
    recent.push(nowMs);
    tx.set(rateRef, { attempts: recent, updatedAt: admin.firestore.Timestamp.now() });
  });

  const codeSnap = await db.collection('roomCodes').doc(code).get();
  if (!codeSnap.exists) {
    throw new HttpsError('not-found', 'That room does not exist or has ended.');
  }

  const codeData = codeSnap.data()!;
  const roomId = String(codeData.roomId);
  const displayName = await getDisplayName(uid);
  const now = admin.firestore.Timestamp.now();

  const result = await db.runTransaction(async (tx) => {
    const roomRef = db.collection('rooms').doc(roomId);
    const roomSnap = await tx.get(roomRef);
    if (!roomSnap.exists) throw new HttpsError('not-found', 'That room has ended.');

    const room = roomSnap.data()!;
    if (room.status !== 'active' || room.expiresAt.toMillis() <= nowMs) {
      throw new HttpsError('failed-precondition', 'That room has expired.');
    }

    const membersSnap = await tx.get(roomRef.collection('members'));
    const existingMember = membersSnap.docs.find((d) => d.id === uid);
    if (existingMember) {
      tx.update(existingMember.ref, { lastSeenAt: now, displayName });
      return { roomId, channelToken: room.channelToken, hostChanged: false, hostUid: room.hostUid };
    }

    // Reclaim stale members (> 2 min without heartbeat)
    const activeDocs = membersSnap.docs.filter((d) => {
      const seen = d.data().lastSeenAt?.toMillis?.() || 0;
      return nowMs - seen <= STALE_MEMBER_MS;
    });
    const staleDocs = membersSnap.docs.filter((d) => !activeDocs.includes(d));
    staleDocs.forEach((d) => tx.delete(d.ref));

    if (activeDocs.length >= ROOM_MAX_MEMBERS) {
      throw new HttpsError('resource-exhausted', 'This room already has 4 members.');
    }

    let nextHostUid = room.hostUid;
    let hostChanged = false;
    const hostStillActive = activeDocs.some((d) => d.id === room.hostUid);
    if (!hostStillActive && activeDocs.length > 0) {
      activeDocs.sort((a, b) => a.data().joinedAt.toMillis() - b.data().joinedAt.toMillis());
      nextHostUid = activeDocs[0].id;
      tx.update(activeDocs[0].ref, { role: 'host' });
      hostChanged = true;
    }

    const newCount = activeDocs.length + 1;
    tx.set(roomRef.collection('members').doc(uid), {
      uid,
      displayName,
      role: 'guest',
      joinedAt: now,
      lastSeenAt: now,
    });

    const updates: Record<string, unknown> = {
      memberCount: newCount,
      lastActivityAt: now,
      revision: (room.revision || 0) + 1,
    };
    if (hostChanged) {
      updates.hostUid = nextHostUid;
      updates.hostSigningPublicKey = null;
      updates.channelToken = randomToken(24);
    }

    tx.update(roomRef, updates);
    tx.update(db.collection('roomCodes').doc(code), {
      memberCount: newCount,
      hostUid: nextHostUid,
    });

    return {
      roomId,
      channelToken: String(updates.channelToken || room.channelToken),
      hostChanged,
      hostUid: nextHostUid,
    };
  });

  await Promise.all([
    rtdb.ref(`roomAccess/${roomId}/${uid}`).set(true),
    rtdb.ref(`roomMeta/${roomId}`).update({
      hostUid: result.hostUid,
      channelToken: result.channelToken,
      status: 'active',
    }),
  ]);

  return result;
});

export const leaveRoom = onCall(async (req) => {
  const uid = requireUid(req);
  const roomId = String((req.data as Record<string, unknown>)?.roomId || '');
  if (!roomId) throw new HttpsError('invalid-argument', 'Missing roomId.');

  const now = admin.firestore.Timestamp.now();
  const outcome = await db.runTransaction(async (tx) => {
    const roomRef = db.collection('rooms').doc(roomId);
    const roomSnap = await tx.get(roomRef);
    if (!roomSnap.exists) return { deleted: true, code: '' };

    const room = roomSnap.data()!;
    const membersSnap = await tx.get(roomRef.collection('members'));
    const myDoc = membersSnap.docs.find((d) => d.id === uid);
    if (!myDoc) return { deleted: false, notMember: true, code: room.code };

    tx.delete(myDoc.ref);
    const remaining = membersSnap.docs.filter((d) => d.id !== uid);

    if (remaining.length === 0) {
      return { deleted: true, code: String(room.code) };
    }

    remaining.sort((a, b) => a.data().joinedAt.toMillis() - b.data().joinedAt.toMillis());
    let nextHostUid = room.hostUid;
    let hostChanged = false;
    if (room.hostUid === uid) {
      nextHostUid = remaining[0].id;
      tx.update(remaining[0].ref, { role: 'host' });
      hostChanged = true;
    }

    const newToken = randomToken(24);
    tx.update(roomRef, {
      hostUid: nextHostUid,
      hostSigningPublicKey: hostChanged ? null : room.hostSigningPublicKey,
      channelToken: newToken,
      memberCount: remaining.length,
      revision: (room.revision || 0) + 1,
      lastActivityAt: now,
    });
    tx.update(db.collection('roomCodes').doc(String(room.code)), {
      memberCount: remaining.length,
      hostUid: nextHostUid,
    });

    return { deleted: false, hostChanged, nextHostUid, newToken, oldToken: room.channelToken, code: room.code };
  });

  if (outcome.deleted) {
    await deleteRoomCascade(roomId, outcome.code);
    return { ok: true, deleted: true };
  }

  await Promise.all([
    rtdb.ref(`roomAccess/${roomId}/${uid}`).remove(),
    rtdb.ref(`roomPresence/${roomId}/${uid}`).remove(),
    outcome.oldToken ? rtdb.ref(`roomLive/${roomId}/${outcome.oldToken}`).remove() : Promise.resolve(),
    rtdb.ref(`roomMeta/${roomId}`).update({
      hostUid: outcome.nextHostUid,
      channelToken: outcome.newToken,
    }),
  ]);

  return { ok: true, deleted: false, hostChanged: !!outcome.hostChanged };
});

export const endRoom = onCall(async (req) => {
  const uid = requireUid(req);
  const roomId = String((req.data as Record<string, unknown>)?.roomId || '');
  if (!roomId) throw new HttpsError('invalid-argument', 'Missing roomId.');

  const roomSnap = await db.collection('rooms').doc(roomId).get();
  if (!roomSnap.exists) return { ok: true, deleted: true };

  const room = roomSnap.data()!;
  if (room.hostUid !== uid) {
    throw new HttpsError('permission-denied', 'Only the room host can end this room.');
  }

  await deleteRoomCascade(roomId, String(room.code));
  return { ok: true, deleted: true };
});

export const sendMessage = onCall(async (req) => {
  const uid = requireUid(req);
  const data = (req.data || {}) as Record<string, unknown>;
  const roomId = String(data.roomId || '');
  const body = String(data.body || '').trim();

  if (!roomId) throw new HttpsError('invalid-argument', 'Missing roomId.');
  if (!body) throw new HttpsError('invalid-argument', 'Write a message first.');
  if (body.length > MESSAGE_MAX_LEN) {
    throw new HttpsError('invalid-argument', 'Messages must be 500 characters or fewer.');
  }

  const memberSnap = await db.collection('rooms').doc(roomId).collection('members').doc(uid).get();
  if (!memberSnap.exists) {
    throw new HttpsError('permission-denied', 'You are not a member of this room.');
  }

  const nowMs = Date.now();
  const since = admin.firestore.Timestamp.fromMillis(nowMs - MESSAGE_RATE_WINDOW_MS);
  const recentSnap = await db
    .collection('rooms')
    .doc(roomId)
    .collection('messages')
    .where('senderUid', '==', uid)
    .where('createdAt', '>', since)
    .get();

  if (recentSnap.size >= MESSAGE_RATE_LIMIT) {
    throw new HttpsError('resource-exhausted', 'Slow down a little before sending another message.');
  }

  const now = admin.firestore.Timestamp.now();
  const msgRef = db.collection('rooms').doc(roomId).collection('messages').doc();
  const senderName = String(memberSnap.data()?.displayName || 'AMStream Member').slice(0, 40);

  await msgRef.set({
    id: msgRef.id,
    roomId,
    senderUid: uid,
    senderName,
    body,
    createdAt: now,
  });

  // Retain at most 500 messages in persistent room history
  const allMsgs = await db
    .collection('rooms')
    .doc(roomId)
    .collection('messages')
    .orderBy('createdAt', 'asc')
    .get();
  if (allMsgs.size > MESSAGE_MAX_RETAIN) {
    const excess = allMsgs.docs.slice(0, allMsgs.size - MESSAGE_MAX_RETAIN);
    const batch = db.batch();
    excess.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }

  return { id: msgRef.id };
});

export const setHostSigningKey = onCall(async (req) => {
  const uid = requireUid(req);
  const data = (req.data || {}) as Record<string, unknown>;
  const roomId = String(data.roomId || '');
  const publicKey = String(data.publicKey || '');

  if (!/^[A-Za-z0-9+/]{40,400}={0,2}$/.test(publicKey)) {
    throw new HttpsError('invalid-argument', 'Invalid host signing public key.');
  }

  const roomRef = db.collection('rooms').doc(roomId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(roomRef);
    if (!snap.exists) throw new HttpsError('not-found', 'Room ended.');
    const room = snap.data()!;
    if (room.hostUid !== uid) {
      throw new HttpsError('permission-denied', 'Only the host can register playback signing.');
    }
    tx.update(roomRef, {
      hostSigningPublicKey: publicKey,
      revision: (room.revision || 0) + 1,
      lastActivityAt: admin.firestore.Timestamp.now(),
    });
  });

  return { ok: true };
});

export const updatePlayback = onCall(async (req) => {
  const uid = requireUid(req);
  const data = (req.data || {}) as Record<string, unknown>;
  const roomId = String(data.roomId || '');
  const kind = String(data.kind || 'position');
  const positionSeconds = Math.max(0, Math.min(86400, Number(data.positionSeconds) || 0));
  const playbackState = data.playbackState === 'playing' ? 'playing' : 'paused';
  const playbackSeq = Number(data.playbackSeq);

  if (!Number.isSafeInteger(playbackSeq) || playbackSeq < 1) {
    throw new HttpsError('invalid-argument', 'Invalid playback sequence.');
  }

  const now = admin.firestore.Timestamp.now();
  const expiresAt = admin.firestore.Timestamp.fromMillis(Date.now() + ROOM_TTL_MS);

  const res = await db.runTransaction(async (tx) => {
    const roomRef = db.collection('rooms').doc(roomId);
    const snap = await tx.get(roomRef);
    if (!snap.exists) throw new HttpsError('not-found', 'Room ended.');
    const room = snap.data()!;
    if (room.hostUid !== uid) {
      throw new HttpsError('permission-denied', 'Only the host can publish playback checkpoints.');
    }
    if (playbackSeq <= (room.playbackSeq || 0)) {
      return { stale: true, revision: room.revision, playbackSeq: room.playbackSeq };
    }
    if (kind === 'position' && room.playbackState !== 'playing') {
      return { stale: true, revision: room.revision, playbackSeq: room.playbackSeq };
    }

    const updates: Record<string, unknown> = {
      positionSeconds,
      playbackState,
      playbackSeq,
      playbackUpdatedAt: now,
      lastActivityAt: now,
      expiresAt,
      revision: (room.revision || 0) + 1,
    };
    if (kind === 'episode' && validMedia(data.media)) {
      updates.media = data.media;
      updates.mediaType = String(data.media.type);
    }

    tx.update(roomRef, updates);
    return { stale: false, revision: updates.revision, playbackSeq };
  });

  return res;
});

export const heartbeat = onCall(async (req) => {
  const uid = requireUid(req);
  const roomId = String((req.data as Record<string, unknown>)?.roomId || '');
  if (!roomId) throw new HttpsError('invalid-argument', 'Missing roomId.');

  const now = admin.firestore.Timestamp.now();
  const expiresAt = admin.firestore.Timestamp.fromMillis(Date.now() + ROOM_TTL_MS);
  const roomRef = db.collection('rooms').doc(roomId);
  const memberRef = roomRef.collection('members').doc(uid);

  await db.runTransaction(async (tx) => {
    const [roomSnap, memberSnap] = await Promise.all([tx.get(roomRef), tx.get(memberRef)]);
    if (!roomSnap.exists || !memberSnap.exists) {
      throw new HttpsError('permission-denied', 'You are no longer in this room.');
    }
    tx.update(memberRef, { lastSeenAt: now });
    tx.update(roomRef, { lastActivityAt: now, expiresAt });
  });

  return { ok: true };
});

export const cleanupExpiredRooms = onSchedule('every 30 minutes', async () => {
  const now = admin.firestore.Timestamp.now();
  const expired = await db.collection('rooms').where('expiresAt', '<=', now).limit(50).get();
  for (const docSnap of expired.docs) {
    const code = docSnap.data().code;
    await deleteRoomCascade(docSnap.id, typeof code === 'string' ? code : undefined);
  }
});
