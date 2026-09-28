const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = 'foodloop_secret_key_change_in_production';

// MongoDB connection — use local MongoDB by default
// To use Atlas, set: set MONGODB_URI=mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/foodloop
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/foodloop';

mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => {
    console.error('❌ MongoDB connection error:', err.message);
    console.log('');
    console.log('To fix:');
    console.log('  1. Install MongoDB locally: https://www.mongodb.com/try/download/community');
    console.log('  2. Run: mongod --dbpath ./data');
    console.log('  3. This server will use mongodb://localhost:27017/foodloop');
  });

// User Schema
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'ngo'], required: true },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

app.use(cors({ origin: '*' }));
app.use(express.json());

// Serve static files from the FoodLoop directory
app.use(express.static('public'));

// ===== Auth Routes =====

// Sign Up
app.post('/api/signup', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'All fields are required.' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ name, email, password: hashedPassword, role });
    await user.save();

    const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
      success: true,
      token,
      user: { name: user.name, email: user.email, role: user.role }
    });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Server error during signup.' });
  }
});

// Sign In
app.post('/api/signin', async (req, res) => {
  try {
    const { email, password, role } = req.body;

    if (!email || !password || !role) {
      return res.status(400).json({ error: 'All fields are required.' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    if (user.role !== role) {
      return res.status(403).json({ error: `This account is registered as ${user.role === 'admin' ? 'an Admin' : 'an NGO'}. Please switch roles.` });
    }

    const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      success: true,
      token,
      user: { name: user.name, email: user.email, role: user.role }
    });
  } catch (err) {
    console.error('Signin error:', err);
    res.status(500).json({ error: 'Server error during signin.' });
  }
});

// Verify token
app.get('/api/verify', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided.' });

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');

    if (!user) return res.status(404).json({ error: 'User not found.' });

    res.json({ user: { name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    res.status(401).json({ error: 'Invalid token.' });
  }
});

// ===== Legacy Routes (for deployed frontend) =====
// These match the API_URL in app.js: 'http://localhost:5000/api'

app.listen(PORT, () => {
  console.log(`🚀 FoodLoop server running on http://localhost:${PORT}`);
  console.log('📍 API endpoints:');
  console.log('   POST /api/signup');
  console.log('   POST /api/signin');
  console.log('   GET  /api/verify');
});