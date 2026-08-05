/**
 * Pinned projects — personal feature gated by Clerk. Firestore doc
 * keyed by Clerk userId: envpact_users/{userId} → { pinned: string[] }.
 * Falls back to localStorage when Firestore isn't configured, so the
 * feature degrades gracefully. Anonymous visitors never reach here
 * (the pin control only renders SignedIn).
 */
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getDb } from './firebase';

const LS_PREFIX = 'envpact.oriz.in:pinned:';
const COLLECTION = 'envpact_users';

function lsKey(userId: string): string {
  return `${LS_PREFIX}${userId}`;
}

function lsRead(userId: string): string[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(lsKey(userId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function lsWrite(userId: string, ids: string[]): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(lsKey(userId), JSON.stringify([...new Set(ids)]));
}

export async function listPinned(userId: string): Promise<string[]> {
  const db = getDb();
  if (!db) return lsRead(userId);
  try {
    const snap = await getDoc(doc(db, COLLECTION, userId));
    const data = snap.data() as { pinned?: unknown } | undefined;
    const pinned = data?.pinned;
    return Array.isArray(pinned) ? pinned.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return lsRead(userId);
  }
}

export async function togglePinned(userId: string, projectName: string): Promise<string[]> {
  const current = await listPinned(userId);
  const next = current.includes(projectName)
    ? current.filter((p) => p !== projectName)
    : [...current, projectName];
  lsWrite(userId, next);
  const db = getDb();
  if (db) {
    try {
      await setDoc(doc(db, COLLECTION, userId), { pinned: next }, { merge: true });
    } catch {
      /* Firestore write failed — localStorage copy still holds. */
    }
  }
  return next;
}
