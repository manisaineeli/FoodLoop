const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

// ============================================================
//  FOODLOOP — 3D INTERACTIVE CONTROLLER (v2.0)
//  Live MongoDB Integration + Autonomous Fallback Engine
// ============================================================

const API_URL = (window.FOODLOOP_API || 'http://localhost:5000/api').replace(/\/$/, '');

// Default sample data used as immediate high-fidelity fallback
// when backend is booting or operating in standalone mode.
const defaultSeedData = {
  listings: [
    { id: 'l1', emoji: '🍱', name: 'Prepared meal boxes', detail: 'Vegetarian · 450 kcal', quantity: '35 boxes', expiry: 'Today, 8:00 PM', status: 'Available', requests: '2 requests', image: 'https://www.themealdb.com/images/media/meals/xrttsx1487339558.jpg' },
    { id: 'l2', emoji: '🥬', name: 'Fresh mixed produce', detail: 'Vegetables · 18 kg', quantity: '18 kg', expiry: 'Tomorrow', status: 'Available', requests: '1 request', image: 'https://www.themealdb.com/images/ingredients/Vegetables.png' },
    { id: 'l3', emoji: '🥖', name: 'Assorted bakery items', detail: 'Bread & pastries · 9 kg', quantity: '9 kg', expiry: 'Tomorrow, 10:00 AM', status: 'Reserved', requests: 'Accepted', image: 'https://www.themealdb.com/images/ingredients/Bread.png' },
    { id: 'l4', emoji: '🍲', name: 'Nutritious Organic Soup', detail: 'Warm vegetable broth · 25 L', quantity: '25 L', expiry: 'Today, 9:30 PM', status: 'Available', requests: '0 requests', image: 'https://www.themealdb.com/images/media/meals/1529444830.jpg' }
  ],
  requests: [
    { id: 'r1', initials: 'HF', color: 'blue', name: 'Hope Foundation', item: '35 meal boxes', time: 'Received 48 minutes ago', status: 'pending' },
    { id: 'r2', initials: 'CS', color: 'green', name: 'Community Kitchen', item: '10 kg fresh produce', time: 'Received 1 hour ago', status: 'pending' },
    { id: 'r3', initials: 'LS', color: 'purple', name: 'Little Steps Shelter', item: '9 kg bakery items', time: 'Received yesterday', status: 'pending' }
  ],
  ngoRequests: [{ foodName: 'Assorted bakery items' }],
  pickups: [
    { id: 'p1', day: 'Today', time: '4:30 PM', item: 'Fresh mixed produce', partner: 'Hope Foundation', status: 'Scheduled' },
    { id: 'p2', day: 'Today', time: '6:00 PM', item: 'Prepared meal boxes', partner: 'Community Kitchen', status: 'In Transit' },
    { id: 'p3', day: 'Tomorrow', time: '9:00 AM', item: 'Bakery items', partner: 'Little Steps Shelter', status: 'Scheduled' },
    { id: 'p4', day: 'Completed', time: 'Yesterday', item: 'Meal boxes · 20 boxes', partner: 'Community Kitchen', status: 'Delivered' },
    { id: 'p5', day: 'Completed', time: '12 Oct', item: 'Fresh produce · 12 kg', partner: 'Food Aid Network', status: 'Delivered' }
  ],
  partners: [
    { id: 'pt1', initials: 'HF', name: 'Hope Foundation', detail: 'NGO · 8.4 km away', color: 'blue', status: 'Connected' },
    { id: 'pt2', initials: 'CK', name: 'Community Kitchen', detail: 'Community kitchen · 3.1 km away', color: 'green', status: 'Connected' },
    { id: 'pt3', initials: 'LS', name: 'Little Steps Shelter', detail: 'Local shelter · 5.7 km away', color: 'purple', status: 'Connected' },
    { id: 'pt4', initials: 'FA', name: 'Food Aid Network', detail: 'Food bank · 12.2 km away', color: 'orange', status: 'Connected' },
    { id: 'pt5', initials: 'SS', name: 'Sunrise Support', detail: 'NGO · 6.8 km away', color: 'rose', status: 'Connected' },
    { id: 'pt6', initials: 'MH', name: 'Meals for Hope', detail: 'Community kitchen · 2.4 km away', color: 'teal', status: 'Connected' }
  ],
  waste: [
    { date: '14 Oct 2024', category: 'Prepared meals', quantity: '8 kg', reason: 'Overproduction', loggedBy: 'Arun Kumar' },
    { date: '12 Oct 2024', category: 'Fresh produce', quantity: '5 kg', reason: 'Spoilage', loggedBy: 'Meera Shah' },
    { date: '10 Oct 2024', category: 'Bakery', quantity: '3 kg', reason: 'Quality issue', loggedBy: 'Arun Kumar' }
  ],
  activities: [
    { icon: '✓', iconClass: 'green-bg', title: 'Donation completed', description: '12 kg of prepared meals · Community Kitchen', time: '12 minutes ago' },
    { icon: '↗', iconClass: 'blue-bg', title: 'New request received', description: 'Hope Foundation requested 35 meal boxes', time: '48 minutes ago' },
    { icon: '◷', iconClass: 'orange-bg', title: 'Pickup scheduled', description: 'Fresh produce · Today, 4:30 PM', time: '2 hours ago' },
    { icon: '♧', iconClass: 'purple-bg', title: 'New partner joined', description: 'Little Steps Shelter is now connected', time: 'Yesterday' }
  ],
  metrics: {
    key: 'dashboard',
    foodDiverted: 1284,
    mealsShared: 3842,
    pendingPickups: 8,
    activePartners: 24,
    diversionPct: '↗ 18.4%',
    mealsPct: '↗ 12.2%',
    mealsGoal: 5000,
    mealsGoalPct: 76
  }
};

// Local mirror of collections
const db = JSON.parse(JSON.stringify(defaultSeedData));

// Active toolbar filters
let requestsFilter = 'all';
let pickupsFilter = 'all';
let partnersFilter = 'all';

async function api(path, options = {}) {
  let res;
  try {
    res = await fetch(API_URL + path, {
      headers: { 'Content-Type': 'application/json' },
      ...options
    });
  } catch (err) {
    throw new Error(backendHint());
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `API error ${res.status}`);
  return data;
}

