import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  updateProfile,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import { doc, getDoc, runTransaction, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import type { UserProfile } from '../types/media';

export const DISPLAY_NAME_MAX_LENGTH = 40;

export function formatAuthError(err: unknown): string {
  const code = (err as { code?: string })?.code || '';
  switch (code) {
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Try signing in instead.';
    case 'auth/invalid-email':
      return 'Enter a valid email address.';
    case 'auth/weak-password':
      return 'Use a password with at least 8 characters.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Incorrect email or password. Please check your details and try again.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a few minutes before trying again.';
    case 'auth/popup-closed-by-user':
      return 'Sign-in window was closed before completing.';
    case 'auth/popup-blocked':
      return 'Your browser blocked the Google sign-in popup. Allow popups for this site and try again.';
    case 'auth/unauthorized-domain':
      return `Add "${location.hostname}" under Firebase Console → Authentication → Settings → Authorized domains.`;
    case 'auth/operation-not-allowed':
      return 'Email/Password sign-in is not yet enabled in Firebase Console → Authentication → Sign-in method.';
    case 'auth/network-request-failed':
      return 'Network error while reaching authentication service. Check your connection.';
    default:
      return err instanceof Error && err.message
        ? err.message.replace(/^Firebase:\s*/i, '').replace(/\s*\(auth\/[^)]+\)\.?/i, '')
        : 'Could not complete authentication request.';
  }
}

export function sanitizeDisplayName(raw: string | null | undefined, email?: string | null): string {
  const cleaned = String(raw || '').trim().slice(0, DISPLAY_NAME_MAX_LENGTH);
  if (cleaned) return cleaned;
  const prefix = String(email || '').split('@')[0]?.trim().slice(0, DISPLAY_NAME_MAX_LENGTH);
  return prefix || 'AMStream Member';
}

const inFlightProfileEnsure = new Map<string, Promise<UserProfile>>();

export function ensureUserProfile(user: User, preferredName?: string): Promise<UserProfile> {
  const existingPromise = inFlightProfileEnsure.get(user.uid);
  if (existingPromise) return existingPromise;

  const task = (async (): Promise<UserProfile> => {
    const path = `users/${user.uid}`;
    const ref = doc(db, 'users', user.uid);
    let snap;
    try {
      snap = await getDoc(ref);
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, path);
    }

    if (snap.exists()) {
      const data = snap.data();
      return {
        uid: user.uid,
        displayName: sanitizeDisplayName(data.displayName || user.displayName, user.email),
        email: String(data.email || user.email || ''),
        avatarUrl: data.avatarUrl || user.photoURL || null,
        createdAt: data.createdAt?.toMillis?.() || Date.now(),
        updatedAt: data.updatedAt?.toMillis?.() || Date.now(),
      };
    }

    const displayName = sanitizeDisplayName(preferredName || user.displayName, user.email);
    const email = String(user.email || '').trim().toLowerCase() || `${user.uid}@users.amstream.local`;
    const avatarUrl = user.photoURL ? String(user.photoURL).slice(0, 500) : null;

    let resultProfile: UserProfile | null = null;
    try {
      resultProfile = await runTransaction(db, async (tx) => {
        const txSnap = await tx.get(ref);
        if (txSnap.exists()) {
          const existing = txSnap.data();
          return {
            uid: user.uid,
            displayName: sanitizeDisplayName(existing.displayName || displayName, user.email),
            email: String(existing.email || email),
            avatarUrl: existing.avatarUrl || avatarUrl,
            createdAt: existing.createdAt?.toMillis?.() || Date.now(),
            updatedAt: existing.updatedAt?.toMillis?.() || Date.now(),
          };
        }
        tx.set(ref, {
          uid: user.uid,
          displayName,
          email,
          avatarUrl,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        return {
          uid: user.uid,
          displayName,
          email,
          avatarUrl,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }

    if (!user.displayName && displayName) {
      await updateProfile(user, { displayName }).catch(() => {});
    }
    return resultProfile!;
  })();

  inFlightProfileEnsure.set(user.uid, task);
  task.finally(() => {
    if (inFlightProfileEnsure.get(user.uid) === task) {
      inFlightProfileEnsure.delete(user.uid);
    }
  });
  return task;
}

export async function registerWithEmail(
  email: string,
  password: string,
  confirmPassword: string,
  displayName?: string
): Promise<{ user: User; profile: UserProfile }> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new Error('Enter a valid email address.');
  }
  if (password.length < 8) {
    throw new Error('Use a password with at least 8 characters.');
  }
  if (password !== confirmPassword) {
    throw new Error('The passwords do not match.');
  }
  const cleanName = sanitizeDisplayName(displayName, normalizedEmail);

  try {
    const cred = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
    await updateProfile(cred.user, { displayName: cleanName }).catch(() => {});
    const profile = await ensureUserProfile(cred.user, cleanName);
    return { user: cred.user, profile };
  } catch (err) {
    throw new Error(formatAuthError(err));
  }
}

export async function loginWithEmail(
  email: string,
  password: string
): Promise<{ user: User; profile: UserProfile }> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !password) {
    throw new Error('Enter your email and password.');
  }
  try {
    const cred = await signInWithEmailAndPassword(auth, normalizedEmail, password);
    const profile = await ensureUserProfile(cred.user);
    return { user: cred.user, profile };
  } catch (err) {
    throw new Error(formatAuthError(err));
  }
}

export async function loginWithGoogle(): Promise<{ user: User; profile: UserProfile }> {
  const provider = new GoogleAuthProvider();
  try {
    const cred = await signInWithPopup(auth, provider);
    const profile = await ensureUserProfile(cred.user);
    return { user: cred.user, profile };
  } catch (err) {
    throw new Error(formatAuthError(err));
  }
}

export async function sendPasswordReset(email: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new Error('Enter a valid email address to receive a password reset link.');
  }
  try {
    await sendPasswordResetEmail(auth, normalizedEmail);
  } catch (err) {
    throw new Error(formatAuthError(err));
  }
}

export async function updateAccountDisplayName(user: User, nextName: string): Promise<UserProfile> {
  const trimmed = nextName.trim();
  if (!trimmed) throw new Error('Display name cannot be empty.');
  if (trimmed.length > DISPLAY_NAME_MAX_LENGTH) {
    throw new Error(`Display name must be ${DISPLAY_NAME_MAX_LENGTH} characters or fewer.`);
  }
  const path = `users/${user.uid}`;
  try {
    await updateProfile(user, { displayName: trimmed });
    await updateDoc(doc(db, 'users', user.uid), {
      displayName: trimmed,
      updatedAt: serverTimestamp(),
    });
    return {
      uid: user.uid,
      displayName: trimmed,
      email: user.email || '',
      avatarUrl: user.photoURL || null,
      updatedAt: Date.now(),
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function signOutAccount(): Promise<void> {
  await signOut(auth);
}

export function subscribeAuthState(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, callback);
}
