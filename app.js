const state = {
  listings: [
    { emoji: '🍱', name: 'Prepared meal boxes', detail: 'Vegetarian · 450 kcal', quantity: '35 boxes', expiry: 'Today, 8:00 PM', status: 'Available', requests: '2 requests' },
    { emoji: '🥬', name: 'Fresh mixed produce', detail: 'Vegetables · 18 kg', quantity: '18 kg', expiry: 'Tomorrow', status: 'Available', requests: '1 request' },
    { emoji: '🥖', name: 'Assorted bakery items', detail: 'Bread & pastries · 9 kg', quantity: '9 kg', expiry: 'Tomorrow, 10:00 AM', status: 'Reserved', requests: 'Accepted' }
  ],
  requests: [
    { initials: 'HF', color: 'blue', name: 'Hope Foundation', item: '35 meal boxes', time: 'Received 48 minutes ago', avatar: 'HF' },
    { initials: 'CS', color: 'green', name: 'Community Kitchen', item: '10 kg fresh produce', time: 'Received 1 hour ago', avatar: 'CK' },
    { initials: 'LS', color: 'purple', name: 'Little Steps Shelter', item: '9 kg bakery items', time: 'Received yesterday', avatar: 'LS' }
  ],
  partners: [
    ['HF','Hope Foundation','NGO · 8.4 km away','blue'],['CK','Community Kitchen','Community kitchen · 3.1 km away','green'],['LS','Little Steps Shelter','Local shelter · 5.7 km away','purple'],['FA','Food Aid Network','Food bank · 12.2 km away','orange'],['SS','Sunrise Support','NGO · 6.8 km away','rose'],['MH','Meals for Hope','Community kitchen · 2.4 km away','teal']
  ],
  ngoRequests: []
};

// ===== Auth System (MongoDB-backed) =====
const API_URL = 'http://localhost:5000/api';

const auth = {
  currentUser: JSON.parse(localStorage.getItem('foodloop_session') || 'null'),

  saveSession() { localStorage.setItem('foodloop_session', JSON.stringify(this.currentUser)); },
  clearSession() { localStorage.removeItem('foodloop_session'); this.currentUser = null; },

  async signup(name, email, password, role) {
    const res = await fetch(`${API_URL}/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, role })
    });
    const data = await res.json();
    if (!res.ok) return { error: data.error || 'Signup failed.' };
    this.currentUser = data.user;
    this.saveSession();
    return { success: true };
  },

  async signin(email, password, role) {
    const res = await fetch(`${API_URL}/signin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, role })
    });
    const data = await res.json();
    if (!res.ok) return { error: data.error || 'Signin failed.' };
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

function showApp() {
  $('#authScreen').classList.add('hidden');
  if (auth.currentUser?.role === 'ngo') {
    $('#appShell').classList.add('hidden');
    $('#ngoDashboard').classList.remove('hidden');
    renderNgoDashboard();
  } else {
    $('#appShell').classList.remove('hidden');
    $('#ngoDashboard').classList.add('hidden');
  }
}

// ===== NGO Dashboard =====
function renderNgoDashboard() {
  const user = auth.currentUser;
  if (!user) return;
  $('#ngoName').textContent = user.name;
  $('#ngoAvatar').textContent = user.name.charAt(0).toUpperCase();
  renderNgoGrid();
}

function renderNgoGrid() {
  const search = ($('#ngoSearch')?.value || '').toLowerCase();
  const available = state.listings.filter(item => item.status === 'Available' && item.name.toLowerCase().includes(search));
  const requested = new Set(state.ngoRequests);

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

// ===== Auth Event Handlers =====
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

$('#signinForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const result = auth.signin(form.get('email'), form.get('password'), formRoles.signin);
  if (result.error) { $('#authError').textContent = result.error; return; }
  showApp();
});

$('#signupForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const result = auth.signup(form.get('name'), form.get('email'), form.get('password'), formRoles.signup);
  if (result.error) { $('#authError').textContent = result.error; return; }
  showApp();
});

$('#ngoLogout').addEventListener('click', () => auth.logout());

$('#ngoSearch').addEventListener('input', renderNgoGrid);

$('#ngoGrid').addEventListener('click', (e) => {
  const btn = e.target.closest('.ngo-request-btn');
  if (!btn || btn.disabled) return;
  const foodName = btn.dataset.food;
  state.ngoRequests.push(foodName);
  renderNgoGrid();
  showToast(`Request sent for ${foodName}`);
});

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
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
}

function showToast(message) {
  $('#toastMessage').textContent = message;
  $('#toast').classList.add('show');
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => $('#toast').classList.remove('show'), 2800);
}

