const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: '/var/run/postgresql',
  database: 'iron_forge_gymwear',
});

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`INSERT INTO categories (id, name, description) VALUES
      ('a0000001-0000-0000-0000-000000000001', 'Tank Tops', 'Cut to show off the gains'),
      ('a0000001-0000-0000-0000-000000000002', 'Stringers', 'Deep cut for maximum ventilation'),
      ('a0000001-0000-0000-0000-000000000003', 'Gym Shorts', 'Squat-proof performance shorts'),
      ('a0000001-0000-0000-0000-000000000004', 'Joggers', 'Street-ready training pants'),
      ('a0000001-0000-0000-0000-000000000005', 'Accessories', 'Gloves, belts, and more')
    ON CONFLICT (name) DO NOTHING`);

    await client.query(`INSERT INTO products (name, description, price, category_id, image_url, stock_quantity) VALUES
      ('Classic Muscle Tank', 'Heavyweight cotton tank built for the grind. Ribbed fabric stays put through heavy sets.', 34.99, 'a0000001-0000-0000-0000-000000000001', '/uploads/products/muscle-tank.jpg', 50),
      ('Sesh Sleeveless Hoodie', 'Tank top meets hoodie. Dropped shoulders for unrestricted pressing.', 54.99, 'a0000001-0000-0000-0000-000000000001', '/uploads/products/sleeveless-hoodie.jpg', 30),
      ('Warrior Stringer', 'Wide armholes and deep drop cut. 4-way stretch for pressing and pull-ups.', 39.99, 'a0000001-0000-0000-0000-000000000002', '/uploads/products/warrior-stringer.jpg', 40),
      ('Squad Stringer', 'Matching stringers for the whole crew. Comfortable racerback cut.', 36.99, 'a0000001-0000-0000-0000-000000000002', '/uploads/products/squad-stringer.jpg', 35),
      ('Squat Proof Shorts', 'Double-layer 7-inch shorts. Phone pocket with zip.', 44.99, 'a0000001-0000-0000-0000-000000000003', '/uploads/products/squat-shorts.jpg', 60),
      ('Lifting Joggers', 'Tapered fit joggers with elastic cuffs. Zippered pockets and reinforced seams.', 59.99, 'a0000001-0000-0000-0000-000000000004', '/uploads/products/lifting-joggers.jpg', 25),
      ('Leather Lifting Belt', '10mm suede leather belt. Double-prong buckle. IPF approved.', 89.99, 'a0000001-0000-0000-0000-000000000005', '/uploads/products/lifting-belt.jpg', 20),
      ('Chalk Block (1lb)', 'Premium magnesium carbonate chalk block. Pure, no fillers.', 12.99, 'a0000001-0000-0000-0000-000000000005', '/uploads/products/chalk-block.jpg', 100)
    ON CONFLICT DO NOTHING`);

    await client.query('COMMIT');
    console.log('Seed data inserted successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
