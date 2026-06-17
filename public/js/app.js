const state = {
  products: [],
  cart: JSON.parse(localStorage.getItem('cart') || '[]'),
  activeCategory: 'all',
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

async function fetchAPI(url, opts = {}) {
  const res = await fetch(url, {
    headers: { 'Accept': 'application/json' },
    ...opts,
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

function saveCart() {
  localStorage.setItem('cart', JSON.stringify(state.cart));
  renderCart();
}

function formatPrice(n) {
  return 'Rs. ' + parseFloat(n).toFixed(2);
}

function fallbackImageUrl(name) {
  return null;
}

async function loadProducts(category) {
  const url = category && category !== 'all'
    ? `/api/products?category=${encodeURIComponent(category)}`
    : '/api/products';
  state.products = await fetchAPI(url);
  renderProducts();
}

function renderProducts() {
  const grid = $('#productGrid');
  if (state.products.length === 0) {
    grid.innerHTML = '<p style="text-align:center;padding:3rem;color:#666;">No products found.</p>';
    return;
  }
  grid.innerHTML = state.products.map(p => {
    const imgHtml = p.image_url
      ? `<img class="product-image" src="${p.image_url}" alt="${p.name}" loading="lazy">`
      : `<div class="product-image-placeholder">${p.name.charAt(0)}</div>`;
    return `
      <div class="product-card" data-id="${p.id}">
        ${imgHtml}
        <div class="product-info">
          <span class="product-category">${p.category_name || ''}</span>
          <h3 class="product-name">${p.name}</h3>
          <p class="product-description">${p.description || ''}</p>
          <div class="product-footer">
            <span class="product-price">${formatPrice(p.price)}</span>
            <button class="add-to-cart" data-id="${p.id}">Add to Cart</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

async function loadCategories() {
  const cats = await fetchAPI('/api/categories');
  const container = $('#categoryFilters');
  container.innerHTML = '<button class="filter-btn active" data-cat="all">All</button>' +
    cats.map(c => `<button class="filter-btn" data-cat="${c.name}">${c.name}</button>`).join('');
}

function renderCart() {
  const container = $('#cartItems');
  const count = $('#cartCount');
  const totalEl = $('#cartTotal');
  count.textContent = state.cart.reduce((s, i) => s + i.quantity, 0);

  if (state.cart.length === 0) {
    container.innerHTML = '<p class="cart-empty">Your cart is empty.</p>';
    totalEl.textContent = '$0.00';
    return;
  }

  container.innerHTML = state.cart.map((item, idx) => `
    <div class="cart-item">
      ${item.image_url
        ? `<img class="cart-item-image" src="${item.image_url}" alt="${item.name}">`
        : '<div class="cart-item-image" style="display:flex;align-items:center;justify-content:center;color:var(--dark-accent);font-weight:700;">' + item.name.charAt(0) + '</div>'
      }
      <div class="cart-item-info">
        <div class="cart-item-name">${item.name}</div>
        <div class="cart-item-price">${formatPrice(item.price)}</div>
        <div class="cart-item-qty">
          <button class="qty-btn" data-index="${idx}" data-delta="-1">−</button>
          <span>${item.quantity}</span>
          <button class="qty-btn" data-index="${idx}" data-delta="1">+</button>
          <button class="cart-item-remove" data-index="${idx}">Remove</button>
        </div>
      </div>
    </div>
  `).join('');

  const total = state.cart.reduce((s, i) => s + i.price * i.quantity, 0);
  totalEl.textContent = formatPrice(total);
}

function addToCart(productId) {
  const p = state.products.find(x => x.id === productId);
  if (!p) return;
  const existing = state.cart.find(i => i.id === productId);
  if (existing) {
    existing.quantity += 1;
  } else {
    state.cart.push({
      id: p.id,
      name: p.name,
      price: parseFloat(p.price),
      image_url: p.image_url,
      quantity: 1,
    });
  }
  saveCart();
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest('.add-to-cart');
  if (btn) addToCart(btn.dataset.id);

  if (e.target.closest('.cart-close') || e.target.closest('#cartOverlay')) {
    $('#cartDrawer').classList.remove('open');
    $('#cartOverlay').classList.remove('active');
  }

  if (e.target.closest('#cartBtn')) {
    $('#cartDrawer').classList.add('open');
    $('#cartOverlay').classList.add('active');
  }

  if (e.target.closest('#checkoutCancel') || e.target.closest('#checkoutOverlay')) {
    $('#checkoutOverlay').classList.remove('active');
  }

  const qtyBtn = e.target.closest('.qty-btn');
  if (qtyBtn) {
    const idx = parseInt(qtyBtn.dataset.index);
    const delta = parseInt(qtyBtn.dataset.delta);
    state.cart[idx].quantity += delta;
    if (state.cart[idx].quantity <= 0) state.cart.splice(idx, 1);
    saveCart();
  }

  const removeBtn = e.target.closest('.cart-item-remove');
  if (removeBtn) {
    state.cart.splice(parseInt(removeBtn.dataset.index), 1);
    saveCart();
  }

  const filterBtn = e.target.closest('.filter-btn');
  if (filterBtn) {
    $$('.filter-btn').forEach(b => b.classList.remove('active'));
    filterBtn.classList.add('active');
    state.activeCategory = filterBtn.dataset.cat;
    loadProducts(state.activeCategory);
  }

  const navLink = e.target.closest('.nav-links a');
  if (navLink) {
    $$('.nav-links a').forEach(a => a.classList.remove('active'));
    navLink.classList.add('active');
    const cat = navLink.dataset.category;
    state.activeCategory = cat;
    loadProducts(cat);
  }
});

$('#checkoutBtn').addEventListener('click', () => {
  if (state.cart.length === 0) return;
  $('#checkoutOverlay').classList.add('active');
});

$('#checkoutForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = 'Placing Order...';
  try {
    await fetchAPI('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_name: $('#checkoutName').value,
        customer_email: $('#checkoutEmail').value,
        shipping_address: $('#checkoutAddress').value,
        items: state.cart.map(i => ({ product_id: i.id, quantity: i.quantity })),
      }),
    });
    state.cart = [];
    saveCart();
    $('#checkoutOverlay').classList.remove('active');
    $('#checkoutForm').reset();
    alert('Order placed successfully!');
  } catch (err) {
    alert('Failed to place order: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Place Order';
  }
});

async function init() {
  await loadCategories();
  await loadProducts('all');
  renderCart();
}

init();
