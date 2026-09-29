const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

// ============================================================
//  Data layer — everything is read from / written to MongoDB
//  via the Express API. No hardcoded demo state.
// ============================================================

const API_URL = (window.FOODLOOP_API || 'http://localhost:5000/api').replace(/\/$/, '');

// Local mirror of the MongoDB collections (loaded from /api/bootstrap).
const db = {
  listings: [],
  requests: [],
  ngoRequests: [],
  pickups: [],
  partners: [],
  waste: [],
  activities: [],
  metrics: null
};

// Active toolbar filters for the Requests / Pickups views.
let requestsFilter = 'all';
let pickupsFilter = 'all';
let partnersFilter = 'all';

async function api(path, options = {}) {
  const res = await fetch(API_URL + path, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `API error ${res.status}`);
  return data;
}

// Load all collections from MongoDB and re-render everything.
async function loadData() {
  try {
    const data = await api('/bootstrap');
    db.listings = data.listings || [];
    db.requests = data.requests || [];
    db.ngoRequests = data.ngoRequests || [];
    db.pickups = data.pickups || [];
    db.partners = data.partners || [];
    db.waste = data.waste || [];
    db.activities = data.activities || [];
    db.metrics = data.metrics || null;

    renderListingCards();
    renderRequests();
    renderPickups();
    renderPartners();
    renderWasteTable();
    renderActivityList();
    renderMetrics();
    renderNavCounts();
    renderScenePhotos();
    if (auth.currentUser?.role === 'ngo') renderNgoGrid();
  } catch (err) {
    showToast(backendHint());
  }
}

// Live refresh — pull fresh entries from MongoDB every 15s so new requests and
// pickups appear without reloading the page.
let livePollTimer = null;
function startLivePolling() {
  if (livePollTimer) return;
  livePollTimer = window.setInterval(async () => {
    try {
      const data = await api('/bootstrap');
      db.listings = data.listings || [];
      db.requests = data.requests || [];
      db.ngoRequests = data.ngoRequests || [];
      db.pickups = data.pickups || [];
      db.partners = data.partners || [];
      db.waste = data.waste || [];
      db.activities = data.activities || [];
      db.metrics = data.metrics || null;
      const active = ($$('.view.active-view')[0] || {}).id;
      if (active === 'requestsView') renderRequests();
      if (active === 'pickupsView') renderPickups();
      if (active === 'listingsView') renderListingCards();
      if (active === 'partnersView') renderPartners();
      renderNavCounts();
    } catch (err) { /* keep last known-good data while the backend is unreachable */ }
  }, 15000);
}

// Render a food photo with a graceful emoji fallback if the image is missing
// or fails to load — a broken photo never leaves a blank tile.
function foodPhotoHtml(item, cls) {
  const fallback = `<span class="food-photo-fallback">${item.emoji || '🍽️'}</span>`;
  if (!item.image) return fallback;
  const lazy = cls.includes('thumb') ? '' : ' loading="lazy"';
  return `${fallback}<img class="${cls}" src="${item.image}" alt="${item.name}"${lazy} onerror="this.remove()">`;
}

// Overview hero — real photos of the latest listings instead of a 3D animation.
function renderScenePhotos() {
  const el = $('#scenePhotos');
  if (!el) return;
  const items = db.listings.slice(0, 3);
  el.innerHTML = items.map((item) => `
    <figure class="scene-photo">${foodPhotoHtml(item, 'scene-photo-img')}<figcaption><strong>${item.name}</strong><small>${item.quantity}</small></figcaption></figure>`).join('') || '<span class="food-photo-fallback">🍽️</span>';
}

// Live counts for the sidebar (Food listings, Requests) from MongoDB.
function renderNavCounts() {
  const lc = document.getElementById('navListingsCount');
  if (lc) lc.textContent = db.listings.length;
  const rc = document.getElementById('navRequestsCount');
  if (rc) rc.textContent = db.requests.filter(r => r.status === 'pending').length;
}

async function addListing({ emoji, name, detail, quantity, expiry }) {
  const { listing } = await api('/listings', {
    method: 'POST',
    body: JSON.stringify({ emoji, name, detail, quantity, expiry })
  });
  db.listings = [listing, ...db.listings];
  return listing;
}

