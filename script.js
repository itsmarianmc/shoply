const SUPABASE_URL = 'https://ludrlaqduarrebqfowcm.supabase.co';
const SUPABASE_ANON = 'sb_publishable_oNa30Ryz6LSZC9mweR9YOw__jjaFPDs';
const POLL_INTERVAL = 2000;

async function sbFetch(path, options = {}) {
	const token = currentSession?.access_token || SUPABASE_ANON;
	const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
		...options,
		headers: {
			'apikey': SUPABASE_ANON,
			'Authorization': `Bearer ${token}`,
			'Content-Type': 'application/json',
			...options.headers
		}
	});
	if (!res.ok) {
		const err = await res.json().catch(() => ({}));
		throw new Error(err.message || err.error_description || `HTTP ${res.status}`);
	}
	if (res.status === 204) return null;
	return res.json();
}

async function authFetch(path, body) {
	const res = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
		method: 'POST',
		headers: {
			'apikey': SUPABASE_ANON,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify(body)
	});
	const data = await res.json();
	if (!res.ok) throw new Error(data.error_description || data.msg || data.error || 'Error');
	return data;
}

let currentSession = null;
let currentProfile = null;
let currentFamily = null;
let familyMembers = [];
let categories = [];
let items = [];
let realtimeSub = null;
let reconnectTimer = null;
let reconnectDelay = 2000;
let pollTimer = null;
let categoryHashes = {};
let confirmCallback = null;
let verifyEmail = '';

function escHtml(str) {
	return String(str ?? '')
		.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function hashItems(arr) {
	if (!arr.length) return '0';
	return arr.reduce((h, item) =>
		((h << 5) - h + [...(item.id + item.done + item.quantity + (item.added_by_user_id ?? ''))].reduce((a, c) => a + c.charCodeAt(0), 0)) | 0, 0
	).toString(36);
}

function showStatus(id, type, msg, timeout = 4500) {
	const el = document.getElementById(id);
	if (!el) return;
	el.className = `status-banner ${type}`;
	el.textContent = msg;
	el.classList.remove('hidden');
	clearTimeout(el._t);
	if (timeout) el._t = setTimeout(() => el.classList.add('hidden'), timeout);
}

function showScreen(id) {
	['auth-screen', 'verify-screen', 'app'].forEach(s => document.getElementById(s).classList.add('hidden'));
	document.getElementById(id).classList.remove('hidden');
}

function memberMap() {
	const map = {};
	familyMembers.forEach(m => map[m.id] = m.display_name);
	return map;
}

function confirmDialog(title, text) {
	return new Promise(resolve => {
		document.getElementById('confirm-title').textContent = title;
		document.getElementById('confirm-text').textContent = text;
		document.getElementById('confirm-modal').classList.remove('hidden');
		confirmCallback = resolve;
	});
}

document.getElementById('confirm-ok').addEventListener('click', () => {
	document.getElementById('confirm-modal').classList.add('hidden');
	confirmCallback?.(true);
	confirmCallback = null;
});
document.getElementById('confirm-cancel').addEventListener('click', () => {
	document.getElementById('confirm-modal').classList.add('hidden');
	confirmCallback?.(false);
	confirmCallback = null;
});

let hiddenAt = 0;

function splashEnabled() {
	return localStorage.getItem('shoply_splash_disabled') !== '1';
}

if (splashEnabled()) {
	setTimeout(() => document.getElementById('splash').classList.add('hidden'), 2000);
} else {
	document.getElementById('splash').classList.add('hidden');
}

document.addEventListener('visibilitychange', () => {
	if (document.hidden) {
		hiddenAt = Date.now();
	} else if (Date.now() - hiddenAt > 1000 && currentSession && splashEnabled()) {
		showSplash();
	}
});

function showSplash() {
	const s = document.getElementById('splash');
	s.classList.remove('hidden');
	s.style.animation = 'none';
	s.offsetHeight;
	s.style.animation = 'splashFade 1.6s ease-out 0.2s forwards';
	setTimeout(() => s.classList.add('hidden'), 2000);
}

function isPWA() {
	return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
}

function detectPlatform() {
	const ua = navigator.userAgent.toLowerCase();
	if (/iphone|ipad|ipod/.test(ua)) return 'safari';
	if (/android/.test(ua)) return 'android';
	if (/firefox/.test(ua)) return 'firefox';
	return 'chrome';
}

function initInstallPopup() {
	if (isPWA() || localStorage.getItem('shoply_skip_install')) return;
	const popup = document.getElementById('install-popup');
	popup.classList.remove('hidden');

	const platform = detectPlatform();
	document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.platform === platform));
	document.querySelectorAll('.platform-panel').forEach(p => p.classList.toggle('active', p.id === `panel-${platform}`));

	document.getElementById('show-install-guide').onclick = () => {
		document.getElementById('install-landing').classList.add('hidden');
		document.getElementById('install-guide').classList.remove('hidden');
	};
	document.getElementById('back-to-landing').onclick = () => {
		document.getElementById('install-guide').classList.add('hidden');
		document.getElementById('install-landing').classList.remove('hidden');
	};
	document.getElementById('learn-more-btn').onclick = () =>
		document.getElementById('install-features').scrollIntoView({
			behavior: 'smooth'
		});
	document.getElementById('continue-in-browser').onclick = () => {
		localStorage.setItem('shoply_skip_install', '1');
		popup.classList.add('hidden');
		initAuth();
	};
	document.querySelectorAll('.tab-btn').forEach(btn => {
		btn.onclick = () => {
			document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
			document.querySelectorAll('.platform-panel').forEach(p => p.classList.remove('active'));
			btn.classList.add('active');
			document.getElementById(`panel-${btn.dataset.platform}`).classList.add('active');
		};
	});
}

