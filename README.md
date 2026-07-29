# envpact-dashboard-app

[![Live](https://img.shields.io/badge/live-envpact--dashboard--app.oriz.in-2ea44f)](https://envpact-dashboard-app.oriz.in)
[![Stars](https://img.shields.io/github/stars/chirag127/envpact-dashboard-app?style=social)](https://github.com/chirag127/envpact-dashboard-app/stargazers)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![CI](https://github.com/chirag127/envpact-dashboard-app/actions/workflows/ci.yml/badge.svg)](https://github.com/chirag127/envpact-dashboard-app/actions/workflows/ci.yml)

Web dashboard for **envpact** — manage your private secrets vault
visually via GitHub OAuth.

> Live at **[envpact-dashboard-app.oriz.in](https://envpact-dashboard-app.oriz.in)** (also
> [envpact.oriz.in](https://envpact.oriz.in), mirrored at [envpact-dashboard.pages.dev](https://envpact-dashboard.pages.dev)).

Part of the [envpact](https://github.com/chirag127/envpact)
ecosystem.

## Privacy & Security

This is a **100% client-side static site**. There is no envpact
server, no third-party storage, no telemetry.

- Authentication uses GitHub's [OAuth Device Flow](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow) — no backend redirect, no client secret.
- Your access token lives **only** in this tab's `sessionStorage`
  (cleared the moment the tab closes). It is never persisted to
  `localStorage`, never sent anywhere except `api.github.com`.
- Every read & write goes directly from your browser to
  `https://api.github.com/repos/<you>/envpact-secrets/contents/secrets.json`.
- The dashboard origin is fully static — hosted on Cloudflare Pages
  with strict CSP and no inline scripts beyond the build output.

## Features

- **Sign in with GitHub** (device flow — works without a backend).
- **View your vault**: projects, key counts, per-key last-modified
  timestamps.
- **Last-modified columns render dual UTC + IST timestamps.** The
  visible text is `YYYY-MM-DD HH:MM:SS IST` (always Asia/Kolkata
  regardless of your browser timezone, per
  [SHARED_SPEC §1.5](https://github.com/chirag127/envpact/blob/main/SHARED_SPEC.md#15-timestamp-rendering-utc--ist));
  hover any cell to see the canonical UTC string in the tooltip.
- **List shared secrets**: names + encryption status + last
  modified (values never appear).
- **Download `.env`** for any project (single-environment per
  project; no env picker).
- **Download global `.env`** — a top-of-page button generates
  `envpact-global.env` from `vault.shared.*` (alphabetical, `KEY=value`,
  encrypted entries become `# KEY: encrypted — decrypt-via-cli`
  comments per [§1.6 + §5.1](https://github.com/chirag127/envpact/blob/main/SHARED_SPEC.md#16-global-vault-env)).
  Save the file to `~/.envpact/.env` to expose every shared secret to
  your shell, or let `envpact-cli --sync-global` regenerate it
  locally. The dashboard never emits `enc:*` ciphertext into the
  download.
- **Per-key status panel** per project, with last-modified
  timestamps for every key.
- **Direct link to GitHub commit history** for full audit log.

## What the dashboard CANNOT do

The dashboard is a static site. It has no access to your local
machine, so it cannot do the per-key pull/push work that the other
envpact surfaces handle:

- Per-key **pull** (vault → local `.env`) with conflict detection
  against `.env.example.lock`.
- Per-key **push** (local `.env` → vault) with conflict detection.
- The full per-key status enumeration in `SHARED_SPEC.md` §1.3 —
  `local_newer` / `vault_newer` / `both_diverged` / `local_only`
  classifications all need a local `.env` plus the lock sidecar.

For those, use:

- **[envpact-cli](https://github.com/chirag127/envpact-cli)** —
  the canonical CLI, runs locally with full git + filesystem
  access.
- **[envpact-mcp](https://github.com/chirag127/envpact-mcp)** —
  MCP server for Claude / IDE integrations.
- **[envpact-vscode](https://github.com/chirag127/envpact-vscode)**
  — VS Code extension with a tree view + per-key sync panel.

The dashboard surfaces vault state (values, references, last
modified) and lets you read/edit secrets directly through the
GitHub Contents API. That's it.

## Setup (for users)

You need an envpact vault first:

```bash
npx envpact-cli --init auto
# Creates {your-username}/envpact-secrets (private) and clones it.
```

Then visit **https://envpact.oriz.in**, click "Connect GitHub",
authorize, and you're in.

## Setup (for hosting your own)

1. Fork this repo.
2. Create a GitHub OAuth App at
   [github.com/settings/developers](https://github.com/settings/developers):
   - Application name: `envpact-dashboard` (or your choice).
   - Homepage URL: `https://your-domain.example`.
   - Authorization callback URL: `https://your-domain.example`
     (unused for device flow but required by the form).
   - **Enable Device Flow** under the OAuth app settings.
3. Set the GitHub OAuth client_id as a Cloudflare Pages env var:
   - `PUBLIC_GITHUB_OAUTH_CLIENT_ID = <your-client-id>`.
4. Connect the repo to Cloudflare Pages, build command
   `npm run build`, output `dist/`. Done.

The `deploy.yml` GitHub Action also automates this — set
`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repo secrets.

## Deploying to your custom domain

In Cloudflare Pages → Custom domains → add `envpact.oriz.in` (or
whatever you own). DNS gets validated automatically if the domain
is on Cloudflare.

## License

MIT © Chirag Singhal — see [LICENSE](./LICENSE).

## Documentation

- **[Repo docs (`docs/README.md`)](./docs/README.md)** — full API + usage reference for envpact-dashboard
- **[Project umbrella site](https://chirag127.github.io/envpact/)** — overview of all envpact components, security model, quick start
- **[Live dashboard](https://envpact.oriz.in)** — visual vault management
