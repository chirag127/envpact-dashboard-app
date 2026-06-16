# Changelog

## [0.3.0] - 2026-06-16

### Fixed

- **"Connect GitHub" button is no longer broken.** The v0.2.0 button
  POSTed directly to `github.com/login/device/code` from the browser,
  which is silently blocked by CORS — GitHub's device-flow endpoints
  do not send `Access-Control-Allow-Origin` for arbitrary origins, so
  the fetch resolved with a CORS error, the `try/catch` showed an
  unhelpful "TypeError: Failed to fetch", and to most users it just
  looked like the button did nothing.

  v0.3.0 ships two Cloudflare Pages Functions —
  `functions/api/auth/device.ts` and `functions/api/auth/token.ts` —
  that proxy the device-flow start and the token exchange through the
  Pages edge. The browser calls `/api/auth/device` and
  `/api/auth/token` (same-origin, no CORS issue); the Function adds
  the OAuth `client_id` server-side from the `PUBLIC_GITHUB_OAUTH_CLIENT_ID`
  env binding and forwards the request to GitHub. GitHub's response
  body is returned verbatim, so the existing client polling / error
  handling works without changes.

### Changed

- `public/scripts/auth.js` no longer reads
  `window.__ENVPACT_CLIENT_ID__` — the static bundle does not need
  the OAuth client_id at all anymore. The Pages Function is the only
  thing that holds it. The build-time `PUBLIC_GITHUB_OAUTH_CLIENT_ID`
  env binding is still required by the Function; we just stopped
  baking it into the JS that ships to browsers.

### Migration

- After deploying v0.3.0, confirm `PUBLIC_GITHUB_OAUTH_CLIENT_ID` is
  set as an environment variable on the Pages project (it should
  already be — set in v0.2.0 deploy fix). The Functions need it at
  runtime; the static bundle does not.

## [0.2.0] - 2026-06-16

### Security

- **AUDIT #1** — `getVaultRepo` now throws when the GitHub Contents
  API reports the vault repo is not private. The dashboard's existing
  error rendering surfaces the message `Vault repo <owner>/<repo> is
  PUBLIC. Refusing to load secrets — make the repo private on GitHub
  before continuing.` instead of silently loading plaintext secrets
  from a public repo.

### Changed (BREAKING but correct)

- **AUDIT #6** — The browser port now omits encrypted (`enc:*`) values
  from the `resolved` map returned by `resolveProject`. The Projects
  table renders a `decryption unsupported (N)` badge next to each
  project that has encrypted keys. The `.env` download handler shows
  an explanatory alert and appends `# <KEY>: decryption unsupported —
  use envpact-cli` comment lines instead of the ciphertext. This is
  an intentional divergence from the CLI port's resolver semantics —
  the browser has no GPG, and shipping ciphertext into a downloaded
  `.env` is worse than omitting it.

## [0.1.0] - 2026-06-15

### Added

- Initial release of envpact-dashboard.
- Astro static site, no backend.
- GitHub OAuth Device Flow authentication.
- Projects table with key counts + environment badges.
- Shared Secrets table (values masked).
- Per-project `.env` download.
- Cloudflare Pages deployment workflow.
- Bit-for-bit identical resolver semantics with envpact-cli.

[0.1.0]: https://github.com/chirag127/envpact-dashboard/releases/tag/v0.1.0