window.matchMedia('(display-mode: standalone)').addEventListener('change', e => {
	if (e.matches) {
		document.getElementById('install-popup').classList.add('hidden');
		initAuth();
	}
});

const COOKIE_KEY = 'shoply_cookie_consent';

function getCookieSettings() {
	try {
		return JSON.parse(localStorage.getItem(COOKIE_KEY));
	} catch {
		return null;
	}
}

function saveCookieSettings(s) {
	localStorage.setItem(COOKIE_KEY, JSON.stringify(s));
	applyConsent(s);
}

function applyConsent(s) {
	if (typeof gtag === 'function') gtag('consent', 'update', {
		analytics_storage: s.analytics ? 'granted' : 'denied',
		ad_storage: s.marketing ? 'granted' : 'denied',
		functionality_storage: s.preferences ? 'granted' : 'denied',
		personalization_storage: s.thirdparty ? 'granted' : 'denied'
	});
}

function initCookieBanner() {
	const s = getCookieSettings();
	if (s) {
		applyConsent(s);
		return;
	}
	document.getElementById('cookie-banner').classList.remove('hidden');
	document.getElementById('accept-all-cookies').onclick = () => {
		saveCookieSettings({
			analytics: true,
			preferences: true,
			thirdparty: true,
			marketing: true
		});
		document.getElementById('cookie-banner').classList.add('hidden');
	};
	document.getElementById('cookie-settings-btn').onclick = openCookieModal;
}

function openCookieModal() {
	document.getElementById('cookie-banner').classList.add('hidden');
	const current = getCookieSettings() || {};
	['analytics', 'preferences', 'thirdparty', 'marketing'].forEach(k => {
		document.getElementById(`toggle-${k}`)?.classList.toggle('active', !!current[k]);
	});
	document.getElementById('cookie-modal').classList.remove('hidden');
}

document.getElementById('close-cookie-modal').onclick = () => document.getElementById('cookie-modal').classList.add('hidden');
document.querySelectorAll('.toggle-switch:not(.disabled)').forEach(t => t.onclick = () => t.classList.toggle('active'));
document.getElementById('save-cookie-settings').onclick = () => {
	const s = {};
	['analytics', 'preferences', 'thirdparty', 'marketing'].forEach(k => {
		s[k] = !!document.getElementById(`toggle-${k}`)?.classList.contains('active');
	});
	saveCookieSettings(s);
	document.getElementById('cookie-modal').classList.add('hidden');
};
document.getElementById('accept-all-modal').onclick = () => {
	['analytics', 'preferences', 'thirdparty', 'marketing'].forEach(k => document.getElementById(`toggle-${k}`)?.classList.add('active'));
	saveCookieSettings({
		analytics: true,
		preferences: true,
		thirdparty: true,
		marketing: true
	});
	document.getElementById('cookie-modal').classList.add('hidden');
};
document.getElementById('open-cookie-settings').onclick = openCookieModal;

function initAuth() {
	initCookieBanner();
	try {
		const stored = JSON.parse(localStorage.getItem('shoply_session') || 'null');
		if (stored?.access_token) {
			currentSession = stored;
			loadProfileAndEnter();
			return;
		}
	} catch {}
	showScreen('auth-screen');
	setupAuthForms();
}

