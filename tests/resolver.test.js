import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveProject,
  upgradeVault,
  resolveString,
  findReferencingProjects,
  maskValue,
  entryValue,
  entryModifiedAt,
  latestModifiedAt,
  formatRelative,
  SCHEMA_URL_V3,
} from '../public/scripts/resolver.js';

const ISO = '2026-06-19T10:00:00.000Z';

function v3Vault() {
  return {
    $schema: SCHEMA_URL_V3,
    version: 3,
    shared: {
      OPENAI_API_KEY: { value: 'sk-shared', _modified_at: ISO },
      ENC_KEY: { value: 'enc:Y2lwaGVy', _modified_at: ISO },
    },
    projects: {
      'my-app': {
        OPENAI_API_KEY: { value: 'shared.OPENAI_API_KEY', _modified_at: ISO },
        PORT: { value: '3000', _modified_at: '2026-06-19T11:00:00.000Z' },
        BAD_REF: { value: 'shared.MISSING', _modified_at: ISO },
        ENC_LOCAL: { value: 'enc:bG9jYWw=', _modified_at: ISO },
      },
    },
    metadata: { updated_at: ISO },
  };
}

test('resolveProject — happy path resolves shared refs and literals', () => {
  const r = resolveProject(v3Vault(), 'my-app');
  assert.equal(r.missing, false);
  assert.equal(r.resolved.OPENAI_API_KEY, 'sk-shared');
  assert.equal(r.resolved.PORT, '3000');
  assert.deepEqual(r.unresolved, ['BAD_REF']);
  // Encrypted entries are tracked but NOT placed in resolved.
  assert.deepEqual(r.encrypted, ['ENC_LOCAL']);
  assert.ok(!('ENC_LOCAL' in r.resolved));
});

test('resolveProject — missing project sets missing:true', () => {
  const r = resolveProject(v3Vault(), 'nope');
  assert.equal(r.missing, true);
  assert.deepEqual(r.resolved, {});
});

test('resolveProject — encrypted shared ref is tracked, not resolved', () => {
  const v = v3Vault();
  v.projects['my-app'].REF_ENC = { value: 'shared.ENC_KEY', _modified_at: ISO };
  const r = resolveProject(v, 'my-app');
  assert.ok(r.encrypted.includes('REF_ENC'));
  assert.ok(!('REF_ENC' in r.resolved));
});

test('resolveProject — invalid entry shapes go to invalid[]', () => {
  const v = v3Vault();
  v.projects['my-app'].BARE_STRING = 'not-an-entry-object';
  v.projects['my-app'].ARRAY_VAL = ['x'];
  v.projects['my-app'].NULL_VAL = null;
  const r = resolveProject(v, 'my-app');
  assert.ok(r.invalid.includes('BARE_STRING'));
  assert.ok(r.invalid.includes('ARRAY_VAL'));
  assert.ok(r.invalid.includes('NULL_VAL'));
});

test('resolveProject — keys starting with _ are ignored', () => {
  const v = v3Vault();
  v.projects['my-app']._comment = { value: 'x', _modified_at: ISO };
  const r = resolveProject(v, 'my-app');
  assert.ok(!('_comment' in r.resolved));
});

test('resolveString — recursive shared ref is invalid (no chains)', () => {
  const shared = { A: { value: 'shared.B', _modified_at: ISO }, B: { value: 'literal', _modified_at: ISO } };
  const r = resolveString('shared.A', shared);
  assert.equal(r.status, 'invalid');
});

test('upgradeVault — already v3 returned unchanged', () => {
  const v = v3Vault();
  assert.equal(upgradeVault(v), v);
});

test('upgradeVault — v1 strings are wrapped into entry objects', () => {
  const v1 = {
    version: 1,
    shared: { OPENAI: 'sk-1' },
    projects: {
      app: { PORT: '3000', _default_env: 'production' },
    },
    metadata: { updated_at: '2026-06-15T00:00:00Z' },
  };
  const upgraded = upgradeVault(v1);
  assert.equal(upgraded.version, 3);
  assert.equal(upgraded.$schema, SCHEMA_URL_V3);
  assert.deepEqual(upgraded.shared.OPENAI, { value: 'sk-1', _modified_at: '2026-06-15T00:00:00Z' });
  assert.deepEqual(upgraded.projects.app.PORT, { value: '3000', _modified_at: '2026-06-15T00:00:00Z' });
  assert.ok(!('_default_env' in upgraded.projects.app));
});

