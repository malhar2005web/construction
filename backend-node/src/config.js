const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

module.exports = {
  dbConfig: {
    host: process.env.POSTGRES_HOST || '127.0.0.1',
    port: Number(process.env.POSTGRES_PORT || '5432'),
    database: process.env.POSTGRES_DB || 'construction',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD,
  },
  port: Number(process.env.NODE_API_PORT || '3000'),
  kgPerLiterDefault: 1.6,
  authSecret: process.env.APP_SECRET || process.env.SECRET_KEY || 'construction-dev-secret',
  authTokenMaxAgeSeconds: Number(process.env.AUTH_TOKEN_MAX_AGE_SECONDS || String(7 * 24 * 60 * 60)),
  auditLogPath: process.env.AUDIT_LOG_PATH || path.resolve(__dirname, '../audit.log'),
};
