/* ─── Auth ─── */
const TOKEN_KEY = 'rb_admin_token';

function getToken() { return localStorage.getItem(TOKEN_KEY); }

function setToken(t) { localStorage.setItem(TOKEN_KEY, t); }

function clearToken() { localStorage.removeItem(TOKEN_KEY); }

function authHeaders() {
  const t = getToken();
  return t ? { 'Authorization': `Bearer ${t}`, 'Accept': 'application/json' } : { 'Accept': 'application/json' };
}

async function api(url, opts = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    ...opts,
  });
  if (res.status === 401) {
    clearToken();
    window.location.href = '/admin/login.html';
    throw new Error('Unauthorized');
  }
  return res.json();
}

/* ─── Login Page ─── */
function initLoginPage() {
  const form = document.getElementById('loginForm');
  const toggle = document.getElementById('passwordToggle');
  const pwInput = document.getElementById('loginPassword');
  const errorEl = document.getElementById('loginError');

  if (toggle) {
    toggle.addEventListener('click', () => {
      const isPassword = pwInput.type === 'password';
      pwInput.type = isPassword ? 'text' : 'password';
      toggle.innerHTML = isPassword
        ? '<svg class="eye-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'
        : '<svg class="eye-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
    });
  }

  if (getToken()) {
    fetch('/api/admin/verify', { headers: authHeaders() })
      .then(r => { if (r.ok) window.location.href = '/admin/dashboard.html'; })
      .catch(() => clearToken());
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('loginBtn');
    btn.disabled = true;
    btn.textContent = 'Signing in...';
    errorEl.classList.add('hidden');

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: document.getElementById('loginUsername').value,
          password: document.getElementById('loginPassword').value,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setToken(data.token);
        window.location.href = '/admin/dashboard.html';
      } else {
        errorEl.textContent = data.error || 'Invalid credentials';
        errorEl.classList.remove('hidden');
      }
    } catch {
      errorEl.textContent = 'Something went wrong';
      errorEl.classList.remove('hidden');
    }

    btn.disabled = false;
    btn.textContent = 'Sign In';
  });
}

/* ─── Dashboard ─── */
let currentPage = 'dashboard';

function showPage(page) {
  currentPage = page;
  document.querySelectorAll('.admin-nav-item').forEach(el => el.classList.remove('active'));
  document.querySelector(`[data-page="${page}"]`)?.classList.add('active');
  document.getElementById('pageTitle').textContent = page.charAt(0).toUpperCase() + page.slice(1);

  const content = document.getElementById('pageContent');

  if (page === 'dashboard') renderDashboard(content);
  else if (page === 'products') renderProducts(content);
  else if (page === 'orders') renderOrders(content);
  else if (page === 'categories') renderCategories(content);
}

/* ─── Dashboard Page ─── */
async function renderDashboard(container) {
  container.innerHTML = '<p style="color:var(--admin-text-dim)">Loading...</p>';
  try {
    const [products, orders] = await Promise.all([
      api('/api/products'),
      api('/api/orders'),
    ]);

    const totalRevenue = orders.reduce((s, o) => s + parseFloat(o.total || 0), 0);
    const totalStock = products.reduce((s, p) => s + parseInt(p.stock_quantity || 0), 0);

    container.innerHTML = `
      <div class="stat-grid">
        <div class="stat-card"><div class="stat-value">${products.length}</div><div class="stat-label">Products</div></div>
        <div class="stat-card"><div class="stat-value">${orders.length}</div><div class="stat-label">Orders</div></div>
        <div class="stat-card"><div class="stat-value">Rs. ${totalRevenue.toFixed(2)}</div><div class="stat-label">Revenue</div></div>
        <div class="stat-card"><div class="stat-value">${totalStock}</div><div class="stat-label">Items in Stock</div></div>
      </div>
      <div class="admin-actions">
        <a href="#" onclick="showPage('products'); return false;">Manage Products</a>
        <a href="#" onclick="showPage('orders'); return false;">View Orders</a>
        <a href="#" onclick="showPage('categories'); return false;">Categories</a>
      </div>
      ${orders.length > 0 ? `
      <div class="admin-card">
        <h3>Recent Orders</h3>
        ${orders.slice(0, 5).map(o => `
          <div class="order-card">
            <div class="order-card-header">
              <div><div class="order-customer">${esc(o.customer_name)}</div><div class="order-email">${esc(o.customer_email)}</div></div>
              <div class="order-total">Rs. ${parseFloat(o.total).toFixed(2)}</div>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center">
              <span class="order-status">${esc(o.status)}</span>
              <span class="order-date">${new Date(o.created_at).toLocaleDateString()}</span>
            </div>
          </div>
        `).join('')}
      </div>` : ''}
    `;
  } catch (err) {
    container.innerHTML = `<p style="color:var(--admin-danger)">Failed to load: ${err.message}</p>`;
  }
}

