// ponytail: 直连 New API PostgreSQL，绕过 HTTP API 的只读 balance 限制
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.NEW_API_PG_HOST || 'localhost',
  port: Number(process.env.NEW_API_PG_PORT) || 5432,
  user: process.env.NEW_API_PG_USER || 'root',
  password: process.env.NEW_API_PG_PASSWORD || '',
  database: process.env.NEW_API_PG_DATABASE || 'new-api',
  connectionTimeoutMillis: 10000,
});

async function updateChannelBalance(channelId, balance) {
  const now = Math.floor(Date.now() / 1000);
  await pool.query(
    'UPDATE channels SET balance = $1, balance_updated_time = $2 WHERE id = $3',
    [balance, now, channelId]
  );
}

module.exports = { updateChannelBalance };