function setupAuthForms() {
	document.getElementById('to-register-btn').onclick = () => {
		document.getElementById('form-login').classList.add('hidden');
		document.getElementById('form-register').classList.remove('hidden');
		document.getElementById('auth-subtitle').textContent = 'Create account';
	};
	document.getElementById('to-login-btn').onclick = () => {
		document.getElementById('form-register').classList.add('hidden');
		document.getElementById('form-login').classList.remove('hidden');
		document.getElementById('auth-subtitle').textContent = 'Welcome back';
	};
	document.getElementById('login-btn').onclick = doLogin;
	document.getElementById('login-password').onkeydown = e => {
		if (e.key === 'Enter') doLogin();
	};
	document.getElementById('register-btn').onclick = doRegister;
	document.getElementById('reg-password').onkeydown = e => {
		if (e.key === 'Enter') doRegister();
	};
	document.getElementById('back-to-login-btn').onclick = () => showScreen('auth-screen');
	document.getElementById('resend-btn').onclick = async () => {
		try {
			await authFetch('resend', {
				type: 'signup',
				email: verifyEmail
			});
			showStatus('verify-msg', 'success', '✓ Resend Link sent.');
		} catch (e) {
			showStatus('verify-msg', 'error', `✗ ${e.message}`);
		}
	};
}

async function doLogin() {
	const email = document.getElementById('login-email').value.trim();
	const password = document.getElementById('login-password').value;
	if (!email || !password) {
		showStatus('login-msg', 'error', '✗ Please enter your email and password.');
		return;
	}
	const btn = document.getElementById('login-btn');
	btn.disabled = true;
	showStatus('login-msg', 'info', '⏳ Signing in…', 0);
	try {
		const data = await authFetch('token?grant_type=password', {
			email,
			password
		});
		currentSession = data;
		localStorage.setItem('shoply_session', JSON.stringify(data));
		await loadProfileAndEnter();
	} catch (e) {
		showStatus('login-msg', 'error', `✗ ${e.message}`);
	} finally {
		btn.disabled = false;
	}
}

async function doRegister() {
	const name = document.getElementById('reg-name').value.trim();
	const email = document.getElementById('reg-email').value.trim();
	const password = document.getElementById('reg-password').value;
	if (!name) {
		showStatus('register-msg', 'error', '✗ Please enter a display name.');
		return;
	}
	if (!email) {
		showStatus('register-msg', 'error', '✗ Please enter an email address.');
		return;
	}
	if (password.length < 8) {
		showStatus('register-msg', 'error', '✗ Password must be at least 8 characters.');
		return;
	}
	const btn = document.getElementById('register-btn');
	btn.disabled = true;
	showStatus('register-msg', 'info', '⏳ Creating account…', 0);
	try {
		await authFetch('signup', {
			email,
			password,
			data: {
				display_name: name
			}
		});
		verifyEmail = email;
		document.getElementById('verify-email-show').textContent = email;
		showScreen('verify-screen');
	} catch (e) {
		showStatus('register-msg', 'error', `✗ ${e.message}`);
	} finally {
		btn.disabled = false;
	}
}

async function loadProfileAndEnter() {
	const userId = currentSession.user?.id;
	if (!userId) {
		doLogout();
		return;
	}
	try {
		let rows = await sbFetch(`profiles?id=eq.${userId}&select=*`);
		if (!rows || rows.length === 0) {
			const displayName = currentSession.user?.user_metadata?.display_name || currentSession.user?.email?.split('@')[0] || 'User';
			rows = await sbFetch('profiles', {
				method: 'POST',
				headers: {
					Prefer: 'return=representation'
				},
				body: JSON.stringify({
					id: userId,
					display_name: displayName,
					family_id: null
				})
			});
		}
		currentProfile = rows[0];
		if (currentProfile.family_id) await loadFamily();
		enterApp();
	} catch (e) {
		console.error('loadProfileAndEnter error:', e);
		doLogout();
	}
}

async function loadFamily() {
	try {
		const fam = await sbFetch(`families?id=eq.${encodeURIComponent(currentProfile.family_id)}&select=id,display_name`);
		currentFamily = fam?.[0] || null;
		if (currentFamily) {
			const members = await sbFetch(`profiles?family_id=eq.${encodeURIComponent(currentProfile.family_id)}&select=id,display_name`);
			familyMembers = members || [];
		}
	} catch (e) {
		console.error('loadFamily error:', e);
	}
}

function ensureCurrentUserInMemberMap() {
	if (!currentSession?.user?.id) return;
	const alreadyIn = familyMembers.some(m => m.id === currentSession.user.id);
	if (!alreadyIn) {
		familyMembers.push({
			id: currentSession.user.id,
			display_name: currentProfile?.display_name || 'Me'
		});
	}
}

