const fs = require('fs');
const path = require('path');
const http = require('http');
const { URL } = require('url');
const crypto = require('crypto');

// Minimal .env loader so we avoid external dependencies while still honoring env files.
(function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  lines.forEach((line) => {
    if (!line || line.trim().startsWith('#')) return;
    const [key, ...rest] = line.split('=');
    const value = rest.join('=');
    if (key && value !== undefined && !process.env[key]) {
      process.env[key] = value;
    }
  });
})();

let MongoClient;
let ObjectId;
let mongoDriverAvailable = false;
try {
  ({ MongoClient, ObjectId } = require('mongodb'));
  mongoDriverAvailable = true;
} catch (error) {
  console.warn('mongodb package not installed; using in-memory store unless driver is added.');
}

const port = Number(process.env.PORT) || 3000;
const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/megumi';
const publicDir = path.join(__dirname, 'public');

const SALT_LENGTH = 16;
const ITERATIONS = 120000;
const KEY_LENGTH = 64;
const DIGEST = 'sha512';

let client;
let db;
let useMemoryStore = false;
const memoryStore = { users: [], products: [] };

async function connectDb() {
  if (useMemoryStore || !mongoDriverAvailable) return null;
  if (db) return db;
  try {
    client = new MongoClient(mongoUri);
    await client.connect();
    db = client.db();
    await Promise.all([
      db.collection('users').createIndex({ email: 1 }, { unique: true }),
      db.collection('products').createIndex({ category: 1 }),
    ]);
    return db;
  } catch (error) {
    console.warn('MongoDB unavailable, switching to in-memory store. Error:', error.message);
    useMemoryStore = true;
    return null;
  }
}

function sendJson(res, statusCode, payload) {
  const data = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(data);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1e6) {
        req.destroy();
        reject(new Error('Body too large'));
      }
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (err) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

async function handleRegister(req, res) {
  try {
    const { email, password } = await parseBody(req);
    if (!email || !password) {
      return sendJson(res, 400, { message: 'Email and password are required.' });
    }
    const database = await connectDb();
    if (useMemoryStore) {
      const existing = memoryStore.users.find((u) => u.email === email);
      if (existing) return sendJson(res, 409, { message: 'User already exists.' });
    }

    const users = database?.collection('users');
    if (users) {
      const existing = await users.findOne({ email });
      if (existing) return sendJson(res, 409, { message: 'User already exists.' });
    }

    const salt = crypto.randomBytes(SALT_LENGTH);
    const derivedKey = await new Promise((resolve, reject) => {
      crypto.pbkdf2(password, salt, ITERATIONS, KEY_LENGTH, DIGEST, (err, key) => {
        if (err) reject(err);
        else resolve(key);
      });
    });

    const userDoc = {
      email,
      password: derivedKey.toString('hex'),
      salt: salt.toString('hex'),
      iterations: ITERATIONS,
      createdAt: new Date(),
    };

    if (users) {
      await users.insertOne(userDoc);
    } else {
      memoryStore.users.push(userDoc);
    }
    sendJson(res, 201, { message: 'Registration successful.' });
  } catch (error) {
    console.error('Registration error', error);
    sendJson(res, 500, { message: 'Unable to register user.' });
  }
}

async function handleLogin(req, res) {
  try {
    const { email, password } = await parseBody(req);
    if (!email || !password) {
      return sendJson(res, 400, { message: 'Email and password are required.' });
    }
    const database = await connectDb();
    const user = database
      ? await database.collection('users').findOne({ email })
      : memoryStore.users.find((u) => u.email === email);
    if (!user) return sendJson(res, 401, { message: 'Invalid credentials.' });

    const salt = Buffer.from(user.salt, 'hex');
    const derivedKey = await new Promise((resolve, reject) => {
      crypto.pbkdf2(password, salt, user.iterations || ITERATIONS, KEY_LENGTH, DIGEST, (err, key) => {
        if (err) reject(err);
        else resolve(key);
      });
    });

    if (derivedKey.toString('hex') !== user.password) {
      return sendJson(res, 401, { message: 'Invalid credentials.' });
    }
    sendJson(res, 200, { message: 'Login successful.' });
  } catch (error) {
    console.error('Login error', error);
    sendJson(res, 500, { message: 'Unable to login.' });
  }
}

async function handleListProducts(req, res, query) {
  try {
    const { category } = Object.fromEntries(query.entries());
    const database = await connectDb();
    const filter = category ? { category } : {};

    if (database) {
      const products = await database.collection('products').find(filter).sort({ createdAt: -1 }).toArray();
      return sendJson(res, 200, products);
    }

    const products = memoryStore.products
      .filter((p) => (category ? p.category === category : true))
      .sort((a, b) => b.createdAt - a.createdAt);
    sendJson(res, 200, products);
  } catch (error) {
    console.error('List products error', error);
    sendJson(res, 500, { message: 'Unable to load products.' });
  }
}