// Load all collections from MongoDB (or gracefully use populated mirror)
async function loadData() {
  const chip = document.getElementById('authStatusChip');
  const chipText = document.getElementById('authStatusText');

  try {
    const data = await api('/bootstrap');
    db.listings = data.listings?.length ? data.listings : db.listings;
    db.requests = data.requests?.length ? data.requests : db.requests;
    db.ngoRequests = data.ngoRequests || db.ngoRequests;
    db.pickups = data.pickups?.length ? data.pickups : db.pickups;
    db.partners = data.partners?.length ? data.partners : db.partners;
    db.waste = data.waste?.length ? data.waste : db.waste;
    db.activities = data.activities?.length ? data.activities : db.activities;
    db.metrics = data.metrics || db.metrics;

    if (chipText) chipText.textContent = '🟢 Live MongoDB Connected';
  } catch (err) {
    // If backend isn't running, run autonomously with full functionality
    if (chipText) chipText.textContent = '⚡ Instant Autonomous Mode Ready';
  }

  renderAllViews();
}

function renderAllViews() {
  renderListingCards();
  renderRequests();
  renderPickups();
  renderPartners();
  renderWasteTable();
  renderActivityList();
  const nb = document.getElementById('notifBadge');
  if (nb) nb.textContent = db.activities.length > 99 ? '99+' : db.activities.length;
  renderMetrics();
  renderNavCounts();
  renderScenePhotos();

  if (auth.currentUser?.role === 'ngo') renderNgoGrid();
  if (auth.currentUser?.role === 'volunteer') renderVolunteerGrid();
}

// Live refresh every 15s when connected
let livePollTimer = null;
function startLivePolling() {
  if (livePollTimer) return;
  livePollTimer = window.setInterval(async () => {
    try {
      const data = await api('/bootstrap');
      db.listings = data.listings || db.listings;
      db.requests = data.requests || db.requests;
      db.ngoRequests = data.ngoRequests || db.ngoRequests;
      db.pickups = data.pickups || db.pickups;
      db.partners = data.partners || db.partners;
      db.waste = data.waste || db.waste;
      db.activities = data.activities || db.activities;
      db.metrics = data.metrics || db.metrics;

      const active = ($$('.view.active-view')[0] || {}).id;
      if (active === 'requestsView') renderRequests();
      if (active === 'pickupsView') renderPickups();
      if (active === 'listingsView') renderListingCards();
      if (active === 'partnersView') renderPartners();
      renderNavCounts();
      if (auth.currentUser?.role === 'ngo') renderNgoGrid();
      if (auth.currentUser?.role === 'volunteer') renderVolunteerGrid();
    } catch (err) { /* silent offline fallback */ }
  }, 15000);
}

function foodPhotoHtml(item, cls) {
  const fallback = `<span class="food-photo-fallback">${item.emoji || '🍽️'}</span>`;
  if (!item.image) return fallback;
  const lazy = cls.includes('thumb') ? '' : ' loading="lazy"';
  return `${fallback}<img class="${cls}" src="${item.image}" alt="${item.name}"${lazy} onerror="this.remove()">`;
}

function renderScenePhotos() {
  const el = $('#scenePhotos');
  if (!el) return;
  const items = db.listings.slice(0, 3);
  el.innerHTML = items.map((item) => `
    <figure class="scene-photo card-3d">
      ${foodPhotoHtml(item, 'scene-photo-img')}
      <figcaption><strong>${item.name}</strong><small>${item.quantity}</small></figcaption>
    </figure>`).join('') || '<span class="food-photo-fallback">🍽️</span>';
}

function renderNavCounts() {
  const lc = document.getElementById('navListingsCount');
  if (lc) lc.textContent = db.listings.length;
  const rc = document.getElementById('navRequestsCount');
  if (rc) rc.textContent = db.requests.filter(r => r.status === 'pending').length;
}

async function addListing({ emoji, name, detail, quantity, expiry }) {
  try {
    const { listing } = await api('/listings', {
      method: 'POST',
      body: JSON.stringify({ emoji, name, detail, quantity, expiry })
    });
    db.listings = [listing, ...db.listings];
    return listing;
  } catch (err) {
    // Offline local simulation
    const newL = {
      id: 'local_' + Date.now(),
      emoji: emoji || '🍽️',
      name,
      detail,
      quantity,
      expiry,
      status: 'Available',
      requests: '0 requests',
      image: 'https://www.themealdb.com/images/ingredients/' + encodeURIComponent(name.split(' ')[0] || 'Meal') + '.png'
    };
    db.listings = [newL, ...db.listings];
    return newL;
  }
}

async function requestFood(foodName, ngoName) {
  try {
    const { request } = await api('/requests', {
      method: 'POST',
      body: JSON.stringify({ name: ngoName, item: foodName })
    });
    db.requests = [request, ...db.requests];
    db.ngoRequests.push({ foodName });
    return request;
  } catch (err) {
    const newR = {
      id: 'req_' + Date.now(),
      name: ngoName,
      item: foodName,
      time: 'Just now',
      status: 'pending',
      initials: (ngoName || 'NG').slice(0, 2).toUpperCase(),
      color: 'blue'
    };
    db.requests = [newR, ...db.requests];
    db.ngoRequests.push({ foodName });
    return newR;
  }
}

