require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const app = express();
const PORT = process.env.PORT || 3000;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

function publicIdFromUrl(url) {
  const parts = url.split('/');
  const uploadIndex = parts.findIndex(p => p === 'upload');
  return parts.slice(uploadIndex + 2).join('/').replace(/\.[^.]+$/, '');
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'products',
    format: async () => 'webp',
    public_id: () => uuidv4(),
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    const mime = allowed.test(file.mimetype);
    cb(null, mime);
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
    const image_url = req.file ? req.file.path : null;
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
      if (image_url) cloudinary.uploader.destroy(publicIdFromUrl(image_url));
      image_url = req.file.path;
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
      cloudinary.uploader.destroy(publicIdFromUrl(product.rows[0].image_url));
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

const JWT_SECRET = process.env.JWT_SECRET || uuidv4();
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

function adminAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token });
});

app.get('/api/admin/verify', adminAuth, (req, res) => {
  res.json({ authenticated: true });
});

app.post('/api/admin/logout', (req, res) => {
  res.json({ message: 'Logged out' });
});

app.post('/api/categories', adminAuth, async (req, res) => {
  try {
    const { name } = req.body;
    const result = await pool.query(
      'INSERT INTO categories (name) VALUES ($1) RETURNING *',
      [name]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create category' });
  }
});

app.delete('/api/categories/:id', adminAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM categories WHERE id = $1', [req.params.id]);
    res.json({ message: 'Category deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Retro Boutique running at http://localhost:${PORT}`);
  });
}

module.exports = app;
