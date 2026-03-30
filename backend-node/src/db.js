const { Pool } = require('pg');
const { dbConfig } = require('./config');

const pool = new Pool(dbConfig);

async function query(text, params) {
  return pool.query(text, params);
}

async function fetchAll(text, params) {
  const result = await query(text, params);
  return result.rows;
}

async function fetchOne(text, params) {
  const result = await query(text, params);
  return result.rows[0] || null;
}

module.exports = {
  pool,
  query,
  fetchAll,
  fetchOne,
};