async function requestFood(foodName, ngoName) {
  const { request } = await api('/requests', {
    method: 'POST',
    body: JSON.stringify({ name: ngoName, item: foodName })
  });
  db.requests = [request, ...db.requests];
  db.ngoRequests.push({ foodName });
  return request;
}

async function updateRequest(id, action) {
  const { request } = await api(`/requests/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ action })
  });
  db.requests = db.requests.map(r => (r.id === id ? request : r));
  return request;
}

async function addWaste(entry) {
  const { waste } = await api('/waste', {
    method: 'POST',
    body: JSON.stringify(entry)
  });
  db.waste = [waste, ...db.waste];
}

async function addPickup(p) {
  const { pickup } = await api('/pickups', {
    method: 'POST',
    body: JSON.stringify(p)
  });
  db.pickups.push(pickup);
}

async function addPartner(p) {
  const { partner } = await api('/partners', {
    method: 'POST',
    body: JSON.stringify(p)
  });
  db.partners.push(partner);
}

function backendHint() {
  if (location.protocol === 'file:') {
    return 'Open the app through a local web server, not by double-clicking index.html. ' +
           'Run "python -m http.server 8000" in the project folder and visit http://localhost:8000';
  }
  if (!/^https?:$/.test(location.protocol)) {
    return 'This page is served over ' + location.protocol + ', which blocks API requests.';
  }
  if (location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
    return 'This page is hosted at ' + location.hostname + ', so "localhost:5000" is not reachable. ' +
           'Set window.FOODLOOP_API in config.js to a public backend URL.';
  }
  return 'Cannot reach the server. Start it with "npm start" in the project folder.';
}

// ===================== Auth =====================

const auth = {
  currentUser: JSON.parse(localStorage.getItem('foodloop_session') || 'null'),

  saveSession() { localStorage.setItem('foodloop_session', JSON.stringify(this.currentUser)); },
  clearSession() { localStorage.removeItem('foodloop_session'); this.currentUser = null; },

  async signup(name, email, password, role) {
    const data = await api('/signup', {
      method: 'POST',
      body: JSON.stringify({ name, email, password, role })
    });
    this.currentUser = data.user;
    this.saveSession();
    return { success: true };
  },

  async signin(email, password, role) {
    const data = await api('/signin', {
      method: 'POST',
      body: JSON.stringify({ email, password, role })
    });
    this.currentUser = data.user;
    this.saveSession();
    return { success: true };
  },

  logout() { this.clearSession(); showAuthScreen(); }
};

function showAuthScreen() {
  $('#authScreen').classList.remove('hidden');
  $('#appShell').classList.add('hidden');
  $('#ngoDashboard').classList.add('hidden');
}

async function showApp() {
  $('#authScreen').classList.add('hidden');
  if (auth.currentUser?.role === 'ngo') {
    $('#appShell').classList.add('hidden');
    $('#ngoDashboard').classList.remove('hidden');
    renderNgoDashboard();
  } else {
    $('#appShell').classList.remove('hidden');
    $('#ngoDashboard').classList.add('hidden');
  }
  renderProfile();
  await loadData();
  startLivePolling();
}

// Fill the dashboard with the logged-in user's details
// instead of the hardcoded demo persona (Priya Varma / Harbor House).
function renderProfile() {
  const user = auth.currentUser;
  if (!user) return;

  const displayName = user.name;
  const firstName = displayName.split(/\s+/)[0] || displayName;
  const initials = displayName.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';
  const roleLabel = user.role === 'ngo' ? 'NGO' : 'Admin';

  const set = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };

  set('welcomeName', firstName);
  set('sceneProviderName', displayName);
  set('wsName', displayName);
  set('wsAvatar', initials);
  set('profileName', displayName);
  set('profileRole', roleLabel);
  set('profileAvatar', initials);
  set('topAvatar', initials);
  set('settingsName', displayName);
  set('settingsEmail', user.email);
  set('settingsAvatar', initials);
  set('settingsRole', roleLabel);
  set('settingsApi', API_URL.replace(/\/api$/, ''));
  set('settingsName2', displayName);
  set('settingsEmail2', user.email);
  set('settingsRole2', roleLabel);
  const joined = user.createdAt ? new Date(user.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : '—';
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
  const available = db.listings.filter(item => item.status === 'Available' && item.name.toLowerCase().includes(search));
  const requested = new Set(db.ngoRequests.map(r => r.foodName));

  $('#ngoGrid').innerHTML = available.map((item) => {
    const isRequested = requested.has(item.name);
    return `<article class="ngo-card">
      <div class="ngo-card-head">
        <div class="ngo-card-thumb">${foodPhotoHtml(item, 'ngo-photo-img')}</div>
        <div class="ngo-card-title"><h3>${item.name}</h3><p class="ngo-detail">${item.detail}</p></div>
        <span class="status available">${item.status}</span>
      </div>
      <div class="ngo-meta"><span>${item.quantity}</span><span>⌁ ${item.expiry}</span></div>
      <button class="ngo-request-btn ${isRequested ? 'requested' : ''}" data-food="${item.name}" ${isRequested ? 'disabled' : ''}>
        ${isRequested ? '✓ Request sent' : 'Request this food'}
      </button>
    </article>`;
  }).join('') || '<div class="ngo-empty">No available food matches your search.</div>';
}

// ===================== Auth Event Handlers =====================

const formRoles = { signin: 'admin', signup: 'admin' };

function syncRoleButtons(formName) {
  const role = formRoles[formName];
  $$(`#${formName}Form .role-btn`).forEach(b => {
    b.classList.toggle('active', b.dataset.role === role);
  });
}

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

