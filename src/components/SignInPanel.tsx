/*
 * SignInPanel — envpact /sign-in island. ClerkProvider + <SignIn/> (one
 * provider per page). Themed to the KEYRING identity: indigo night +
 * oxide brass / cut cyan, Space Mono stamps. Public marketing stays public.
 */
import { ClerkProvider, SignIn } from '@clerk/clerk-react'

const publishableKey = import.meta.env.PUBLIC_CLERK_PUBLISHABLE_KEY

const appearance = {
  variables: {
    colorPrimary: '#e8622c',
    colorText: '#f2eef6',
    colorTextSecondary: '#8a8fa8',
    colorBackground: '#151a2e',
    colorInputBackground: '#0a0d18',
    colorInputText: '#f2eef6',
    colorDanger: '#ff6a6a',
    colorNeutral: '#232a48',
    borderRadius: '4px',
    fontFamily: "'Inter Tight', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  elements: {
    card: {
      backgroundColor: '#151a2e',
      border: '1px solid #202744',
      boxShadow: '0 24px 60px -40px rgba(0,0,0,0.9)',
      borderRadius: '4px',
    },
    headerTitle: {
      fontFamily: "'Syne', 'Arial Narrow', system-ui, sans-serif",
      fontWeight: '800',
      color: '#f2eef6',
      letterSpacing: '-0.01em',
    },
    headerSubtitle: { color: '#8a8fa8' },
    formButtonPrimary: {
      backgroundColor: '#e8622c',
      color: '#0b0e1a',
      fontFamily: "'Space Mono', Consolas, monospace",
      fontWeight: '700',
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
      borderRadius: '3px',
    },
    formFieldInput: {
      backgroundColor: '#0a0d18',
      borderColor: '#202744',
      color: '#f2eef6',
    },
    formFieldLabel: { color: '#f2eef6' },
    footerActionLink: { color: '#4fd6e0' },
  },
} as const

export default function SignInPanel() {
  if (!publishableKey) {
    return <p style={{ color: '#8a8fa8', fontFamily: 'monospace', fontSize: '13px' }}>Sign-in unavailable — auth not configured.</p>
  }
  return (
    <ClerkProvider publishableKey={publishableKey} appearance={appearance}>
      <SignIn routing="hash" />
    </ClerkProvider>
  )
}
