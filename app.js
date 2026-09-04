const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = window.APP_CONFIG;
const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

let currentUser = null;
let currentProfile = null;
let profileMap = new Map();

const $ = (id) => document.getElementById(id);
const loginView = $('login-view');
const portalView = $('portal-view');
const passwordView = $('password-view');
const pendingView = $('pending-view');

function hideAllViews() {
  [loginView, portalView, passwordView, pendingView].forEach(view => view.classList.add('hidden'));
}
function showLogin() { hideAllViews(); loginView.classList.remove('hidden'); }
function showPasswordSetup() { hideAllViews(); passwordView.classList.remove('hidden'); }
function showPending() { hideAllViews(); pendingView.classList.remove('hidden'); }
function showBanner(text) {
  const el = $('portal-message');
  el.textContent = text;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 4500);
}
function isInviteLink() {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const query = new URLSearchParams(window.location.search);
  return hash.get('type') === 'invite' || query.get('type') === 'invite';
}
function isApprover() { return currentProfile?.role === 'approver'; }
function displayName(profile, fallback = 'Resident') { return profile?.display_name || profile?.email || fallback; }
function uploaderName(ownerId) { return displayName(profileMap.get(ownerId), ownerId ? 'Resident' : 'Association'); }
function canDelete(ownerId) { return isApprover() || ownerId === currentUser?.id; }

$('show-login').addEventListener('click', () => setAuthMode('login'));
$('show-signup').addEventListener('click', () => setAuthMode('signup'));
function setAuthMode(mode) {
  const login = mode === 'login';
  $('login-form').classList.toggle('hidden', !login);
  $('signup-form').classList.toggle('hidden', login);
  $('show-login').classList.toggle('active', login);
  $('show-signup').classList.toggle('active', !login);
}

$('login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  $('login-message').textContent = '';
  const button = $('login-button');
  button.disabled = true; button.textContent = 'Signing in…';
  const { data, error } = await client.auth.signInWithPassword({
    email: $('email').value.trim(), password: $('password').value
  });
  button.disabled = false; button.textContent = 'Sign in';
  if (error) return $('login-message').textContent = error.message;
  await routeAuthenticatedUser(data.user);
});

$('signup-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const message = $('signup-message');
  message.className = 'message'; message.textContent = '';
  const password = $('signup-password').value;
  if (password !== $('signup-confirm').value) return message.textContent = 'The passwords do not match.';
  const button = $('signup-button');
  button.disabled = true; button.textContent = 'Creating account…';
  const { data, error } = await client.auth.signUp({
    email: $('signup-email').value.trim(),
    password,
    options: {
      emailRedirectTo: 'https://sdecesare.github.io/s/',
      data: { display_name: $('signup-name').value.trim() }
    }
  });
  button.disabled = false; button.textContent = 'Create account';
  if (error) return message.textContent = error.message;
  // Take successful registrations to a dedicated confirmation page.
  window.location.href = 'signup-success.html';
});

$('password-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const password = $('new-password').value;
  const confirmPassword = $('confirm-password').value;
  if (password.length < 8) return $('password-message').textContent = 'Please use at least 8 characters.';
  if (password !== confirmPassword) return $('password-message').textContent = 'The passwords do not match.';
  const button = $('password-button');
  button.disabled = true; button.textContent = 'Saving…';
  const { data, error } = await client.auth.updateUser({ password });
  button.disabled = false; button.textContent = 'Set password';
  if (error) return $('password-message').textContent = error.message;
  history.replaceState({}, document.title, window.location.pathname);
  await routeAuthenticatedUser(data.user);
});

async function signOut() {
  await client.auth.signOut();
  currentUser = null; currentProfile = null; profileMap = new Map();
  showLogin();
}
$('logout-button').addEventListener('click', signOut);
$('pending-logout').addEventListener('click', signOut);

document.querySelectorAll('.tab').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    button.classList.add('active');
    document.querySelectorAll('.portal-section').forEach(section => section.classList.add('hidden'));
    $(`section-${button.dataset.section}`).classList.remove('hidden');
    if (button.dataset.section === 'approvals' && isApprover()) loadApprovals();
  });
});

