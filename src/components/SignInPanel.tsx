/*
 * SignInPanel — envpact /sign-in island. ClerkProvider + <SignIn/> (one
 * provider per page). Themed to the FIELD STATION identity: basalt panels,
 * verdigris/ochre mineral accents, IBM Plex Mono stamps. Public reads stay
 * open — this only fronts oriz.in SSO for the personal baseline.
 */
import { ClerkProvider, SignIn } from '@clerk/clerk-react'

const publishableKey = import.meta.env.PUBLIC_CLERK_PUBLISHABLE_KEY

const appearance = {
  variables: {
    colorPrimary: '#4fa294',
    colorText: '#eef0ea',
    colorTextSecondary: '#97a09a',
    colorBackground: '#1f262b',
    colorInputBackground: '#14181b',
    colorInputText: '#eef0ea',
    colorDanger: '#c85b44',
    colorNeutral: '#2c353b',
    borderRadius: '6px',
    fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  elements: {
    card: {
      backgroundColor: '#1f262b',
      border: '1px solid #2c353b',
      boxShadow: '0 26px 60px -42px rgba(0,0,0,0.92)',
      borderRadius: '10px',
    },
    headerTitle: {
      fontFamily: "'Big Shoulders Display', 'Arial Narrow', system-ui, sans-serif",
      fontWeight: '700',
      color: '#eef0ea',
    },
    headerSubtitle: { color: '#97a09a' },
    formButtonPrimary: {
      backgroundColor: '#4fa294',
      color: '#14181b',
      fontFamily: "'IBM Plex Mono', Consolas, monospace",
      fontWeight: '600',
      letterSpacing: '0.03em',
      textTransform: 'none',
      borderRadius: '6px',
    },
    formFieldInput: {
      backgroundColor: '#14181b',
      borderColor: '#2c353b',
      color: '#eef0ea',
    },
    formFieldLabel: { color: '#eef0ea' },
    footerActionLink: { color: '#4fa294' },
  },
} as const

export default function SignInPanel() {
  if (!publishableKey) {
    return <p style={{ color: '#97a09a', fontFamily: 'monospace', fontSize: '13px' }}>Sign-in unavailable — auth not configured.</p>
  }
  return (
    <ClerkProvider publishableKey={publishableKey} appearance={appearance}>
      <SignIn routing="hash" />
    </ClerkProvider>
  )
}