$$('.role-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const form = btn.closest('.auth-form');
    const formName = form.id.replace('Form', '');
    formRoles[formName] = btn.dataset.role;
    syncRoleButtons(formName);
  });
});

$('#signinForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const errorEl = $('#authError');
  errorEl.textContent = '';
  const submit = e.target.querySelector('button[type="submit"]');
  submit.disabled = true;
  try {
    const result = await auth.signin(form.get('email'), form.get('password'), formRoles.signin);
    showApp();
  } catch (err) {
    errorEl.textContent = err.message;
  } finally {
    submit.disabled = false;
  }
});

$('#signupForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const errorEl = $('#authError');
  errorEl.textContent = '';
  const submit = e.target.querySelector('button[type="submit"]');
  submit.disabled = true;
  try {
    const result = await auth.signup(form.get('name'), form.get('email'), form.get('password'), formRoles.signup);
    showApp();
  } catch (err) {
    errorEl.textContent = err.message;
  } finally {
    submit.disabled = false;
  }
});

$('#ngoLogout').addEventListener('click', () => auth.logout());

$('#ngoSearch').addEventListener('input', renderNgoGrid);

$('#ngoGrid').addEventListener('click', async (e) => {
  const btn = e.target.closest('.ngo-request-btn');
  if (!btn || btn.disabled) return;
  const foodName = btn.dataset.food;
  const ngoName = auth.currentUser?.name || 'NGO';
  try {
    await requestFood(foodName, ngoName);
    renderNgoGrid();
    showToast(`Request sent for ${foodName}`);
  } catch (err) {
    showToast('Could not send request: ' + err.message);
  }
});

// ===================== Views =====================

const viewNames = { overview: 'Overview', listings: 'Food listings', requests: 'Requests', pickups: 'Pickups', waste: 'Waste log', partners: 'Partners', reports: 'Reports', docs: 'About FoodLoop', settings: 'Settings' };

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
  $('#toastMessage').textContent = message;
  $('#toast').classList.add('show');
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => $('#toast').classList.remove('show'), 2800);
}

function renderListingCards() {
  const search = ($('#listingSearch')?.value || '').toLowerCase();
  $('#listingCards').innerHTML = db.listings.filter((item) => item.name.toLowerCase().includes(search)).map((item) => `<article class="listing-card"><div class="listing-card-head"><div class="listing-card-thumb">${foodPhotoHtml(item, 'listing-photo-img')}</div><div class="listing-card-info"><h3>${item.name}</h3><p>${item.detail}</p></div><span class="status ${item.status === 'Available' ? 'available' : 'reserved'}">${item.status}</span></div><div class="listing-meta"><span>${item.quantity}</span><span>⌁ ${item.expiry}</span></div></article>`).join('') || '<div class="empty-state">No listings found.</div>';

  $('#listingRows').innerHTML = db.listings.map((item) => `<tr><td><div class="food-cell"><div class="food-thumb-wrap">${foodPhotoHtml(item, 'food-thumb')}</div><div><strong>${item.name}</strong><small>${item.detail}</small></div></div></td><td>${item.quantity}</td><td>${item.expiry}</td><td><span class="status ${item.status === 'Available' ? 'available' : 'reserved'}">${item.status}</span></td><td>${item.requests}</td><td><button class="row-menu">•••</button></td></tr>`).join('');
}