/* ─── Products Page ─── */
async function renderProducts(container) {
  container.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
      <h3 style="color:var(--admin-text);font-size:1rem;font-weight:700">All Products</h3>
      <button class="btn-add" onclick="openProductModal()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Add Product
      </button>
    </div>
    <div class="admin-card"><div class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr>
          <th>Image</th><th>Name</th><th>Price</th><th>Stock</th><th>Category</th><th style="text-align:right">Actions</th>
        </tr></thead>
        <tbody id="productsTableBody">
          <tr class="empty-row"><td colspan="6">Loading...</td></tr>
        </tbody>
      </table>
    </div></div>
  `;

  try {
    const products = await api('/api/products');
    const tbody = document.getElementById('productsTableBody');

    if (products.length === 0) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="6">No products yet. Add your first product!</td></tr>';
      return;
    }

    tbody.innerHTML = products.map(p => `
      <tr>
        <td>${p.image_url ? `<img src="${p.image_url}" alt="" style="width:40px;height:40px;object-fit:cover;border-radius:4px">` : '<span style="color:var(--admin-text-dim);font-size:0.7rem">—</span>'}</td>
        <td><strong>${esc(p.name)}</strong></td>
        <td>Rs. ${parseFloat(p.price).toFixed(2)}</td>
        <td>${p.stock_quantity || 0}</td>
        <td><span class="category-tag">${esc(p.category_name || 'Uncategorized')}</span></td>
        <td style="text-align:right">
          <button class="btn-sm btn-edit" onclick="editProduct('${p.id}')">Edit</button>
          <button class="btn-sm btn-delete" onclick="deleteProduct('${p.id}')">Delete</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    document.getElementById('productsTableBody').innerHTML =
      `<tr class="empty-row"><td colspan="6">Failed to load: ${err.message}</td></tr>`;
  }
}

/* ─── Orders Page ─── */
async function renderOrders(container) {
  container.innerHTML = '<h3 style="color:var(--admin-text);font-size:1rem;font-weight:700;margin-bottom:1rem">All Orders</h3><div id="ordersContainer"><p style="color:var(--admin-text-dim)">Loading...</p></div>';

  try {
    const orders = await api('/api/orders');
    const oc = document.getElementById('ordersContainer');

    if (orders.length === 0) {
      oc.innerHTML = '<p style="color:var(--admin-text-dim)">No orders yet.</p>';
      return;
    }

    oc.innerHTML = orders.map(o => `
      <div class="order-card">
        <div class="order-card-header">
          <div>
            <div class="order-customer">${esc(o.customer_name)}</div>
            <div class="order-email">${esc(o.customer_email)}</div>
            <div style="font-size:0.8rem;color:var(--admin-text-dim);margin-top:0.25rem">${esc(o.shipping_address)}</div>
          </div>
          <div style="text-align:right">
            <div class="order-total">Rs. ${parseFloat(o.total).toFixed(2)}</div>
            <span class="order-status">${esc(o.status)}</span>
          </div>
        </div>
        <div class="order-date">${new Date(o.created_at).toLocaleString()}</div>
      </div>
    `).join('');
  } catch (err) {
    document.getElementById('ordersContainer').innerHTML =
      `<p style="color:var(--admin-danger)">Failed to load: ${err.message}</p>`;
  }
}

