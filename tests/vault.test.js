import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getSecretsFile, commitSecretsFile } from '../public/scripts/vault.js';
import { SCHEMA_URL_V3 } from '../public/scripts/resolver.js';

const ISO = '2026-06-19T10:00:00.000Z';

function b64encode(s) {
  return Buffer.from(s, 'utf-8').toString('base64');
}

function b64decode(s) {
  return Buffer.from(s, 'base64').toString('utf-8');
}

function installFetch(handler) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  return () => { globalThis.fetch = original; };
}

// Polyfills for atob/btoa under Node test runner — Node 18+ has them
// natively but be defensive.
if (typeof globalThis.atob !== 'function') {
  globalThis.atob = (s) => Buffer.from(s, 'base64').toString('binary');
}
if (typeof globalThis.btoa !== 'function') {
  globalThis.btoa = (s) => Buffer.from(s, 'binary').toString('base64');
}

test('getSecretsFile — v2 vault is auto-upgraded to v3 in memory', async () => {
  const v2 = {
    version: 2,
    shared: { OPENAI: 'sk-shared' },
    projects: {
      app: {
        PORT: '3000',
        URL: { default: 'http://default', production: 'http://prod' },
        _default_env: 'production',
      },
    },
    metadata: { updated_at: ISO },
  };
  const restore = installFetch(async (url) => {
    assert.match(url, /contents\/secrets\.json$/);
    return new Response(JSON.stringify({
      sha: 'abc',
      content: b64encode(JSON.stringify(v2)),
      encoding: 'base64',
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  try {
    const result = await getSecretsFile('TOKEN', 'me');
    assert.equal(result.sha, 'abc');
    assert.equal(result.originalVersion, 2);
    assert.equal(result.content.version, 3);
    assert.equal(result.content.$schema, SCHEMA_URL_V3);
    assert.deepEqual(result.content.shared.OPENAI, { value: 'sk-shared', _modified_at: ISO });
    assert.equal(result.content.projects.app.PORT.value, '3000');
    assert.equal(result.content.projects.app.URL.value, 'http://default');
    assert.ok(!('_default_env' in result.content.projects.app));
  } finally {
    restore();
  }
});

test('getSecretsFile — already-v3 vault passes through unchanged', async () => {
  const v3 = {
    $schema: SCHEMA_URL_V3,
    version: 3,
    shared: { K: { value: 'v', _modified_at: ISO } },
    projects: { app: { PORT: { value: '3000', _modified_at: ISO } } },
    metadata: { updated_at: ISO },
  };
  const restore = installFetch(async () => new Response(JSON.stringify({
    sha: 'sha3', content: b64encode(JSON.stringify(v3)), encoding: 'base64',
  }), { status: 200 }));
  try {
    const r = await getSecretsFile('T', 'me');
    assert.equal(r.originalVersion, 3);
    assert.equal(r.content.version, 3);
    assert.equal(r.content.projects.app.PORT.value, '3000');
  } finally {
    restore();
  }
});

test('getSecretsFile — 404 returns null', async () => {
  const restore = installFetch(async () => new Response('', { status: 404 }));
  try {
    assert.equal(await getSecretsFile('T', 'me'), null);
  } finally {
    restore();
  }
});

test('commitSecretsFile — round-trip writes v3 schema URL and version=3', async () => {
  let captured;
  const restore = installFetch(async (url, opts) => {
    assert.equal(opts.method, 'PUT');
    captured = JSON.parse(opts.body);
    return new Response(JSON.stringify({ content: { sha: 'newsha' } }), { status: 200 });
  });
  try {
    const v3 = {
      $schema: SCHEMA_URL_V3,
      version: 3,
      shared: {},
      projects: { app: { K: { value: 'v', _modified_at: ISO } } },
      metadata: { updated_at: ISO },
    };
    await commitSecretsFile('TOKEN', 'me', 'envpact-secrets', v3, 'oldsha', 'msg');
    const persisted = JSON.parse(b64decode(captured.content));
    assert.equal(persisted.version, 3);
    assert.equal(persisted.$schema, SCHEMA_URL_V3);
    // updated_at is bumped to wall-clock now and parses as a valid ISO.
    assert.ok(typeof persisted.metadata.updated_at === 'string');
    assert.ok(!Number.isNaN(Date.parse(persisted.metadata.updated_at)));
    assert.equal(captured.sha, 'oldsha');
    assert.equal(captured.message, 'msg');
  } finally {
    restore();
  }
});

test('commitSecretsFile — canary: v2 input persists as v3, no _default_env survives', async () => {
  let captured;
  const restore = installFetch(async (_url, opts) => {
    captured = JSON.parse(opts.body);
    return new Response(JSON.stringify({ content: { sha: 'newsha' } }), { status: 200 });
  });
  try {
    const v2 = {
      version: 2,
      shared: { K: 'v' },
      projects: {
        app: { PORT: '3000', _default_env: 'production' },
      },
      metadata: { updated_at: ISO },
    };
    await commitSecretsFile('T', 'me', 'envpact-secrets', v2, 'sha', 'msg');
    const persisted = JSON.parse(b64decode(captured.content));
    assert.equal(persisted.version, 3);
    assert.equal(persisted.$schema, SCHEMA_URL_V3);
    // _default_env MUST NOT survive a round-trip.
    assert.ok(!('_default_env' in persisted.projects.app));
    // Bare-string entries must be wrapped.
    assert.equal(persisted.projects.app.PORT.value, '3000');
    assert.equal(persisted.shared.K.value, 'v');
  } finally {
    restore();
  }
});

test('commitSecretsFile — failure surfaces a structured error', async () => {
  const restore = installFetch(async () => new Response('boom', { status: 422 }));
  try {
    await assert.rejects(
      commitSecretsFile('T', 'me', 'envpact-secrets', {
        $schema: SCHEMA_URL_V3, version: 3, shared: {}, projects: {}, metadata: { updated_at: ISO },
      }, 'sha', 'msg'),
      /commit failed: 422/
    );
  } finally {
    restore();
  }
});