function renderRequests() {
  const q = ($('#requestSearch')?.value || '').toLowerCase();
  const counts = { all: db.requests.length, pending: 0, accepted: 0, declined: 0 };
  db.requests.forEach((r) => { if (counts[r.status] !== undefined) counts[r.status]++; });
  [['reqCountAll', counts.all], ['reqCountPending', counts.pending], ['reqCountAccepted', counts.accepted], ['reqCountDeclined', counts.declined]].forEach(([id, n]) => { const el = document.getElementById(id); if (el) el.textContent = n; });
  const list = db.requests.filter((r) => (requestsFilter === 'all' || r.status === requestsFilter) && (!q || (r.name + ' ' + r.item).toLowerCase().includes(q)));
  $('#requestList').innerHTML = list.map((request) => {
    const actions = request.status === 'pending'
      ? `<div class="request-actions"><button class="decline" data-id="${request.id}" data-action="decline">Decline</button><button class="accept" data-id="${request.id}" data-action="accept">Accept request</button></div>`
      : `<span class="status ${request.status === 'accepted' ? 'accepted' : 'declined'}">${request.status === 'accepted' ? 'Accepted' : 'Declined'}</span>`;
    return `<article class="request-card"><span class="partner-avatar ${request.color || 'blue'}">${request.initials || 'NG'}</span><div class="request-main"><h3>${request.name}</h3><p>Would like to receive <strong>${request.item}</strong></p><small>${request.time || 'Received just now'}</small></div>${actions}</article>`;
  }).join('') || `<div class="ngo-empty">No ${requestsFilter === 'all' ? '' : requestsFilter + ' '}requests match.</div>`;
}

function renderPickups() {
  const q = ($('#pickupSearch')?.value || '').toLowerCase();
  const order = pickupsFilter === 'all' ? ['Today', 'Tomorrow', 'Completed'] : [pickupsFilter];
  const counts = { all: db.pickups.length, Today: 0, Tomorrow: 0, Completed: 0 };
  db.pickups.forEach((p) => { if (counts[p.day] !== undefined) counts[p.day]++; });
  [['puCountAll', counts.all], ['puCountToday', counts.Today], ['puCountTomorrow', counts.Tomorrow], ['puCountCompleted', counts.Completed]].forEach(([id, n]) => { const el = document.getElementById(id); if (el) el.textContent = n; });
  $('#pickupBoard').innerHTML = order.map((day) => {
    const cards = db.pickups.filter((p) => p.day === day && (!q || (p.item + ' ' + (p.partner || '')).toLowerCase().includes(q)));
    return `<div class="pickup-column"><h3>${day}<span>${counts[day]}</span></h3>${cards.map((p) => `<div class="pickup-card"><strong>${p.item}</strong><p>${p.partner || '—'}</p><small>◷ ${p.time}</small></div>`).join('') || '<div class="ngo-empty">Nothing scheduled</div>'}</div>`;
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
  [['ptCountAll', counts.all], ['ptCountNgo', counts.ngo], ['ptCountKitchen', counts.kitchen], ['ptCountShelter', counts.shelter], ['ptCountFoodbank', counts.foodbank]].forEach(([id, n]) => { const el = document.getElementById(id); if (el) el.textContent = n; });
  const list = db.partners.filter((p) => (partnersFilter === 'all' || partnerType(p) === partnersFilter) && (!q || (p.name + ' ' + (p.detail || '')).toLowerCase().includes(q)));
  $('#partnerGrid').innerHTML = list.map((p) => `<article class="partner-card"><span class="partner-avatar ${p.color}">${p.initials}</span><div><strong>${p.name}</strong><small>${p.detail}</small></div><span class="partner-status">${p.status || 'Connected'}</span></article>`).join('') || '<div class="ngo-empty">No partners match.</div>';
}

function renderWasteTable() {
  const rows = document.querySelector('.waste-panel tbody');
  if (!rows) return;
  rows.innerHTML = db.waste.map(w => `<tr><td>${w.date}</td><td>${w.category}</td><td>${w.quantity}</td><td><span class="reason-pill">${w.reason}</span></td><td>${w.loggedBy}</td></tr>`).join('');
}

function renderActivityList() {
  const list = $('#activityList');
  if (!list) return;
  list.innerHTML = db.activities.slice(0, 4).map(a => `<div class="activity-item"><span class="activity-icon ${a.iconClass}">${a.icon}</span><div><strong>${a.title}</strong><p>${a.description}</p><small>${a.time}</small></div></div>`).join('');
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

// ===================== Modal (Add listing) =====================

function openListingModal() { $('#modalBackdrop').classList.add('open'); setTimeout(() => $('#listingForm').elements.name.focus(), 10); }
function closeListingModal() { $('#modalBackdrop').classList.remove('open'); $('#listingForm').reset(); }

// ===================== Global listeners =====================

$$('.nav-item[data-view]').forEach((item) => item.addEventListener('click', () => showView(item.dataset.view)));
$$('[data-view="listings"]').forEach((item) => item.addEventListener('click', () => showView('listings')));
$('#mobileMenu').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
$('#addListingBtn').addEventListener('click', openListingModal);
$('#addListingBtn2').addEventListener('click', openListingModal);
$('#modalClose').addEventListener('click', closeListingModal);
$('#modalCancel').addEventListener('click', closeListingModal);
$('#modalBackdrop').addEventListener('click', (event) => { if (event.target.id === 'modalBackdrop') closeListingModal(); });
$('#listingSearch').addEventListener('input', renderListingCards);

// ===================== Settings · Help · Log out =====================

// Help center modal
$('#helpBtn').addEventListener('click', () => $('#helpBackdrop').classList.add('open'));
$('#helpClose').addEventListener('click', () => $('#helpBackdrop').classList.remove('open'));
$('#helpDone').addEventListener('click', () => $('#helpBackdrop').classList.remove('open'));
$('#helpBackdrop').addEventListener('click', (event) => { if (event.target.id === 'helpBackdrop') $('#helpBackdrop').classList.remove('open'); });

// Log out — Settings page button and profile ••• menu
$('#settingsLogout').addEventListener('click', () => auth.logout());
$('#profileMenuBtn').addEventListener('click', (e) => { e.stopPropagation(); $('#profileMenu').classList.toggle('open'); });
document.addEventListener('click', () => { if ($('#profileMenu')) $('#profileMenu').classList.remove('open'); });
$('#profileMenu').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action="logout"]');
  if (btn) { $('#profileMenu').classList.remove('open'); auth.logout(); }
});