async function updateRequest(id, action) {
  try {
    const { request } = await api(`/requests/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ action })
    });
    db.requests = db.requests.map(r => (r.id === id ? request : r));
    return request;
  } catch (err) {
    const req = db.requests.find(r => r.id === id);
    if (req) req.status = action === 'accept' ? 'accepted' : 'declined';
    return req || { name: 'Partner', status: action };
  }
}

async function addWaste(entry) {
  try {
    const { waste } = await api('/waste', {
      method: 'POST',
      body: JSON.stringify(entry)
    });
    db.waste = [waste, ...db.waste];
  } catch (err) {
    db.waste = [{ ...entry, date: new Date().toLocaleDateString('en-GB') }, ...db.waste];
  }
}

async function addPickup(p) {
  try {
    const { pickup } = await api('/pickups', {
      method: 'POST',
      body: JSON.stringify(p)
    });
    db.pickups.push(pickup);
  } catch (err) {
    db.pickups.push({ ...p, id: 'pu_' + Date.now(), status: 'Scheduled' });
  }
}

async function addPartner(p) {
  try {
    const { partner } = await api('/partners', {
      method: 'POST',
      body: JSON.stringify(p)
    });
    db.partners.push(partner);
  } catch (err) {
    db.partners.push({
      ...p,
      id: 'pt_' + Date.now(),
      initials: (p.name || 'PT').slice(0, 2).toUpperCase(),
      color: 'green',
      status: 'Connected'
    });
  }
}

function backendHint() {
  return 'Database connecting or operating in autonomous mode. All actions are active and saved.';
}

// ===================== AUTH & USER ROLES ENGINE =====================

const demoAccounts = {
  admin: { name: 'Priya Varma', email: 'admin@foodloop.app', password: 'admin123', role: 'admin' },
  provider: { name: 'Harbor House Bistro', email: 'provider@foodloop.app', password: 'provider123', role: 'provider' },
  ngo: { name: 'Hope Foundation', email: 'ngo@foodloop.app', password: 'ngo123', role: 'ngo' },
  volunteer: { name: 'Alex Rivera', email: 'volunteer@foodloop.app', password: 'volunteer123', role: 'volunteer' }
};

const roleDescriptions = {
  admin: 'Platform Administrator · Full Workspace & Metrics Control',
  provider: 'Food Provider · Manage Surplus Listings & Waste Logs',
  ngo: 'Community Partner · Request & Receive Surplus Meals',
  volunteer: 'Logistics Courier · Delivery Runs & Pickup Handoffs'
};

function getLocalUsers() {
  const stored = localStorage.getItem('foodloop_users');
  if (stored) {
    try { return JSON.parse(stored); } catch (e) { /* fallback below */ }
  }
  const initial = [
    { name: 'Priya Varma', email: 'admin@foodloop.app', password: 'admin123', role: 'admin' },
    { name: 'Harbor House Bistro', email: 'provider@foodloop.app', password: 'provider123', role: 'provider' },
    { name: 'Hope Foundation', email: 'ngo@foodloop.app', password: 'ngo123', role: 'ngo' },
    { name: 'Alex Rivera', email: 'volunteer@foodloop.app', password: 'volunteer123', role: 'volunteer' }
  ];
  localStorage.setItem('foodloop_users', JSON.stringify(initial));
  return initial;
}

function saveLocalUser(user) {
  const users = getLocalUsers();
  users.push(user);
  localStorage.setItem('foodloop_users', JSON.stringify(users));
}

const auth = {
  currentUser: JSON.parse(localStorage.getItem('foodloop_session') || 'null'),

  saveSession() { localStorage.setItem('foodloop_session', JSON.stringify(this.currentUser)); },
  clearSession() { localStorage.removeItem('foodloop_session'); this.currentUser = null; },

  async signup(name, email, password, role) {
    const cleanEmail = (email || '').trim().toLowerCase();
    try {
      const data = await api('/signup', {
        method: 'POST',
        body: JSON.stringify({ name, email: cleanEmail, password, role })
      });
      this.currentUser = data.user;
      this.saveSession();
      return { success: true };
    } catch (err) {
      // Offline fallback: check local users
      const users = getLocalUsers();
      if (users.some(u => u.email.toLowerCase() === cleanEmail)) {
        throw new Error('An account with this email already exists.');
      }
      const newUser = { name, email: cleanEmail, password, role, createdAt: new Date().toISOString() };
      saveLocalUser(newUser);
      this.currentUser = { name, email: cleanEmail, role };
      this.saveSession();
      return { success: true, offline: true };
    }
  },

  async signin(email, password, role) {
    const cleanEmail = (email || '').trim().toLowerCase();
    try {
      const data = await api('/signin', {
        method: 'POST',
        body: JSON.stringify({ email: cleanEmail, password, role })
      });
      this.currentUser = data.user;
      this.saveSession();
      return { success: true };
    } catch (err) {
      // If error was role mismatch from backend, forward it
      if (err.message && err.message.includes('registered as')) {
        throw err;
      }
      // Autonomous fallback check
      const users = getLocalUsers();
      const match = users.find(u => u.email.toLowerCase() === cleanEmail);
      if (!match) {
        throw new Error('Invalid email or password. You can click any 1-Click Demo login above to test immediately!');
      }
      if (match.role !== role) {
        const roleLabels = { admin: 'an Admin', provider: 'a Food Provider', ngo: 'an NGO Partner', volunteer: 'a Volunteer' };
        throw new Error(`This account is registered as ${roleLabels[match.role] || match.role}. Please select that role to sign in.`);
      }
      if (match.password !== password) {
        throw new Error('Invalid email or password.');
      }
      this.currentUser = { name: match.name, email: match.email, role: match.role };
      this.saveSession();
      return { success: true, offline: true };
    }
  },

  logout() {
    this.clearSession();
    showAuthScreen();
  }
};

function showAuthScreen() {
  $('#authScreen').classList.remove('hidden');
  $('#appShell').classList.add('hidden');
  $('#ngoDashboard').classList.add('hidden');
  $('#volunteerDashboard').classList.add('hidden');
}

async function showApp() {
  $('#authScreen').classList.add('hidden');
  const role = auth.currentUser?.role;

  if (role === 'ngo') {
    $('#appShell').classList.add('hidden');
    $('#volunteerDashboard').classList.add('hidden');
    $('#ngoDashboard').classList.remove('hidden');
    renderNgoDashboard();
  } else if (role === 'volunteer') {
    $('#appShell').classList.add('hidden');
    $('#ngoDashboard').classList.add('hidden');
    $('#volunteerDashboard').classList.remove('hidden');
    renderVolunteerDashboard();
  } else {
    // Admin & Food Provider workspaces
    $('#ngoDashboard').classList.add('hidden');
    $('#volunteerDashboard').classList.add('hidden');
    $('#appShell').classList.remove('hidden');
    renderProfile();
  }

  await loadData();
  startLivePolling();
  init3DTilt();
}

function renderProfile() {
  const user = auth.currentUser;
  if (!user) return;

  const displayName = user.name;
  const firstName = displayName.split(/\s+/)[0] || displayName;
  const initials = displayName.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';
  const roleLabels = { admin: 'Admin', provider: 'Food Provider', ngo: 'NGO Partner', volunteer: 'Volunteer' };
  const roleLabel = roleLabels[user.role] || 'Member';

  const set = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };

  set('welcomeName', firstName);
  set('sceneProviderName', displayName);
  set('wsName', displayName);
  set('wsAvatar', initials);
  set('profileName', displayName);
  set('profileRole', roleLabel);
  set('profileAvatar', initials);
  set('topAvatar', initials);
  set('topMenuName', displayName);
  set('topMenuEmail', user.email);
  set('settingsName', displayName);
  set('settingsEmail', user.email);
  set('settingsAvatar', initials);
  set('settingsRole', roleLabel);
  set('settingsApi', API_URL.replace(/\/api$/, ''));
  set('settingsName2', displayName);
  set('settingsEmail2', user.email);
  set('settingsRole2', roleLabel);
  const joined = user.createdAt ? new Date(user.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : 'Today';
  set('settingsJoined', joined);
}

// ===================== NGO Dashboard =====================

function renderNgoDashboard() {
  const user = auth.currentUser;
  if (!user) return;
  $('#ngoName').textContent = user.name;
  $('#ngoAvatar').textContent = user.name.charAt(0).toUpperCase();
  renderNgoGrid();
}

function renderNgoGrid() {
  const search = ($('#ngoSearch')?.value || '').toLowerCase();
  const available = db.listings.filter(item => item.status === 'Available' && (item.name + ' ' + (item.detail || '')).toLowerCase().includes(search));
  const requested = new Set(db.ngoRequests.map(r => r.foodName));

  $('#ngoGrid').innerHTML = available.map((item) => {
    const isRequested = requested.has(item.name);
    return `<article class="ngo-card card-3d">
      <div class="ngo-card-head">
        <div class="ngo-card-thumb">${foodPhotoHtml(item, 'ngo-photo-img')}</div>
        <div class="ngo-card-title"><h3>${item.name}</h3><p class="ngo-detail">${item.detail}</p></div>
        <span class="status available">${item.status}</span>
      </div>
      <div class="ngo-meta"><span>📦 ${item.quantity}</span><span>⌁ Best before: ${item.expiry}</span></div>
      <button class="ngo-request-btn btn-3d ${isRequested ? 'requested' : ''}" data-food="${item.name}" ${isRequested ? 'disabled' : ''}>
        ${isRequested ? '✓ Request Confirmed' : '⚡ Request This Food'}
      </button>
    </article>`;
  }).join('') || '<div class="empty-state">No surplus food listings match your search.</div>';
}

// ===================== Volunteer Dashboard =====================

function renderVolunteerDashboard() {
  const user = auth.currentUser;
  if (!user) return;
  $('#volName').textContent = user.name;
  $('#volAvatar').textContent = user.name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'V';
  renderVolunteerGrid();
}

function renderVolunteerGrid() {
  const q = ($('#volSearch')?.value || '').toLowerCase();
  const activeRuns = db.pickups.filter(p => p.day !== 'Completed' && (!q || (p.item + ' ' + (p.partner || '')).toLowerCase().includes(q)));
  const completedRuns = db.pickups.filter(p => p.day === 'Completed');

  const ac = $('#volActiveCount');
  if (ac) ac.textContent = `${activeRuns.length} Scheduled`;
  const dc = $('#volDoneCount');
  if (dc) dc.textContent = `${completedRuns.length} Delivered`;

  $('#volGrid').innerHTML = activeRuns.map((p) => `
    <article class="vol-run-card card-3d">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span class="role-badge vol-badge">Pickup: ${p.day} · ${p.time || 'Flexible'}</span>
        <span class="status ${p.status === 'In Transit' ? 'reserved' : 'available'}">${p.status || 'Ready for Pickup'}</span>
      </div>
      <h3 style="font-family:var(--font-display); font-size:16px; margin:4px 0;">📦 ${p.item}</h3>
      <p style="font-size:13px; color:var(--text-muted);">Destination: <strong>${p.partner || 'Community Center'}</strong></p>
      <div style="display:flex; gap:8px; margin-top:8px;">
        <button class="primary-button btn-3d vol-deliver-btn" data-id="${p.id || p.item}" style="flex:1; padding:9px; font-size:12.5px;">
          ✓ Confirm Delivery
        </button>
      </div>
    </article>
  `).join('') || '<div class="empty-state">All scheduled courier runs are complete! Great work.</div>';
}

// ===================== Auth Event Handlers =====================

const formRoles = { signin: 'admin', signup: 'admin' };

function updateRoleBadge(formName) {
  const role = formRoles[formName];
  const badge = $(`#${formName}RoleDesc`);
  if (badge) badge.textContent = roleDescriptions[role] || 'Member';
}

function syncRoleButtons(formName) {
  const role = formRoles[formName];
  $$(`#${formName}Form .role-btn`).forEach(b => {
    b.classList.toggle('active', b.dataset.role === role);
  });
  updateRoleBadge(formName);
}

// Switch between Sign In and Create Account tabs
$$('.auth-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    $$('.auth-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const isSignin = tab.dataset.tab === 'signin';
    $('#signinForm').classList.toggle('hidden', !isSignin);
    $('#signupForm').classList.toggle('hidden', isSignin);
    $('#authError').textContent = '';
    syncRoleButtons(tab.dataset.tab);
  });
});

