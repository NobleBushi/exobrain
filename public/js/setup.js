// Redirect if already initialized
fetch('/api/status')
  .then(r => r.json())
  .then(data => {
    if (data.initialized) window.location.href = '/admin';
  });

const form    = document.getElementById('setup-form');
const errBox  = document.getElementById('err');
const submitBtn = document.getElementById('submit-btn');

function showError(msg) {
  errBox.textContent = msg;
  errBox.classList.add('visible');
}

function hideError() {
  errBox.classList.remove('visible');
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideError();

  const ownerName = document.getElementById('owner-name').value.trim();
  const keyName   = document.getElementById('key-name').value.trim() || 'Admin Key';
  const username  = document.getElementById('username').value.trim()  || undefined;
  const email     = document.getElementById('email').value.trim()     || undefined;
  const password  = document.getElementById('password').value         || undefined;
  const secret    = document.getElementById('secret').value;

  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="spinner"></span> Initializing…';

  try {
    const res = await fetch('/api/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ownerName, keyName, username, email, password, secret }),
    });

    const data = await res.json();

    if (!res.ok) {
      showError(data.error || 'Setup failed');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Initialize ExoBrain';
      return;
    }

    // Show success state
    document.getElementById('page-setup').style.display = 'none';
    document.getElementById('page-done').style.display  = '';

    document.getElementById('key-display').textContent = data.apiKey;

    const baseUrl = window.location.origin;
    const snippet = JSON.stringify({
      mcpServers: {
        exobrain: {
          type: 'http',
          url: baseUrl,
          headers: { Authorization: `Bearer ${data.apiKey}` },
        }
      }
    }, null, 2);
    document.getElementById('config-snippet').textContent = snippet;

    // Store key in sessionStorage so admin page auto-authenticates
    sessionStorage.setItem('exobrain_token', data.apiKey);

  } catch (err) {
    showError('Network error — is the server running?');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Initialize ExoBrain';
  }
});

document.getElementById('copy-btn').addEventListener('click', () => {
  const val = document.getElementById('key-display').textContent;
  navigator.clipboard.writeText(val).then(() => {
    const btn = document.getElementById('copy-btn');
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
  });
});

document.getElementById('go-admin-btn').addEventListener('click', () => {
  window.location.href = '/admin';
});
