const express = require('express');
const cors = require('cors');
const { fetchAll, fetchOne, query } = require('./db');
const { port, kgPerLiterDefault } = require('./config');
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
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    return res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
      },
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/plants', async (_req, res) => {
  try {
    const rows = await fetchAll(
      `
        SELECT DISTINCT plant_name
        FROM contractor_data
        ORDER BY plant_name
      `
    );

    return res.json(rows.map((row) => row.plant_name).filter(Boolean));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/sections/:plantName', async (req, res) => {
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

    return res.json(serializeDatetimes(normalizedRows));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/contractor', async (req, res) => {
  const data = req.body || {};

  try {
    await query(
      `
        INSERT INTO contractor_data
          (plant_name, section, material, length, width, pit_depth, density)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
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

    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/user', async (req, res) => {
  const data = req.body || {};
  if (!data.section_id) {
    return res.status(400).json({ error: 'Missing section_id' });
  }

  try {
    await query(
      `
        INSERT INTO volume_logs
          (section_id, volume, weight_ton, frontal_area, img_original, img_grayscale, img_blur, img_mask)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
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

    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/stats/:sectionId', async (req, res) => {
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

    return res.json(serializeDatetimes(rows));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/scan/:logId', async (req, res) => {
  try {
    const row = await fetchOne(
      'SELECT * FROM volume_logs WHERE id = $1',
      [Number(req.params.logId)]
    );

    if (!row) {
      return res.status(404).json({ error: 'Scan not found' });
    }

    return res.json(serializeDatetimes(row));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/materials', async (_req, res) => {
  try {
    const rows = await fetchAll(
      `
        SELECT *
        FROM material_library
        ORDER BY created_at DESC, id DESC
      `
    );

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

app.post('/api/materials', async (req, res) => {
  const { name } = req.body || {};

  try {
    await query('INSERT INTO material_library (name) VALUES ($1)', [name]);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.delete('/api/log/:logId', async (req, res) => {
  try {
    await query('DELETE FROM volume_logs WHERE id = $1', [
      Number(req.params.logId),
    ]);

    return res.json({ success: true, message: 'Log deleted' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/plant-report/:plantName', async (req, res) => {
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

    return res.json({
      plant: req.params.plantName,
      sections,
      recent_logs: serializeDatetimes(logs),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Node API listening on http://0.0.0.0:${port}`);
});