// Settings view — "Open project documentation" button
$$('[data-open-docs]').forEach((item) => item.addEventListener('click', () => showView('docs')));

// Notification toggles persist in localStorage
$$('.settings-toggle input').forEach((input) => {
  const stored = localStorage.getItem('foodloop_' + input.id);
  if (stored !== null) input.checked = stored === '1';
  input.addEventListener('change', () => localStorage.setItem('foodloop_' + input.id, input.checked ? '1' : '0'));
});

$('#listingForm').addEventListener('submit', async (event) => {
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
    showToast('Food listing published');
  } catch (err) {
    showToast('Could not publish: ' + err.message);
  } finally {
    submit.disabled = false;
  }
});

$('#requestList').addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-id]');
  if (!button) return;
  const id = button.dataset.id;
  const action = button.dataset.action;
  try {
    const request = await updateRequest(id, action);
    renderRequests();
    showToast(action === 'accept' ? `${request.name} request accepted` : 'Request declined');
    await loadData();
  } catch (err) {
    showToast('Could not update: ' + err.message);
  }
});

$('#logWasteBtn').addEventListener('click', async () => {
  const category = prompt('Waste category (e.g. Fresh produce):');
  if (!category) return;
  const quantity = prompt('Quantity (e.g. 4 kg):');
  if (!quantity) return;
  const reason = prompt('Reason (Overproduction / Spoilage / Quality issue):') || 'Other';
  try {
    await addWaste({ category, quantity, reason, loggedBy: auth.currentUser?.name || 'Admin' });
    renderWasteTable();
    showToast('Waste entry logged');
  } catch (err) {
    showToast('Could not log: ' + err.message);
  }
});

// ===================== Requests · Pickups — live toolbars =====================

