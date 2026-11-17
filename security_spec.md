# AMStream Security Specification (Phase 0 TDD)

## 1. Data Invariants
1. **Default Deny**: Every Firestore path and Realtime Database node denies read/write by default.
2. **PII & Library Isolation**: `/users/{uid}` and all `/users/{uid}/*` subcollections can only be read or written by `request.auth.uid == uid`. No cross-user profile or library reads are permitted.
3. **Display Name Bounds**: User display names and message sender names are strictly bounded to 1–40 characters.
4. **Watch Room Membership Gate**: Private room state (`/rooms/{roomId}`), member lists (`/rooms/{roomId}/members/{uid}`), and chat history (`/rooms/{roomId}/messages/{messageId}`) are readable ONLY when the requesting authenticated user has an active member document at `/rooms/{roomId}/members/$(request.auth.uid)`.
5. **Non-Enumerable Room Codes**: `/roomCodes/{code}` prohibits `list` queries (`allow list: if false`) so invite codes cannot be brute-forced or scraped.
6. **4-Seat Capacity**: Joining a room requires `existing.memberCount < 4` and atomically increments `memberCount` by exactly `1` while creating `/rooms/{roomId}/members/$(request.auth.uid)`.
7. **Host Playback Authority**: Only `existing.hostUid == request.auth.uid` can modify playback state (`playbackState`, `positionSeconds`, `playbackSeq`, `playbackUpdatedAt`, `media`, `hostSigningPublicKey`) or end/delete the room.
8. **Self-Assignment Prevention**: Guests joining a room must create their member doc with `role == 'guest'` and cannot escalate their role or mutate `hostUid` while the host is active.
9. **Chat Integrity**: Messages require active membership, `senderUid == request.auth.uid`, `body` length `1..500`, and server timestamp `createdAt == request.time`.
10. **Host Handover**: Host transfer is permitted only by the current host during leave OR by an active member if the current host's `lastSeenAt` is stale (> 120 seconds old).

## 2. "Dirty Dozen" Adversarial Payloads (Must All Return PERMISSION_DENIED)
1. **Unauthenticated Room Read**: `get /rooms/room_abc123` with `auth == null`.
2. **Cross-User Library Read**: `get /users/victim_uid/myList/anime_1` authenticated as `attacker_uid`.
3. **Room Code Enumeration**: `list /roomCodes` authenticated as any user.
4. **5th Member Capacity Bypass**: `create /rooms/{roomId}/members/{uid5}` + `update /rooms/{roomId}` when `memberCount == 4`.
5. **Guest Self-Escalation on Join**: `create /rooms/{roomId}/members/{guestUid}` with `{ role: 'host' }`.
6. **Guest Playback Hijack**: `update /rooms/{roomId}` with `{ playbackState: 'paused', positionSeconds: 10 }` by a guest UID.
7. **Guest Host Takeover (Active Host)**: `update /rooms/{roomId}` with `{ hostUid: guestUid }` while current host `lastSeenAt` is recent.
8. **Message Impersonation**: `create /rooms/{roomId}/messages/m1` with `{ senderUid: otherUid }`.
9. **Oversized Chat Payload (DoS)**: `create /rooms/{roomId}/messages/m2` with `body` of 501+ characters.
10. **Shadow / Ghost Field Injection**: `create /users/{uid}` with `{ ..., isAdmin: true }`.
11. **Backdated Timestamp Spoofing**: `create /rooms/{roomId}/messages/m3` with `createdAt` set to a past client timestamp (`!= request.time`).
12. **Non-Host Room Deletion**: `delete /rooms/{roomId}` executed by a guest UID while other members exist.
