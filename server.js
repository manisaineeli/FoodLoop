const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

try {
  process.loadEnvFile(path.join(__dirname, '.env'));
} catch (err) {
  if (err.code !== 'ENOENT') console.error('Could not read .env:', err.message);
}

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = 'foodloop_secret_key_change_in_production';

// ALL FoodLoop data lives in this database.
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/foodloop';

function describeUri(uri) {
  return uri.replace(/\/\/([^@/]+)@/, '//***@');
}

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('Connected to MongoDB:', describeUri(MONGODB_URI));
    return seedDatabaseIfEmpty();
  })
  .catch(err => {
    console.error('MongoDB connection error:', err.message);
    console.log('');
    console.log('The app reads MONGODB_URI from .env in this folder.');
    console.log('Local MongoDB should already be listening on 127.0.0.1:27017.');
    console.log('Start the Windows service named MongoDB, then run: npm start');
  });

// ===================== Schemas =====================

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'ngo'], required: true },
  createdAt: { type: Date, default: Date.now }
});

const listingSchema = new mongoose.Schema({
  emoji: { type: String, default: '🍽️' },
  name: { type: String, required: true },
  detail: String,
  quantity: String,
  expiry: String,
  status: { type: String, default: 'Available' }, // Available | Reserved
  requests: { type: String, default: '0 requests' },
  createdAt: { type: Date, default: Date.now }
});

const requestSchema = new mongoose.Schema({
  initials: String,
  color: String,
  name: { type: String, required: true },
  item: { type: String, required: true },
  time: { type: String, default: 'Received just now' },
  status: { type: String, default: 'pending' }, // pending | accepted | declined
  createdAt: { type: Date, default: Date.now }
});

const ngoRequestSchema = new mongoose.Schema({
  foodName: { type: String, required: true },
  ngoName: { type: String, default: 'NGO' },
  createdAt: { type: Date, default: Date.now }
});

const pickupSchema = new mongoose.Schema({
  day: { type: String, default: 'Today' }, // Today | Tomorrow | Completed
  time: String,
  item: { type: String, required: true },
  partner: String
});

const partnerSchema = new mongoose.Schema({
  initials: String,
  name: { type: String, required: true },
  detail: String,
  color: { type: String, default: 'blue' },
  status: { type: String, default: 'Connected' }
});

const wasteSchema = new mongoose.Schema({
  date: { type: String, default: () => new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) },
  category: String,
  quantity: String,
  reason: String,
  loggedBy: { type: String, default: 'Admin' },
  createdAt: { type: Date, default: Date.now }
});

const activitySchema = new mongoose.Schema({
  icon: String,
  iconClass: String,
  title: String,
  description: String,
  time: String,
  createdAt: { type: Date, default: Date.now }
});