async function getMyProfile(user) {
  let result = await client.from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) {
    await new Promise(resolve => setTimeout(resolve, 500));
    result = await client.from('profiles').select('*').eq('id', user.id).maybeSingle();
  }
  return result.data;
}

async function routeAuthenticatedUser(user) {
  currentUser = user;
  try {
    currentProfile = await getMyProfile(user);
  } catch (error) {
    $('login-message').textContent = `Profile setup error: ${error.message}`;
    await client.auth.signOut();
    return showLogin();
  }
  if (!currentProfile || currentProfile.status !== 'approved') {
    $('pending-copy').textContent = currentProfile?.status === 'rejected'
      ? 'This account has not been approved for residents-area access. Please contact the association committee.'
      : 'Your account has been created but must be approved by an association approver before you can enter the residents area.';
    return showPending();
  }
  await showPortal();
}

async function showPortal() {
  hideAllViews(); portalView.classList.remove('hidden');
  $('signed-in-name').textContent = displayName(currentProfile);
  $('signed-in-as').textContent = currentUser.email || '';
  $('role-badge').textContent = isApprover() ? 'Admin' : 'Resident';
  $('home-role').textContent = isApprover() ? 'Admin — resident access plus administration' : 'Approved resident';
  $('approvals-tab').classList.toggle('hidden', !isApprover());
  await loadProfiles();
  await Promise.all([loadNotices(), loadDocuments(), loadContacts(), isApprover() ? loadPendingCount() : Promise.resolve()]);
}

async function loadProfiles() {
  const { data, error } = await client.from('profiles').select('id, display_name, email, role, status');
  if (!error) profileMap = new Map((data || []).map(profile => [profile.id, profile]));
}

$('notice-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const message = $('notice-message'); message.textContent = '';
  const button = $('notice-submit'); button.disabled = true; button.textContent = 'Publishing…';
  const { error } = await client.from('notices').insert({
    title: $('notice-title').value.trim(), body: $('notice-body').value.trim()
  });
  button.disabled = false; button.textContent = 'Publish notice';
  if (error) return message.textContent = error.message;
  event.target.reset(); showBanner('Notice published.'); await loadNotices();
});

async function loadNotices() {
  const target = $('notices-list');
  const { data, error } = await client.from('notices').select('*').order('published_at', { ascending: false });
  if (error) return target.innerHTML = `<p class="muted">Notices could not be loaded: ${escapeHtml(error.message)}</p>`;
  $('home-notice-count').textContent = `${data.length} notice${data.length === 1 ? '' : 's'} available`;
  target.innerHTML = data.length ? data.map(item => `
    <article class="list-item">
      <div class="item-header">
        <div>
          <p class="meta">Posted by ${escapeHtml(uploaderName(item.owner_id))} · ${formatDateTime(item.published_at)}</p>
          <h3>${escapeHtml(item.title)}</h3>
        </div>
        ${canDelete(item.owner_id) ? `<div class="item-actions"><button class="danger delete-notice" data-id="${item.id}">Delete</button></div>` : ''}
      </div>
      <p>${escapeHtml(item.body).replace(/\n/g, '<br>')}</p>
    </article>`).join('') : '<p class="muted">No notices have been published yet.</p>';
  target.querySelectorAll('.delete-notice').forEach(button => button.addEventListener('click', () => deleteNotice(button.dataset.id)));
}
async function deleteNotice(id) {
  if (!confirm('Delete this notice?')) return;
  const { error } = await client.from('notices').delete().eq('id', id);
  if (error) return alert(error.message);
  showBanner('Notice deleted.'); await loadNotices();
}

$('document-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const message = $('document-message'); message.textContent = '';
  const file = $('document-file').files[0];
  if (!file) return message.textContent = 'Choose a file to upload.';
  const button = $('document-submit'); button.disabled = true; button.textContent = 'Uploading…';
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '_');
  const path = `${currentUser.id}/${crypto.randomUUID()}-${safeName}`;
  const upload = await client.storage.from('residents-documents').upload(path, file, { upsert: false });
  if (upload.error) { button.disabled = false; button.textContent = 'Upload document'; return message.textContent = upload.error.message; }
  const inserted = await client.from('documents').insert({
    title: $('document-title').value.trim(),
    description: $('document-description').value.trim() || null,
    storage_path: path,
    file_name: file.name
  });
  if (inserted.error) {
    await client.storage.from('residents-documents').remove([path]);
    button.disabled = false; button.textContent = 'Upload document'; return message.textContent = inserted.error.message;
  }
  button.disabled = false; button.textContent = 'Upload document';
  event.target.reset(); showBanner('Document uploaded.'); await loadDocuments();
});