function enterApp() {
	showScreen('app');
	updateAppHeader();
	if (currentProfile.family_id && currentFamily) {
		document.getElementById('no-family-notice').classList.add('hidden');
		document.getElementById('forms-section').classList.remove('hidden');
		ensureCurrentUserInMemberMap();
		loadData();
		startRealtime();
		startPolling();
	} else {
		document.getElementById('no-family-notice').classList.remove('hidden');
		document.getElementById('forms-section').classList.add('hidden');
		document.getElementById('category-list').innerHTML = `
      <div class="empty-state" id="empty-state">
        <i class="fa-solid fa-basket-shopping empty-icon"></i>
        <p>No entries yet.</p>
        <span>Add a category and some items!</span>
      </div>`;
	}
}

function updateAppHeader() {
	document.getElementById('family-name-display').textContent = currentFamily?.display_name || 'No family';
}

document.getElementById('logout-btn').onclick = doLogout;

function doLogout() {
	currentSession = null;
	currentProfile = null;
	currentFamily = null;
	familyMembers = [];
	categories = [];
	items = [];
	localStorage.removeItem('shoply_session');
	stopRealtime();
	stopPolling();
	showScreen('auth-screen');
	document.getElementById('form-register').classList.add('hidden');
	document.getElementById('form-login').classList.remove('hidden');
	document.getElementById('auth-subtitle').textContent = 'Welcome back';
}

async function loadData() {
	if (!currentProfile?.family_id) return;
	try {
		const [cats, itms] = await Promise.all([
			sbFetch(`categories?family_id=eq.${encodeURIComponent(currentProfile.family_id)}&order=name.asc`),
			sbFetch(`items?family_id=eq.${encodeURIComponent(currentProfile.family_id)}&order=created_at.asc`)
		]);
		categories = cats || [];
		items = itms || [];
		ensureCurrentUserInMemberMap();
		renderAll();
		updateLastUpdated();
	} catch (e) {
		console.error('loadData error:', e);
	}
}