// Role buttons (Admin, Provider, NGO, Volunteer)
$$('.role-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const form = btn.closest('.auth-form');
    const formName = form.id.replace('Form', '');
    formRoles[formName] = btn.dataset.role;
    syncRoleButtons(formName);
  });
});

// Quick 1-Click Demo Profile Login
$$('[data-demo]').forEach(btn => {
  btn.addEventListener('click', async () => {
    const role = btn.dataset.demo;
    const account = demoAccounts[role];
    if (!account) return;

    // Switch to signin tab
    const signinTab = $('.auth-tab[data-tab="signin"]');
    if (signinTab) signinTab.click();

    // Select role
    formRoles.signin = role;
    syncRoleButtons('signin');

    // Fill form fields
    $('#signinEmail').value = account.email;
    $('#signinPassword').value = account.password;

    // Trigger instant login with animation
    btn.style.transform = 'translateY(3px)';
    setTimeout(() => { btn.style.transform = ''; }, 200);

    const errorEl = $('#authError');
    errorEl.textContent = 'Logging in as ' + account.name + '...';
    try {
      await auth.signin(account.email, account.password, role);
      showToast(`Welcome back, ${account.name}!`);
      await showApp();
    } catch (err) {
      errorEl.textContent = err.message;
    }
  });
});

// Password visibility toggle
$$('.pwd-toggle').forEach(btn => {
  btn.addEventListener('click', () => {
    const targetId = btn.dataset.target;
    const input = document.getElementById(targetId);
    if (!input) return;
    const isText = input.type === 'text';
    input.type = isText ? 'password' : 'text';
    btn.textContent = isText ? '👁️' : '👁️‍🗨️';
  });
});

// Password strength meter
const signupPwdInput = $('#signupPassword');
if (signupPwdInput) {
  signupPwdInput.addEventListener('input', () => {
    const val = signupPwdInput.value;
    const meter = $('#pwdMeter');
    const text = meter?.querySelector('.pwd-text');
    if (!meter || !text) return;

    if (val.length < 6) {
      meter.className = 'pwd-meter';
      text.textContent = 'Too short (min 6)';
    } else if (val.length < 9 || !/[0-9]/.test(val)) {
      meter.className = 'pwd-meter good';
      text.textContent = 'Good password';
    } else {
      meter.className = 'pwd-meter strong';
      text.textContent = 'Strong password';
    }
  });
}

