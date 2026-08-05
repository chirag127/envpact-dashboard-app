import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';
import { SignedIn, SignedOut, SignInButton, UserButton } from '@clerk/clerk-react';
import ClerkRoot from './ClerkRoot';
import PinnedPanel from './PinnedPanel';

/**
 * Single Clerk island for the whole page. One <ClerkProvider> (via
 * ClerkRoot) hosts BOTH the header account control and the signed-in
 * pinned-projects panel, which is portaled into #pinned-mount in <main>.
 * One provider avoids Clerk's "multiple ClerkProvider" error that arises
 * when two independent islands each mount their own.
 */
function AccountControl() {
  return (
    <>
      <SignedOut>
        <SignInButton mode="modal">
          <button className="acct-btn" type="button">
            <span className="acct-dot" aria-hidden="true" />
            Save your view
          </button>
        </SignInButton>
      </SignedOut>
      <SignedIn>
        <UserButton />
      </SignedIn>
    </>
  );
}

export default function DashboardShell() {
  const [mount, setMount] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setMount(document.getElementById('pinned-mount'));
  }, []);
  return (
    <ClerkRoot>
      <AccountControl />
      {mount ? createPortal(<PinnedPanel />, mount) : null}
    </ClerkRoot>
  );
}
