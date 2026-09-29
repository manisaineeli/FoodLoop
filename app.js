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
    if (auth.currentUser?.role === 'ngo') renderNgoGrid();
  } catch (err) {
    showToast(backendHint());
  }
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
  await loadData();
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
      <div class="ngo-card-top"><span class="big-food">${item.emoji}</span><span class="status available">${item.status}</span></div>
      <h3>${item.name}</h3>
      <p class="ngo-detail">${item.detail}</p>
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

const viewNames = { overview: 'Overview', listings: 'Food listings', requests: 'Requests', pickups: 'Pickups', waste: 'Waste log', partners: 'Partners', reports: 'Reports' };

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
  $('#listingCards').innerHTML = db.listings.filter((item) => item.name.toLowerCase().includes(search)).map((item) => `<article class="listing-card"><div class="listing-card-top"><span class="big-food">${item.emoji}</span><span class="status ${item.status === 'Available' ? 'available' : 'reserved'}">${item.status}</span></div><h3>${item.name}</h3><p>${item.detail}</p><div class="listing-meta"><span>${item.quantity}</span><span>⌁ ${item.expiry}</span></div></article>`).join('') || '<div class="empty-state">No listings found.</div>';

  $('#listingRows').innerHTML = db.listings.map((item) => `<tr><td><div class="food-cell"><span class="food-emoji">${item.emoji}</span><div><strong>${item.name}</strong><small>${item.detail}</small></div></div></td><td>${item.quantity}</td><td>${item.expiry}</td><td><span class="status ${item.status === 'Available' ? 'available' : 'reserved'}">${item.status}</span></td><td>${item.requests}</td><td><button class="row-menu">•••</button></td></tr>`).join('');
}

function renderRequests() {
  const pending = db.requests.filter(r => r.status === 'pending');
  $('#requestList').innerHTML = pending.map((request) => `<article class="request-card"><span class="partner-avatar ${request.color}">${request.initials}</span><div class="request-main"><h3>${request.name}</h3><p>Would like to receive <strong>${request.item}</strong></p><small>${request.time}</small></div><div class="request-actions"><button class="decline" data-id="${request.id}" data-action="decline">Decline</button><button class="accept" data-id="${request.id}" data-action="accept">Accept request</button></div></article>`).join('') || '<div class="ngo-empty">No pending requests.</div>';
}

function renderPickups() {
  const groups = [['Today', []], ['Tomorrow', []], ['Completed', []]];
  db.pickups.forEach(p => {
    const g = groups.find(([name]) => name === p.day);
    if (g) g[1].push([p.time, p.item, p.partner]);
  });
  $('#pickupBoard').innerHTML = groups.map(([name, cards]) => `<div class="pickup-column"><h3>${name}<span>${cards.length}</span></h3>${cards.map(([time, item, partner]) => `<div class="pickup-card"><strong>${item}</strong><p>${partner}</p><small>◷ ${time}</small></div>`).join('') || '<div class="ngo-empty">Nothing scheduled</div>'}</div>`).join('');
}

function renderPartners() {
  $('#partnerGrid').innerHTML = db.partners.map((p) => `<article class="partner-card"><span class="partner-avatar ${p.color}">${p.initials}</span><div><strong>${p.name}</strong><small>${p.detail}</small></div><span class="partner-status">${p.status}</span></article>`).join('');
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

// Schedule pickup (secondary button on pickups view)
$('.view-heading .secondary-button')?.addEventListener('click', async () => {
  const item = prompt('Food item (e.g. Fresh produce):');
  if (!item) return;
  const time = prompt('Time (e.g. 3:00 PM):') || 'TBD';
  const partner = prompt('Partner (e.g. Hope Foundation):') || '—';
  try {
    await addPickup({ item, time, partner, day: 'Today' });
    renderPickups();
    showToast('Pickup scheduled');
  } catch (err) {
    showToast('Could not schedule: ' + err.message);
  }
});

$('#partnerGrid').parentElement.querySelector('.view-heading .primary-button')?.addEventListener('click', async () => {
  const name = prompt('Partner name (e.g. New Shelter):');
  if (!name) return;
  try {
    await addPartner({ name });
    renderPartners();
    showToast('Partner invited');
  } catch (err) {
    showToast('Could not invite: ' + err.message);
  }
});

// ===================== Initialisation =====================

// Skip auth screen if a session exists, otherwise show it.
if (auth.currentUser) {
  showApp();
} else {
  showAuthScreen();
}