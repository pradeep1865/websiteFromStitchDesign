require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MongoClient, ObjectId } = require('mongodb');
const crypto = require('crypto');

const app = express();
const port = process.env.PORT || 3000;
const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/megumi';

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const SALT_LENGTH = 16;
const ITERATIONS = 120000;
const KEY_LENGTH = 64;
const DIGEST = 'sha512';

let client;
let db;

async function connectDb() {
  if (db) return db;
  client = new MongoClient(mongoUri);
  await client.connect();
  db = client.db();
  await Promise.all([
    db.collection('users').createIndex({ email: 1 }, { unique: true }),
    db.collection('products').createIndex({ category: 1 }),
  ]);
  return db;
}

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'megumi' });
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }
    const database = await connectDb();
    const users = database.collection('users');
    const existing = await users.findOne({ email });
    if (existing) {
      return res.status(409).json({ message: 'User already exists.' });
    }
    const salt = crypto.randomBytes(SALT_LENGTH);
    const derivedKey = await new Promise((resolve, reject) => {
      crypto.pbkdf2(password, salt, ITERATIONS, KEY_LENGTH, DIGEST, (err, key) => {
        if (err) reject(err);
        else resolve(key);
      });
    });

    await users.insertOne({
      email,
      password: derivedKey.toString('hex'),
      salt: salt.toString('hex'),
      iterations: ITERATIONS,
      createdAt: new Date(),
    });
    res.status(201).json({ message: 'Registration successful.' });
  } catch (error) {
    console.error('Registration error', error);
    res.status(500).json({ message: 'Unable to register user.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }
    const database = await connectDb();
    const user = await database.collection('users').findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }
    const salt = Buffer.from(user.salt, 'hex');
    const derivedKey = await new Promise((resolve, reject) => {
      crypto.pbkdf2(password, salt, user.iterations || ITERATIONS, KEY_LENGTH, DIGEST, (err, key) => {
        if (err) reject(err);
        else resolve(key);
      });
    });

    if (derivedKey.toString('hex') !== user.password) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }
    res.json({ message: 'Login successful.' });
  } catch (error) {
    console.error('Login error', error);
    res.status(500).json({ message: 'Unable to login.' });
  }
});

app.get('/api/products', async (req, res) => {
  try {
    const { category } = req.query;
    const database = await connectDb();
    const filter = category ? { category } : {};
    const products = await database.collection('products').find(filter).sort({ createdAt: -1 }).toArray();
    res.json(products);
  } catch (error) {
    console.error('List products error', error);
    res.status(500).json({ message: 'Unable to load products.' });
  }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const database = await connectDb();
    const product = await database.collection('products').findOne({ _id: new ObjectId(id) });
    if (!product) return res.status(404).json({ message: 'Product not found.' });
    res.json(product);
  } catch (error) {
    console.error('Get product error', error);
    res.status(400).json({ message: 'Unable to load product.' });
  }
});

app.post('/api/products', async (req, res) => {
  try {
    const { name, category, price, description, imageUrl } = req.body;
    if (!name || !category) {
      return res.status(400).json({ message: 'Name and category are required.' });
    }
    const database = await connectDb();
    const result = await database.collection('products').insertOne({
      name,
      category,
      price: price ? Number(price) : null,
      description: description || '',
      imageUrl: imageUrl || '',
      createdAt: new Date(),
    });
    const product = await database.collection('products').findOne({ _id: result.insertedId });
    res.status(201).json(product);
  } catch (error) {
    console.error('Create product error', error);
    res.status(500).json({ message: 'Unable to create product.' });
  }
});

app.put('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const database = await connectDb();
    const result = await database.collection('products').findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: { ...updates, updatedAt: new Date() } },
      { returnDocument: 'after' }
    );
    if (!result.value) return res.status(404).json({ message: 'Product not found.' });
    res.json(result.value);
  } catch (error) {
    console.error('Update product error', error);
    res.status(400).json({ message: 'Unable to update product.' });
  }
});

app.delete('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const database = await connectDb();
    const result = await database.collection('products').deleteOne({ _id: new ObjectId(id) });
    if (!result.deletedCount) return res.status(404).json({ message: 'Product not found.' });
    res.json({ message: 'Product removed.' });
  } catch (error) {
    console.error('Delete product error', error);
    res.status(400).json({ message: 'Unable to delete product.' });
  }
});

process.on('SIGINT', async () => {
  if (client) await client.close();
  process.exit(0);
});

app.listen(port, () => {
  console.log(`Megumi server listening on port ${port}`);
});
