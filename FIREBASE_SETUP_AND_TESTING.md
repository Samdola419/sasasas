# AMStream — Firebase Setup, Deployment & Two-Session Testing Guide

## 1. Provisioned Firebase Project
- **Project ID**: `gen-lang-client-0595600296`
- **Firestore Database ID**: `ai-studio-dc6a0b59-a97a-4eb9-bf20-6441555425f2`
- **Client Config**: `/firebase-applet-config.json` (contains public Firebase Web SDK keys only; zero service-account or admin secrets are exposed in frontend code).

---

## 2. Firebase Console Settings Checklist (One-Time Setup)
Open the [Firebase Console](https://console.firebase.google.com/project/gen-lang-client-0595600296) and verify the following:

1. **Authentication → Sign-in method**
   - Enable **Email/Password** (required for email registration, login, password confirmation, and password reset).
   - Enable **Google** (required for "Continue with Google" popup authentication).
2. **Authentication → Settings → Authorized domains**
   - Add your live app hostnames:
     - `localhost`
     - `ais-dev-3oau2hbsv535mj2diyrjhw-734172983488.europe-west1.run.app`
     - `ais-pre-3oau2hbsv535mj2diyrjhw-734172983488.europe-west1.run.app`
3. **Cloud Firestore**
   - Provisioned database `ai-studio-dc6a0b59-a97a-4eb9-bf20-6441555425f2` already has `/firestore.rules` deployed.
4. **Firebase Realtime Database (Optional Secondary Sync Adapter)**
   - The app runs real-time presence and ECDSA P-256 signed playback relay immediately over `/ws/rooms` on Express + Cloud Firestore.
   - To additionally enable Firebase Realtime Database (`database.rules.json`), create a Realtime Database instance in Firebase Console and set `VITE_FIREBASE_DATABASE_URL="https://YOUR-DB.firebaseio.com"` in environment variables.
5. **Firebase Cloud Functions (Production Privileged Backend)**
   - Complete Cloud Functions v2 backend lives in `/functions/src/index.ts`:
     - `createRoom`, `joinRoom`, `leaveRoom`, `endRoom`, `sendMessage`, `setHostSigningKey`, `updatePlayback`, `heartbeat`, `cleanupExpiredRooms` (scheduled every 15 minutes).

---

## 3. Deploying Rules, Indexes & Cloud Functions
From a local environment with Firebase CLI (`npm i -g firebase-tools && firebase login`):

```bash
firebase use gen-lang-client-0595600296
firebase deploy --only firestore:rules,firestore:indexes,database
cd functions && npm install && npm run build && cd ..
firebase deploy --only functions
```

---

## 4. Two-Session / Two-Browser Live Testing Checklist
1. **Guest Browse & Local Progress**
   - Open Browser A (unauthenticated). Search for an anime or movie, save a title to **My List**, and start playback to record **Continue Watching** progress.
2. **Account Registration & Non-Destructive Merge Sync**
   - Click **Sign In → Create Account** in Browser A (verify display name <= 40 chars and password confirmation).
   - Refresh Browser A and confirm session persists and local **My List** + **Continue Watching** items merged into `/account`.
3. **Cross-Device Restoration**
   - Open Browser B (Incognito/separate browser profile) and sign in with the same account. Confirm **My List**, **Continue Watching**, and preferences appear cleanly.
4. **Watch Room Creation & Joining (4-Seat Cap & Rate Limit)**
   - In Browser A (Host), play an anime/movie/series and click **Watch Room** to generate an 8-character code and `/room/CODE` invite link.
   - In Browser B (sign in with a second account), click **Watch Room** in the header and paste the 8-character code or `/room/CODE` link.
   - Verify Browser B automatically loads the exact title, episode, language, and timestamp, and appears in the live member roster (`2/4 viewers`) with green live presence dots.
5. **ECDSA P-256 Playback Sync & Guest Restrictions**
   - In Browser A (Host), play, pause, scrub/seek, or switch episodes. Verify Browser B follows within ~1 second via `megaplay.html` shield (`ANIMESTREAM_ROOM_CONTROL`) without manual intervention.
   - In Browser B (Guest), verify video iframe clicks are locked while local volume slider and Re-sync remain interactive.
6. **Live Chat & Host Handover / Cleanup**
   - Exchange messages between Browser A and Browser B; verify 500-char limit and persistence after refresh.
   - In Browser A (Host), click **Leave → Leave Room** (not "End for Everyone"). Verify Browser B automatically promotes to **Host** cleanly with a new ECDSA signing key.
   - When the final member leaves, verify the room and `roomCodes/{code}` document are cleanly removed so reusing the old link rejects cleanly.