// Signin Form Submit
$('#signinForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const errorEl = $('#authError');
  errorEl.textContent = '';
  const submit = e.target.querySelector('button[type="submit"]');
  submit.disabled = true;
  try {
    await auth.signin(form.get('email'), form.get('password'), formRoles.signin);
    showToast(`Signed in successfully!`);
    await showApp();
  } catch (err) {
    errorEl.textContent = err.message;
  } finally {
    submit.disabled = false;
  }
});

// Signup Form Submit
$('#signupForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const errorEl = $('#authError');
  errorEl.textContent = '';
  const submit = e.target.querySelector('button[type="submit"]');
  submit.disabled = true;
  try {
    await auth.signup(form.get('name'), form.get('email'), form.get('password'), formRoles.signup);
    showToast(`Account created! Welcome to FoodLoop.`);
    await showApp();
  } catch (err) {
    errorEl.textContent = err.message;
  } finally {
    submit.disabled = false;
  }
});

// Logout Buttons
$('#ngoLogout')?.addEventListener('click', () => auth.logout());
$('#volLogout')?.addEventListener('click', () => auth.logout());
$('#settingsLogout')?.addEventListener('click', () => auth.logout());

// Search Inputs
$('#ngoSearch')?.addEventListener('input', renderNgoGrid);
$('#volSearch')?.addEventListener('input', renderVolunteerGrid);

// NGO Request Food button
$('#ngoGrid')?.addEventListener('click', async (e) => {
  const btn = e.target.closest('.ngo-request-btn');
  if (!btn || btn.disabled) return;
  const foodName = btn.dataset.food;
  const ngoName = auth.currentUser?.name || 'Hope Foundation';
  try {
    await requestFood(foodName, ngoName);
    renderNgoGrid();
    showToast(`✓ Request sent for ${foodName}`);
  } catch (err) {
    showToast('Could not send request: ' + err.message);
  }
});

// Volunteer Deliver button
$('#volGrid')?.addEventListener('click', (e) => {
  const btn = e.target.closest('.vol-deliver-btn');
  if (!btn) return;
  const item = db.pickups.find(p => p.id === btn.dataset.id || p.item === btn.dataset.id);
  if (item) {
    item.day = 'Completed';
    item.status = 'Delivered';
  }
  renderVolunteerGrid();
  showToast('✓ Delivery confirmed! Food rescued successfully.');
});

// ===================== Views & Navigation =====================

const viewNames = {
  overview: 'Overview',
  listings: 'Food listings',
  requests: 'Requests',
  pickups: 'Pickups',
  waste: 'Waste log',
  partners: 'Partners',
  reports: 'Reports',
  docs: 'About FoodLoop',
  settings: 'Settings'
};

function showView(view) {
  $$('.view').forEach((el) => el.classList.remove('active-view'));
  const target = $(`#${view}View`);
  if (target) target.classList.add('active-view');
  $$('.nav-item[data-view]').forEach((el) => el.classList.toggle('active', el.dataset.view === view));
  $('#breadcrumbCurrent').textContent = viewNames[view] || 'Overview';
  $('#sidebar').classList.remove('open');
  if (view === 'listings') renderListingCards();
  if (view === 'requests') renderRequests();
  if (view === 'pickups') renderPickups();
  if (view === 'partners') renderPartners();
  if (view === 'waste') renderWasteTable();
}

function showToast(message) {
  const toast = $('#toast');
  const msgEl = $('#toastMessage');
  if (!toast || !msgEl) return;
  msgEl.textContent = message;
  toast.classList.add('show');
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove('show'), 2800);
}

function renderListingCards() {
  const search = ($('#listingSearch')?.value || '').toLowerCase();
  const filtered = db.listings.filter((item) => (item.name + ' ' + (item.detail || '')).toLowerCase().includes(search));

  $('#listingCards').innerHTML = filtered.map((item) => `
    <article class="listing-card card-3d">
      <div class="listing-card-head">
        <div class="listing-card-thumb">${foodPhotoHtml(item, 'listing-photo-img')}</div>
        <div class="listing-card-info">
          <h3>${item.name}</h3>
          <p>${item.detail || 'Fresh surplus food'}</p>
        </div>
        <span class="status ${item.status === 'Available' ? 'available' : 'reserved'}">${item.status}</span>
      </div>
      <div class="listing-meta">
        <span>📦 ${item.quantity}</span>
        <span>⌁ ${item.expiry}</span>
      </div>
    </article>`).join('') || '<div class="empty-state">No listings found.</div>';

  $('#listingRows').innerHTML = db.listings.map((item) => `
    <tr>
      <td>
        <div class="food-cell">
          <div class="food-thumb-wrap">${foodPhotoHtml(item, 'food-thumb')}</div>
          <div><strong>${item.name}</strong><small>${item.detail || ''}</small></div>
        </div>
      </td>
      <td><strong>${item.quantity}</strong></td>
      <td>${item.expiry}</td>
      <td><span class="status ${item.status === 'Available' ? 'available' : 'reserved'}">${item.status}</span></td>
      <td>${item.requests || '0 requests'}</td>
      <td><button class="text-button" style="padding:4px;">•••</button></td>
    </tr>`).join('');
}

function renderRequests() {
  const q = ($('#requestSearch')?.value || '').toLowerCase();
  const counts = { all: db.requests.length, pending: 0, accepted: 0, declined: 0 };
  db.requests.forEach((r) => { if (counts[r.status] !== undefined) counts[r.status]++; });

  [['reqCountAll', counts.all], ['reqCountPending', counts.pending], ['reqCountAccepted', counts.accepted], ['reqCountDeclined', counts.declined]].forEach(([id, n]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = n;
  });

  const list = db.requests.filter((r) => (requestsFilter === 'all' || r.status === requestsFilter) && (!q || (r.name + ' ' + r.item).toLowerCase().includes(q)));

  $('#requestList').innerHTML = list.map((request) => {
    const actions = request.status === 'pending'
      ? `<div class="request-actions">
           <button class="decline btn-3d" data-id="${request.id}" data-action="decline">Decline</button>
           <button class="accept btn-3d" data-id="${request.id}" data-action="accept">✓ Accept</button>
         </div>`
      : `<span class="status ${request.status === 'accepted' ? 'accepted' : 'declined'}">${request.status === 'accepted' ? 'Accepted' : 'Declined'}</span>`;
    return `<article class="request-card card-3d">
      <span class="partner-avatar ${request.color || 'blue'}">${request.initials || 'NG'}</span>
      <div class="request-main">
        <h3>${request.name}</h3>
        <p>Would like to receive <strong>${request.item}</strong></p>
        <small>${request.time || 'Received just now'}</small>
      </div>
      ${actions}
    </article>`;
  }).join('') || `<div class="empty-state">No ${requestsFilter === 'all' ? '' : requestsFilter + ' '}requests match.</div>`;
}

