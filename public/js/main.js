const productGrid = document.getElementById('product-grid');
const productForm = document.getElementById('product-form');
const formStatus = document.getElementById('form-status');
const authForm = document.getElementById('auth-form');
const loginBtn = document.getElementById('login-btn');
const authStatus = document.getElementById('auth-status');

async function fetchProducts() {
  const res = await fetch('/api/products');
  const products = await res.json();
  renderProducts(products);
}

function renderProducts(products) {
  if (!productGrid) return;
  if (!products.length) {
    productGrid.innerHTML = '<p>No products yet. Add your first item above.</p>';
    return;
  }
  productGrid.innerHTML = products
    .map(
      (p) => `
        <article class="card">
          <img src="${p.imageUrl || 'https://placehold.co/400x250?text=Megumi'}" alt="${p.name}" />
          <span class="tag">${p.category}</span>
          <h3>${p.name}</h3>
          ${p.price ? `<p class="price">$${p.price.toFixed(2)}</p>` : ''}
          <p>${p.description || ''}</p>
        </article>
      `
    )
    .join('');
}

if (productForm) {
  productForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      name: document.getElementById('name').value,
      category: document.getElementById('category').value,
      price: document.getElementById('price').value,
      imageUrl: document.getElementById('imageUrl').value,
      description: document.getElementById('description').value,
    };
    const res = await fetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      formStatus.textContent = 'Unable to add product.';
      formStatus.className = 'error';
      return;
    }
    productForm.reset();
    formStatus.textContent = 'Product added.';
    formStatus.className = 'alert';
    fetchProducts();
  });
}

if (authForm) {
  authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      email: document.getElementById('email').value,
      password: document.getElementById('password').value,
    };
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    authStatus.textContent = data.message || 'Unable to register.';
    authStatus.className = res.ok ? 'alert' : 'error';
  });

  loginBtn.addEventListener('click', async () => {
    const payload = {
      email: document.getElementById('email').value,
      password: document.getElementById('password').value,
    };
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    authStatus.textContent = data.message || 'Unable to login.';
    authStatus.className = res.ok ? 'alert' : 'error';
  });
}

fetchProducts();
