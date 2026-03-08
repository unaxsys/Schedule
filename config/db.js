const { Pool } = require('pg');

function createDbPool() {
  if (process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0) {
    return new Pool({ connectionString: process.env.DATABASE_URL });
  }

  return new Pool({
    host: process.env.PGHOST || '127.0.0.1',
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE || 'schedule_db',
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || '',
  });
}

module.exports = { createDbPool };
