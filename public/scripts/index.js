import { login, getStoredToken, getStoredUser, clearAuth } from '/scripts/auth.js';
import { getSecretsFile, commitSecretsFile, getVaultRepo } from '/scripts/vault.js';
import {
  resolveProject,
  findReferencingProjects,
  renderEnv,
  downloadEnv,
  entryValue,
  entryModifiedAt,
  latestModifiedAt,
} from '/scripts/resolver.js';
import { formatTimestamp } from '/scripts/timestamps.js';
import { downloadGlobalEnv } from '/scripts/global-env.js';

const app = document.getElementById('app');
const userBar = document.getElementById('user-bar');

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

/**
 * Dual-render a vault `_modified_at` ISO timestamp for a table cell.
 * Visible text = IST (Asia/Kolkata, host-TZ independent).
 * Tooltip (`title=`) = canonical UTC string + IST below it, so
 * hovering reveals both per SHARED_SPEC §1.5.
 *
 * Returns { html, title } so callers can drop the markup directly.
 * Both fields are HTML-escaped.
 */
function renderTimestampCell(iso) {
  const ts = formatTimestamp(iso);
  if (!ts) return { html: '<span class="muted-cell">—</span>', title: '' };
  const titleAttr = `${ts.utc} (UTC)\n${ts.ist}`;
  return {
    html: `<span class="muted-cell" title="${escapeHtml(titleAttr)}">${escapeHtml(ts.ist)}</span>`,
    title: titleAttr,
  };
}

function renderUserBar() {
  const user = getStoredUser();
  if (user) {
    userBar.innerHTML = `
      <span style="display:inline-flex;align-items:center;gap:8px;">
        <img src="${escapeHtml(user.avatar_url)}" width="24" height="24" style="border-radius:50%" alt="" />
        <span>${escapeHtml(user.login)}</span>
        <button class="secondary" id="logout-btn" style="padding:4px 10px;font-size:12px;">Sign out</button>
      </span>`;
    document.getElementById('logout-btn')?.addEventListener('click', () => {
      clearAuth();
      location.reload();
    });
  } else {
    userBar.innerHTML = '';
  }
}

async function renderDashboard() {
  const token = getStoredToken();
  const user = getStoredUser();
  if (!token || !user) {
    renderLoggedOut();
    return;
  }

  app.innerHTML = '<p>Loading vault…</p>';
  try {
    const repo = await getVaultRepo(token, user.login);
    if (!repo) {
      app.innerHTML = `
        <div class="empty">
          <h2>No vault found</h2>
          <p>You don't have a <code>${user.login}/envpact-secrets</code> repo yet.</p>
          <p>Run <code>npx envpact-cli --init auto</code> in your terminal to create one.</p>
        </div>`;
      return;
    }
    const result = await getSecretsFile(token, user.login);
    if (!result) {
      app.innerHTML = `<p>Vault repo exists but has no <code>secrets.json</code>. Run <code>npx envpact-cli --init auto</code>.</p>`;
      return;
    }
    renderVault(result.content, result.sha);
  } catch (e) {
    app.innerHTML = `<p style="color:var(--danger)">Error: ${escapeHtml(e.message)}</p>`;
  }
}

function renderLoggedOut() {
  document.getElementById('login-btn')?.addEventListener('click', async () => {
    try {
      await login();
      renderUserBar();
      await renderDashboard();
    } catch (e) {
      alert(`Login failed: ${e.message}`);
    }
  });
}