async function loadDocuments() {
  const target = $('documents-list');
  const { data, error } = await client.from('documents').select('*').order('created_at', { ascending: false });
  if (error) return target.innerHTML = `<p class="muted">Documents could not be loaded: ${escapeHtml(error.message)}</p>`;
  $('home-document-count').textContent = `${data.length} document${data.length === 1 ? '' : 's'} available`;
  target.innerHTML = data.length ? data.map(item => `
    <article class="list-item">
      <div class="item-header">
        <div>
          <p class="meta">Uploaded by ${escapeHtml(uploaderName(item.owner_id))} · ${formatDateTime(item.created_at)}</p>
          <h3>${escapeHtml(item.title)}</h3>
          ${item.description ? `<p>${escapeHtml(item.description)}</p>` : ''}
          <p class="meta">${escapeHtml(item.file_name || fileNameFromPath(item.storage_path))}</p>
        </div>
        <div class="item-actions">
          <button class="download-document" data-path="${escapeHtml(item.storage_path)}">Download</button>
          ${canDelete(item.owner_id) ? `<button class="danger delete-document" data-id="${item.id}" data-path="${escapeHtml(item.storage_path)}">Delete</button>` : ''}
        </div>
      </div>
    </article>`).join('') : '<p class="muted">No documents have been uploaded yet.</p>';
  target.querySelectorAll('.download-document').forEach(button => button.addEventListener('click', () => downloadDocument(button.dataset.path)));
  target.querySelectorAll('.delete-document').forEach(button => button.addEventListener('click', () => deleteDocument(button.dataset.id, button.dataset.path)));
}
async function downloadDocument(path) {
  const { data, error } = await client.storage.from('residents-documents').createSignedUrl(path, 60, { download: true });
  if (error) return alert(error.message);
  const link = document.createElement('a'); link.href = data.signedUrl; link.rel = 'noopener'; link.click();
}
async function deleteDocument(id, path) {
  if (!confirm('Delete this document? This also removes the stored file.')) return;
  const removed = await client.storage.from('residents-documents').remove([path]);
  if (removed.error) return alert(`Could not remove file: ${removed.error.message}`);
  const deleted = await client.from('documents').delete().eq('id', id);
  if (deleted.error) return alert(`File removed, but database entry could not be deleted: ${deleted.error.message}`);
  showBanner('Document deleted.'); await loadDocuments();
}

async function loadContacts() {
  const target = $('contacts-list');
  const { data, error } = await client.from('contacts').select('*').order('display_order', { ascending: true });
  if (error) return target.innerHTML = `<p class="muted">Contacts could not be loaded: ${escapeHtml(error.message)}</p>`;
  target.innerHTML = data.length ? data.map(item => `
    <article class="list-item"><h3>${escapeHtml(item.role)}</h3><p>${escapeHtml(item.name)}</p>
    ${item.email ? `<p><a href="mailto:${encodeURIComponent(item.email)}">${escapeHtml(item.email)}</a></p>` : ''}</article>`).join('')
    : '<p class="muted">No committee contacts have been added yet.</p>';
}