const metricSchema = new mongoose.Schema({
  key: { type: String, default: 'dashboard' },
  foodDiverted: Number,
  mealsShared: Number,
  pendingPickups: Number,
  activePartners: Number,
  diversionPct: String,
  mealsPct: String,
  mealsGoal: Number,
  mealsGoalPct: Number,
  updatedAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Listing = mongoose.model('Listing', listingSchema);
const Request = mongoose.model('Request', requestSchema);
const NgoRequest = mongoose.model('NgoRequest', ngoRequestSchema);
const Pickup = mongoose.model('Pickup', pickupSchema);
const Partner = mongoose.model('Partner', partnerSchema);
const Waste = mongoose.model('Waste', wasteSchema);
const Activity = mongoose.model('Activity', activitySchema);
const Metric = mongoose.model('Metric', metricSchema);

// ===================== Seed =====================

async function seedDatabaseIfEmpty() {
  const listingCount = await Listing.countDocuments();
  if (listingCount > 0) return console.log('📦 Data already seeded — skipping.');

  console.log('🌱 Seeding demo data into MongoDB...');

  await Listing.insertMany([
    { emoji: '🍱', name: 'Prepared meal boxes', detail: 'Vegetarian · 450 kcal', quantity: '35 boxes', expiry: 'Today, 8:00 PM', status: 'Available', requests: '2 requests' },
    { emoji: '🥬', name: 'Fresh mixed produce', detail: 'Vegetables · 18 kg', quantity: '18 kg', expiry: 'Tomorrow', status: 'Available', requests: '1 request' },
    { emoji: '🥖', name: 'Assorted bakery items', detail: 'Bread & pastries · 9 kg', quantity: '9 kg', expiry: 'Tomorrow, 10:00 AM', status: 'Reserved', requests: 'Accepted' }
  ]);

  await Request.insertMany([
    { initials: 'HF', color: 'blue', name: 'Hope Foundation', item: '35 meal boxes', time: 'Received 48 minutes ago', status: 'pending' },
    { initials: 'CS', color: 'green', name: 'Community Kitchen', item: '10 kg fresh produce', time: 'Received 1 hour ago', status: 'pending' },
    { initials: 'LS', color: 'purple', name: 'Little Steps Shelter', item: '9 kg bakery items', time: 'Received yesterday', status: 'pending' }
  ]);

  await Pickup.insertMany([
    { day: 'Today', time: '4:30 PM', item: 'Fresh mixed produce', partner: 'Hope Foundation' },
    { day: 'Today', time: '6:00 PM', item: 'Prepared meal boxes', partner: 'Community Kitchen' },
    { day: 'Tomorrow', time: '9:00 AM', item: 'Bakery items', partner: 'Little Steps Shelter' },
    { day: 'Completed', time: 'Yesterday', item: 'Meal boxes · 20 boxes', partner: 'Community Kitchen' },
    { day: 'Completed', time: '12 Oct', item: 'Fresh produce · 12 kg', partner: 'Food Aid Network' }
  ]);

  await Partner.insertMany([
    { initials: 'HF', name: 'Hope Foundation', detail: 'NGO · 8.4 km away', color: 'blue' },
    { initials: 'CK', name: 'Community Kitchen', detail: 'Community kitchen · 3.1 km away', color: 'green' },
    { initials: 'LS', name: 'Little Steps Shelter', detail: 'Local shelter · 5.7 km away', color: 'purple' },
    { initials: 'FA', name: 'Food Aid Network', detail: 'Food bank · 12.2 km away', color: 'orange' },
    { initials: 'SS', name: 'Sunrise Support', detail: 'NGO · 6.8 km away', color: 'rose' },
    { initials: 'MH', name: 'Meals for Hope', detail: 'Community kitchen · 2.4 km away', color: 'teal' }
  ]);

  await Waste.insertMany([
    { date: '14 Oct 2024', category: 'Prepared meals', quantity: '8 kg', reason: 'Overproduction', loggedBy: 'Arun Kumar' },
    { date: '12 Oct 2024', category: 'Fresh produce', quantity: '5 kg', reason: 'Spoilage', loggedBy: 'Meera Shah' },
    { date: '10 Oct 2024', category: 'Bakery', quantity: '3 kg', reason: 'Quality issue', loggedBy: 'Arun Kumar' }
  ]);

  await Activity.insertMany([
    { icon: '✓', iconClass: 'green-bg', title: 'Donation completed', description: '12 kg of prepared meals · Community Kitchen', time: '12 minutes ago' },
    { icon: '↗', iconClass: 'blue-bg', title: 'New request received', description: 'Hope Foundation requested 35 meal boxes', time: '48 minutes ago' },
    { icon: '◷', iconClass: 'orange-bg', title: 'Pickup scheduled', description: 'Fresh produce · Today, 4:30 PM', time: '2 hours ago' },
    { icon: '♧', iconClass: 'purple-bg', title: 'New partner joined', description: 'Little Steps Shelter is now connected', time: 'Yesterday' }
  ]);

  await Metric.create({
    key: 'dashboard',
    foodDiverted: 1284,
    mealsShared: 3842,
    pendingPickups: 8,
    activePartners: 24,
    diversionPct: '↗ 18.4%',
    mealsPct: '↗ 12.2%',
    mealsGoal: 5000,
    mealsGoalPct: 76
  });

  console.log('✅ Demo data seeded across listings, requests, pickups, partners, waste, activity, metrics.');
}

// ===================== Middleware =====================

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const toClient = (doc) => ({ ...doc.toObject(), id: doc._id.toString() });

// ===================== Auth Routes =====================

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

// ===================== Data API (everything in MongoDB) =====================

// One call returns every collection the UI needs.
app.get('/api/bootstrap', async (req, res) => {
  try {
    const [listings, requests, ngoRequests, pickups, partners, waste, activities, metrics] = await Promise.all([
      Listing.find().sort({ createdAt: -1 }),
      Request.find().sort({ createdAt: -1 }),
      NgoRequest.find(),
      Pickup.find(),
      Partner.find(),
      Waste.find().sort({ createdAt: -1 }),
      Activity.find().sort({ createdAt: -1 }),
      Metric.findOne({ key: 'dashboard' })
    ]);

    res.json({
      listings: listings.map(toClient),
      requests: requests.map(toClient),
      ngoRequests: ngoRequests.map(toClient),
      pickups: pickups.map(toClient),
      partners: partners.map(toClient),
      waste: waste.map(toClient),
      activities: activities.map(toClient),
      metrics: metrics ? metrics.toObject() : null
    });
  } catch (err) {
    console.error('bootstrap error:', err);
    res.status(500).json({ error: 'Could not load data.' });
  }
});

// Food listings — create
app.post('/api/listings', async (req, res) => {
  try {
    const { emoji, name, detail, quantity, expiry } = req.body;
    if (!name || !quantity || !expiry) {
      return res.status(400).json({ error: 'Food name, quantity and best-before are required.' });
    }
    const listing = await Listing.create({
      emoji: emoji || '🍽️',
      name,
      detail: detail || 'Fresh surplus food',
      quantity,
      expiry,
      status: 'Available',
      requests: '0 requests'
    });

    await Activity.create({ icon: '＋', iconClass: 'green-bg', title: 'Food listing published', description: name, time: 'Just now' });

    res.status(201).json({ listing: toClient(listing) });
  } catch (err) {
    console.error('create listing error:', err);
    res.status(500).json({ error: 'Could not create listing.' });
  }
});

// Donation requests — NGO creates one
app.post('/api/requests', async (req, res) => {
  try {
    const { initials, color, name, item, ngoName } = req.body;
    if (!item) return res.status(400).json({ error: 'Item is required.' });

    const request = await Request.create({
      initials: initials || 'NG',
      color: color || 'teal',
      name: name || ngoName || 'New NGO',
      item,
      time: 'Received just now',
      status: 'pending'
    });

    await NgoRequest.create({ foodName: item, ngoName });

    await Activity.create({ icon: '↗', iconClass: 'blue-bg', title: 'New request received', description: `${request.name} requested ${item}`, time: 'Just now' });

    res.status(201).json({ request: toClient(request) });
  } catch (err) {
    console.error('create request error:', err);
    res.status(500).json({ error: 'Could not create request.' });
  }
});

// Donation requests — admin accepts / declines
app.patch('/api/requests/:id', async (req, res) => {
  try {
    const { action } = req.body; // "accept" | "decline"
    const request = await Request.findById(req.params.id);
    if (!request) return res.status(404).json({ error: 'Request not found.' });

    request.status = action === 'accept' ? 'accepted' : 'declined';
    await request.save();

    if (action === 'accept') {
      await Activity.create({ icon: '✓', iconClass: 'green-bg', title: 'Donation accepted', description: `${request.item} · ${request.name}`, time: 'Just now' });
    }

    res.json({ request: toClient(request) });
  } catch (err) {
    console.error('update request error:', err);
    res.status(500).json({ error: 'Could not update request.' });
  }
});

// Waste — create
app.post('/api/waste', async (req, res) => {
  try {
    const { category, quantity, reason, loggedBy } = req.body;
    if (!category || !quantity || !reason) {
      return res.status(400).json({ error: 'Category, quantity and reason are required.' });
    }
    const waste = await Waste.create({ category, quantity, reason, loggedBy: loggedBy || 'Admin' });
    await Activity.create({ icon: '◒', iconClass: 'orange-bg', title: 'Waste logged', description: `${quantity} of ${category} · ${reason}`, time: 'Just now' });
    res.status(201).json({ waste: toClient(waste) });
  } catch (err) {
    console.error('create waste error:', err);
    res.status(500).json({ error: 'Could not log waste.' });
  }
});

// Pickups — create
app.post('/api/pickups', async (req, res) => {
  try {
    const { time, item, partner, day } = req.body;
    if (!item) return res.status(400).json({ error: 'Item is required.' });
    const pickup = await Pickup.create({ time: time || 'TBD', item, partner: partner || '—', day: day || 'Today' });
    res.status(201).json({ pickup: toClient(pickup) });
  } catch (err) {
    console.error('create pickup error:', err);
    res.status(500).json({ error: 'Could not schedule pickup.' });
  }
});

// Partners — create
app.post('/api/partners', async (req, res) => {
  try {
    const { initials, name, detail, color } = req.body;
    if (!name) return res.status(400).json({ error: 'Partner name is required.' });
    const partner = await Partner.create({
      initials: initials || name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?',
      name,
      detail: detail || 'New community partner',
      color: color || 'teal'
    });
    await Activity.create({ icon: '♧', iconClass: 'purple-bg', title: 'New partner joined', description: `${name} is now connected`, time: 'Just now' });
    res.status(201).json({ partner: toClient(partner) });
  } catch (err) {
    console.error('create partner error:', err);
    res.status(500).json({ error: 'Could not add partner.' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 FoodLoop server running on http://localhost:${PORT}`);
  console.log('📍 API endpoints:');
  console.log('   Auth : POST /api/signup · POST /api/signin · GET /api/verify');
  console.log('   Data : GET  /api/bootstrap');
  console.log('          POST /api/listings · POST /api/requests · PATCH /api/requests/:id');
  console.log('          POST /api/waste · POST /api/pickups · POST /api/partners');
  console.log('   Every collection lives in MongoDB: ' + describeUri(MONGODB_URI));
});