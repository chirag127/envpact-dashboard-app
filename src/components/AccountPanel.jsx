import { useEffect, useState } from 'react';
import {
  ClerkProvider,
  SignInButton,
  SignedIn,
  SignedOut,
  UserButton,
  useUser,
} from '@clerk/clerk-react';
import { getDb, firebaseReady } from '../lib/firebase.js';
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';

const pk = import.meta.env.PUBLIC_CLERK_PUBLISHABLE_KEY;

// The three station metrics a signed-in analyst can pin as their baseline.
const METRICS = [
  { id: 'carbon', label: 'Carbon intensity', unit: 'gCO₂/kWh' },
  { id: 'pm25', label: 'Particulate PM2.5', unit: 'µg/m³' },
  { id: 'offset', label: 'Sequestered load', unit: 't CO₂e' },
];

function Baseline() {
  const { user } = useUser();
  const [pinned, setPinned] = useState([]);
  const [status, setStatus] = useState('idle');

  useEffect(() => {
    if (!user || !firebaseReady) return;
    const db = getDb();
    if (!db) return;
    let live = true;
    getDoc(doc(db, 'envpact_baselines', user.id))
      .then((snap) => {
        if (live && snap.exists()) setPinned(snap.data().metrics ?? []);
      })
      .catch(() => setStatus('error'));
    return () => {
      live = false;
    };
  }, [user]);

  async function toggle(id) {
    const next = pinned.includes(id)
      ? pinned.filter((m) => m !== id)
      : [...pinned, id];
    setPinned(next);
    const db = getDb();
    if (!db || !user) return;
    setStatus('saving');
    try {
      await setDoc(
        doc(db, 'envpact_baselines', user.id),
        { metrics: next, updatedAt: serverTimestamp() },
        { merge: true },
      );
      setStatus('saved');
    } catch {
      setStatus('error');
    }
  }

  return (
    <div className="baseline">
      <p className="baseline-lead">
        Pin the readings you steward. Your baseline follows your oriz
        account across every station panel.
      </p>
      <ul className="baseline-list">
        {METRICS.map((m) => {
          const on = pinned.includes(m.id);
          return (
            <li key={m.id}>
              <button
                type="button"
                className={on ? 'pin on' : 'pin'}
                aria-pressed={on}
                onClick={() => toggle(m.id)}
              >
                <span className="pin-dot" aria-hidden="true" />
                <span className="pin-label">{m.label}</span>
                <span className="pin-unit">{m.unit}</span>
                <span className="pin-state">{on ? 'Pinned' : 'Pin'}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="baseline-status" role="status">
        {status === 'saving' && 'Saving baseline…'}
        {status === 'saved' && 'Baseline saved.'}
        {status === 'error' &&
          'Could not reach the store. Check Firebase config.'}
        {status === 'idle' && !firebaseReady &&
          'Firestore not configured — pins stay local this session.'}
      </p>
    </div>
  );
}

function Inner() {
  return (
    <div className="account">
      <SignedOut>
        <p className="account-lead">
          The station reads are open to everyone. Sign in only to keep a
          personal baseline of the metrics you watch.
        </p>
        <SignInButton mode="modal">
          <button type="button" className="signin">Sign in to pin metrics</button>
        </SignInButton>
      </SignedOut>
      <SignedIn>
        <div className="account-bar">
          <span className="account-tag">Signed in</span>
          <UserButton afterSignOutUrl="/" />
        </div>
        <Baseline />
      </SignedIn>
    </div>
  );
}

export default function AccountPanel() {
  if (!pk) {
    return (
      <p className="account-lead">
        Sign-in is not configured for this build. Public station reads
        remain fully available above.
      </p>
    );
  }
  return (
    <ClerkProvider publishableKey={pk} afterSignOutUrl="/">
      <Inner />
    </ClerkProvider>
  );
}