function updateLastUpdated() {
	document.getElementById('last-updated').textContent =
		`Aktualisiert: ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
}

const EMPTY_STATE_HTML = `
  <div class="empty-state" id="empty-state">
    <i class="fa-solid fa-basket-shopping empty-icon"></i>
    <p>No entries yet.</p>
    <span>Add a category and some items!</span>
  </div>`;

function renderAll() {
	const container = document.getElementById('category-list');

	if (categories.length === 0) {
		container.innerHTML = EMPTY_STATE_HTML;
		updateCategorySelect();
		return;
	}

	const existing = document.getElementById('empty-state');
	if (existing) existing.remove();

	const map = memberMap();

	categories.forEach(cat => {
		const catItems = items.filter(i => i.category_id === cat.id);
		const hash = hashItems(catItems);
		let card = document.getElementById(`cat-${cat.id}`);
		if (card && categoryHashes[cat.id] === hash) return;
		categoryHashes[cat.id] = hash;
		const newCard = buildCategoryCard(cat, catItems, map);
		if (card) container.replaceChild(newCard, card);
		else container.appendChild(newCard);
	});

	const catIds = new Set(categories.map(c => c.id));
	container.querySelectorAll('.category-card').forEach(card => {
		if (!catIds.has(card.id.replace('cat-', ''))) card.remove();
	});

	updateCategorySelect();
}

function buildCategoryCard(cat, catItems, map) {
	const card = document.createElement('div');
	card.className = 'category-card';
	card.id = `cat-${cat.id}`;
	const doneCount = catItems.filter(i => i.done).length;
	card.innerHTML = `
    <div class="category-header">
      <div class="category-title">
        <i class="fa-solid fa-folder"></i>
        ${escHtml(cat.name)}
        <span class="item-count">${catItems.length} Item${catItems.length !== 1 ? 's' : ''}${doneCount > 0 ? ` · ${doneCount} ✓` : ''}</span>
      </div>
      <button class="delete-cat-btn" data-cat-id="${cat.id}" data-cat-name="${escHtml(cat.name)}">
        <i class="fa-solid fa-trash-can"></i> Delete
      </button>
    </div>
    <div class="items-list" id="items-${cat.id}">
      ${catItems.length === 0
        ? '<div class="no-items-placeholder">No items in this category</div>'
        : catItems.map(item => buildItemHTML(item, map)).join('')}
    </div>`;

	card.querySelector('.delete-cat-btn').addEventListener('click', async e => {
		const name = e.currentTarget.dataset.catName;
		const ok = await confirmDialog('Delete category', `Delete "${name}" and all its items?`);
		if (ok) deleteCategory(cat.id);
	});
	card.querySelectorAll('.item-check-btn').forEach(btn => {
		btn.addEventListener('click', () => toggleItem(btn.dataset.itemId, btn.dataset.done === 'true'));
	});
	card.querySelectorAll('.item-delete-btn').forEach(btn => {
		btn.addEventListener('click', async () => {
			const ok = await confirmDialog('Delete item', `Delete "${btn.dataset.itemName}"?`);
			if (ok) deleteItem(btn.dataset.itemId);
		});
	});
	return card;
}

function buildItemHTML(item, map) {
	const doneClass = item.done ? 'done' : '';
	const textClass = item.done ? 'done-text' : '';
	const qty = item.quantity > 1 ? `<span class="item-qty">(${item.quantity}x)</span>` : '';
	const myId = currentSession?.user?.id;
	const isMe = item.added_by_user_id === myId;
	const adderName = item.added_by_user_id ?
		(isMe ? 'Me' : (map[item.added_by_user_id] || '?')) :
		'';
	const attribution = adderName ?
		`<span class="item-added-by ${isMe ? 'is-me' : ''}"><i class="fa-solid fa-user-pen" style="font-size:9px;margin-right:3px;"></i>${escHtml(adderName)}</span>` :
		'';
	return `
    <div class="item-row" id="item-${item.id}">
      <button class="item-check-btn ${doneClass}" data-item-id="${item.id}" data-done="${item.done}" title="${item.done ? 'Mark as open' : 'Check off'}">
        <i class="fa-solid fa-check"></i>
      </button>
      <span class="item-label ${textClass}">${escHtml(item.name)}</span>
      ${qty}
      ${attribution}
      <button class="item-delete-btn" data-item-id="${item.id}" data-item-name="${escHtml(item.name)}" title="Delete">
        <i class="fa-solid fa-xmark"></i>
      </button>
    </div>`;
}

function updateCategorySelect() {
	const sel = document.getElementById('category-select');
	const current = sel.value;
	sel.innerHTML = '<option value="">Choose category…</option>';
	categories.forEach(cat => {
		const opt = document.createElement('option');
		opt.value = cat.id;
		opt.textContent = cat.name;
		sel.appendChild(opt);
	});
	if (current) sel.value = current;
}

document.getElementById('add-category-btn').onclick = addCategory;
document.getElementById('category-input').onkeydown = e => {
	if (e.key === 'Enter') addCategory();
};

async function addCategory() {
	const input = document.getElementById('category-input');
	const name = input.value.trim();
	if (!name) return;
	if (categories.some(c => c.name.toLowerCase() === name.toLowerCase())) {
		showStatus('category-msg', 'error', `✗ Category "${name}" already exists.`);
		return;
	}
	const btn = document.getElementById('add-category-btn');
	btn.disabled = true;
	try {
		const rows = await sbFetch('categories', {
			method: 'POST',
			headers: {
				Prefer: 'return=representation'
			},
			body: JSON.stringify({
				name,
				family_id: currentProfile.family_id
			})
		});
		input.value = '';
		if (rows?.[0]) categories.push(rows[0]);
		renderAll();
		showStatus('category-msg', 'success', `✓ "${name}" added.`);
	} catch (e) {
		showStatus('category-msg', 'error', `✗ ${e.message}`);
	} finally {
		btn.disabled = false;
	}
}

document.getElementById('add-item-btn').onclick = addItem;
document.getElementById('item-name-input').onkeydown = e => {
	if (e.key === 'Enter') addItem();
};

async function addItem() {
	const name = document.getElementById('item-name-input').value.trim();
	const catId = document.getElementById('category-select').value;
	const qty = Math.max(1, parseInt(document.getElementById('item-qty-input').value) || 1);
	if (!name) {
		showStatus('item-msg', 'error', '✗ Please enter an item name.');
		return;
	}
	if (!catId) {
		showStatus('item-msg', 'error', '✗ Please select a category.');
		return;
	}
	const btn = document.getElementById('add-item-btn');
	btn.disabled = true;
	try {
		const rows = await sbFetch('items', {
			method: 'POST',
			headers: {
				Prefer: 'return=representation'
			},
			body: JSON.stringify({
				name,
				category_id: catId,
				family_id: currentProfile.family_id,
				quantity: qty,
				done: false,
				added_by_user_id: currentSession.user.id
			})
		});
		document.getElementById('item-name-input').value = '';
		document.getElementById('item-qty-input').value = '1';
		if (rows?.[0]) {
			items.push(rows[0]);
			ensureCurrentUserInMemberMap();
		}
		renderAll();
		showStatus('item-msg', 'success', `✓ "${name}" added.`);
	} catch (e) {
		showStatus('item-msg', 'error', `✗ ${e.message}`);
	} finally {
		btn.disabled = false;
	}
}

async function toggleItem(id, currentDone) {
	const newDone = !currentDone;

	const idx = items.findIndex(i => i.id === id);
	if (idx >= 0) items[idx].done = newDone;

	const btn = document.querySelector(`[data-item-id="${id}"].item-check-btn`);
	const label = btn?.closest('.item-row')?.querySelector('.item-label');
	if (btn) {
		btn.classList.toggle('done', newDone);
		btn.dataset.done = String(newDone);
		btn.title = newDone ? 'Mark as open' : 'Check off';
	}
	if (label) label.classList.toggle('done-text', newDone);

	const catId = items[idx]?.category_id;
	if (catId) {
		const catItems = items.filter(i => i.category_id === catId);
		const doneCount = catItems.filter(i => i.done).length;
		const countEl = document.querySelector(`#cat-${catId} .item-count`);
		if (countEl) countEl.textContent = `${catItems.length} Item${catItems.length !== 1 ? 's' : ''}${doneCount > 0 ? ` · ${doneCount} ✓` : ''}`;
		categoryHashes[catId] = hashItems(catItems);
	}

	try {
		await sbFetch(`items?id=eq.${id}`, {
			method: 'PATCH',
			headers: {
				Prefer: 'return=representation'
			},
			body: JSON.stringify({
				done: newDone
			})
		});
	} catch (e) {
		console.error(e);
		if (idx >= 0) items[idx].done = currentDone;
		if (btn) {
			btn.classList.toggle('done', currentDone);
			btn.dataset.done = String(currentDone);
		}
		if (label) label.classList.toggle('done-text', currentDone);
	}
}