// Requests — add a request that lands in MongoDB
$('#addRequestBtn').addEventListener('click', async () => {
  const name = prompt('Requesting partner (e.g. Hope Foundation):');
  if (!name) return;
  const item = prompt('Food item requested (e.g. 18 kg fresh produce):');
  if (!item) return;
  try {
    await requestFood(item, name);
    renderRequests();
    renderNavCounts();
    showToast('Request received');
  } catch (err) {
    showToast('Could not add: ' + err.message);
  }
});

// Requests — status tabs
$('#requestTabs').addEventListener('click', (e) => {
  const tab = e.target.closest('.filter-tab');
  if (!tab) return;
  requestsFilter = tab.dataset.status;
  $$('#requestTabs .filter-tab').forEach((t) => t.classList.toggle('active', t === tab));
  renderRequests();
});
$('#requestSearch').addEventListener('input', renderRequests);

// Pickups — day tabs
$('#pickupTabs').addEventListener('click', (e) => {
  const tab = e.target.closest('.filter-tab');
  if (!tab) return;
  pickupsFilter = tab.dataset.day;
  $$('#pickupTabs .filter-tab').forEach((t) => t.classList.toggle('active', t === tab));
  renderPickups();
});
$('#pickupSearch').addEventListener('input', renderPickups);

// Schedule pickup — lands in MongoDB under the chosen day column
$('#schedulePickupBtn').addEventListener('click', async () => {
  const day = prompt('When is the pickup? (Today / Tomorrow):') || 'Today';
  const item = prompt('Food item (e.g. Fresh produce):');
  if (!item) return;
  const time = prompt('Time (e.g. 3:00 PM):') || 'TBD';
  const partner = prompt('Partner (e.g. Hope Foundation):') || '—';
  try {
    await addPickup({ item, time, partner, day: day.trim() });
    renderPickups();
    showToast('Pickup scheduled');
  } catch (err) {
    showToast('Could not schedule: ' + err.message);
  }
});

// Export report (secondary button on reports view)
$('#reportsView .secondary-button')?.addEventListener('click', exportReport);

// Partners — invite writes to MongoDB
$('#invitePartnerBtn').addEventListener('click', async () => {
  const name = prompt('Partner name (e.g. New Shelter):');
  if (!name) return;
  const type = prompt('Partner type (NGO / Community kitchen / Local shelter / Food bank):') || 'NGO';
  try {
    await addPartner({ name, detail: type });
    renderPartners();
    showToast('Partner invited');
  } catch (err) {
    showToast('Could not invite: ' + err.message);
  }
});

// Partners — type tabs + search
$('#partnerTabs').addEventListener('click', (e) => {
  const tab = e.target.closest('.filter-tab');
  if (!tab) return;
  partnersFilter = tab.dataset.type;
  $$('#partnerTabs .filter-tab').forEach((t) => t.classList.toggle('active', t === tab));
  renderPartners();
});
$('#partnerSearch').addEventListener('input', renderPartners);

// Export report — builds a downloadable impact report from live data.
function exportReport() {
  const m = db.metrics || {};
  const lines = [
    'FOODLOOP — WASTE REDUCTION IMPACT REPORT',
    'Generated: ' + new Date().toLocaleString(),
    '==========================================',
    '',
    `Food diverted        : ${m.foodDiverted || 0} kg`,
    `Meals shared         : ${m.mealsShared || 0}`,
    `Pending pickups      : ${m.pendingPickups || 0}`,
    `Active partners      : ${m.activePartners || 0}`,
    '',
    'Food listings        : ' + db.listings.length,
    'Donation requests    : ' + db.requests.filter(r => r.status === 'pending').length + ' pending',
    'Partners             : ' + db.partners.length,
    'Pickups scheduled    : ' + db.pickups.length,
    'Waste entries        : ' + db.waste.length,
    '',
    '--- Current listings ---'
  ];
  db.listings.forEach(l => lines.push(` - ${l.name} (${l.quantity}) ${l.status}`));
  lines.push('', '--- Pending requests ---');
  db.requests.filter(r => r.status === 'pending').forEach(r => lines.push(` - ${r.name} requested ${r.item}`));
  lines.push('', 'Report from the Food Waste Reduction Platform (OOAD).');

  const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'foodloop-report.txt';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
  showToast('Report exported');
}

// ===================== Initialisation =====================

// Skip auth screen if a session exists, otherwise show it.
if (auth.currentUser) {
  showApp();
} else {
  showAuthScreen();
}