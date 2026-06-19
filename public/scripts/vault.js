/**
 * GitHub Contents API client — read & commit secrets.json
 * directly from the user's private vault repo.
 *
 * No backend. All requests go from the browser to api.github.com
 * with the user's session token.
 *
 * v3: vaults are read with auto-upgrade in memory (per
 * SHARED_SPEC.md §1.4). Writes always go out as v3.
 */

import { upgradeVault, SCHEMA_URL_V3 } from './resolver.js';

const GITHUB_API = 'https://api.github.com';

export async function getVaultRepo(token, owner, repo = 'envpact-secrets') {
  const r = await fetch(`${GITHUB_API}/repos/${owner}/${repo}`, {
    headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github+json' },
  });
  if (!r.ok) {
    if (r.status === 404) return null;
    throw new Error(`repo fetch failed: ${r.status}`);
  }
  const data = await r.json();
  if (data.private !== true) {
    throw new Error(`Vault repo ${owner}/${repo} is PUBLIC. Refusing to load secrets — make the repo private on GitHub before continuing.`);
  }
  return data;
}

/**
 * Fetch and parse secrets.json. The parsed JSON is piped through
 * `upgradeVault` so all UI code sees v3 shapes regardless of what's
 * on disk. Pre-upgrade version is returned so callers can decide
 * whether to persist the upgrade on the next mutation.
 */
export async function getSecretsFile(token, owner, repo = 'envpact-secrets') {
  const r = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/contents/secrets.json`,
    {
      headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github+json' },
    }
  );
  if (!r.ok) {
    if (r.status === 404) return null;
    throw new Error(`secrets fetch failed: ${r.status}`);
  }
  const data = await r.json();
  const parsed = JSON.parse(atob(data.content.replace(/\n/g, '')));
  const originalVersion = parsed && typeof parsed === 'object' ? parsed.version : null;
  const content = upgradeVault(parsed);
  return { sha: data.sha, content, originalVersion };
}

/**
 * Commit the (already-v3-shaped) vault back. Bumps
 * `metadata.updated_at`, ensures `version: 3`, and rewrites
 * `$schema` to the v3 URL — so even a vault loaded as v1/v2 is
 * persisted as v3 on first mutation (per SHARED_SPEC §1.4 step 5).
 */
export async function commitSecretsFile(token, owner, repo, vault, sha, message) {
  // Defensive: callers should already have v3 shapes (getSecretsFile
  // upgrades on read), but enforce here.
  const next = upgradeVault(vault);
  next.$schema = SCHEMA_URL_V3;
  next.version = 3;
  next.metadata = next.metadata || {};
  next.metadata.updated_at = new Date().toISOString();

  const content = btoa(unescape(encodeURIComponent(JSON.stringify(next, null, 2) + '\n')));
  const body = {
    message: message || 'envpact-dashboard: update vault',
    content,
    sha,
    committer: { name: 'envpact-dashboard', email: 'envpact@local' },
  };
  const r = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/contents/secrets.json`,
    {
      method: 'PUT',
      headers: {
        Authorization: `token ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  );
  if (!r.ok) throw new Error(`commit failed: ${r.status} ${(await r.text()).slice(0, 200)}`);
  return await r.json();
}

export async function listVaultCommits(token, owner, repo = 'envpact-secrets', limit = 20) {
  const r = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/commits?path=secrets.json&per_page=${limit}`,
    { headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github+json' } }
  );
  if (!r.ok) return [];
  return await r.json();
}
