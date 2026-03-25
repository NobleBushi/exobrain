// ── Auth ──────────────────────────────────────────────────────────────────

let apiKey = sessionStorage.getItem('exobrain_key') || '';

function api(path, opts = {}) {
  return fetch(path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      ...(opts.headers || {}),
    },
  });
}

// ── Login flow ────────────────────────────────────────────────────────────

const loginOverlay = document.getElementById('login-overlay');
const shell        = document.getElementById('shell');

async function tryAuth(key) {
  const r = await fetch('/api/keys', {
    headers: { 'Authorization': `Bearer ${key}` },
  });
  return r.ok;
}

async function init() {
  if (apiKey) {
    const ok = await tryAuth(apiKey).catch(() => false);
    if (ok) {
      showShell();
      return;
    }
    sessionStorage.removeItem('exobrain_key');
    apiKey = '';
  }
  loginOverlay.style.display = 'flex';
}

function showShell() {
  loginOverlay.style.display = 'none';
  shell.style.display = 'grid';
  loadStatus();
  loadKeys();
}

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const key = document.getElementById('api-key-input').value.trim();
  const btn = document.getElementById('login-btn');
  const err = document.getElementById('login-err');
  err.classList.remove('visible');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';

  const ok = await tryAuth(key).catch(() => false);
  if (ok) {
    apiKey = key;
    sessionStorage.setItem('exobrain_key', key);
    showShell();
  } else {
    err.textContent = 'Invalid API key.';
    err.classList.add('visible');
    btn.disabled = false;
    btn.textContent = 'Sign In';
  }
});

document.getElementById('signout-link').addEventListener('click', (e) => {
  e.preventDefault();
  sessionStorage.removeItem('exobrain_key');
  apiKey = '';
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
      if (name === 'system')     loadSystem();
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
  const [statusRes] = await Promise.all([fetch('/api/status')]);
  const status = await statusRes.json();
  document.getElementById('system-info').innerHTML = `
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:1rem;">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--text2);margin-bottom:.75rem;">Instance</div>
      ${row('Version', `v${status.version}`)}
      ${row('Initialized', status.initialized ? '<span style="color:var(--success)">Yes</span>' : '<span style="color:var(--danger)">No</span>')}
    </div>
  `;
}

function row(label, value) {
  return `<div style="display:flex;justify-content:space-between;padding:.3rem 0;border-bottom:1px solid var(--border);font-size:13px;">
    <span style="color:var(--text2)">${label}</span><span>${value}</span>
  </div>`;
}

// ── Keys ──────────────────────────────────────────────────────────────────

async function loadKeys() {
  const r = await api('/api/keys');
  if (!r.ok) {
    document.getElementById('keys-tbody').innerHTML = emptyRow(7, 'Failed to load keys');
    return;
  }
  const keys = await r.json();
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
      <td>
        <button class="btn btn-danger btn-sm" onclick="revokeKey('${esc(k.keyId)}', this)">
          Revoke
        </button>
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

// Build permission checkboxes
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

document.getElementById('issue-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('issue-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Issuing…';

  const agentName = document.getElementById('ik-name').value.trim();
  const expiresAt = document.getElementById('ik-expires').value.trim() || undefined;
  const permissions = PERMS.filter(p => document.getElementById(`perm-${p}`).checked);

  const r = await api('/api/keys', {
    method: 'POST',
    body: JSON.stringify({ agentName, permissions, expiresAt }),
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

// ── XSS guard ─────────────────────────────────────────────────────────────

function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Boot ──────────────────────────────────────────────────────────────────

init();