async function deleteItem(id) {
	try {
		await sbFetch(`items?id=eq.${id}`, {
			method: 'DELETE'
		});
		items = items.filter(i => i.id !== id);
		renderAll();
	} catch (e) {
		console.error(e);
	}
}

async function deleteCategory(catId) {
	try {
		await sbFetch(`items?category_id=eq.${catId}`, {
			method: 'DELETE'
		});
		await sbFetch(`categories?id=eq.${catId}`, {
			method: 'DELETE'
		});
		categories = categories.filter(c => c.id !== catId);
		items = items.filter(i => i.category_id !== catId);
		delete categoryHashes[catId];
		renderAll();
	} catch (e) {
		console.error(e);
	}
}

document.getElementById('profile-btn').onclick = openProfileModal;
document.getElementById('open-profile-from-notice').onclick = openProfileModal;
document.getElementById('close-profile-modal').onclick = () =>
	document.getElementById('profile-modal').classList.add('hidden');

function openProfileModal() {
	document.getElementById('profile-modal').classList.remove('hidden');
	document.getElementById('profile-display-name').textContent = currentProfile?.display_name || '—';
	document.getElementById('profile-email').textContent = currentSession?.user?.email || '—';
	document.getElementById('new-display-name').value = currentProfile?.display_name || '';

	if (currentFamily) {
		document.getElementById('current-family-section').classList.remove('hidden');
		document.getElementById('familySettings').classList.add('hidden');
		document.getElementById('no-family-section').classList.add('hidden');
		document.getElementById('profile-family-name').textContent = currentFamily.display_name;
		const list = document.getElementById('family-members-list');
		list.innerHTML = '';
		familyMembers.forEach(m => {
			const isMe = m.id === currentSession.user.id;
			const chip = document.createElement('span');
			chip.className = `member-chip ${isMe ? 'is-me' : ''}`;
			chip.innerHTML = `<i class="fa-solid fa-user"></i>${escHtml(m.display_name)}${isMe ? ' (Me)' : ''}`;
			list.appendChild(chip);
		});
		document.getElementById('share-id-section').classList.remove('hidden');
		document.getElementById('share-id-display').textContent = currentFamily.id;
	} else {
		document.getElementById('current-family-section').classList.add('hidden');
		document.getElementById('familySettings').classList.remove('hidden');
		document.getElementById('no-family-section').classList.remove('hidden');
		document.getElementById('share-id-section').classList.add('hidden');
	}

	const joinInput = document.getElementById('join-family-id');
	joinInput.value = '';
	document.getElementById('join-id-count').textContent = '0 / 64';
	joinInput.oninput = () => {
		const len = joinInput.value.length;
		document.getElementById('join-id-count').textContent = `${len} / 64`;
		document.getElementById('join-id-count').style.color = len === 64 ? 'var(--green)' : '';
	};

	const splashToggle = document.getElementById('toggle-splash');
	if (splashToggle) {
		splashToggle.classList.toggle('active', splashEnabled());
		splashToggle.onclick = () => {
			const nowEnabled = !splashEnabled();
			localStorage.setItem('shoply_splash_disabled', nowEnabled ? '0' : '1');
			splashToggle.classList.toggle('active', nowEnabled);
		};
	}
}

