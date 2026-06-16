      import { login, getStoredToken, getStoredUser, clearAuth } from '/scripts/auth.js';
      import { getSecretsFile, commitSecretsFile, getVaultRepo } from '/scripts/vault.js';
      import { resolveProject, findReferencingProjects, renderEnv, downloadEnv } from '/scripts/resolver.js';

      // (v0.3.0+ no longer needs the OAuth client_id in the browser —
      // the /api/auth/* Pages Functions inject it server-side from
      // wrangler.toml [vars]. The old window.__ENVPACT_CLIENT_ID__
      // line was dead code and crashed at runtime in a static .js
      // file because import.meta.env is undefined outside of Astro.)

      const app = document.getElementById('app');
      const userBar = document.getElementById('user-bar');

      function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, c => ({
          '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
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
        // Already in initial state; just attach the login handler.
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

      function renderVault(vault, sha) {
        const projects = Object.entries(vault.projects || {}).sort(([a], [b]) => a.localeCompare(b));
        const sharedKeys = Object.keys(vault.shared || {}).sort();

        app.innerHTML = `
          <h2>Projects (${projects.length})</h2>
          <div class="panel">
            ${projects.length === 0 ? '<p class="empty">No projects yet. Add some with envpact-cli or below.</p>' : `
              <table>
                <thead><tr><th>Name</th><th>Keys</th><th>Environments</th><th></th></tr></thead>
                <tbody>
                  ${projects.map(([name, proj]) => {
                    const keyCount = Object.keys(proj).filter(k => !k.startsWith('_')).length;
                    const envs = Array.from(new Set(
                      Object.values(proj).flatMap(v => v && typeof v === 'object' ? Object.keys(v) : ['default'])
                    )).sort();
                    const encCount = resolveProject(vault, name, null).encrypted.length;
                    const encBadge = encCount > 0
                      ? ` <span class="badge encrypted">decryption unsupported (${encCount})</span>`
                      : '';
                    return `
                      <tr>
                        <td><strong>${escapeHtml(name)}</strong>${encBadge}</td>
                        <td>${keyCount}</td>
                        <td>${envs.map(e => `<span class="badge">${escapeHtml(e)}</span>`).join(' ')}</td>
                        <td>
                          <button class="secondary download-env" data-project="${escapeHtml(name)}">Download .env</button>
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
                <thead><tr><th>Name</th><th>Type</th><th>Used by</th></tr></thead>
                <tbody>
                  ${sharedKeys.map(k => {
                    const v = vault.shared[k];
                    const enc = typeof v === 'string' && v.startsWith('enc:');
                    const refs = findReferencingProjects(vault, k);
                    return `
                      <tr>
                        <td><code>${escapeHtml(k)}</code></td>
                        <td>${enc ? '<span class="badge encrypted">encrypted</span>' : '<span class="badge">plain</span>'}</td>
                        <td>${refs.length} reference${refs.length === 1 ? '' : 's'}</td>
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

        // Wire up download buttons
        for (const btn of app.querySelectorAll('.download-env')) {
          btn.addEventListener('click', () => {
            const project = btn.dataset.project;
            const env = prompt('Environment (development/staging/production/default):', 'default') || 'default';
            const result = resolveProject(vault, project, env === 'default' ? null : env);
            if (result.encrypted.length > 0) {
              alert(`This project has ${result.encrypted.length} encrypted secrets. The browser dashboard cannot decrypt enc: values — use envpact-cli locally to materialize them. The downloaded .env will skip those keys.`);
            }
            const ordered = Object.keys(result.resolved);
            let content = renderEnv(ordered, result.resolved, { project, environment: result.environment });
            if (result.encrypted.length > 0) {
              const encComments = result.encrypted
                .map(key => `# ${key}: decryption unsupported — use envpact-cli`)
                .join('\n') + '\n';
              content = content + encComments;
            }
            downloadEnv(`.env.${project}.${result.environment}`, content);
          });
        }
      }

      // Initial render
      renderUserBar();
      renderDashboard();
