const fs = require('fs');
const path = require('path');
const { query } = require('./db');
const { auditLogPath } = require('./config');

function ensureLogFile() {
  const dir = path.dirname(auditLogPath);
  fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(auditLogPath)) {
    fs.writeFileSync(auditLogPath, '', 'utf8');
  }
}

function getRequestIp(req) {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || req.ip || null;
}

function cleanMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return metadata || {};
  }

  return Object.fromEntries(
    Object.entries(metadata).filter(([, value]) => value !== undefined)
  );
}

function appendFileAuditLine(payload) {
  const line = [
    payload.created_at,
    payload.event_type,
    `user_id=${payload.user_id ?? 'null'}`,
    `entity_type=${payload.entity_type ?? 'null'}`,
    `entity_id=${payload.entity_id ?? 'null'}`,
    `ip=${payload.ip_address ?? 'null'}`,
    `description=${JSON.stringify(payload.description)}`,
    `metadata=${JSON.stringify(payload.metadata || {})}`,
  ].join(' | ');

  fs.appendFile(auditLogPath, `${line}\n`, (error) => {
    if (error) {
      console.error('Failed to append audit log file:', error.message);
    }
  });
}

async function ensureAuditStorage() {
  ensureLogFile();
  await query(
    `
      CREATE TABLE IF NOT EXISTS audit_logs (
        id serial primary key,
        user_id integer references users(id) on delete set null,
        event_type text not null,
        entity_type text,
        entity_id text,
        description text not null,
        metadata jsonb not null default '{}'::jsonb,
        ip_address text,
        user_agent text,
        created_at timestamp with time zone default now()
      )
    `
  );
  await query(
    'CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created_at ON audit_logs (user_id, created_at DESC)'
  );
  await query(
    'CREATE INDEX IF NOT EXISTS idx_audit_logs_event_created_at ON audit_logs (event_type, created_at DESC)'
  );
}

async function writeAuditLog(
  req,
  eventType,
  description,
  { userId = null, entityType = null, entityId = null, metadata = {} } = {}
) {
  const payload = {
    user_id: userId,
    event_type: eventType,
    entity_type: entityType,
    entity_id: entityId == null ? null : String(entityId),
    description,
    metadata: cleanMetadata(metadata),
    ip_address: getRequestIp(req),
    user_agent: req.headers['user-agent'] || '',
    created_at: new Date().toISOString(),
  };

  appendFileAuditLine(payload);

  try {
    await query(
      `
        INSERT INTO audit_logs
          (user_id, event_type, entity_type, entity_id, description, metadata, ip_address, user_agent)
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
      `,
      [
        payload.user_id,
        payload.event_type,
        payload.entity_type,
        payload.entity_id,
        payload.description,
        JSON.stringify(payload.metadata),
        payload.ip_address,
        payload.user_agent,
      ]
    );
  } catch (error) {
    console.error(`Audit DB write failed for ${eventType}:`, error.message);
  }
}

module.exports = {
  ensureAuditStorage,
  writeAuditLog,
};
