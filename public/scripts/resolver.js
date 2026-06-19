/**
 * Client-side resolver — port of envpact-cli/lib/resolver.js for v3
 * (flat, single-env, per-key `_modified_at` timestamps).
 * See SHARED_SPEC.md §1.2.
 *
 * Browser divergence (intentional, audit #6 from v0.2.0): encrypted
 * (`enc:`) entries are NEVER written into `resolved`. They are tracked
 * in `result.encrypted[]` so the UI can surface them, and the .env
 * download appends `# <KEY>: decryption unsupported — use envpact-cli`
 * comment lines instead. Materializing `enc:` requires the CLI.
 */

export const SHARED_PREFIX = 'shared.';
export const ENC_PREFIX = 'enc:';
export const SCHEMA_URL_V3 = 'https://envpact.oriz.in/schema/v3.json';

function nowIso() {
  return new Date().toISOString();
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Mask a secret value for safe display. First 3 + bullets + last 3
 * when the value is long enough; bullets-only otherwise.
 */
export function maskValue(v) {
  if (v === null || v === undefined) return '••••';
  const s = String(v);
  if (s.length <= 8) return '••••';
  return `${s.slice(0, 3)}••••${s.slice(-3)}`;
}

/**
 * Pure helper: extract `value` (string) from a v3 entry object.
 * Returns null if the entry is malformed.
 */
export function entryValue(entry) {
  if (!isPlainObject(entry)) return null;
  return typeof entry.value === 'string' ? entry.value : null;
}

/**
 * Pure helper: extract ISO `_modified_at` from a v3 entry object.
 * Returns null if missing or malformed.
 */
export function entryModifiedAt(entry) {
  if (!isPlainObject(entry)) return null;
  return typeof entry._modified_at === 'string' ? entry._modified_at : null;
}

/**
 * In-memory upgrade of v1/v2 → v3 (per SHARED_SPEC §1.4).
 * Pure: returns a NEW object. Caller decides whether to persist.
 *
 * - Drops every project key starting with `_` (kills `_default_env`).
 * - Wraps bare strings into `{value, _modified_at}`.
 * - Flattens per-env objects with priority: default → production →
 *   first non-empty value in `Object.values(raw)`.
 * - Rewrites `$schema` to v3 and bumps `version` to 3.
 */
export function upgradeVault(parsed) {
  if (!isPlainObject(parsed)) {
    throw new Error('Vault must be a JSON object');
  }
  if (parsed.version === 3) return parsed;
  if (parsed.version !== 1 && parsed.version !== 2) {
    throw new Error(`Unsupported vault version: ${parsed.version}. Expected 1, 2, or 3.`);
  }

  const fallback =
    (parsed.metadata && typeof parsed.metadata.updated_at === 'string'
      ? parsed.metadata.updated_at
      : null) || nowIso();

  const next = {
    $schema: SCHEMA_URL_V3,
    version: 3,
    shared: {},
    projects: {},
    metadata: { ...(parsed.metadata || {}) },
  };
  next.metadata.updated_at = fallback;

  for (const [k, raw] of Object.entries(parsed.shared || {})) {
    if (typeof raw === 'string') {
      next.shared[k] = { value: raw, _modified_at: fallback };
    } else if (isPlainObject(raw) && typeof raw.value === 'string') {
      next.shared[k] = {
        value: raw.value,
        _modified_at: typeof raw._modified_at === 'string' ? raw._modified_at : fallback,
      };
    }
  }

  for (const [pname, proj] of Object.entries(parsed.projects || {})) {
    if (!isPlainObject(proj)) continue;
    const out = {};
    for (const [key, raw] of Object.entries(proj)) {
      if (key.startsWith('_')) continue;
      if (typeof raw === 'string') {
        out[key] = { value: raw, _modified_at: fallback };
      } else if (isPlainObject(raw)) {
        // Already-v3 shape: has a string `value` and no per-env keys.
        if (typeof raw.value === 'string' && !('default' in raw) && !('production' in raw)) {
          out[key] = {
            value: raw.value,
            _modified_at: typeof raw._modified_at === 'string' ? raw._modified_at : fallback,
          };
        } else {
          // v2 per-env object: pick default → production → first.
          let picked = null;
          if (typeof raw.default === 'string' && raw.default !== '') picked = raw.default;
          else if (typeof raw.production === 'string' && raw.production !== '') picked = raw.production;
          else {
            for (const v of Object.values(raw)) {
              if (typeof v === 'string' && v !== '') { picked = v; break; }
            }
          }
          if (picked !== null) out[key] = { value: picked, _modified_at: fallback };
        }
      }
    }
    next.projects[pname] = out;
  }

  return next;
}

export function resolveString(rawValue, shared) {
  if (typeof rawValue !== 'string') return { value: null, status: 'invalid' };
  if (rawValue.startsWith(ENC_PREFIX)) return { value: rawValue, status: 'encrypted' };
  if (rawValue.startsWith(SHARED_PREFIX)) {
    const k = rawValue.slice(SHARED_PREFIX.length);
    if (!k) return { value: null, status: 'invalid' };
    if (!shared || !(k in shared)) return { value: null, status: 'unresolved' };
    const sharedVal = entryValue(shared[k]);
    if (sharedVal === null) return { value: null, status: 'invalid' };
    if (sharedVal.startsWith(SHARED_PREFIX)) return { value: null, status: 'invalid' };
    return sharedVal.startsWith(ENC_PREFIX)
      ? { value: sharedVal, status: 'encrypted' }
      : { value: sharedVal, status: 'ok' };
  }
  return { value: rawValue, status: 'ok' };
}

/**
 * v3 resolver. No env parameter — vaults are single-env.
 */
export function resolveProject(vault, projectName) {
  const project = (vault.projects || {})[projectName];
  if (!project) {
    return { resolved: {}, unresolved: [], invalid: [], encrypted: [], missing: true };
  }
  const resolved = {};
  const unresolved = [];
  const invalid = [];
  const encrypted = [];
  const shared = vault.shared || {};

  for (const [key, entry] of Object.entries(project)) {
    if (key.startsWith('_')) continue;
    const raw = entryValue(entry);
    if (raw === null) { invalid.push(key); continue; }
    const r = resolveString(raw, shared);
    if (r.status === 'ok') resolved[key] = r.value;
    else if (r.status === 'encrypted') {
      // Browser divergence (audit #6): track separately, do NOT
      // include enc: ciphertext in resolved — caller writes a
      // comment line in .env instead.
      encrypted.push(key);
    } else if (r.status === 'unresolved') unresolved.push(key);
    else invalid.push(key);
  }

  return { resolved, unresolved, invalid, encrypted, missing: false };
}

/**
 * List the projects that reference a given shared key. v3 entries
 * are flat — no per-env scan needed.
 */
export function findReferencingProjects(vault, sharedKey) {
  const refs = [];
  const ref = `${SHARED_PREFIX}${sharedKey}`;
  for (const [pname, proj] of Object.entries(vault.projects || {})) {
    if (!isPlainObject(proj)) continue;
    for (const [k, entry] of Object.entries(proj)) {
      if (k.startsWith('_')) continue;
      if (entryValue(entry) === ref) refs.push({ project: pname, key: k });
    }
  }
  return refs;
}

export function downloadEnv(filename, content) {
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 100);
}

