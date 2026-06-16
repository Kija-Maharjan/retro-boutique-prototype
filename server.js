require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

const pool = new Pool({
  host: '/var/run/postgresql',
  database: 'iron_forge_gymwear',
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = 'uploads/products';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    cb(null, ext && mime);
  },
});

app.get('/api/products', async (req, res) => {
  try {
    const { category } = req.query;
    let query = `
      SELECT p.*, c.name AS category_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
    `;
    const params = [];
    if (category) {
      query += ' WHERE c.name = $1';
      params.push(category);
    }
    query += ' ORDER BY p.created_at DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, c.name AS category_name
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Product not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

app.post('/api/products', upload.single('image'), async (req, res) => {
  try {
    const { name, description, price, category_id, stock_quantity } = req.body;
    const image_url = req.file ? `/uploads/products/${req.file.filename}` : null;
    const result = await pool.query(
      `INSERT INTO products (name, description, price, category_id, image_url, stock_quantity)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [name, description, price, category_id, image_url, stock_quantity || 0]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create product' });
  }
});

app.put('/api/products/:id', upload.single('image'), async (req, res) => {
  try {
    const { name, description, price, category_id, stock_quantity } = req.body;
    const product = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
    if (product.rows.length === 0) return res.status(404).json({ error: 'Product not found' });

    let image_url = product.rows[0].image_url;
    if (req.file) {
      if (image_url) {
        const oldPath = path.join(__dirname, image_url);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      image_url = `/uploads/products/${req.file.filename}`;
    }

    const result = await pool.query(
      `UPDATE products SET name=$1, description=$2, price=$3, category_id=$4, image_url=$5, stock_quantity=$6, updated_at=NOW()
       WHERE id=$7 RETURNING *`,
      [name, description, price, category_id, image_url, stock_quantity || 0, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update product' });
  }
});

app.delete('/api/products/:id', async (req, res) => {
  try {
    const product = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
    if (product.rows.length === 0) return res.status(404).json({ error: 'Product not found' });
    if (product.rows[0].image_url) {
      const filePath = path.join(__dirname, product.rows[0].image_url);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    await pool.query('DELETE FROM products WHERE id = $1', [req.params.id]);
    res.json({ message: 'Product deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

app.get('/api/categories', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM categories ORDER BY name');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

app.post('/api/orders', async (req, res) => {
  const client = await pool.connect();
  try {
    const { customer_name, customer_email, shipping_address, items } = req.body;
    await client.query('BEGIN');

    let total = 0;
    for (const item of items) {
      const prod = await client.query('SELECT price, name FROM products WHERE id = $1', [item.product_id]);
      if (prod.rows.length === 0) throw new Error(`Product ${item.product_id} not found`);
      total += parseFloat(prod.rows[0].price) * item.quantity;
    }

    const order = await client.query(
      `INSERT INTO orders (customer_name, customer_email, shipping_address, total, status)
       VALUES ($1, $2, $3, $4, 'pending') RETURNING *`,
      [customer_name, customer_email, shipping_address, total]
    );

    for (const item of items) {
      const prod = await client.query('SELECT price, name FROM products WHERE id = $1', [item.product_id]);
      await client.query(
        `INSERT INTO order_items (order_id, product_id, product_name, quantity, price)
         VALUES ($1, $2, $3, $4, $5)`,
        [order.rows[0].id, item.product_id, prod.rows[0].name, item.quantity, prod.rows[0].price]
      );
    }

    await client.query('COMMIT');
    res.status(201).json(order.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to create order' });
  } finally {
    client.release();
  }
});

app.get('/api/orders', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM orders ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

app.listen(PORT, () => {
  console.log(`Iron Forge Gymwear running at http://localhost:${PORT}`);
});
