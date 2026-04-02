// ── Auth ──────────────────────────────────────────────────────────────────

let authToken = sessionStorage.getItem('exobrain_token') || '';

function api(path, opts = {}) {
  return fetch(path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`,
      ...(opts.headers || {}),
    },
  });
}

// ── Login flow ────────────────────────────────────────────────────────────

const loginOverlay = document.getElementById('login-overlay');
const shell        = document.getElementById('shell');

async function tryAuth(token) {
  const r = await fetch('/api/auth/me', {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  return r.ok;
}

async function init() {
  if (authToken) {
    const ok = await tryAuth(authToken).catch(() => false);
    if (ok) {
      showShell();
      return;
    }
    sessionStorage.removeItem('exobrain_token');
    authToken = '';
  }
  loginOverlay.style.display = 'flex';
}

function showShell() {
  loginOverlay.style.display = 'none';
  shell.style.display = 'flex';
  loadStatus();
  fetchSpaces();
  loadKeys();
}

// ── Login tab switcher ────────────────────────────────────────────────────

window.switchLoginTab = function(tab) {
  document.getElementById('tab-password').classList.toggle('active', tab === 'password');
  document.getElementById('tab-apikey').classList.toggle('active',   tab === 'apikey');
  document.getElementById('login-form-password').style.display = tab === 'password' ? '' : 'none';
  document.getElementById('login-form-apikey').style.display   = tab === 'apikey'   ? '' : 'none';
};

// Username + password login
document.getElementById('login-form-password').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const btn = document.getElementById('login-btn-password');
  const err = document.getElementById('login-err');
  err.classList.remove('visible');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';

  try {
    const r = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await r.json();
    if (r.ok) {
      authToken = data.sessionToken;
      sessionStorage.setItem('exobrain_token', authToken);
      showShell();
    } else {
      err.textContent = data.error || 'Login failed.';
      err.classList.add('visible');
      btn.disabled = false;
      btn.textContent = 'Sign In';
    }
  } catch {
    err.textContent = 'Network error — is the server running?';
    err.classList.add('visible');
    btn.disabled = false;
    btn.textContent = 'Sign In';
  }
});

// API key / session token login
document.getElementById('login-form-apikey').addEventListener('submit', async (e) => {
  e.preventDefault();
  const token = document.getElementById('api-key-input').value.trim();
  const btn = document.getElementById('login-btn-apikey');
  const err = document.getElementById('login-err');
  err.classList.remove('visible');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';

  const ok = await tryAuth(token).catch(() => false);
  if (ok) {
    authToken = token;
    sessionStorage.setItem('exobrain_token', authToken);
    showShell();
  } else {
    err.textContent = 'Invalid key or token.';
    err.classList.add('visible');
    btn.disabled = false;
    btn.textContent = 'Sign In';
  }
});

document.getElementById('signout-link').addEventListener('click', async (e) => {
  e.preventDefault();
  // Best-effort logout (revokes session token server-side if applicable)
  if (authToken.startsWith('exbs_')) {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
  }
  sessionStorage.removeItem('exobrain_token');
  authToken = '';
  location.reload();
});

// ── Tabs ──────────────────────────────────────────────────────────────────

const tabLoaded = {};

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    const name = tab.dataset.tab;
    document.getElementById(`panel-${name}`).classList.add('active');
    if (!tabLoaded[name]) {
      tabLoaded[name] = true;
      if (name === 'spaces')     loadSpaces();
      if (name === 'principals') loadPrincipals();
      if (name === 'account')    loadAccount();
      if (name === 'system')     loadSystem();
      if (name === 'help')       loadHelp();
    }
  });
});

// ── Helpers ───────────────────────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function typeBadge(type) {
  const cls = type === 'owner' ? 'badge-owner'
            : type === 'agent' ? 'badge-agent'
            : type === 'user'  ? 'badge-user'
            : 'badge-type';
  return `<span class="badge ${cls}">${type}</span>`;
}

function spaceBadge(type) {
  return `<span class="badge badge-space">${type}</span>`;
}

function permBadges(perms) {
  if (!perms || perms.length === 0) return '<span style="color:var(--text2)">none</span>';
  return `<div class="perms">${perms.map(p => `<span class="badge badge-perm">${p}</span>`).join('')}</div>`;
}

function emptyRow(cols, msg = 'No entries') {
  return `<tr><td colspan="${cols}"><div class="empty">${msg}</div></td></tr>`;
}

// ── Status / system ───────────────────────────────────────────────────────

async function loadStatus() {
  const r = await fetch('/api/status');
  if (!r.ok) return;
  const d = await r.json();
  document.getElementById('meta-version').textContent = `v${d.version}`;
}

async function loadSystem() {
  const [statusRes, detailRes] = await Promise.all([
    fetch('/api/status'),
    api('/api/status/detail'),
  ]);
  const status = await statusRes.json();
  const detail = detailRes.ok ? await detailRes.json() : null;
  const security = detail?.security;
  const embedding = detail?.embedding;
  const embedHealthy = !!(embedding?.available && embedding?.sampleOk && !embedding?.error);

  document.getElementById('system-info').innerHTML = `
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:1rem;">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--text2);margin-bottom:.75rem;">Instance</div>
      ${row('Version', `v${status.version}`)}
      ${row('Initialized', status.initialized ? '<span style="color:var(--success)">Yes</span>' : '<span style="color:var(--danger)">No</span>')}
    </div>
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:1rem;">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--text2);margin-bottom:.75rem;">Security</div>
      ${row('Registration Secret', security?.registrationSecretConfigured ? '<span style="color:var(--success)">Configured</span>' : '<span style="color:var(--danger)">Missing</span>')}
      ${row('Password Login', security?.passwordLoginAvailable ? '<span style="color:var(--success)">Enabled</span>' : '<span style="color:var(--warning)">Not set</span>')}
      ${row('Session TTL', security ? `${security.sessionTtlHours}h` : '—')}
      ${row('SSO', security?.ssoConfigured ? '<span style="color:var(--success)">Configured</span>' : '<span style="color:var(--text2)">Not configured</span>')}
    </div>
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:1rem;">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--text2);margin-bottom:.75rem;">Embeddings</div>
      ${row('Status', embedding ? (embedHealthy ? '<span style="color:var(--success)">Ready</span>' : '<span style="color:var(--danger)">Attention needed</span>') : '—')}
      ${row('Backend', embedding?.backend || '—')}
      ${row('Model', embedding?.model || '—')}
      ${row('Expected Dimensions', embedding?.dimensions ?? '—')}
      ${row('Sample Dimensions', embedding?.sampleDimensions ?? '—')}
      ${row('Chunking', embedding ? `${embedding.chunkTokens} / overlap ${embedding.chunkOverlap}` : '—')}
      ${row('Endpoint', embedding?.baseUrl ? `<code class="mono">${esc(embedding.baseUrl)}</code>` : '<span style="color:var(--text2)">Not detected</span>')}
      ${row('Probe', embedding?.error ? `<span style="color:var(--danger)">${esc(embedding.error)}</span>` : '<span style="color:var(--success)">OK</span>')}
    </div>
  `;
}

function row(label, value) {
  return `<div style="display:flex;justify-content:space-between;padding:.3rem 0;border-bottom:1px solid var(--border);font-size:13px;">
    <span style="color:var(--text2)">${label}</span><span>${value}</span>
  </div>`;
}

// ── Keys ──────────────────────────────────────────────────────────────────

let currentKeys = [];

async function loadKeys() {
  const r = await api('/api/keys');
  if (!r.ok) {
    document.getElementById('keys-tbody').innerHTML = emptyRow(7, 'Failed to load keys');
    return;
  }
  const keys = await r.json();
  currentKeys = keys;
  const tbody = document.getElementById('keys-tbody');
  if (keys.length === 0) {
    tbody.innerHTML = emptyRow(7, 'No active keys');
    return;
  }
  tbody.innerHTML = keys.map(k => `
    <tr>
      <td>${esc(k.name)}</td>
      <td><code class="mono">${esc(k.prefix)}…</code></td>
      <td>${permBadges(k.permissions)}</td>
      <td>${k.spaceIds && k.spaceIds.length > 0
        ? k.spaceIds.map(s => `<span class="badge badge-space">${esc(s)}</span>`).join(' ')
        : '<span style="color:var(--text2)">all</span>'}</td>
      <td>${fmtDate(k.issuedAt)}</td>
      <td>${fmtDate(k.lastUsedAt)}</td>
      <td style="white-space:nowrap">
        <button class="btn btn-ghost btn-sm" style="margin-right:0.3rem" onclick="openEditModal('${esc(k.keyId)}')">Edit</button>
        <button class="btn btn-danger btn-sm" onclick="revokeKey('${esc(k.keyId)}', this)">Revoke</button>
      </td>
    </tr>
  `).join('');
}

window.revokeKey = async (keyId, btn) => {
  if (!confirm('Revoke this key? This cannot be undone.')) return;
  btn.disabled = true;
  btn.textContent = '…';
  const r = await api(`/api/keys/${keyId}`, { method: 'DELETE' });
  const ok = document.getElementById('keys-ok');
  const err = document.getElementById('keys-err');
  if (r.ok) {
    ok.textContent = 'Key revoked.';
    ok.style.display = 'block';
    setTimeout(() => { ok.style.display = 'none'; }, 3000);
    loadKeys();
  } else {
    const d = await r.json();
    err.textContent = d.error || 'Failed to revoke key.';
    err.style.display = 'block';
    btn.disabled = false;
    btn.textContent = 'Revoke';
  }
};

// ── Spaces (shared cache for issue form + edit modal) ──────────────────────

let allSpaces = [];

async function fetchSpaces() {
  const r = await api('/api/spaces');
  if (!r.ok) return;
  allSpaces = await r.json();
  renderSpaceCheckboxes();
}

function renderSpaceCheckboxes() {
  const issueContainer = document.getElementById('ik-spaces-container');
  const issueField     = document.getElementById('ik-spaces-field');
  const editContainer  = document.getElementById('edit-modal-spaces');
  const editSection    = document.getElementById('edit-spaces-section');

  if (!allSpaces.length) {
    issueField.style.display  = 'none';
    editSection.style.display = 'none';
    return;
  }

  issueField.style.display  = '';
  editSection.style.display = '';

  const makeHtml = (prefix) => allSpaces.map(s => `
    <div class="checkbox-row">
      <input type="checkbox" id="${prefix}${esc(s.spaceId)}" value="${esc(s.spaceId)}">
      <label for="${prefix}${esc(s.spaceId)}">${esc(s.name)} <span style="color:var(--text2);font-size:11px">(${esc(s.spaceType)})</span></label>
    </div>
  `).join('');

  issueContainer.innerHTML = makeHtml('ik-space-');
  editContainer.innerHTML  = makeHtml('edit-space-');
}

// ── Edit key modal ─────────────────────────────────────────────────────────

let editModalKeyId = null;

window.openEditModal = function(keyId) {
  const k = currentKeys.find(k => k.keyId === keyId);
  if (!k) return;
  editModalKeyId = keyId;
  document.getElementById('edit-modal-title').textContent = `Edit Key: ${k.name}`;

  // Permissions
  PERMS.forEach(p => {
    const cb = document.getElementById(`edit-perm-${p}`);
    if (cb) cb.checked = (k.permissions || []).includes(p);
  });

  // Spaces
  allSpaces.forEach(s => {
    const cb = document.getElementById(`edit-space-${s.spaceId}`);
    if (cb) cb.checked = (k.spaceIds || []).includes(s.spaceId);
  });

  document.getElementById('edit-modal').style.display = 'flex';
};

window.closeEditModal = function() {
  document.getElementById('edit-modal').style.display = 'none';
  editModalKeyId = null;
};

document.getElementById('edit-modal-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!editModalKeyId) return;

  const permissions = PERMS.filter(p => {
    const cb = document.getElementById(`edit-perm-${p}`);
    return cb && cb.checked;
  });
  const spaceIds = allSpaces
    .filter(s => { const cb = document.getElementById(`edit-space-${s.spaceId}`); return cb && cb.checked; })
    .map(s => s.spaceId);

  const btn = document.getElementById('edit-save-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';

  const r = await api(`/api/keys/${editModalKeyId}`, {
    method: 'PATCH',
    body: JSON.stringify({ permissions, spaceIds }),
  });

  btn.disabled = false;
  btn.textContent = 'Save';

  const ok  = document.getElementById('keys-ok');
  const err = document.getElementById('keys-err');

  if (r.ok) {
    closeEditModal();
    ok.textContent = 'Key updated.';
    ok.style.display = 'block';
    setTimeout(() => { ok.style.display = 'none'; }, 3000);
    loadKeys();
  } else {
    const d = await r.json().catch(() => ({}));
    err.textContent = d.error || 'Failed to update key.';
    err.style.display = 'block';
  }
});

// ── Build permission checkboxes (issue form + edit modal)
const PERMS = ['read', 'list', 'write', 'delete', 'manage', 'admin'];

const permBox = document.getElementById('perm-checkboxes');
PERMS.forEach(p => {
  const id = `perm-${p}`;
  const div = document.createElement('div');
  div.className = 'checkbox-row';
  div.innerHTML = `<input type="checkbox" id="${id}" value="${p}" ${p === 'read' || p === 'list' ? 'checked' : ''}>
    <label for="${id}">${p}</label>`;
  permBox.appendChild(div);
});

const editPermBox = document.getElementById('edit-perm-checkboxes');
PERMS.forEach(p => {
  const id = `edit-perm-${p}`;
  const div = document.createElement('div');
  div.className = 'checkbox-row';
  div.innerHTML = `<input type="checkbox" id="${id}" value="${p}">
    <label for="${id}">${p}</label>`;
  editPermBox.appendChild(div);
});

document.getElementById('issue-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('issue-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Issuing…';

  const agentName = document.getElementById('ik-name').value.trim();
  const expiresAt = document.getElementById('ik-expires').value.trim() || undefined;
  const permissions = PERMS.filter(p => document.getElementById(`perm-${p}`).checked);
  const spaceIds = allSpaces
    .filter(s => { const cb = document.getElementById(`ik-space-${s.spaceId}`); return cb && cb.checked; })
    .map(s => s.spaceId);

  const r = await api('/api/keys', {
    method: 'POST',
    body: JSON.stringify({ agentName, permissions, expiresAt, spaceIds }),
  });

  const data = await r.json();
  btn.disabled = false;
  btn.textContent = 'Issue Key';

  if (!r.ok) {
    const err = document.getElementById('keys-err');
    err.textContent = data.error || 'Failed to issue key.';
    err.style.display = 'block';
    return;
  }

  const box = document.getElementById('new-key-box');
  box.style.display = 'block';
  document.getElementById('new-key-value').textContent = data.apiKey;
  document.getElementById('ik-name').value = '';
  document.getElementById('ik-expires').value = '';
  document.querySelectorAll('#ik-spaces-container input[type=checkbox]').forEach(cb => { cb.checked = false; });
  loadKeys();
});

document.getElementById('new-key-copy').addEventListener('click', () => {
  const val = document.getElementById('new-key-value').textContent;
  navigator.clipboard.writeText(val).then(() => {
    const btn = document.getElementById('new-key-copy');
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
  });
});

// ── Spaces ────────────────────────────────────────────────────────────────

async function loadSpaces() {
  const r = await api('/api/spaces');
  if (!r.ok) {
    document.getElementById('spaces-tbody').innerHTML = emptyRow(5, 'Failed to load spaces');
    return;
  }
  const spaces = await r.json();
  const tbody = document.getElementById('spaces-tbody');
  if (spaces.length === 0) {
    tbody.innerHTML = emptyRow(5, 'No spaces');
    return;
  }
  tbody.innerHTML = spaces.map(s => `
    <tr>
      <td><code class="mono">${esc(s.spaceId)}</code></td>
      <td>${esc(s.name)}</td>
      <td>${spaceBadge(s.spaceType)}</td>
      <td>${s.sensitivityTier}</td>
      <td>${fmtDate(s.createdAt)}</td>
    </tr>
  `).join('');
}

// ── Principals ────────────────────────────────────────────────────────────

async function loadPrincipals() {
  const r = await api('/api/principals');
  if (!r.ok) {
    document.getElementById('principals-tbody').innerHTML = emptyRow(4, 'Failed to load principals');
    return;
  }
  const principals = await r.json();
  const tbody = document.getElementById('principals-tbody');
  if (principals.length === 0) {
    tbody.innerHTML = emptyRow(4, 'No principals');
    return;
  }
  tbody.innerHTML = principals.map(p => `
    <tr>
      <td>${esc(p.displayName || p.name)}</td>
      <td>${typeBadge(p.principalType)}</td>
      <td><code class="mono" style="font-size:11px;">${esc(p.principalId)}</code></td>
      <td>${fmtDate(p.createdAt)}</td>
    </tr>
  `).join('');
}

// ── Account ───────────────────────────────────────────────────────────────

let accountData = null;

async function loadAccount() {
  const r = await api('/api/auth/me');
  if (!r.ok) return;
  accountData = await r.json();
  document.getElementById('acct-display-name').value = accountData.displayName || '';
  document.getElementById('acct-username').value     = accountData.username     || '';
  document.getElementById('acct-email').value        = accountData.email        || '';
  // Only show current password field if a password is already set
  document.getElementById('current-pw-wrap').style.display =
    accountData.hasPassword ? '' : 'none';
}

function acctAlert(type, msg) {
  const err = document.getElementById('acct-err');
  const ok  = document.getElementById('acct-ok');
  err.classList.remove('visible');
  ok.classList.remove('visible');
  if (type === 'error') { err.textContent = msg; err.classList.add('visible'); }
  else                  { ok.textContent  = msg; ok.classList.add('visible');  }
  setTimeout(() => { err.classList.remove('visible'); ok.classList.remove('visible'); }, 4000);
}

document.getElementById('profile-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.submitter;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';

  const r = await api('/api/auth/me', {
    method: 'PATCH',
    body: JSON.stringify({
      displayName: document.getElementById('acct-display-name').value.trim() || null,
      username:    document.getElementById('acct-username').value.trim()     || null,
      email:       document.getElementById('acct-email').value.trim()        || null,
    }),
  });
  const data = await r.json();
  btn.disabled = false;
  btn.textContent = 'Save Profile';

  if (r.ok) {
    accountData = { ...accountData, ...data };
    acctAlert('success', 'Profile updated.');
  } else {
    acctAlert('error', data.error || 'Failed to update profile.');
  }
});

document.getElementById('password-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const newPw     = document.getElementById('acct-new-pw').value;
  const confirmPw = document.getElementById('acct-confirm-pw').value;
  const currentPw = document.getElementById('acct-current-pw').value;

  if (newPw !== confirmPw) {
    acctAlert('error', 'Passwords do not match.');
    return;
  }
  if (newPw.length < 8) {
    acctAlert('error', 'Password must be at least 8 characters.');
    return;
  }

  const btn = e.submitter;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';

  const body = { newPassword: newPw };
  if (currentPw) body.currentPassword = currentPw;

  const r = await api('/api/auth/me', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  const data = await r.json();
  btn.disabled = false;
  btn.textContent = 'Update Password';

  if (r.ok) {
    document.getElementById('acct-current-pw').value = '';
    document.getElementById('acct-new-pw').value     = '';
    document.getElementById('acct-confirm-pw').value = '';
    accountData = { ...accountData, hasPassword: true };
    document.getElementById('current-pw-wrap').style.display = '';
    acctAlert('success', 'Password updated.');
  } else {
    acctAlert('error', data.error || 'Failed to update password.');
  }
});

// ── XSS guard ─────────────────────────────────────────────────────────────

function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Help ──────────────────────────────────────────────────────────────────

async function loadHelp() {
  const listEl = document.getElementById('help-docs-list');
  const r = await fetch('/api/docs').catch(() => null);
  if (!r || !r.ok) {
    listEl.textContent = 'Could not load documentation list.';
    return;
  }
  const docs = await r.json();
  if (!docs.length) {
    listEl.textContent = 'No documentation files found.';
    return;
  }
  listEl.innerHTML = docs.map(d => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:.4rem 0;border-bottom:1px solid var(--border);">
      <span style="font-family:var(--mono);font-size:12px;color:var(--text)">${esc(d.path)}</span>
      <button class="btn btn-ghost btn-sm" onclick="viewDoc('${esc(d.path)}')">View</button>
    </div>
  `).join('');
}

window.viewDoc = async function(path) {
  const viewer   = document.getElementById('help-doc-viewer');
  const titleEl  = document.getElementById('help-doc-title');
  const contentEl = document.getElementById('help-doc-content');

  titleEl.textContent   = path;
  contentEl.textContent = 'Loading…';
  viewer.style.display  = 'block';
  viewer.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const r = await fetch(`/api/docs/${encodeURIComponent(path)}`).catch(() => null);
  contentEl.textContent = (r && r.ok) ? await r.text() : 'Failed to load file.';
};

// ── Boot ──────────────────────────────────────────────────────────────────

init();