export function renderEnv(orderedKeys, valueMap, opts = {}) {
  const lines = [
    `# Generated by envpact-dashboard on ${new Date().toISOString()}`,
    '# DO NOT COMMIT — add .env to .gitignore',
  ];
  if (opts.project) lines.push(`# project: ${opts.project}`);
  lines.push('');
  for (const k of orderedKeys) {
    if (k in valueMap) {
      const v = String(valueMap[k]);
      const needsQuote = /[\s#"'\\]/.test(v) || v === '';
      lines.push(`${k}=${needsQuote ? `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` : v}`);
    }
  }
  return lines.join('\n') + '\n';
}

/**
 * Format an ISO timestamp as a relative duration ("5 minutes ago",
 * "2 days ago"). Falls back to the raw string on parse failure.
 */
export function formatRelative(iso, now = Date.now()) {
  if (typeof iso !== 'string') return '—';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const deltaSec = Math.round((t - now) / 1000);
  const abs = Math.abs(deltaSec);
  // eslint-disable-next-line no-undef
  const rtf = typeof Intl !== 'undefined' && Intl.RelativeTimeFormat
    ? new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
    : null;
  const fmt = (val, unit) => rtf ? rtf.format(val, unit) : `${Math.abs(val)} ${unit}${Math.abs(val) === 1 ? '' : 's'} ${val < 0 ? 'ago' : 'from now'}`;
  if (abs < 60) return fmt(deltaSec, 'second');
  if (abs < 3600) return fmt(Math.round(deltaSec / 60), 'minute');
  if (abs < 86400) return fmt(Math.round(deltaSec / 3600), 'hour');
  if (abs < 86400 * 30) return fmt(Math.round(deltaSec / 86400), 'day');
  if (abs < 86400 * 365) return fmt(Math.round(deltaSec / (86400 * 30)), 'month');
  return fmt(Math.round(deltaSec / (86400 * 365)), 'year');
}

/**
 * Latest `_modified_at` across every entry in a project (or across
 * shared if you pass shared instead). Returns null when empty.
 */
export function latestModifiedAt(record) {
  if (!isPlainObject(record)) return null;
  let latest = null;
  for (const [k, entry] of Object.entries(record)) {
    if (k.startsWith('_')) continue;
    const m = entryModifiedAt(entry);
    if (m && (latest === null || m > latest)) latest = m;
  }
  return latest;
}