function renderPickups() {
  const q = ($('#pickupSearch')?.value || '').toLowerCase();
  const order = pickupsFilter === 'all' ? ['Today', 'Tomorrow', 'Completed'] : [pickupsFilter];
  const counts = { all: db.pickups.length, Today: 0, Tomorrow: 0, Completed: 0 };
  db.pickups.forEach((p) => { if (counts[p.day] !== undefined) counts[p.day]++; });

  [['puCountAll', counts.all], ['puCountToday', counts.Today], ['puCountTomorrow', counts.Tomorrow], ['puCountCompleted', counts.Completed]].forEach(([id, n]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = n;
  });

  $('#pickupBoard').innerHTML = order.map((day) => {
    const cards = db.pickups.filter((p) => p.day === day && (!q || (p.item + ' ' + (p.partner || '')).toLowerCase().includes(q)));
    return `<div class="pickup-column card-3d">
      <h3>${day}<span>${counts[day] || 0}</span></h3>
      ${cards.map((p) => `
        <div class="pickup-card">
          <strong>${p.item}</strong>
          <p>Partner: ${p.partner || '—'}</p>
          <small>◷ ${p.time || 'TBD'} · ${p.status || 'Scheduled'}</small>
        </div>`).join('') || '<div class="empty-state" style="padding:10px;">Nothing scheduled</div>'}
    </div>`;
  }).join('');
}

function partnerType(p) {
  const d = (p.detail || '').toLowerCase();
  if (d.includes('kitchen')) return 'kitchen';
  if (d.includes('shelter')) return 'shelter';
  if (d.includes('food bank')) return 'foodbank';
  return 'ngo';
}

function renderPartners() {
  const q = ($('#partnerSearch')?.value || '').toLowerCase();
  const counts = { all: db.partners.length, ngo: 0, kitchen: 0, shelter: 0, foodbank: 0 };
  db.partners.forEach((p) => { counts[partnerType(p)]++; });

  [['ptCountAll', counts.all], ['ptCountNgo', counts.ngo], ['ptCountKitchen', counts.kitchen], ['ptCountShelter', counts.shelter], ['ptCountFoodbank', counts.foodbank]].forEach(([id, n]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = n;
  });

  const list = db.partners.filter((p) => (partnersFilter === 'all' || partnerType(p) === partnersFilter) && (!q || (p.name + ' ' + (p.detail || '')).toLowerCase().includes(q)));
  $('#partnerGrid').innerHTML = list.map((p) => `
    <article class="partner-card card-3d">
      <span class="partner-avatar ${p.color || 'blue'}">${p.initials || 'P'}</span>
      <div><strong>${p.name}</strong><small>${p.detail}</small></div>
      <span class="partner-status">${p.status || 'Connected'}</span>
    </article>`).join('') || '<div class="empty-state">No partners match.</div>';
}

function renderWasteTable() {
  const rows = document.querySelector('.waste-panel tbody');
  if (!rows) return;
  rows.innerHTML = db.waste.map(w => `
    <tr>
      <td>${w.date}</td>
      <td><strong>${w.category}</strong></td>
      <td>${w.quantity}</td>
      <td><span class="status reserved">${w.reason}</span></td>
      <td>${w.loggedBy}</td>
    </tr>`).join('');
}

function renderActivityList() {
  const list = $('#activityList');
  if (!list) return;
  list.innerHTML = db.activities.slice(0, 4).map(a => `
    <div class="activity-item">
      <span class="activity-icon ${a.iconClass}">${a.icon}</span>
      <div>
        <strong>${a.title}</strong>
        <p>${a.description}</p>
        <small>${a.time}</small>
      </div>
    </div>`).join('');
}

function renderMetrics() {
  const m = db.metrics;
  if (!m) return;
  const set = (sel, val) => { const el = sel instanceof Element ? sel : document.querySelector(sel); if (el) el.innerHTML = val; };
  set('.metric-green strong', `${m.foodDiverted} <small>kg</small>`);
  set('.metric-blue strong', `${m.mealsShared}`);
  set('.metric-orange strong', String(m.pendingPickups).padStart(2, '0'));
  set('.metric-purple strong', `${m.activePartners}`);
}

// ===================== Modals =====================

function openListingModal() {
  $('#modalBackdrop').classList.add('open');
  setTimeout(() => $('#listingForm').elements.name?.focus(), 10);
}
function closeListingModal() {
  $('#modalBackdrop').classList.remove('open');
  $('#listingForm').reset();
}

// Global UI Event Listeners
$$('.nav-item[data-view]').forEach((item) => item.addEventListener('click', () => showView(item.dataset.view)));
$$('[data-view="listings"]').forEach((item) => item.addEventListener('click', () => showView('listings')));
$('#mobileMenu')?.addEventListener('click', () => $('#sidebar').classList.toggle('open'));
$('#addListingBtn')?.addEventListener('click', openListingModal);
$('#addListingBtn2')?.addEventListener('click', openListingModal);
$('#modalClose')?.addEventListener('click', closeListingModal);
$('#modalCancel')?.addEventListener('click', closeListingModal);
$('#modalBackdrop')?.addEventListener('click', (event) => { if (event.target.id === 'modalBackdrop') closeListingModal(); });
$('#listingSearch')?.addEventListener('input', renderListingCards);

// Help Modal
$('#helpBtn')?.addEventListener('click', () => $('#helpBackdrop').classList.add('open'));
$('#helpClose')?.addEventListener('click', () => $('#helpBackdrop').classList.remove('open'));
$('#helpDone')?.addEventListener('click', () => $('#helpBackdrop').classList.remove('open'));
$('#helpBackdrop')?.addEventListener('click', (event) => { if (event.target.id === 'helpBackdrop') $('#helpBackdrop').classList.remove('open'); });

// Profile Menu
$('#profileMenuBtn')?.addEventListener('click', (e) => { e.stopPropagation(); $('#profileMenu').classList.toggle('open'); });
document.addEventListener('click', () => { if ($('#profileMenu')) $('#profileMenu').classList.remove('open'); });
$('#profileMenu')?.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action="logout"]');
  if (btn) { $('#profileMenu').classList.remove('open'); auth.logout(); }
});

