const crypto = require('crypto');

function normalizeDensityToKgPerLiter(value, fallback = 1.6) {
  const density = Number(value ?? fallback);
  return density > 20 ? density / 1000.0 : density;
}

function serializeDatetimes(payload) {
  if (Array.isArray(payload)) {
    return payload.map(serializeDatetimes);
  }

  if (payload && typeof payload === 'object') {
    return Object.fromEntries(
      Object.entries(payload).map(([key, value]) => {
        if (value instanceof Date) {
          return [key, value.toISOString()];
        }
        return [key, serializeDatetimes(value)];
      })
    );
  }

  return payload;
}

function generateSalt(length = 16) {
  return crypto
    .randomBytes(length)
    .toString('base64')
    .replace(/[+/=]/g, '')
    .slice(0, length);
}

function pbkdf2Hash(password, salt, iterations, digest) {
  return crypto
    .pbkdf2Sync(password, salt, iterations, 32, digest)
    .toString('hex');
}

function scryptHash(password, salt, n, r, p) {
  return crypto
    .scryptSync(password, salt, 64, { N: n, r, p })
    .toString('hex');
}

function hashPassword(password) {
  const salt = generateSalt();
  const iterations = 1000000;
  const digest = 'sha256';
  const hash = pbkdf2Hash(password, salt, iterations, digest);
  return `pbkdf2:${digest}:${iterations}$${salt}$${hash}`;
}

function timingSafeCompare(left, right) {
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function checkPasswordHash(storedHash, password) {
  if (!storedHash || !password) {
    return false;
  }

  const [methodPart, salt, expectedHash] = storedHash.split('$');
  if (!methodPart || !salt || !expectedHash) {
    return false;
  }

  const methodPieces = methodPart.split(':');
  const method = methodPieces[0];

  try {
    if (method === 'pbkdf2') {
      const digest = methodPieces[1] || 'sha256';
      const iterations = Number(methodPieces[2] || '1000000');
      const calculatedHash = pbkdf2Hash(password, salt, iterations, digest);
      return timingSafeCompare(calculatedHash, expectedHash);
    }

    if (method === 'scrypt') {
      const n = Number(methodPieces[1] || '32768');
      const r = Number(methodPieces[2] || '8');
      const p = Number(methodPieces[3] || '1');
      const calculatedHash = scryptHash(password, salt, n, r, p);
      return timingSafeCompare(calculatedHash, expectedHash);
    }
  } catch (error) {
    return false;
  }

  return false;
}

module.exports = {
  checkPasswordHash,
  hashPassword,
  normalizeDensityToKgPerLiter,
  serializeDatetimes,
};