test('upgradeVault — v2 per-env objects flatten with default → production → first priority', () => {
  const v2 = {
    version: 2,
    shared: { OPENAI: { value: 'sk-shared', _modified_at: ISO } },
    projects: {
      app: {
        WITH_DEFAULT: { default: 'def', production: 'prod', staging: 'stage' },
        WITH_PROD_ONLY: { production: 'prod-val', staging: 'stage-val' },
        FIRST_FALLBACK: { staging: 'stage-only', development: 'dev-only' },
        ALREADY_V3: { value: 'literal', _modified_at: ISO },
        _default_env: 'production',
      },
    },
    metadata: { updated_at: ISO },
  };
  const upgraded = upgradeVault(v2);
  assert.equal(upgraded.version, 3);
  assert.equal(upgraded.projects.app.WITH_DEFAULT.value, 'def');
  assert.equal(upgraded.projects.app.WITH_PROD_ONLY.value, 'prod-val');
  // The first non-empty Object.values() wins. JS preserves insertion
  // order so 'staging' lands first here.
  assert.equal(upgraded.projects.app.FIRST_FALLBACK.value, 'stage-only');
  assert.equal(upgraded.projects.app.ALREADY_V3.value, 'literal');
  assert.equal(upgraded.projects.app.ALREADY_V3._modified_at, ISO);
  assert.ok(!('_default_env' in upgraded.projects.app));
});

test('upgradeVault — encrypted entries pass through unchanged on upgrade', () => {
  const v1 = {
    version: 1,
    shared: { ENC: 'enc:Y2lwaGVy' },
    projects: { app: { LOCAL_ENC: 'enc:bG9jYWw=' } },
    metadata: { updated_at: ISO },
  };
  const upgraded = upgradeVault(v1);
  assert.equal(upgraded.shared.ENC.value, 'enc:Y2lwaGVy');
  assert.equal(upgraded.projects.app.LOCAL_ENC.value, 'enc:bG9jYWw=');
  // …and resolveProject puts them into encrypted[], not resolved[].
  const r = resolveProject(upgraded, 'app');
  assert.deepEqual(r.encrypted, ['LOCAL_ENC']);
});

test('upgradeVault — unsupported version throws', () => {
  assert.throws(() => upgradeVault({ version: 99 }), /Unsupported vault version/);
  assert.throws(() => upgradeVault(null), /JSON object/);
});

test('upgradeVault — v2→v3 + resolveProject equivalence', () => {
  // A v2 vault with a default env that the resolver would have used,
  // upgraded to v3, must resolve to the same set of values.
  const v2 = {
    version: 2,
    shared: { S: 'shared-val' },
    projects: {
      app: {
        K1: { default: 'one', production: 'one-prod' },
        K2: 'two',
        K3: { default: 'shared.S' },
      },
    },
    metadata: { updated_at: ISO },
  };
  const r = resolveProject(upgradeVault(v2), 'app');
  assert.equal(r.resolved.K1, 'one');
  assert.equal(r.resolved.K2, 'two');
  assert.equal(r.resolved.K3, 'shared-val');
});

test('findReferencingProjects — flat v3 entries only', () => {
  const v = v3Vault();
  v.projects.other = { OPENAI_API_KEY: { value: 'shared.OPENAI_API_KEY', _modified_at: ISO } };
  const refs = findReferencingProjects(v, 'OPENAI_API_KEY');
  assert.equal(refs.length, 2);
  assert.ok(refs.some(r => r.project === 'my-app'));
  assert.ok(refs.some(r => r.project === 'other'));
});

test('maskValue — long values keep prefix/suffix, short ones are bullets only', () => {
  assert.equal(maskValue('sk-1234567890abc'), 'sk-••••abc');
  assert.equal(maskValue('short'), '••••');
  assert.equal(maskValue(null), '••••');
  assert.equal(maskValue(''), '••••');
});

test('entryValue / entryModifiedAt — extract from v3 entry, null on garbage', () => {
  assert.equal(entryValue({ value: 'x', _modified_at: ISO }), 'x');
  assert.equal(entryValue({ value: 42 }), null);
  assert.equal(entryValue('not-an-object'), null);
  assert.equal(entryValue(null), null);
  assert.equal(entryModifiedAt({ value: 'x', _modified_at: ISO }), ISO);
  assert.equal(entryModifiedAt({ value: 'x' }), null);
});

test('latestModifiedAt — picks the most recent timestamp', () => {
  const proj = {
    A: { value: '1', _modified_at: '2026-06-19T10:00:00.000Z' },
    B: { value: '2', _modified_at: '2026-06-19T11:00:00.000Z' },
    C: { value: '3', _modified_at: '2026-06-18T10:00:00.000Z' },
    _comment: { value: 'ignored', _modified_at: '2099-01-01T00:00:00.000Z' },
  };
  assert.equal(latestModifiedAt(proj), '2026-06-19T11:00:00.000Z');
  assert.equal(latestModifiedAt({}), null);
  assert.equal(latestModifiedAt(null), null);
});

test('formatRelative — produces a non-empty string for recent timestamps', () => {
  const now = Date.parse('2026-06-19T12:00:00.000Z');
  // 2 hours ago
  const out = formatRelative('2026-06-19T10:00:00.000Z', now);
  assert.ok(typeof out === 'string' && out.length > 0);
  assert.ok(/hour/.test(out));
});
