const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.on('connect', function() { console.log('Connecte a PostgreSQL'); });
pool.on('error', function(err) { console.error('Erreur PostgreSQL:', err.message); });
async function query(text, params) { return pool.query(text, params); }
async function queryOne(text, params) { var res = await pool.query(text, params); return res.rows[0] || null; }
async function queryAll(text, params) { var res = await pool.query(text, params); return res.rows; }
module.exports = { pool: pool, query: query, queryOne: queryOne, queryAll: queryAll };
