const express = require('express');
const cors = require('cors');
const { fetchAll, fetchOne, query } = require('./db');
const { port, kgPerLiterDefault } = require('./config');
const { createAuthToken, requireAuth } = require('./auth');
const { ensureAuditStorage, writeAuditLog } = require('./audit');
const {
  checkPasswordHash,
  hashPassword,
  normalizeDensityToKgPerLiter,
  serializeDatetimes,
} = require('./utils');

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '25mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'construction-node-api' });
});

app.post('/api/signup', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Missing credentials' });
  }

  try {
    const existingUser = await fetchOne(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (existingUser) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    const user = await fetchOne(
      `
        INSERT INTO users (email, password)
        VALUES ($1, $2)
        RETURNING id, email
      `,
      [email, hashPassword(password)]
    );

    await writeAuditLog(req, 'auth.signup', `User account created for ${email}`, {
      userId: user.id,
      entityType: 'user',
      entityId: user.id,
      metadata: { email },
    });

    return res.json({
      success: true,
      message: 'User created successfully',
      user,
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to create user',
      details: error.message,
    });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body || {};

  try {
    const user = await fetchOne(
      'SELECT id, email, password FROM users WHERE email = $1 LIMIT 1',
      [email]
    );

    if (!user || !checkPasswordHash(user.password || '', password)) {
      await writeAuditLog(req, 'auth.login_failed', `Login failed for ${email || 'unknown email'}`, {
        entityType: 'user',
        metadata: {
          email,
          reason: user ? 'invalid_password' : 'user_not_found',
        },
      });
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const authUser = {
      id: user.id,
      email: user.email,
    };

    await writeAuditLog(req, 'auth.login_success', `User logged in: ${user.email}`, {
      userId: user.id,
      entityType: 'user',
      entityId: user.id,
      metadata: { email: user.email },
    });

    return res.json({
      success: true,
      user: authUser,
      token: createAuthToken(authUser),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/logout', requireAuth, async (req, res) => {
  await writeAuditLog(req, 'auth.logout', `User logged out: ${req.currentUser.email}`, {
    userId: req.currentUser.id,
    entityType: 'user',
    entityId: req.currentUser.id,
    metadata: { email: req.currentUser.email },
  });
  return res.json({ success: true });
});

app.get('/api/plants', requireAuth, async (req, res) => {
  try {
    const rows = await fetchAll(
      `
        SELECT DISTINCT plant_name
        FROM contractor_data
        ORDER BY plant_name
      `
    );

    const plants = rows.map((row) => row.plant_name).filter(Boolean);
    await writeAuditLog(req, 'plants.list_viewed', 'User fetched plant list', {
      userId: req.currentUser.id,
      entityType: 'plant',
      metadata: { plant_count: plants.length },
    });

    return res.json(plants);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/sections/:plantName', requireAuth, async (req, res) => {
  try {
    const rows = await fetchAll(
      `
        SELECT *
        FROM contractor_data
        WHERE plant_name = $1
        ORDER BY id DESC
      `,
      [req.params.plantName]
    );

    const normalizedRows = rows.map((row) => ({
      ...row,
      density: normalizeDensityToKgPerLiter(row.density, kgPerLiterDefault),
    }));

    await writeAuditLog(
      req,
      'sections.viewed',
      `User viewed sections for plant ${req.params.plantName}`,
      {
        userId: req.currentUser.id,
        entityType: 'plant',
        entityId: req.params.plantName,
        metadata: {
          plant_name: req.params.plantName,
          section_count: normalizedRows.length,
        },
      }
    );

    return res.json(serializeDatetimes(normalizedRows));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/contractor', requireAuth, async (req, res) => {
  const data = req.body || {};

  try {
    const row = await fetchOne(
      `
        INSERT INTO contractor_data
          (plant_name, section, material, length, width, pit_depth, density)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, plant_name, section, material
      `,
      [
        data.plantName,
        data.section,
        data.material || '',
        Number(data.length),
        Number(data.width),
        Number(data.pitDepth),
        normalizeDensityToKgPerLiter(data.density, kgPerLiterDefault),
      ]
    );

    await writeAuditLog(
      req,
      'site.created',
      `Section ${row.section} created under plant ${row.plant_name}`,
      {
        userId: req.currentUser.id,
        entityType: 'contractor_data',
        entityId: row.id,
        metadata: {
          plant_name: row.plant_name,
          section: row.section,
          material: row.material,
        },
      }
    );

    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/user', requireAuth, async (req, res) => {
  const data = req.body || {};
  if (!data.section_id) {
    return res.status(400).json({ error: 'Missing section_id' });
  }

  try {
    const row = await fetchOne(
      `
        INSERT INTO volume_logs
          (section_id, volume, weight_ton, frontal_area, img_original, img_grayscale, img_blur, img_mask)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, section_id, volume, weight_ton, frontal_area, timestamp
      `,
      [
        Number(data.section_id),
        Number(data.volume || 0),
        Number(data.weight_ton || 0),
        Number(data.frontal_area || 0),
        data.img_original || '',
        data.img_grayscale || '',
        data.img_blur || '',
        data.img_mask || '',
      ]
    );

    await writeAuditLog(req, 'scan.saved', `Scan saved for section ${row.section_id}`, {
      userId: req.currentUser.id,
      entityType: 'volume_log',
      entityId: row.id,
      metadata: {
        section_id: row.section_id,
        volume: row.volume,
        weight_ton: row.weight_ton,
        frontal_area: row.frontal_area,
        timestamp: row.timestamp,
      },
    });

    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/stats/:sectionId', requireAuth, async (req, res) => {
  try {
    const rows = await fetchAll(
      `
        SELECT id, section_id, volume, weight_ton, frontal_area, timestamp
        FROM volume_logs
        WHERE section_id = $1
        ORDER BY timestamp DESC
        LIMIT 20
      `,
      [Number(req.params.sectionId)]
    );

    await writeAuditLog(
      req,
      'scan.history_viewed',
      `User viewed scan history for section ${req.params.sectionId}`,
      {
        userId: req.currentUser.id,
        entityType: 'section',
        entityId: req.params.sectionId,
        metadata: {
          section_id: Number(req.params.sectionId),
          result_count: rows.length,
        },
      }
    );

    return res.json(serializeDatetimes(rows));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/scan/:logId', requireAuth, async (req, res) => {
  try {
    const row = await fetchOne(
      'SELECT * FROM volume_logs WHERE id = $1',
      [Number(req.params.logId)]
    );

    if (!row) {
      return res.status(404).json({ error: 'Scan not found' });
    }

    await writeAuditLog(req, 'scan.detail_viewed', `User viewed scan detail ${req.params.logId}`, {
      userId: req.currentUser.id,
      entityType: 'volume_log',
      entityId: req.params.logId,
      metadata: { section_id: row.section_id },
    });

    return res.json(serializeDatetimes(row));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/materials', requireAuth, async (req, res) => {
  try {
    const rows = await fetchAll(
      `
        SELECT *
        FROM material_library
        ORDER BY created_at DESC, id DESC
      `
    );

    await writeAuditLog(req, 'materials.list_viewed', 'User viewed material library', {
      userId: req.currentUser.id,
      entityType: 'material_library',
      metadata: { material_count: rows.length },
    });

    return res.json(serializeDatetimes(rows));
  } catch (_error) {
    return res.json([
      { name: '10mm Aggregate' },
      { name: '20mm Aggregate' },
      { name: 'Coarse Sand' },
      { name: 'Natural Sand' },
    ]);
  }
});

app.post('/api/materials', requireAuth, async (req, res) => {
  const { name } = req.body || {};

  try {
    const row = await fetchOne(
      'INSERT INTO material_library (name) VALUES ($1) RETURNING id, name',
      [name]
    );

    await writeAuditLog(req, 'materials.created', `Material added: ${row.name}`, {
      userId: req.currentUser.id,
      entityType: 'material_library',
      entityId: row.id,
      metadata: { name: row.name },
    });

    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.delete('/api/log/:logId', requireAuth, async (req, res) => {
  try {
    const existingLog = await fetchOne(
      'SELECT id, section_id, volume, weight_ton FROM volume_logs WHERE id = $1',
      [Number(req.params.logId)]
    );

    await query('DELETE FROM volume_logs WHERE id = $1', [
      Number(req.params.logId),
    ]);

    await writeAuditLog(req, 'scan.deleted', `Scan log deleted: ${req.params.logId}`, {
      userId: req.currentUser.id,
      entityType: 'volume_log',
      entityId: req.params.logId,
      metadata: existingLog || { log_id: Number(req.params.logId) },
    });

    return res.json({ success: true, message: 'Log deleted' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/plant-report/:plantName', requireAuth, async (req, res) => {
  try {
    const sections = await fetchAll(
      `
        SELECT id, section
        FROM contractor_data
        WHERE plant_name = $1
        ORDER BY id DESC
      `,
      [req.params.plantName]
    );

    const sectionIds = sections.map((row) => row.id);
    if (!sectionIds.length) {
      return res.json({
        plant: req.params.plantName,
        sections: [],
        recent_logs: [],
      });
    }

    const logs = await fetchAll(
      `
        SELECT *
        FROM volume_logs
        WHERE section_id = ANY($1::int[])
        ORDER BY timestamp DESC
      `,
      [sectionIds]
    );

    await writeAuditLog(req, 'plant.report_viewed', `User viewed report for plant ${req.params.plantName}`, {
      userId: req.currentUser.id,
      entityType: 'plant',
      entityId: req.params.plantName,
      metadata: {
        plant_name: req.params.plantName,
        section_count: sections.length,
        log_count: logs.length,
      },
    });

    return res.json({
      plant: req.params.plantName,
      sections,
      recent_logs: serializeDatetimes(logs),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/activity', requireAuth, async (req, res) => {
  const {
    event_type: eventType,
    description = 'User activity captured',
    entity_type: entityType = 'ui',
    entity_id: entityId = null,
    metadata = {},
  } = req.body || {};

  if (!eventType) {
    return res.status(400).json({ error: 'Missing event_type' });
  }

  await writeAuditLog(req, eventType, description, {
    userId: req.currentUser.id,
    entityType,
    entityId,
    metadata,
  });

  return res.json({ success: true });
});

app.post('/api/activity/heartbeat', requireAuth, async (req, res) => {
  await writeAuditLog(req, 'user.heartbeat', 'User session heartbeat captured', {
    userId: req.currentUser.id,
    entityType: 'session',
    metadata: {
      view: req.body?.view,
      plant_name: req.body?.plant_name,
      section_id: req.body?.section_id,
      section_name: req.body?.section_name,
    },
  });

  return res.json({ success: true });
});

ensureAuditStorage()
  .then(() => {
    app.listen(port, () => {
      console.log(`Node API listening on http://0.0.0.0:${port}`);
    });
  })
  .catch((error) => {
    console.error('Failed to initialize Node API audit storage:', error.message);
    process.exit(1);
  });