function renderListingCards() {
  const search = ($('#listingSearch')?.value || '').toLowerCase();
  $('#listingCards').innerHTML = state.listings.filter((item) => item.name.toLowerCase().includes(search)).map((item) => `<article class="listing-card"><div class="listing-card-top"><span class="big-food">${item.emoji}</span><span class="status ${item.status === 'Available' ? 'available' : 'reserved'}">${item.status}</span></div><h3>${item.name}</h3><p>${item.detail}</p><div class="listing-meta"><span>${item.quantity}</span><span>⌁ ${item.expiry}</span></div></article>`).join('') || '<div class="empty-state">No listings found.</div>';
}

function renderRequests() {
  $('#requestList').innerHTML = state.requests.map((request, index) => `<article class="request-card"><span class="partner-avatar ${request.color}">${request.initials}</span><div class="request-main"><h3>${request.name}</h3><p>Would like to receive <strong>${request.item}</strong></p><small>${request.time}</small></div><div class="request-actions"><button class="decline" data-request="${index}" data-action="decline">Decline</button><button class="accept" data-request="${index}" data-action="accept">Accept request</button></div></article>`).join('');
}

function renderPickups() {
  const groups = [['Today', [['4:30 PM', 'Fresh mixed produce', 'Hope Foundation'], ['6:00 PM', 'Prepared meal boxes', 'Community Kitchen']]], ['Tomorrow', [['9:00 AM', 'Bakery items', 'Little Steps Shelter']]], ['Completed', [['Yesterday', 'Meal boxes · 20 boxes', 'Community Kitchen'], ['12 Oct', 'Fresh produce · 12 kg', 'Food Aid Network']]]];
  $('#pickupBoard').innerHTML = groups.map(([name, cards]) => `<div class="pickup-column"><h3>${name}<span>${cards.length}</span></h3>${cards.map(([time, item, partner]) => `<div class="pickup-card"><strong>${item}</strong><p>${partner}</p><small>◷ ${time}</small></div>`).join('')}</div>`).join('');
}

function renderPartners() {
  $('#partnerGrid').innerHTML = state.partners.map(([initials, name, detail, color]) => `<article class="partner-card"><span class="partner-avatar ${color}">${initials}</span><div><strong>${name}</strong><small>${detail}</small></div><span class="partner-status">Connected</span></article>`).join('');
}

function openListingModal() { $('#modalBackdrop').classList.add('open'); $('#listingForm').elements.name.focus(); }
function closeListingModal() { $('#modalBackdrop').classList.remove('open'); $('#listingForm').reset(); }

$$('.nav-item[data-view]').forEach((item) => item.addEventListener('click', () => showView(item.dataset.view)));
$$('[data-view="listings"]').forEach((item) => item.addEventListener('click', () => showView('listings')));
$('#mobileMenu').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
$('#addListingBtn').addEventListener('click', openListingModal);
$('#addListingBtn2').addEventListener('click', openListingModal);
$('#modalClose').addEventListener('click', closeListingModal);
$('#modalCancel').addEventListener('click', closeListingModal);
$('#modalBackdrop').addEventListener('click', (event) => { if (event.target.id === 'modalBackdrop') closeListingModal(); });
$('#listingSearch').addEventListener('input', renderListingCards);
$('#listingForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const form = new FormData(event.target);
  state.listings.unshift({ emoji: '🍽️', name: form.get('name'), detail: form.get('notes') || 'Fresh surplus food', quantity: form.get('quantity'), expiry: form.get('expiry'), status: 'Available', requests: '0 requests' });
  const first = state.listings[0];
  $('#listingRows').insertAdjacentHTML('afterbegin', `<tr><td><div class="food-cell"><span class="food-emoji">${first.emoji}</span><div><strong>${first.name}</strong><small>${first.detail}</small></div></div></td><td>${first.quantity}</td><td>${first.expiry}</td><td><span class="status available">Available</span></td><td>0 requests</td><td><button class="row-menu">•••</button></td></tr>`);
  closeListingModal(); showToast('Food listing published');
});
$('#requestList').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-request]');
  if (!button) return;
  const index = Number(button.dataset.request); const request = state.requests[index];
  state.requests.splice(index, 1); renderRequests(); showToast(button.dataset.action === 'accept' ? `${request.name} request accepted` : 'Request declined');
});
$('#logWasteBtn').addEventListener('click', () => showToast('Waste log form is ready for your next entry'));
renderListingCards(); renderRequests(); renderPickups(); renderPartners();

// Skip auth if already logged in
if (auth.currentUser) showApp();

// Give the impact scene a small, tactile tilt on desktop pointer movement.
const scene = $('#scene3d');
if (scene && window.matchMedia('(pointer: fine)').matches) {
  scene.addEventListener('pointermove', (event) => {
    const box = scene.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width - 0.5;
    const y = (event.clientY - box.top) / box.height - 0.5;
    scene.style.transform = `rotateX(${y * -5}deg) rotateY(${x * 7}deg)`;
  });
  scene.addEventListener('pointerleave', () => { scene.style.transform = ''; });
}