function renderVault(vault, _sha) {
  const projects = Object.entries(vault.projects || {}).sort(([a], [b]) => a.localeCompare(b));
  const sharedKeys = Object.keys(vault.shared || {}).sort();

  app.innerHTML = `
    <div class="global-env-bar">
      <div>
        <button class="secondary" id="download-global-env">Download global .env</button>
        <div class="global-env-hint">
          Save this to <code>~/.envpact/.env</code> to expose every shared
          secret to your shell. <code>envpact-cli --sync-global</code> does
          this automatically.
        </div>
      </div>
    </div>

    <h2>Projects (${projects.length})</h2>
    <div class="panel">
      ${projects.length === 0 ? '<p class="empty">No projects yet. Add some with envpact-cli.</p>' : `
        <table>
          <thead><tr><th></th><th>Name</th><th>Keys</th><th>Last modified</th><th></th></tr></thead>
          <tbody>
            ${projects.map(([name, proj]) => {
              const keyCount = Object.keys(proj).filter(k => !k.startsWith('_')).length;
              const encCount = resolveProject(vault, name).encrypted.length;
              const encBadge = encCount > 0
                ? ` <span class="badge encrypted">decryption unsupported (${encCount})</span>`
                : '';
              const latest = latestModifiedAt(proj);
              const lastMod = renderTimestampCell(latest);
              return `
                <tr>
                  <td><button class="secondary toggle-perkey" data-project="${escapeHtml(name)}" aria-expanded="false" style="padding:2px 8px;">▸</button></td>
                  <td><strong>${escapeHtml(name)}</strong>${encBadge}</td>
                  <td>${keyCount}</td>
                  <td>${lastMod.html}</td>
                  <td>
                    <button class="secondary download-env" data-project="${escapeHtml(name)}">Download .env</button>
                  </td>
                </tr>
                <tr class="perkey-row" data-project-row="${escapeHtml(name)}" hidden>
                  <td colspan="5">
                    <div class="perkey-panel" data-project-panel="${escapeHtml(name)}"></div>
                  </td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>`}
    </div>

    <h2>Shared Secrets (${sharedKeys.length})</h2>
    <div class="panel">
      ${sharedKeys.length === 0 ? '<p class="empty">No shared secrets yet.</p>' : `
        <table>
          <thead><tr><th>Name</th><th>Type</th><th>Used by</th><th>Last modified</th></tr></thead>
          <tbody>
            ${sharedKeys.map(k => {
              const entry = vault.shared[k];
              const v = entryValue(entry);
              const enc = typeof v === 'string' && v.startsWith('enc:');
              const refs = findReferencingProjects(vault, k);
              const m = entryModifiedAt(entry);
              const lastMod = renderTimestampCell(m);
              return `
                <tr>
                  <td><code>${escapeHtml(k)}</code></td>
                  <td>${enc ? '<span class="badge encrypted">encrypted</span>' : '<span class="badge">plain</span>'}</td>
                  <td>${refs.length} reference${refs.length === 1 ? '' : 's'}</td>
                  <td>${lastMod.html}</td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>`}
    </div>

    <h2>Vault Info</h2>
    <div class="panel">
      <p><strong>Schema:</strong> ${escapeHtml(vault.$schema || '(none)')}</p>
      <p><strong>Version:</strong> ${vault.version}</p>
      <p><strong>Last updated:</strong> ${escapeHtml(vault.metadata?.updated_at || 'unknown')}</p>
      <p>
        <a href="https://github.com/${escapeHtml(getStoredUser().login)}/envpact-secrets/commits/main/secrets.json" target="_blank" rel="noopener">
          → View commit history on GitHub
        </a>
      </p>
    </div>
  `;

  // Wire up the global .env download button.
  const globalBtn = app.querySelector('#download-global-env');
  if (globalBtn) {
    globalBtn.addEventListener('click', () => {
      // global-env.js walks vault.shared.* alphabetically and produces
      // KEY=value lines (quoted per §5). Encrypted entries become
      // `# KEY: encrypted — decrypt-via-cli` comment lines — no
      // ciphertext ever lands in the downloaded file.
      downloadGlobalEnv(vault);
    });
  }

  // Wire up download buttons (single-env per project — no prompt).
  for (const btn of app.querySelectorAll('.download-env')) {
    btn.addEventListener('click', () => {
      const project = btn.dataset.project;
      const result = resolveProject(vault, project);
      if (result.encrypted.length > 0) {
        alert(`This project has ${result.encrypted.length} encrypted secrets. The browser dashboard cannot decrypt enc: values — use envpact-cli locally to materialize them. The downloaded .env will skip those keys.`);
      }
      const ordered = Object.keys(result.resolved);
      let content = renderEnv(ordered, result.resolved, { project });
      if (result.encrypted.length > 0) {
        const encComments = result.encrypted
          .map(key => `# ${key}: decryption unsupported — use envpact-cli`)
          .join('\n') + '\n';
        content = content + encComments;
      }
      downloadEnv(`.env.${project}`, content);
    });
  }

  // Wire up per-key status expand/collapse buttons.
  for (const btn of app.querySelectorAll('.toggle-perkey')) {
    btn.addEventListener('click', () => {
      const project = btn.dataset.project;
      const row = app.querySelector(`tr.perkey-row[data-project-row="${CSS.escape(project)}"]`);
      const panel = app.querySelector(`div.perkey-panel[data-project-panel="${CSS.escape(project)}"]`);
      if (!row || !panel) return;
      const expanded = btn.getAttribute('aria-expanded') === 'true';
      if (expanded) {
        row.hidden = true;
        btn.setAttribute('aria-expanded', 'false');
        btn.textContent = '▸';
      } else {
        if (!panel.dataset.rendered) {
          panel.innerHTML = renderPerKeyPanel(vault, project);
          panel.dataset.rendered = '1';
        }
        row.hidden = false;
        btn.setAttribute('aria-expanded', 'true');
        btn.textContent = '▾';
      }
    });
  }
}

/**
 * Per-key status panel for a project. The dashboard cannot see a
 * local `.env`, so it cannot compute the full per-key status set
 * (synced / local_newer / vault_newer / both_diverged / local_only /
 * vault_only) defined in SHARED_SPEC §1.3. It shows vault state
 * only, with a banner pointing the user at envpact-cli/mcp/vscode
 * for actual sync work.
 */
function renderPerKeyPanel(vault, projectName) {
  const proj = (vault.projects || {})[projectName] || {};
  const keys = Object.keys(proj).filter(k => !k.startsWith('_')).sort();
  const banner = `
    <div class="perkey-banner">
      <strong>Note:</strong> the dashboard shows vault state only.
      For per-key pull/push, use
      <a href="https://github.com/chirag127/envpact-cli">envpact-cli</a>,
      <a href="https://github.com/chirag127/envpact-mcp">envpact-mcp</a>,
      or
      <a href="https://github.com/chirag127/envpact-vscode">envpact-vscode</a>.
    </div>`;
  if (keys.length === 0) {
    return banner + '<p class="empty">No keys in this project.</p>';
  }
  const rows = keys.map(k => {
    const entry = proj[k];
    const v = entryValue(entry);
    const m = entryModifiedAt(entry);
    let statusBadge = '<span class="badge">synced</span>';
    if (v === null) {
      statusBadge = '<span class="badge encrypted">invalid</span>';
    } else if (typeof v === 'string' && v.startsWith('enc:')) {
      statusBadge = '<span class="badge encrypted">encrypted</span>';
    } else if (typeof v === 'string' && v.startsWith('shared.')) {
      statusBadge = '<span class="badge">shared ref</span>';
    }
    const lastMod = renderTimestampCell(m);
    return `
      <tr>
        <td><code>${escapeHtml(k)}</code></td>
        <td>${statusBadge}</td>
        <td>${lastMod.html}</td>
      </tr>`;
  }).join('');
  return banner + `
    <table class="perkey-table">
      <thead><tr><th>Key</th><th>Status</th><th>Last modified</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// Initial render
renderUserBar();
renderDashboard();
