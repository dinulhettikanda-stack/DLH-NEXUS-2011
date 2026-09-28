const {
  PROVIDERS, seal, open, createState, verifyState,
  cookie, clearCookie, redirectUri, providerConfig
} = require('../../lib/connector-oauth');

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function redirect(res, location) {
  res.statusCode = 302;
  res.setHeader('Location', location);
  res.end();
}

function getProvider(req) {
  const parts = String(req.url || '').split('?')[0].split('/').filter(Boolean);
  return parts[parts.length - 1];
}

function getAction(req) {
  return new URL(req.url, 'https://local.invalid').searchParams.get('action') || 'start';
}

async function readJson(res, req) {
  if (req.method !== 'POST') return {};
  return await new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1024 * 1024) req.destroy();
    });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); } catch (_) { resolve({}); }
    });
    req.on('error', reject);
  });
}

function parseCookies(header) {
  const out = {};
  String(header || '').split(';').forEach(pair => {
    const i = pair.indexOf('=');
    if (i > 0) out[pair.slice(0, i).trim()] = decodeURIComponent(pair.slice(i + 1).trim());
  });
  return out;
}

async function exchange(provider, code, req) {
  const cfg = providerConfig(provider);
  const clientId = process.env[cfg.clientId];
  const clientSecret = process.env[cfg.clientSecret];
  if (!clientId || !clientSecret) throw new Error('OAuth credentials are not configured for ' + provider + '.');

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri(req, provider)
  });
  if (provider === 'google') params.set('grant_type', 'authorization_code');

  const response = await fetch(cfg.token, {
    method: 'POST',
    headers: { 'Accept': 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params
  });
  const data = await response.json();
  if (!response.ok || data.error || !data.access_token) {
    throw new Error(data.error_description || data.error || 'OAuth token exchange failed.');
  }
  return data;
}

module.exports = async function handler(req, res) {
  const provider = getProvider(req);
  const cfg = providerConfig(provider);
  if (!cfg) return send(res, 404, { error: 'Unknown connector' });

  const action = getAction(req);
  const base = (process.env.CONNECTOR_BASE_URL || '').replace(/\/$/, '');

  try {
    if (action === 'status') {
      const cookies = parseCookies(req.headers.cookie);
      const session = open(cookies['nexus_connector_' + provider]);
      return send(res, 200, {
        connected: !!session,
        provider,
        account: session ? (session.account || null) : null,
        expiresAt: session ? session.expiresAt || null : null
      });
    }

    if (action === 'disconnect') {
      res.setHeader('Set-Cookie', clearCookie('nexus_connector_' + provider));
      return send(res, 200, { connected: false, provider });
    }

    if (action === 'callback') {
      const url = new URL(req.url, 'https://local.invalid');
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      const error = url.searchParams.get('error');
      if (error) return redirect(res, (base || '') + '/?connector_error=' + encodeURIComponent(provider + ':' + error));
      if (!code || !verifyState(state, provider)) return send(res, 400, { error: 'Invalid OAuth callback.' });

      const token = await exchange(provider, code, req);
      const session = {
        provider,
        accessToken: token.access_token,
        refreshToken: token.refresh_token || null,
        tokenType: token.token_type || 'Bearer',
        expiresAt: token.expires_in ? Date.now() + Number(token.expires_in) * 1000 : null,
        account: token.team || token.workspace_name || null
      };

      res.setHeader('Set-Cookie', cookie('nexus_connector_' + provider, seal(session), 60 * 60 * 24 * 30));
      return redirect(res, (base || '') + '/?connector_connected=' + encodeURIComponent(provider));
    }

    if (action === 'start') {
      const clientId = process.env[cfg.clientId];
      if (!clientId) return send(res, 503, { error: 'Connector is not configured yet.', provider });
      const state = createState(provider);
      const u = new URL(cfg.authorize);
      u.searchParams.set('client_id', clientId);
      u.searchParams.set('redirect_uri', redirectUri(req, provider));
      u.searchParams.set('state', state);

      if (provider === 'github') {
        u.searchParams.set('scope', cfg.scopes.join(' '));
      } else if (provider === 'google') {
        u.searchParams.set('response_type', 'code');
        u.searchParams.set('access_type', 'offline');
        u.searchParams.set('prompt', 'consent');
        u.searchParams.set('scope', cfg.scopes.join(' '));
      } else if (provider === 'slack') {
        u.searchParams.set('user_scope', cfg.scopes.join(','));
      } else if (provider === 'notion') {
        // Notion's OAuth authorize endpoint uses the client ID and redirect URI.
      }

      return redirect(res, u.toString());
    }

    if (action === 'api') {
      const cookies = parseCookies(req.headers.cookie);
      const session = open(cookies['nexus_connector_' + provider]);
      if (!session || !session.accessToken) return send(res, 401, { error: 'Connector not connected.' });

      const body = await readJson(res, req);
      const target = body && typeof body.url === 'string' ? body.url : '';
      if (!target || !/^https:\/\/(api\.github\.com|www\.googleapis\.com|slack\.com|api\.slack\.com|api\.notion\.com)\//.test(target)) {
        return send(res, 400, { error: 'Invalid connector API target.' });
      }

      const upstream = await fetch(target, {
        method: body.method === 'POST' ? 'POST' : 'GET',
        headers: {
          'Authorization': session.tokenType + ' ' + session.accessToken,
          'Accept': 'application/json',
          ...(provider === 'notion' ? { 'Notion-Version': '2022-06-28' } : {})
        },
        body: body.method === 'POST' ? JSON.stringify(body.body || {}) : undefined
      });
      const data = await upstream.text();
      res.statusCode = upstream.status;
      res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
      return res.end(data);
    }

    return send(res, 400, { error: 'Unsupported connector action.' });
  } catch (e) {
    return send(res, 500, { error: e.message || 'Connector error' });
  }
};
