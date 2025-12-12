const grid = document.getElementById('product-grid');
const form = document.querySelector('.product-form');
const statusEl = document.querySelector('.status');
const category = grid?.dataset.category;

async function loadCategory() {
  if (!category) return;
  try {
    const res = await fetch(`/api/products?category=${category}`);
    if (!res.ok) throw new Error('Unable to load products');
    const products = await res.json();
    render(products);
  } catch (error) {
    if (grid) grid.innerHTML = `<p class="error">${error.message}</p>`;
  }
}

function render(products) {
  if (!grid) return;
  if (!products.length) {
    grid.innerHTML = '<p>No products in this category yet.</p>';
    return;
  }
  grid.innerHTML = products
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

if (form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const inputs = form.querySelectorAll('input, textarea');
    const payload = {
      name: document.getElementById(`${category}-name`).value,
      category,
      price: document.getElementById(`${category}-price`).value,
      imageUrl: document.getElementById(`${category}-image`).value,
      description: document.getElementById(`${category}-description`).value,
    };
    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Unable to add product.');
      }
      inputs.forEach((input) => {
        if (input.tagName === 'TEXTAREA') input.value = '';
        else input.value = '';
      });
      statusEl.textContent = 'Saved to MongoDB.';
      statusEl.className = 'status alert';
      loadCategory();
    } catch (error) {
      statusEl.textContent = error.message;
      statusEl.className = 'status error';
    }
  });
}

loadCategory();
