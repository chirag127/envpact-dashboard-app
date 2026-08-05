/**
 * Firebase — shared oriz-in project. Firestore ONLY (Clerk owns auth).
 * Lazy singleton so islands that never touch Firestore pay nothing.
 * All config from PUBLIC_FIREBASE_* env — never hardcoded.
 */
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';

let cachedApp: FirebaseApp | null = null;
let cachedDb: Firestore | null = null;

function config() {
  return {
    apiKey: import.meta.env.PUBLIC_FIREBASE_API_KEY,
    authDomain: import.meta.env.PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.PUBLIC_FIREBASE_APP_ID,
  };
}

/** True when the six PUBLIC_FIREBASE_* keys are all present. */
export function firebaseReady(): boolean {
  const c = config();
  return Boolean(c.apiKey && c.projectId && c.appId);
}

export function getDb(): Firestore | null {
  if (!firebaseReady()) return null;
  if (cachedDb) return cachedDb;
  cachedApp = getApps()[0] ?? initializeApp(config());
  cachedDb = getFirestore(cachedApp);
  return cachedDb;
}