async function handleGetProduct(req, res, id) {
  try {
    const database = await connectDb();
    if (database) {
      const product = await database.collection('products').findOne({ _id: new ObjectId(id) });
      if (!product) return sendJson(res, 404, { message: 'Product not found.' });
      return sendJson(res, 200, product);
    }
    const product = memoryStore.products.find((p) => p._id === id);
    if (!product) return sendJson(res, 404, { message: 'Product not found.' });
    sendJson(res, 200, product);
  } catch (error) {
    console.error('Get product error', error);
    sendJson(res, 400, { message: 'Unable to load product.' });
  }
}

async function handleCreateProduct(req, res) {
  try {
    const { name, category, price, description, imageUrl } = await parseBody(req);
    if (!name || !category) {
      return sendJson(res, 400, { message: 'Name and category are required.' });
    }
    const database = await connectDb();
    const productDoc = {
      name,
      category,
      price: price ? Number(price) : null,
      description: description || '',
      imageUrl: imageUrl || '',
      createdAt: new Date(),
    };

    if (database) {
      const result = await database.collection('products').insertOne(productDoc);
      const product = await database.collection('products').findOne({ _id: result.insertedId });
      return sendJson(res, 201, product);
    }

    const memoryDoc = { ...productDoc, _id: crypto.randomUUID() };
    memoryStore.products.push(memoryDoc);
    sendJson(res, 201, memoryDoc);
  } catch (error) {
    console.error('Create product error', error);
    sendJson(res, 500, { message: 'Unable to create product.' });
  }
}

async function handleUpdateProduct(req, res, id) {
  try {
    const updates = await parseBody(req);
    const database = await connectDb();
    if (database) {
      const result = await database.collection('products').findOneAndUpdate(
        { _id: new ObjectId(id) },
        { $set: { ...updates, updatedAt: new Date() } },
        { returnDocument: 'after' }
      );
      if (!result.value) return sendJson(res, 404, { message: 'Product not found.' });
      return sendJson(res, 200, result.value);
    }
    const idx = memoryStore.products.findIndex((p) => p._id === id);
    if (idx === -1) return sendJson(res, 404, { message: 'Product not found.' });
    memoryStore.products[idx] = { ...memoryStore.products[idx], ...updates, updatedAt: new Date() };
    sendJson(res, 200, memoryStore.products[idx]);
  } catch (error) {
    console.error('Update product error', error);
    sendJson(res, 400, { message: 'Unable to update product.' });
  }
}

async function handleDeleteProduct(_req, res, id) {
  try {
    const database = await connectDb();
    if (database) {
      const result = await database.collection('products').deleteOne({ _id: new ObjectId(id) });
      if (!result.deletedCount) return sendJson(res, 404, { message: 'Product not found.' });
      return sendJson(res, 200, { message: 'Product removed.' });
    }
    const before = memoryStore.products.length;
    memoryStore.products = memoryStore.products.filter((p) => p._id !== id);
    if (memoryStore.products.length === before) return sendJson(res, 404, { message: 'Product not found.' });
    sendJson(res, 200, { message: 'Product removed.' });
  } catch (error) {
    console.error('Delete product error', error);
    sendJson(res, 400, { message: 'Unable to delete product.' });
  }
}

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.webp': 'image/webp',
  };
  return types[ext] || 'application/octet-stream';
}

function safeJoin(base, requestedPath) {
  const safePath = path.normalize(requestedPath).replace(/^\\|\/+/, '');
  return path.join(base, safePath);
}

function serveStatic(res, pathname) {
  const routeMap = {
    '/': 'index.html',
    '/boys': 'boys.html',
    '/girls': 'girls.html',
    '/parents': 'parents.html',
  };
  const target = routeMap[pathname] || pathname;
  const filePath = safeJoin(publicDir, target);
  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }
    res.writeHead(200, {
      'Content-Type': getContentType(filePath),
      'Access-Control-Allow-Origin': '*',
    });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  // Handle CORS preflight quickly.
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;

  if (pathname.startsWith('/api/')) {
    if (pathname === '/api/health' && req.method === 'GET') {
      return sendJson(res, 200, { status: 'ok', service: 'megumi' });
    }
    if (pathname === '/api/auth/register' && req.method === 'POST') return handleRegister(req, res);
    if (pathname === '/api/auth/login' && req.method === 'POST') return handleLogin(req, res);
    if (pathname === '/api/products' && req.method === 'GET') return handleListProducts(req, res, parsedUrl.searchParams);
    if (pathname === '/api/products' && req.method === 'POST') return handleCreateProduct(req, res);
    const productMatch = pathname.match(/^\/api\/products\/([^/]+)$/);
    if (productMatch) {
      const id = productMatch[1];
      if (req.method === 'GET') return handleGetProduct(req, res, id);
      if (req.method === 'PUT') return handleUpdateProduct(req, res, id);
      if (req.method === 'DELETE') return handleDeleteProduct(req, res, id);
    }
    return sendJson(res, 404, { message: 'API route not found.' });
  }

  serveStatic(res, pathname === '/' ? '/' : pathname);
});

process.on('SIGINT', async () => {
  if (client) await client.close();
  process.exit(0);
});

server.listen(port, () => {
  console.log(`Megumi server listening on port ${port}`);
});
