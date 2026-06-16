/**
 * GitHub OAuth Device Flow — proxied through Cloudflare Pages Functions.
 *
 * GitHub's device-flow endpoints (`/login/device/code`,
 * `/login/oauth/access_token`) do NOT send Access-Control-Allow-Origin
 * for arbitrary browser origins, so the previous v0.2.0 implementation
 * that POSTed straight to github.com from the browser was blocked by
 * CORS in every browser. The "Connect GitHub" button silently failed.
 *
 * v0.3.0 fixes this by proxying both calls through Pages Functions
 * shipped alongside this dashboard:
 *
 *   /api/auth/device  → POSTs to github.com/login/device/code
 *   /api/auth/token   → POSTs to github.com/login/oauth/access_token
 *
 * Both are same-origin so CORS does not apply. The Function injects
 * the OAuth client_id from the deployment's env binding, so the
 * browser bundle no longer needs to ship it.
 *
 * The access token is stored ONLY in sessionStorage (cleared on tab
 * close). It is never persisted in localStorage and never sent to
 * any third party — every API call after auth still goes directly
 * to api.github.com.
 */

const DEVICE_URL = '/api/auth/device';
const TOKEN_URL = '/api/auth/token';
const GITHUB_API = 'https://api.github.com';

const SESSION_TOKEN_KEY = 'envpact_gh_token';
const SESSION_USER_KEY = 'envpact_gh_user';

export function getStoredToken() {
  return sessionStorage.getItem(SESSION_TOKEN_KEY);
}

export function getStoredUser() {
  const raw = sessionStorage.getItem(SESSION_USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function clearAuth() {
  sessionStorage.removeItem(SESSION_TOKEN_KEY);
  sessionStorage.removeItem(SESSION_USER_KEY);
}

export async function startDeviceFlow(scope = 'repo') {
  const r = await fetch(DEVICE_URL, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ scope }),
  });
  if (!r.ok) {
    let detail = '';
    try {
      const data = await r.json();
      detail = data.error_description || data.error || '';
    } catch (_e) { /* non-JSON response */ }
    throw new Error(`device flow start failed: ${r.status}${detail ? ` — ${detail}` : ''}`);
  }
  return await r.json();
}

export async function pollForToken(deviceCode, interval) {
  while (true) {
    await new Promise((res) => setTimeout(res, (interval || 5) * 1000));
    const r = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_code: deviceCode }),
    });
    let data;
    try {
      data = await r.json();
    } catch (_e) {
      throw new Error(`device flow token endpoint returned non-JSON (status ${r.status})`);
    }
    if (data.access_token) return data.access_token;
    if (data.error === 'authorization_pending') continue;
    if (data.error === 'slow_down') {
      interval = (data.interval || interval) + 5;
      continue;
    }
    throw new Error(`device flow failed: ${data.error_description || data.error}`);
  }
}

export async function fetchUser(token) {
  const r = await fetch(`${GITHUB_API}/user`, {
    headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github+json' },
  });
  if (!r.ok) throw new Error(`user fetch failed: ${r.status}`);
  return await r.json();
}

export async function login() {
  const start = await startDeviceFlow('repo');
  // Show the code to the user
  const dialog = document.createElement('div');
  dialog.className = 'auth-dialog';
  dialog.innerHTML = `
    <div class="auth-card">
      <h2>Connect GitHub</h2>
      <p>Open <a href="${start.verification_uri}" target="_blank" rel="noopener">${start.verification_uri}</a> and enter:</p>
      <code class="auth-code">${start.user_code}</code>
      <p class="auth-hint">Waiting for authorisation… (token stays in this tab only)</p>
      <button class="auth-cancel">Cancel</button>
    </div>`;
  document.body.appendChild(dialog);
  dialog.querySelector('.auth-cancel').addEventListener('click', () => dialog.remove());

  try {
    const token = await pollForToken(start.device_code, start.interval);
    sessionStorage.setItem(SESSION_TOKEN_KEY, token);
    const user = await fetchUser(token);
    sessionStorage.setItem(SESSION_USER_KEY, JSON.stringify({
      login: user.login,
      name: user.name,
      avatar_url: user.avatar_url,
    }));
    dialog.remove();
    return { token, user };
  } catch (e) {
    dialog.remove();
    throw e;
  }
}
