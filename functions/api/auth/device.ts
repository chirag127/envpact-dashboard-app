// Cloudflare Pages Function: GitHub Device Flow proxy.
//
// Why this exists: github.com/login/device/code does NOT send
// Access-Control-Allow-Origin for arbitrary origins, so a static
// dashboard hosted at envpact-dashboard.pages.dev cannot call it
// directly from the browser — the response is blocked by CORS.
//
// This Function runs on Cloudflare's edge (server-side), forwards the
// request to GitHub with the OAuth client_id pulled from the Pages
// env binding, and returns the JSON to the browser with same-origin
// CORS-irrelevance.
//
// We never expose the client_id to the browser bundle anymore; the
// request body from the browser only carries `scope`. (The client_id
// is a public OAuth value, but funneling it through one place keeps
// the static bundle clean and lets us rotate the app without a
// re-deploy.)

interface Env {
  PUBLIC_GITHUB_OAUTH_CLIENT_ID: string;
}

interface DeviceFlowBody {
  scope?: string;
}

const ALLOWED_SCOPES = new Set(['repo', 'read:user', 'user']);

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  if (!ctx.env.PUBLIC_GITHUB_OAUTH_CLIENT_ID) {
    return json({ error: 'config', error_description: 'GitHub OAuth client_id not configured on the deployment.' }, 500);
  }

  let body: DeviceFlowBody;
  try {
    body = await ctx.request.json<DeviceFlowBody>();
  } catch {
    return json({ error: 'bad_request', error_description: 'expected JSON body' }, 400);
  }

  // Whitelist the scope to keep the proxy from being repurposed for
  // unrelated OAuth scopes against this client_id.
  const scope = (body.scope ?? 'repo').trim();
  if (!ALLOWED_SCOPES.has(scope)) {
    return json({ error: 'bad_request', error_description: `scope must be one of ${[...ALLOWED_SCOPES].join(', ')}` }, 400);
  }

  const upstream = await fetch('https://github.com/login/device/code', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'envpact-dashboard/0.3 (+https://github.com/chirag127/envpact-dashboard)',
    },
    body: JSON.stringify({ client_id: ctx.env.PUBLIC_GITHUB_OAUTH_CLIENT_ID, scope }),
  });

  // Forward GitHub's body verbatim — it already speaks the protocol
  // the browser expects. Just normalise content-type.
  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // Same-origin only — no CORS headers needed because the dashboard
      // and this Function ship under the same hostname.
      'Cache-Control': 'no-store',
    },
  });
};

// Reject everything else cleanly; some browsers preflight even
// same-origin requests in dev tooling.
export const onRequest: PagesFunction<Env> = (ctx) => {
  if (ctx.request.method === 'POST') return onRequestPost(ctx);
  return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } });
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
