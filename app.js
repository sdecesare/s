const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = window.APP_CONFIG;
const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const loginView = document.getElementById('login-view');
const portalView = document.getElementById('portal-view');
const passwordView = document.getElementById('password-view');
const passwordForm = document.getElementById('password-form');
const passwordButton = document.getElementById('password-button');
const passwordMessage = document.getElementById('password-message');
const loginForm = document.getElementById('login-form');
const loginButton = document.getElementById('login-button');
const loginMessage = document.getElementById('login-message');
const signedInAs = document.getElementById('signed-in-as');

function showLogin() {
  loginView.classList.remove('hidden');
  passwordView.classList.add('hidden');
  portalView.classList.add('hidden');
}

function showPasswordSetup() {
  loginView.classList.add('hidden');
  passwordView.classList.remove('hidden');
  portalView.classList.add('hidden');
}

function isInviteLink() {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const query = new URLSearchParams(window.location.search);
  return hash.get('type') === 'invite' || query.get('type') === 'invite';
}

async function showPortal(user) {
  loginView.classList.add('hidden');
  passwordView.classList.add('hidden');
  portalView.classList.remove('hidden');
  signedInAs.textContent = user.email || 'Signed in';
  await Promise.all([loadNotices(), loadDocuments(), loadContacts()]);
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginMessage.textContent = '';
  loginButton.disabled = true;
  loginButton.textContent = 'Signing in…';

  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  const { data, error } = await client.auth.signInWithPassword({ email, password });

  loginButton.disabled = false;
  loginButton.textContent = 'Sign in';

  if (error) {
    loginMessage.textContent = error.message || 'Unable to sign in. Please check your details.';
    return;
  }
  await showPortal(data.user);
});


passwordForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  passwordMessage.textContent = '';

  const password = document.getElementById('new-password').value;
  const confirmPassword = document.getElementById('confirm-password').value;

  if (password.length < 8) {
    passwordMessage.textContent = 'Please use at least 8 characters.';
    return;
  }
  if (password !== confirmPassword) {
    passwordMessage.textContent = 'The passwords do not match.';
    return;
  }

  passwordButton.disabled = true;
  passwordButton.textContent = 'Saving…';

  const { data, error } = await client.auth.updateUser({ password });

  passwordButton.disabled = false;
  passwordButton.textContent = 'Set password';

  if (error) {
    passwordMessage.textContent = error.message || 'Unable to set your password.';
    return;
  }

  // Remove invitation tokens from the address bar once the password has been set.
  history.replaceState({}, document.title, window.location.pathname);
  await showPortal(data.user);
});

document.getElementById('logout-button').addEventListener('click', async () => {
  await client.auth.signOut();
  showLogin();
});

document.querySelectorAll('.tab').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((b) => b.classList.remove('active'));
    button.classList.add('active');
    document.querySelectorAll('.portal-section').forEach((section) => section.classList.add('hidden'));
    document.getElementById(`section-${button.dataset.section}`).classList.remove('hidden');
  });
});

async function loadNotices() {
  const target = document.getElementById('notices-list');
  const { data, error } = await client.from('notices').select('*').order('published_at', { ascending: false });
  if (error) {
    target.innerHTML = '<p class="muted">Notices could not be loaded.</p>';
    return;
  }
  document.getElementById('home-notice-count').textContent = `${data.length} notice${data.length === 1 ? '' : 's'} available`;
  target.innerHTML = data.length ? data.map(item => `
    <article class="list-item">
      <p class="meta">${formatDate(item.published_at)}</p>
      <h3>${escapeHtml(item.title)}</h3>
      <p>${escapeHtml(item.body)}</p>
    </article>`).join('') : '<p class="muted">No notices have been published yet.</p>';
}

async function loadDocuments() {
  const target = document.getElementById('documents-list');
  const { data, error } = await client.from('documents').select('*').order('created_at', { ascending: false });
  if (error) {
    target.innerHTML = '<p class="muted">Documents could not be loaded.</p>';
    return;
  }
  document.getElementById('home-document-count').textContent = `${data.length} document${data.length === 1 ? '' : 's'} available`;
  target.innerHTML = data.length ? data.map(item => `
    <article class="list-item doc-row">
      <div>
        <p class="meta">${formatDate(item.created_at)}</p>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.description || '')}</p>
      </div>
      <button data-path="${escapeHtml(item.storage_path)}" class="open-document">Open</button>
    </article>`).join('') : '<p class="muted">No documents have been uploaded yet.</p>';

  target.querySelectorAll('.open-document').forEach((button) => {
    button.addEventListener('click', async () => {
      const { data: signed, error: signedError } = await client.storage
        .from('residents-documents')
        .createSignedUrl(button.dataset.path, 60);
      if (signedError) return alert('Could not open this document.');
      window.open(signed.signedUrl, '_blank', 'noopener');
    });
  });
}

async function loadContacts() {
  const target = document.getElementById('contacts-list');
  const { data, error } = await client.from('contacts').select('*').order('display_order', { ascending: true });
  if (error) {
    target.innerHTML = '<p class="muted">Contacts could not be loaded.</p>';
    return;
  }
  target.innerHTML = data.length ? data.map(item => `
    <article class="list-item">
      <h3>${escapeHtml(item.role)}</h3>
      <p>${escapeHtml(item.name)}</p>
      ${item.email ? `<p><a href="mailto:${encodeURIComponent(item.email)}">${escapeHtml(item.email)}</a></p>` : ''}
    </article>`).join('') : '<p class="muted">No committee contacts have been added yet.</p>';
}

function formatDate(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(new Date(value));
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c]));
}

(async function initialise() {
  if (SUPABASE_URL.includes('YOUR-PROJECT') || SUPABASE_PUBLISHABLE_KEY.includes('YOUR-PUBLISHABLE')) {
    loginMessage.textContent = 'Setup required: add your Supabase URL and publishable key to config.js.';
  }
  const arrivedFromInvite = isInviteLink();
  const { data: { session }, error } = await client.auth.getSession();

  if (error) {
    loginMessage.textContent = error.message;
    showLogin();
    return;
  }

  if (arrivedFromInvite && session?.user) {
    showPasswordSetup();
    return;
  }

  if (session?.user) await showPortal(session.user); else showLogin();
})();