document.getElementById('save-display-name-btn').onclick = async () => {
	const name = document.getElementById('new-display-name').value.trim();
	if (!name) return;
	try {
		await sbFetch(`profiles?id=eq.${currentSession.user.id}`, {
			method: 'PATCH',
			headers: {
				Prefer: 'return=representation'
			},
			body: JSON.stringify({
				display_name: name
			})
		});
		currentProfile.display_name = name;
		document.getElementById('profile-display-name').textContent = name;
		const self = familyMembers.find(m => m.id === currentSession.user.id);
		if (self) self.display_name = name;
		if (currentFamily) await loadFamily();
		showStatus('name-msg', 'success', '✓ Name updated.');
	} catch (e) {
		showStatus('name-msg', 'error', `✗ ${e.message}`);
	}
};

document.getElementById('create-family-btn').onclick = async () => {
	const name = document.getElementById('new-family-name').value.trim();
	if (!name) {
		showStatus('family-msg', 'error', '✗ Please enter a family name.');
		return;
	}
	const btn = document.getElementById('create-family-btn');
	btn.disabled = true;
	try {
		const arr = new Uint8Array(32);
		crypto.getRandomValues(arr);
		const familyId = Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
		const fam = await sbFetch('families', {
			method: 'POST',
			headers: {
				Prefer: 'return=representation'
			},
			body: JSON.stringify({
				id: familyId,
				display_name: name
			})
		});
		currentFamily = fam[0];
		await sbFetch(`profiles?id=eq.${currentSession.user.id}`, {
			method: 'PATCH',
			headers: {
				Prefer: 'return=representation'
			},
			body: JSON.stringify({
				family_id: familyId
			})
		});
		currentProfile.family_id = familyId;
		familyMembers = [{
			id: currentSession.user.id,
			display_name: currentProfile.display_name
		}];
		showStatus('family-msg', 'success', `✓ Family "${name}" created!`);
		document.getElementById('new-family-name').value = '';
		openProfileModal();
		enterApp();
	} catch (e) {
		showStatus('family-msg', 'error', `✗ ${e.message}`);
	} finally {
		btn.disabled = false;
	}
};

document.getElementById('join-family-btn').onclick = async () => {
	const id = document.getElementById('join-family-id').value.trim();
	if (id.length !== 64) {
		showStatus('family-msg', 'error', '✗ The family ID must be exactly 64 characters.');
		return;
	}
	const btn = document.getElementById('join-family-btn');
	btn.disabled = true;
	try {
		const fam = await sbFetch(`families?id=eq.${encodeURIComponent(id)}&select=id,display_name`);
		if (!fam || fam.length === 0) {
			showStatus('family-msg', 'error', '✗ Family not found.');
			return;
		}
		await sbFetch(`profiles?id=eq.${currentSession.user.id}`, {
			method: 'PATCH',
			headers: {
				Prefer: 'return=representation'
			},
			body: JSON.stringify({
				family_id: id
			})
		});
		currentProfile.family_id = id;
		currentFamily = fam[0];
		await loadFamily();
		showStatus('family-msg', 'success', `✓ Successfully joined "${currentFamily.display_name}"!`);
		document.getElementById('join-family-id').value = '';
		openProfileModal();
		enterApp();
	} catch (e) {
		showStatus('family-msg', 'error', `✗ ${e.message}`);
	} finally {
		btn.disabled = false;
	}
};

document.getElementById('leave-family-btn').onclick = async () => {
	const ok = await confirmDialog('Leave family', `Are you sure you want to leave "${currentFamily?.display_name}"?`);
	if (!ok) return;
	try {
		await sbFetch(`profiles?id=eq.${currentSession.user.id}`, {
			method: 'PATCH',
			headers: {
				Prefer: 'return=representation'
			},
			body: JSON.stringify({
				family_id: null
			})
		});
		currentProfile.family_id = null;
		currentFamily = null;
		familyMembers = [];
		categories = [];
		items = [];
		stopRealtime();
		stopPolling();
		document.getElementById('profile-modal').classList.add('hidden');
		enterApp();
	} catch (e) {
		showStatus('family-msg', 'error', `✗ ${e.message}`);
	}
};