$('admin-user-submit').addEventListener('click', async () => {
  if (!isApprover()) return;

  const form = $('admin-user-form');
  const message = $('admin-user-message');
  message.className = 'message';
  message.textContent = '';

  if (!form.reportValidity()) return;

  const displayNameValue = $('admin-user-name').value.trim();
  const emailValue = $('admin-user-email').value.trim();
  const password = $('admin-user-password').value;
  const requestedRole = $('admin-user-role').value;

  if (password.length < 8) {
    message.textContent = 'Please use an initial password of at least 8 characters.';
    return;
  }

  const button = $('admin-user-submit');
  button.disabled = true;
  button.textContent = 'Creating user…';

  try {
    const { data, error } = await client.functions.invoke('admin-create-user', {
      body: {
        displayName: displayNameValue,
        email: emailValue,
        password,
        role: requestedRole
      }
    });

    if (error) {
      let detail = error.message || 'The user could not be created.';
      try {
        if (error.context && typeof error.context.json === 'function') {
          const body = await error.context.json();
          detail = body?.error || body?.message || detail;
        }
      } catch (_) {}
      message.textContent = detail;
      return;
    }

    if (data?.error) {
      message.textContent = data.error;
      return;
    }

    // Never report success for an empty/preflight response. The Edge Function
    // must explicitly confirm the new Auth user's ID.
    if (!data?.ok || !data?.id || !data?.email) {
      message.textContent = 'The server did not confirm that the user was created. Please check the Edge Function logs.';
      return;
    }

    const roleLabel = data?.role === 'approver' ? 'Admin' : 'Resident';
    message.classList.add('success-text');
    message.textContent = `${roleLabel} account created for ${data?.email || emailValue}.`;
    form.reset();
    await loadProfiles();
    await loadApprovals();

    // Keep the Administration page visible after creating the account.
    document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.section === 'approvals'));
    document.querySelectorAll('.portal-section').forEach(section => section.classList.add('hidden'));
    $('section-approvals').classList.remove('hidden');
  } catch (err) {
    message.textContent = err?.message || 'Unexpected error while creating the user.';
  } finally {
    button.disabled = false;
    button.textContent = 'Create user';
  }
});

async function loadPendingCount() {
  const { count } = await client.from('profiles').select('*', { count: 'exact', head: true }).eq('status', 'pending');
  $('pending-count').textContent = count ?? 0;
}
async function loadApprovals() {
  const target = $('approvals-list');
  const { data, error } = await client.from('profiles').select('*').eq('status', 'pending').order('created_at', { ascending: true });
  if (error) return target.innerHTML = `<p class="muted">Pending users could not be loaded: ${escapeHtml(error.message)}</p>`;
  target.innerHTML = data.length ? data.map(profile => `
    <article class="list-item approval-row">
      <div><h3>${escapeHtml(displayName(profile))}</h3><p>${escapeHtml(profile.email || '')}</p><p class="meta">Registered ${formatDateTime(profile.created_at)}</p></div>
      <div class="approval-actions">
        <button class="success approve-user" data-id="${profile.id}">Approve</button>
        <button class="danger reject-user" data-id="${profile.id}">Reject</button>
      </div>
    </article>`).join('') : '<p class="muted">There are no accounts awaiting approval.</p>';
  target.querySelectorAll('.approve-user').forEach(b => b.addEventListener('click', () => setUserStatus(b.dataset.id, 'approved')));
  target.querySelectorAll('.reject-user').forEach(b => b.addEventListener('click', () => setUserStatus(b.dataset.id, 'rejected')));
  await loadPendingCount();
}
async function setUserStatus(id, status) {
  const { error } = await client.from('profiles').update({ status }).eq('id', id);
  if (error) return alert(error.message);
  showBanner(status === 'approved' ? 'Resident approved.' : 'Account rejected.');
  await loadApprovals();
}

function formatDateTime(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}
function fileNameFromPath(path = '') { return path.split('/').pop()?.replace(/^[^-]+-/, '') || 'Document'; }
function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c]));
}

(async function initialise() {
  if (SUPABASE_URL.includes('YOUR-PROJECT') || SUPABASE_PUBLISHABLE_KEY.includes('YOUR-PUBLISHABLE')) {
    $('login-message').textContent = 'Setup required: add your Supabase URL and publishable key to config.js.';
  }
  const arrivedFromInvite = isInviteLink();
  const { data: { session }, error } = await client.auth.getSession();
  if (error) { $('login-message').textContent = error.message; return showLogin(); }
  if (arrivedFromInvite && session?.user) return showPasswordSetup();
  if (session?.user) return routeAuthenticatedUser(session.user);
  showLogin();
})();
