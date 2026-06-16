// Cloudflare Pages Function: GitHub Device Flow token-exchange proxy.
//
// Companion to functions/api/auth/device.ts. The browser polls this
// endpoint with the device_code it got from /api/auth/device; we
// forward the request to github.com/login/oauth/access_token with the
// client_id added server-side, and return GitHub's response.
//
// GitHub's token endpoint also lacks browser-friendly CORS, so the
// same proxy pattern applies.

interface Env {
  PUBLIC_GITHUB_OAUTH_CLIENT_ID: string;
}

interface TokenBody {
  device_code?: string;
}

const DEVICE_CODE_RE = /^[A-Za-z0-9._\-]{8,256}$/;

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  if (!ctx.env.PUBLIC_GITHUB_OAUTH_CLIENT_ID) {
    return json({ error: 'config', error_description: 'GitHub OAuth client_id not configured on the deployment.' }, 500);
  }

  let body: TokenBody;
  try {
    body = await ctx.request.json<TokenBody>();
  } catch {
    return json({ error: 'bad_request', error_description: 'expected JSON body' }, 400);
  }

  const deviceCode = (body.device_code ?? '').trim();
  if (!DEVICE_CODE_RE.test(deviceCode)) {
    return json({ error: 'bad_request', error_description: 'device_code missing or malformed' }, 400);
  }

  const upstream = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'envpact-dashboard/0.3 (+https://github.com/chirag127/envpact-dashboard)',
    },
    body: JSON.stringify({
      client_id: ctx.env.PUBLIC_GITHUB_OAUTH_CLIENT_ID,
      device_code: deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    }),
  });

  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
};

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