/* ─── Categories Page ─── */
async function renderCategories(container) {
  container.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
      <h3 style="color:var(--admin-text);font-size:1rem;font-weight:700">Categories</h3>
      <button class="btn-add" onclick="openCategoryModal()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Add Category
      </button>
    </div>
    <div class="admin-card" id="categoriesContainer">
      <p style="color:var(--admin-text-dim)">Loading...</p>
    </div>
  `;

  try {
    const cats = await api('/api/categories');
    const cc = document.getElementById('categoriesContainer');

    if (cats.length === 0) {
      cc.innerHTML = '<p style="color:var(--admin-text-dim)">No categories yet.</p>';
      return;
    }

    cc.innerHTML = `<div class="admin-table-wrap"><table class="admin-table">
      <thead><tr><th>Name</th><th style="text-align:right">Actions</th></tr></thead>
      <tbody>${cats.map(c => `
        <tr>
          <td><span class="category-tag">${esc(c.name)}</span></td>
          <td style="text-align:right"><button class="btn-sm btn-delete" onclick="deleteCategory('${c.id}')">Delete</button></td>
        </tr>
      `).join('')}</tbody>
    </table></div>`;
  } catch (err) {
    document.getElementById('categoriesContainer').innerHTML =
      `<p style="color:var(--admin-danger)">Failed to load: ${err.message}</p>`;
  }
}

/* ─── Product CRUD ─── */
let editingProductId = null;

function openProductModal(product) {
  editingProductId = product?.id || null;
  document.getElementById('modalTitle').textContent = product ? 'Edit Product' : 'Add Product';
  document.getElementById('saveProductBtn').textContent = product ? 'Update' : 'Save';
  document.getElementById('productId').value = product?.id || '';
  document.getElementById('formName').value = product?.name || '';
  document.getElementById('formDesc').value = product?.description || '';
  document.getElementById('formPrice').value = product?.price || '';
  document.getElementById('formStock').value = product?.stock_quantity || 0;

  if (product?.image_url) {
    document.getElementById('imagePreview').innerHTML = `<img src="${product.image_url}" alt="">`;
  } else {
    document.getElementById('imagePreview').innerHTML = '';
  }

  loadCategorySelect(product?.category_id);
  openModal('productModal');
}

async function editProduct(id) {
  try {
    const p = await api(`/api/products/${id}`);
    openProductModal(p);
  } catch (err) {
    alert('Failed to load product: ' + err.message);
  }
}

async function deleteProduct(id) {
  if (!confirm('Delete this product?')) return;
  try {
    await fetch(`/api/products/${id}`, { method: 'DELETE', headers: authHeaders() });
    showPage('products');
  } catch (err) {
    alert('Failed to delete: ' + err.message);
  }
}

async function loadCategorySelect(selectedId) {
  try {
    const cats = await api('/api/categories');
    const sel = document.getElementById('formCategory');
    sel.innerHTML = cats.map(c =>
      `<option value="${c.id}" ${c.id == selectedId ? 'selected' : ''}>${esc(c.name)}</option>`
    ).join('');
  } catch {
    // ignore
  }
}

/* ─── Category CRUD ─── */
function openCategoryModal() { openModal('categoryModal'); }

async function deleteCategory(id) {
  if (!confirm('Delete this category? This may affect products using it.')) return;
  try {
    const token = getToken();
    await fetch(`/api/categories/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    showPage('categories');
  } catch (err) {
    alert('Failed to delete: ' + err.message);
  }
}

/* ─── Modal Helpers ─── */
function openModal(id) { document.getElementById(id).classList.add('active'); }

function closeModal(id) { document.getElementById(id).classList.remove('active'); }

/* ─── Utils ─── */
function esc(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

/* ─── Init Dashboard ─── */
document.addEventListener('DOMContentLoaded', () => {
  if (!getToken()) {
    window.location.href = '/admin/login.html';
    return;
  }

  // Verify token
  fetch('/api/admin/verify', { headers: authHeaders() })
    .then(r => { if (!r.ok) throw new Error(); })
    .catch(() => { clearToken(); window.location.href = '/admin/login.html'; });

  // Sidebar toggle mobile
  const toggle = document.getElementById('sidebarToggle');
  const sidebar = document.getElementById('adminSidebar');
  const overlay = document.getElementById('mobileOverlay');

  if (toggle && sidebar) {
    toggle.addEventListener('click', () => {
      sidebar.classList.toggle('open');
      overlay.classList.toggle('active');
    });
    overlay.addEventListener('click', () => {
      sidebar.classList.remove('open');
      overlay.classList.remove('active');
    });
  }

  // Logout
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    clearToken();
    window.location.href = '/admin/login.html';
  });

  // Init dashboard
  showPage('dashboard');

  // Product form submit
  document.getElementById('productForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('saveProductBtn');
    btn.disabled = true;
    btn.textContent = 'Saving...';

    try {
      const id = document.getElementById('productId').value;
      const fd = new FormData();
      fd.append('name', document.getElementById('formName').value);
      fd.append('description', document.getElementById('formDesc').value);
      fd.append('price', document.getElementById('formPrice').value);
      fd.append('category_id', document.getElementById('formCategory').value);
      fd.append('stock_quantity', document.getElementById('formStock').value);
      const fileInput = document.getElementById('formImage');
      if (fileInput.files[0]) fd.append('image', fileInput.files[0]);

      const url = id ? `/api/products/${id}` : '/api/products';
      const method = id ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        body: fd,
        headers: { 'Authorization': `Bearer ${getToken()}` },
      });

      if (!res.ok) throw new Error(await res.text());

      document.getElementById('productForm').reset();
      document.getElementById('productId').value = '';
      document.getElementById('imagePreview').innerHTML = '';
      closeModal('productModal');
      showPage('products');
    } catch (err) {
      alert('Failed to save: ' + err.message);
    }

    btn.disabled = false;
    btn.textContent = document.getElementById('productId').value ? 'Update' : 'Save';
  });

  // Category form submit
  document.getElementById('categoryForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const token = getToken();
      await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ name: document.getElementById('categoryName').value }),
      });
      document.getElementById('categoryForm').reset();
      closeModal('categoryModal');
      showPage('categories');
    } catch (err) {
      alert('Failed to save: ' + err.message);
    }
  });
});
