const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

require('dotenv').config();

const pool = new Pool({
  host: '/var/run/postgresql',
  database: 'iron_forge_gymwear',
});

async function migrate() {
  const client = await pool.connect();
  try {
    const sqlDir = path.join(__dirname, '..', 'sql');
    const files = fs.readdirSync(sqlDir).sort();

    for (const file of files) {
      if (file.endsWith('.sql')) {
        console.log(`Running migration: ${file}`);
        const sql = fs.readFileSync(path.join(sqlDir, file), 'utf-8');
        await client.query(sql);
        console.log(`  ✓ ${file} applied`);
      }
    }
    console.log('All migrations complete.');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
