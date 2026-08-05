import { useEffect, useState } from 'react';
import { SignedIn, useUser } from '@clerk/clerk-react';
import { listPinned, togglePinned } from '../lib/pinned';

function Inner() {
  const { user } = useUser();
  const userId = user?.id ?? null;
  const [pins, setPins] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!userId) return;
    listPinned(userId).then(setPins).catch(() => setPins([]));
  }, [userId]);

  async function add() {
    const name = draft.trim();
    if (!name || !userId || pins.includes(name)) return;
    setBusy(true);
    setPins(await togglePinned(userId, name));
    setDraft('');
    setBusy(false);
  }

  async function remove(name: string) {
    if (!userId) return;
    setBusy(true);
    setPins(await togglePinned(userId, name));
    setBusy(false);
  }

  return (
    <div className="panel" style={{ padding: '14px' }}>
      <p className="global-env-hint" style={{ marginTop: 0 }}>
        Pin the project names you open most. Saved to your account, synced
        across every <code>*.oriz.in</code> session.
      </p>
      <div style={{ display: 'flex', gap: '8px', margin: '10px 0' }}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="project name"
          aria-label="Project name to pin"
          style={{ flex: 1 }}
        />
        <button type="button" onClick={add} disabled={busy || !draft.trim()}>
          Pin
        </button>
      </div>
      {pins.length === 0 ? (
        <p className="muted-cell" style={{ padding: '4px 2px' }}>No pinned projects yet.</p>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {pins.map((p) => (
            <span key={p} className="badge encrypted" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              {p}
              <button
                type="button"
                className="pin-btn"
                aria-label={`Unpin ${p}`}
                onClick={() => remove(p)}
                style={{ fontSize: '13px' }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Pinned-projects panel — a personal feature gated behind Clerk sign-in.
 * Public vault content is never gated; this only appears when signed in.
 * Data lives in Firestore keyed by the Clerk userId (falls back to
 * localStorage when Firebase isn't configured). Rendered inside the
 * single page-level ClerkProvider (see DashboardShell) — no own provider.
 */
export default function PinnedPanel() {
  return (
    <SignedIn>
      <h2 data-seq="★">Your pinned projects</h2>
      <Inner />
    </SignedIn>
  );
}
