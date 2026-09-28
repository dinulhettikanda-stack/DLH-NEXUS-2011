const crypto = require('crypto');

const PROVIDERS = {
  github: {
    label: 'GitHub',
    clientId: 'GITHUB_OAUTH_CLIENT_ID',
    clientSecret: 'GITHUB_OAUTH_CLIENT_SECRET',
    authorize: 'https://github.com/login/oauth/authorize',
    token: 'https://github.com/login/oauth/access_token',
    scopes: ['read:user', 'user:email', 'repo']
  },
  google: {
    label: 'Google',
    clientId: 'GOOGLE_OAUTH_CLIENT_ID',
    clientSecret: 'GOOGLE_OAUTH_CLIENT_SECRET',
    authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token',
    scopes: [
      'https://www.googleapis.com/auth/drive.metadata.readonly',
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/gmail.readonly'
    ]
  },
  slack: {
    label: 'Slack',
    clientId: 'SLACK_CLIENT_ID',
    clientSecret: 'SLACK_CLIENT_SECRET',
    authorize: 'https://slack.com/oauth/v2/authorize',
    token: 'https://slack.com/api/oauth.v2.access',
    scopes: ['channels:read', 'groups:read', 'chat:write', 'users:read']
  },
  notion: {
    label: 'Notion',
    clientId: 'NOTION_CLIENT_ID',
    clientSecret: 'NOTION_CLIENT_SECRET',
    authorize: 'https://api.notion.com/v1/oauth/authorize',
    token: 'https://api.notion.com/v1/oauth/token',
    scopes: []
  }
};

function getSecret() {
  const value = process.env.CONNECTOR_SESSION_SECRET;
  if (!value || value.length < 32) throw new Error('CONNECTOR_SESSION_SECRET must be set to a random value of at least 32 characters.');
  return crypto.createHash('sha256').update(value).digest();
}

function b64(buf) {
  return Buffer.from(buf).toString('base64url');
}

function ub64(value) {
  return Buffer.from(value, 'base64url');
}

function seal(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getSecret(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return [b64(iv), b64(cipher.getAuthTag()), b64(ciphertext)].join('.');
}

function open(value) {
  try {
    const [iv, tag, ciphertext] = String(value).split('.');
    if (!iv || !tag || !ciphertext) return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', getSecret(), ub64(iv));
    decipher.setAuthTag(ub64(tag));
    return JSON.parse(Buffer.concat([decipher.update(ub64(ciphertext)), decipher.final()]).toString('utf8'));
  } catch (_) {
    return null;
  }
}

function sign(value) {
  return crypto.createHmac('sha256', getSecret()).update(value).digest('base64url');
}

function createState(provider) {
  const nonce = crypto.randomBytes(24).toString('base64url');
  const payload = provider + '.' + nonce;
  return payload + '.' + sign(payload);
}

function verifyState(value, provider) {
  try {
    const parts = String(value || '').split('.');
    if (parts.length !== 3 || parts[0] !== provider) return false;
    const payload = parts[0] + '.' + parts[1];
    const expected = sign(payload);
    return crypto.timingSafeEqual(Buffer.from(parts[2]), Buffer.from(expected));
  } catch (_) {
    return false;
  }
}

function cookie(name, value, maxAge) {
  return name + '=' + encodeURIComponent(value) + '; Path=/; Max-Age=' + maxAge + '; HttpOnly; Secure; SameSite=Lax';
}

function clearCookie(name) {
  return name + '=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax';
}

function redirectUri(req, provider) {
  const configured = process.env.CONNECTOR_BASE_URL || process.env.NEXT_PUBLIC_APP_URL;
  const base = configured || ('https://' + req.headers.host);
  return base.replace(/\/$/, '') + '/api/connectors/' + provider + '?action=callback';
}

function providerConfig(provider) {
  return PROVIDERS[provider] || null;
}

module.exports = {
  PROVIDERS,
  seal,
  open,
  sign,
  createState,
  verifyState,
  cookie,
  clearCookie,
  redirectUri,
  providerConfig
};