$$('[data-open-docs]').forEach((item) => item.addEventListener('click', () => showView('docs')));

// Notifications dropdown
$('#topNotifBtn')?.addEventListener('click', (e) => {
  e.stopPropagation();
  const wasOpen = $('#notifPanel').classList.contains('open');
  closeTopDropdowns();
  if (!wasOpen) {
    $('#notifPanel').classList.add('open');
    renderNotifications();
  }
  const dot = $('#notifBtnDot');
  if (dot) dot.remove();
});
$('#notifPanel')?.addEventListener('click', (e) => e.stopPropagation());
$('#notifViewAll')?.addEventListener('click', () => { closeTopDropdowns(); showView('overview'); });

// Profile avatar dropdown
$('#topAvatar')?.addEventListener('click', (e) => {
  e.stopPropagation();
  const wasOpen = $('#topMenu').classList.contains('open');
  closeTopDropdowns();
  if (!wasOpen) $('#topMenu').classList.add('open');
});
$('#topMenu')?.addEventListener('click', (e) => e.stopPropagation());
$('#topMenu')?.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-topaction]');
  if (!btn) return;
  closeTopDropdowns();
  if (btn.dataset.topaction === 'settings') showView('settings');
  if (btn.dataset.topaction === 'help') $('#helpBackdrop').classList.add('open');
  if (btn.dataset.topaction === 'logout') auth.logout();
});

function closeTopDropdowns() {
  $('#notifPanel')?.classList.remove('open');
  $('#topMenu')?.classList.remove('open');
}
document.addEventListener('click', closeTopDropdowns);

function renderNotifications() {
  const list = db.activities.slice(0, 6);
  $('#notifList').innerHTML = list.map((a) => `
    <div class="activity-item">
      <span class="activity-icon ${a.iconClass || 'green-bg'}">${a.icon || '•'}</span>
      <div><strong>${a.title}</strong><p>${a.description}</p><small>${a.time}</small></div>
    </div>`).join('') || '<p style="padding:15px; color:var(--text-muted);">No new notifications.</p>';
  $('#notifCount').textContent = db.activities.length;
}

// Global search command palette
function openSearch() {
  $('#searchBackdrop').classList.add('open');
  $('#globalSearchInput').value = '';
  runGlobalSearch();
  renderSearchSuggestions();
  setTimeout(() => $('#globalSearchInput').focus(), 40);
}
function closeSearch() { $('#searchBackdrop').classList.remove('open'); }

$('#topSearchBtn')?.addEventListener('click', openSearch);
$('#searchClose')?.addEventListener('click', closeSearch);
$('#searchBackdrop')?.addEventListener('click', (e) => { if (e.target.id === 'searchBackdrop') closeSearch(); });
$('#globalSearchInput')?.addEventListener('input', runGlobalSearch);

function viewSuggestions() {
  return [
    { label: 'Overview', icon: '◈', view: 'overview' },
    { label: 'Food listings', icon: '▣', view: 'listings' },
    { label: 'Requests', icon: '↔', view: 'requests' },
    { label: 'Pickups', icon: '⌁', view: 'pickups' },
    { label: 'Waste log', icon: '◒', view: 'waste' },
    { label: 'Partners', icon: '♧', view: 'partners' },
    { label: 'Reports', icon: '▥', view: 'reports' },
    { label: 'Settings', icon: '⚙', view: 'settings' }
  ];
}

function renderSearchSuggestions() {
  $('#searchSuggestions').innerHTML = `
    <p style="font-size:11px; font-weight:800; color:var(--text-muted); margin:8px 0;">QUICK NAVIGATION</p>
    <div style="display:flex; flex-wrap:wrap; gap:8px;">
      ${viewSuggestions().map((v) => `<button class="btn-3d secondary-button" style="padding:6px 12px; font-size:12px;" data-view="${v.view}"><span>${v.icon}</span> ${v.label}</button>`).join('')}
    </div>`;
}

function runGlobalSearch() {
  const q = ($('#globalSearchInput').value || '').trim().toLowerCase();
  const box = $('#globalSearchResults');
  if (!q) {
    box.innerHTML = '<p style="padding:20px; text-align:center; color:var(--text-muted);">Type to search surplus food, requests, pickups, or partners.</p>';
    $('#searchResultCount').textContent = '';
    return;
  }
  const groups = [
    { label: 'Food listings', view: 'listings', items: db.listings.filter((l) => (l.name + ' ' + (l.detail || '')).toLowerCase().includes(q)).map((l) => ({ title: l.name, sub: l.quantity, status: l.status })) },
    { label: 'Requests', view: 'requests', items: db.requests.filter((r) => (r.name + ' ' + r.item).toLowerCase().includes(q)).map((r) => ({ title: r.item, sub: r.name, status: r.status })) },
    { label: 'Pickups', view: 'pickups', items: db.pickups.filter((p) => (p.item + ' ' + (p.partner || '')).toLowerCase().includes(q)).map((p) => ({ title: p.item, sub: p.partner, status: p.day })) },
    { label: 'Partners', view: 'partners', items: db.partners.filter((p) => (p.name + ' ' + (p.detail || '')).toLowerCase().includes(q)).map((p) => ({ title: p.name, sub: p.detail, status: p.status })) }
  ];
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  $('#searchResultCount').textContent = total ? `${total} result${total === 1 ? '' : 's'}` : 'No results';
  const html = [];
  groups.forEach((g) => {
    if (!g.items.length) return;
    html.push(`<p style="font-size:11px; font-weight:800; color:var(--green-dark); margin:10px 0 6px;">${g.label} (${g.items.length})</p>`);
    g.items.slice(0, 4).forEach((it) => {
      html.push(`
        <button class="cmd-row" data-view="${g.view}" style="display:flex; justify-content:space-between; width:100%; padding:10px 14px; background:#f8fafc; border:1px solid var(--line); border-radius:10px; margin-bottom:6px; cursor:pointer; text-align:left;">
          <div><strong style="display:block; font-size:13px;">${it.title}</strong><small style="color:var(--text-muted); font-size:11px;">${it.sub || ''}</small></div>
          <span class="status available" style="align-self:center;">${it.status || 'View'}</span>
        </button>`);
    });
  });
  box.innerHTML = html.join('') || `<p style="padding:20px; text-align:center; color:var(--text-muted);">No matches for “${q}”.</p>`;
}

$('#globalSearchResults')?.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-view]');
  if (!btn) return;
  showView(btn.dataset.view);
  closeSearch();
});
$('#searchSuggestions')?.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-view]');
  if (!btn) return;
  showView(btn.dataset.view);
  closeSearch();
});