document.getElementById('copy-id-btn').onclick = async () => {
	if (!currentFamily) return;
	try {
		await navigator.clipboard.writeText(currentFamily.id);
		showStatus('family-msg', 'success', '✓ ID copied to clipboard!');
	} catch {
		showStatus('family-msg', 'info', 'ℹ Copying not supported – please copy manually.');
	}
};

function startRealtime() {
	if (!currentProfile?.family_id) return;
	clearTimeout(reconnectTimer);
	if (realtimeSub) {
		realtimeSub.onclose = null;
		realtimeSub.onerror = null;
		realtimeSub.close();
		realtimeSub = null;
	}
	try {
		const wsUrl = SUPABASE_URL.replace('https', 'wss').replace('http', 'ws');
		const ws = new WebSocket(`${wsUrl}/realtime/v1/websocket?apikey=${SUPABASE_ANON}&vsn=1.0.0`);
		realtimeSub = ws;
		ws.onopen = () => {
			reconnectDelay = 2000;
			setDot('green');
			const fid = currentProfile.family_id;
			ws.send(JSON.stringify({
				topic: `realtime:public:items:family_id=eq.${fid}`,
				event: 'phx_join',
				payload: {
					config: {
						broadcast: {
							self: false
						},
						presence: {
							key: ''
						}
					}
				},
				ref: 'items'
			}));
			ws.send(JSON.stringify({
				topic: `realtime:public:categories:family_id=eq.${fid}`,
				event: 'phx_join',
				payload: {
					config: {
						broadcast: {
							self: false
						},
						presence: {
							key: ''
						}
					}
				},
				ref: 'cats'
			}));
		};
		ws.onmessage = e => {
			try {
				const msg = JSON.parse(e.data);
				if (['INSERT', 'UPDATE', 'DELETE'].includes(msg.payload?.type)) loadData();
			} catch {}
		};
		ws.onclose = () => {
			if (!currentProfile?.family_id) return;
			reconnectTimer = setTimeout(() => {
				setDot('red');
				startRealtime();
			}, 3000);
		};
		ws.onerror = () => {};
	} catch {
		setDot('red');
	}
}

function stopRealtime() {
	clearTimeout(reconnectTimer);
	reconnectTimer = null;
	if (realtimeSub) {
		realtimeSub.onclose = null;
		realtimeSub.onerror = null;
		realtimeSub.close();
		realtimeSub = null;
	}
	setDot('gray');
}

function setDot(color) {
	const dot = document.querySelector('#connection-dot .dot');
	if (!dot) return;
	dot.className = `dot dot-${color}`;
	dot.parentElement.title = {
		green: 'Connected',
		red: 'Connection lost',
		gray: 'Not connected'
	} [color];
}

function startPolling() {
	stopPolling();
	pollTimer = setInterval(() => {
		if (currentProfile?.family_id) loadData();
	}, POLL_INTERVAL);
}

function stopPolling() {
	clearInterval(pollTimer);
	pollTimer = null;
}

async function handleHashToken() {
	const hash = window.location.hash;
	if (!hash || !hash.includes('access_token')) return false;

	const params = new URLSearchParams(hash.replace(/^#/, ''));
	const accessToken = params.get('access_token');
	const refreshToken = params.get('refresh_token');
	const type = params.get('type');

	if (!accessToken) return false;

	history.replaceState(null, '', window.location.pathname + window.location.search);

	try {
		const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
			headers: {
				'apikey': SUPABASE_ANON,
				'Authorization': `Bearer ${accessToken}`
			}
		});
		if (!res.ok) throw new Error('Token invalid or expired.');
		const user = await res.json();

		currentSession = {
			access_token: accessToken,
			refresh_token: refreshToken,
			user
		};
		localStorage.setItem('shoply_session', JSON.stringify(currentSession));

		const splash = document.getElementById('splash');
		const brandEl = splash.querySelector('.splash-brand');
		brandEl.textContent = type === 'signup' ? '✓ Email confirmed!' : '✓ Authenticated!';
		splash.classList.remove('hidden');
		splash.style.animation = 'none';

		setTimeout(async () => {
			splash.classList.add('hidden');
			brandEl.textContent = 'Shoply';
			await loadProfileAndEnter();
		}, 1400);

		return true;
	} catch (e) {
		console.error('handleHashToken error:', e);
		showScreen('auth-screen');
		setupAuthForms();
		showStatus('login-msg', 'error', '✗ Confirmation link invalid or expired. Please sign in again.');
		return true;
	}
}

initInstallPopup();

(async () => {
	const handled = await handleHashToken();
	if (!handled) {
		if (isPWA() || localStorage.getItem('shoply_skip_install')) initAuth();
	}
})();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(console.error);