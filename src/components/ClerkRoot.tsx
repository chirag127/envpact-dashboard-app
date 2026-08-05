import { ClerkProvider } from '@clerk/clerk-react';
import type { ReactNode } from 'react';

const publishableKey = import.meta.env.PUBLIC_CLERK_PUBLISHABLE_KEY;

// Cut-Steel escutcheon — oxidized-brass keyway accent on blued gunmetal.
const appearance = {
  variables: {
    colorPrimary: '#C08A2D',
    colorText: '#E4E7EC',
    colorTextSecondary: '#8A96A6',
    colorBackground: '#141A24',
    colorInputBackground: '#0B0E14',
    colorInputText: '#E4E7EC',
    colorDanger: '#D9553B',
    borderRadius: '4px',
    fontFamily: 'Archivo, system-ui, sans-serif',
  },
  elements: {
    card: {
      backgroundColor: '#141A24',
      border: '1px solid #2A3442',
      boxShadow: '0 1px 0 rgba(192,138,45,0.25) inset, 0 20px 60px rgba(0,0,0,0.5)',
      borderRadius: '6px',
    },
    headerTitle: {
      fontFamily: "'Zilla Slab', Georgia, serif",
      color: '#E4E7EC',
      letterSpacing: '-0.01em',
    },
    headerSubtitle: { color: '#8A96A6' },
    formButtonPrimary: {
      backgroundColor: '#C08A2D',
      backgroundImage: 'linear-gradient(180deg, #E0B45C 0%, #C08A2D 55%, #8A5F17 100%)',
      color: '#12130B',
      fontWeight: '600',
      borderRadius: '4px',
      boxShadow: '0 1px 0 rgba(255,255,255,0.3) inset, 0 2px 8px rgba(138,95,23,0.4)',
      textTransform: 'none',
    },
    formFieldInput: {
      backgroundColor: '#0B0E14',
      borderColor: '#2A3442',
      color: '#E4E7EC',
    },
    formFieldLabel: { color: '#E4E7EC' },
    footerActionLink: { color: '#5AA9E6' },
    identityPreviewEditButton: { color: '#5AA9E6' },
    userButtonAvatarBox: { width: '28px', height: '28px' },
  },
} as const;

/**
 * Clerk root. Renders children only when a publishable key is present —
 * never hardcoded, read from PUBLIC_CLERK_PUBLISHABLE_KEY. Cross-subdomain
 * SSO across *.oriz.in is Clerk's default for the shared production key.
 */
export default function ClerkRoot({ children }: { children: ReactNode }) {
  if (!publishableKey) return null;
  return (
    <ClerkProvider publishableKey={publishableKey} appearance={appearance}>
      {children}
    </ClerkProvider>
  );
}