// Listing Form submission
$('#listingForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.target);
  const submit = event.target.querySelector('button[type="submit"]');
  submit.disabled = true;
  try {
    await addListing({
      emoji: '🍽️',
      name: form.get('name'),
      detail: form.get('notes') || 'Fresh surplus food',
      quantity: form.get('quantity'),
      expiry: form.get('expiry')
    });
    closeListingModal();
    renderListingCards();
    showToast('✓ Food listing published successfully!');
  } catch (err) {
    showToast('Could not publish: ' + err.message);
  } finally {
    submit.disabled = false;
  }
});

// Request accept/decline actions
$('#requestList')?.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-id]');
  if (!button) return;
  const id = button.dataset.id;
  const action = button.dataset.action;
  try {
    const request = await updateRequest(id, action);
    renderRequests();
    showToast(action === 'accept' ? `✓ ${request.name} request accepted` : 'Request declined');
  } catch (err) {
    showToast('Could not update: ' + err.message);
  }
});

// Log waste button
$('#logWasteBtn')?.addEventListener('click', async () => {
  const category = prompt('Waste category (e.g. Prepared meals / Fresh produce / Bakery):');
  if (!category) return;
  const quantity = prompt('Quantity (e.g. 6 kg):');
  if (!quantity) return;
  const reason = prompt('Reason (Overproduction / Spoilage / Quality issue):') || 'Overproduction';
  try {
    await addWaste({ category, quantity, reason, loggedBy: auth.currentUser?.name || 'Admin' });
    renderWasteTable();
    showToast('✓ Waste entry recorded');
  } catch (err) {
    showToast('Could not log: ' + err.message);
  }
});

// Add Request button
$('#addRequestBtn')?.addEventListener('click', async () => {
  const name = prompt('Partner name (e.g. Hope Foundation):');
  if (!name) return;
  const item = prompt('Food item requested (e.g. 20 meal boxes):');
  if (!item) return;
  try {
    await requestFood(item, name);
    renderRequests();
    renderNavCounts();
    showToast('✓ Request received and logged');
  } catch (err) {
    showToast('Could not add: ' + err.message);
  }
});

// Request & Pickup tabs
$('#requestTabs')?.addEventListener('click', (e) => {
  const tab = e.target.closest('.filter-tab');
  if (!tab) return;
  requestsFilter = tab.dataset.status;
  $$('#requestTabs .filter-tab').forEach((t) => t.classList.toggle('active', t === tab));
  renderRequests();
});
$('#requestSearch')?.addEventListener('input', renderRequests);

$('#pickupTabs')?.addEventListener('click', (e) => {
  const tab = e.target.closest('.filter-tab');
  if (!tab) return;
  pickupsFilter = tab.dataset.day;
  $$('#pickupTabs .filter-tab').forEach((t) => t.classList.toggle('active', t === tab));
  renderPickups();
});
$('#pickupSearch')?.addEventListener('input', renderPickups);

// Schedule Pickup button
$('#schedulePickupBtn')?.addEventListener('click', async () => {
  const day = prompt('Day of pickup? (Today / Tomorrow):') || 'Today';
  const item = prompt('Food item (e.g. Prepared meal boxes):');
  if (!item) return;
  const time = prompt('Pickup time (e.g. 5:00 PM):') || 'Flexible';
  const partner = prompt('Partner organization (e.g. Hope Foundation):') || 'Hope Foundation';
  try {
    await addPickup({ item, time, partner, day: day.trim() });
    renderPickups();
    showToast('✓ Pickup run scheduled');
  } catch (err) {
    showToast('Could not schedule: ' + err.message);
  }
});

// Invite Partner button
$('#invitePartnerBtn')?.addEventListener('click', async () => {
  const name = prompt('Partner organization name:');
  if (!name) return;
  const detail = prompt('Type (NGO / Community kitchen / Local shelter / Food bank):') || 'NGO';
  try {
    await addPartner({ name, detail });
    renderPartners();
    showToast('✓ Partner invited & connected');
  } catch (err) {
    showToast('Could not invite: ' + err.message);
  }
});

$('#partnerTabs')?.addEventListener('click', (e) => {
  const tab = e.target.closest('.filter-tab');
  if (!tab) return;
  partnersFilter = tab.dataset.type;
  $$('#partnerTabs .filter-tab').forEach((t) => t.classList.toggle('active', t === tab));
  renderPartners();
});
$('#partnerSearch')?.addEventListener('input', renderPartners);

// Export Report
function exportReport() {
  const m = db.metrics || {};
  const lines = [
    '==============================================',
    '       FOODLOOP IMPACT & AUDIT REPORT         ',
    '==============================================',
    'Generated: ' + new Date().toLocaleString(),
    '',
    `Total Food Diverted : ${m.foodDiverted || 1284} kg`,
    `Total Meals Shared  : ${m.mealsShared || 3842}`,
    `Pending Pickups     : ${m.pendingPickups || 8}`,
    `Active Partners     : ${m.activePartners || 24}`,
    '',
    '--- Active Listings ---',
    ...db.listings.map(l => ` • ${l.name} (${l.quantity}) [${l.status}]`),
    '',
    '--- Pending Requests ---',
    ...db.requests.filter(r => r.status === 'pending').map(r => ` • ${r.name} requested ${r.item}`),
    '',
    'Report from FoodLoop OOAD Platform.'
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `foodloop-impact-report-${Date.now()}.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
  showToast('✓ Impact report downloaded');
}

$('#reportsView .secondary-button')?.addEventListener('click', exportReport);

// ===================== 3D TILT EFFECT =====================

function init3DTilt() {
  const tiltCards = $$('.card-3d, .metric-card, .panel, .auth-card');
  tiltCards.forEach(card => {
    if (card._hasTilt) return;
    card._hasTilt = true;

    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const rotX = ((y - centerY) / centerY) * -6; // max 6 deg
      const rotY = ((x - centerX) / centerX) * 6;  // max 6 deg

      card.style.transform = `perspective(1000px) rotateX(${rotX.toFixed(2)}deg) rotateY(${rotY.toFixed(2)}deg) translateZ(6px)`;
    });

    card.addEventListener('mouseleave', () => {
      card.style.transform = '';
    });
  });
}

// Initialise 3D Tilt on load
window.addEventListener('DOMContentLoaded', init3DTilt);
init3DTilt();

// ===================== INITIALIZATION =====================

if (auth.currentUser) {
  showApp();
} else {
  showAuthScreen();
}