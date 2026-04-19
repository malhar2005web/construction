const crypto = require('crypto');
const { fetchOne } = require('./db');
const { authSecret, authTokenMaxAgeSeconds } = require('./config');

function toBase64Url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromBase64Url(input) {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(`${normalized}${padding}`, 'base64').toString('utf8');
}

function signTokenPayload(encodedHeader, encodedPayload) {
  return crypto
    .createHmac('sha256', authSecret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function createAuthToken(user) {
  const header = toBase64Url(
    JSON.stringify({ alg: 'HS256', typ: 'CST' })
  );
  const payload = toBase64Url(
    JSON.stringify({
      user_id: user.id,
      email: user.email,
      exp: Math.floor(Date.now() / 1000) + authTokenMaxAgeSeconds,
    })
  );
  const signature = signTokenPayload(header, payload);
  return `${header}.${payload}.${signature}`;
}

function decodeAuthToken(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid authentication token');
  }

  const [header, payload, signature] = parts;
  const expectedSignature = signTokenPayload(header, payload);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    throw new Error('Invalid authentication token');
  }

  const decodedPayload = JSON.parse(fromBase64Url(payload));
  if (!decodedPayload.exp || decodedPayload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('Session expired. Please login again.');
  }

  return decodedPayload;
}

function extractAuthToken(req) {
  const authHeader = req.headers.authorization || '';
  const prefix = 'Bearer ';
  if (authHeader.startsWith(prefix)) {
    return authHeader.slice(prefix.length).trim();
  }
  return null;
}

async function requireAuth(req, res, next) {
  const token = extractAuthToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  let payload;
  try {
    payload = decodeAuthToken(token);
  } catch (error) {
    return res.status(401).json({ error: error.message });
  }

  try {
    const user = await fetchOne(
      'SELECT id, email FROM users WHERE id = $1 LIMIT 1',
      [payload.user_id]
    );

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    req.currentUser = user;
    return next();
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

module.exports = {
  createAuthToken,
  decodeAuthToken,
  extractAuthToken,
  requireAuth,
};
