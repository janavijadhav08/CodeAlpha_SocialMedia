/* ── Utilities ───────────────────────────────────────────────────────────── */
const esc = s => String(s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const tok = () => localStorage.token || '';

const timeAgo = iso => {
  const diff = (Date.now() - new Date(iso)) / 1000;
  if (diff < 60)  return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  return new Date(iso).toLocaleDateString();
};

async function api(url, opt = {}) {
  const res = await fetch('/api' + url, {
    ...opt,
    headers: {
      'Content-Type': 'application/json',
      ...(tok() ? { Authorization: 'Bearer ' + tok() } : {}),
      ...(opt.headers || {}),
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// Toast
let _toastTimer;
function toast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show' + (type ? ' ' + type : '');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { el.className = 'toast'; }, 3000);
}

function avatarEl(emoji, size = 36) {
  return emoji
    ? `<span style="font-size:${Math.round(size * 0.55)}px">${esc(emoji)}</span>`
    : '👤';
}

/* ── State ───────────────────────────────────────────────────────────────── */
let currentTab = 'all';
let currentProfileId = null;
let myId = null;

/* ── Auth ────────────────────────────────────────────────────────────────── */
function getMyId() {
  if (!tok()) return null;
  try { return JSON.parse(atob(tok().split('.')[1])).id; } catch { return null; }
}

function updateNav() {
  myId = getMyId();
  document.getElementById('navLogin').style.display   = myId ? 'none' : 'inline';
  document.getElementById('navLogout').style.display  = myId ? 'inline' : 'none';
  document.getElementById('navProfile').style.display = myId ? 'inline' : 'none';
}

function showAuth(mode) {
  document.getElementById('heroSection').style.display = 'none';
  const panel = document.getElementById('authPanel');
  panel.style.display = 'block';
  document.getElementById('authTitle').textContent = mode === 'register' ? 'Create your account' : 'Welcome back';
  document.getElementById('nameBox').style.display = mode === 'register' ? 'block' : 'none';
  document.getElementById('authSwitch').innerHTML = mode === 'register'
    ? 'Already have an account? <a onclick="showAuth(\'login\')">Sign in</a>'
    : 'No account yet? <a onclick="showAuth(\'register\')">Join the community</a>';

  document.getElementById('authForm').onsubmit = async e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    const btn = document.getElementById('authSubmit');
    btn.disabled = true;
    try {
      const r = await api('/' + mode, { method: 'POST', body: JSON.stringify(data) });
      localStorage.token = r.token;
      panel.style.display = 'none';
      updateNav();
      toast('Welcome, ' + r.name + '! 👋', 'success');
      showHome();
      load();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  };
}

function closeAuth() {
  document.getElementById('authPanel').style.display = 'none';
  document.getElementById('heroSection').style.display = '';
}

/* ── Navigation ──────────────────────────────────────────────────────────── */
function showHome() {
  document.getElementById('profileSection').style.display = 'none';
  document.getElementById('homeSection').style.display = '';
  document.getElementById('heroSection').style.display = myId ? 'none' : '';
  currentProfileId = null;
}

function showProfilePage(uid) {
  document.getElementById('homeSection').style.display = 'none';
  document.getElementById('heroSection').style.display = 'none';
  document.getElementById('authPanel').style.display = 'none';
  document.getElementById('profileSection').style.display = '';
  loadProfile(uid);
}

/* ── Profile ─────────────────────────────────────────────────────────────── */
async function loadProfile(uid) {
  currentProfileId = uid;
  try {
    const u = await api('/users/' + uid);
    document.getElementById('profileAvatar').innerHTML = avatarEl(u.avatar, 80);
    document.getElementById('profileName').textContent = u.name;
    document.getElementById('profileBio').textContent = u.bio || 'No bio yet.';
    document.getElementById('profilePosts').textContent = u.posts_count;
    document.getElementById('profileFollowers').textContent = u.followers;
    document.getElementById('profileFollowing').textContent = u.following;
    document.getElementById('profilePostsHeading').textContent = u.name + "'s Posts";

    const followBtn = document.getElementById('profileFollowBtn');
    const editBtn   = document.getElementById('profileEditBtn');

    if (myId && myId !== uid) {
      followBtn.style.display = 'inline-block';
      editBtn.style.display   = 'none';
      const { following } = await api('/users/' + uid + '/follow-status');
      followBtn.textContent = following ? 'Unfollow' : 'Follow';
      followBtn.className   = following ? 'btn-outline' : '';
    } else if (myId === uid) {
      followBtn.style.display = 'none';
      editBtn.style.display   = 'inline-block';
      const me = await api('/me');
      document.getElementById('editName').value   = me.name;
      document.getElementById('editBio').value    = me.bio;
      document.getElementById('editAvatar').value = me.avatar;
    } else {
      followBtn.style.display = 'none';
      editBtn.style.display   = 'none';
    }

    // Load user's posts
    const posts = await api('/posts?user_id=' + uid);
    document.getElementById('profileFeed').innerHTML = posts.length
      ? posts.map(p => renderPost(p)).join('')
      : '<p class="muted">No posts yet.</p>';

  } catch (err) {
    toast(err.message, 'error');
  }
}

async function toggleFollowProfile() {
  const uid = currentProfileId;
  const btn = document.getElementById('profileFollowBtn');
  const isFollowing = btn.textContent === 'Unfollow';
  try {
    if (isFollowing) {
      await api('/users/' + uid + '/follow', { method: 'DELETE' });
      btn.textContent = 'Follow';
      btn.className   = '';
    } else {
      await api('/users/' + uid + '/follow', { method: 'POST' });
      btn.textContent = 'Unfollow';
      btn.className   = 'btn-outline';
    }
    toast(isFollowing ? 'Unfollowed' : 'Following ✓', 'success');
    loadProfile(uid);
  } catch (err) { toast(err.message, 'error'); }
}

function showEditProfile() {
  document.getElementById('editProfileCard').style.display = 'block';
}

async function saveProfile() {
  try {
    await api('/me', {
      method: 'PUT',
      body: JSON.stringify({
        name:   document.getElementById('editName').value,
        bio:    document.getElementById('editBio').value,
        avatar: document.getElementById('editAvatar').value,
      }),
    });
    document.getElementById('editProfileCard').style.display = 'none';
    toast('Profile saved ✓', 'success');
    loadProfile(currentProfileId);
  } catch (err) { toast(err.message, 'error'); }
}

/* ── Compose ─────────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  const ta = document.getElementById('postText');
  if (ta) {
    ta.addEventListener('input', () => {
      document.getElementById('charCount').textContent = ta.value.length;
    });
  }
});

async function publish() {
  const content = document.getElementById('postText').value.trim();
  if (!content) return toast('Write something first!', 'error');
  if (!tok())   return showAuth('login');
  const btn = document.getElementById('publishBtn');
  btn.disabled = true;
  try {
    await api('/posts', { method: 'POST', body: JSON.stringify({ content }) });
    document.getElementById('postText').value = '';
    document.getElementById('charCount').textContent = '0';
    toast('Post published! ✓', 'success');
    load();
  } catch (err) { toast(err.message, 'error'); }
  finally { btn.disabled = false; }
}

/* ── Feed ────────────────────────────────────────────────────────────────── */
function switchTab(tab) {
  currentTab = tab;
  ['all', 'following', 'liked'].forEach(t => {
    document.getElementById('tab' + t.charAt(0).toUpperCase() + t.slice(1))
      .classList.toggle('active', t === tab);
  });
  load();
}

async function load() {
  if (!myId && currentTab !== 'all') {
    document.getElementById('feed').innerHTML = '<p class="muted">Sign in to see this feed.</p>';
    return;
  }
  try {
    let url = '/posts';
    if (currentTab === 'liked' && myId) url = '/posts?liked_by=' + myId;
    const posts = await api(url);
    const feedEl = document.getElementById('feed');
    if (!posts.length) {
      feedEl.innerHTML = '<p class="muted">Nothing to show here yet.</p>';
      return;
    }
    feedEl.innerHTML = posts.map(p => renderPost(p)).join('');
  } catch (err) { toast(err.message, 'error'); }
}

/* ── Render post ─────────────────────────────────────────────────────────── */
function renderPost(p) {
  const mine = myId && myId === p.user_id;
  return `
    <article class="post-card" id="post-${p.id}">
      <div class="post-header">
        <div class="post-avatar" onclick="showProfilePage(${p.user_id})" role="button" aria-label="View ${esc(p.name)}'s profile">
          ${avatarEl(p.avatar, 40)}
        </div>
        <div class="post-meta">
          <span class="post-author" onclick="showProfilePage(${p.user_id})" role="button">${esc(p.name)}</span>
          <div class="post-time">${timeAgo(p.created_at)}</div>
        </div>
      </div>
      <p class="post-content">${esc(p.content)}</p>
      <div class="post-actions">
        <button class="btn-sm btn-outline like-btn" id="likeBtn-${p.id}" onclick="toggleLike(${p.id})">
          ♡ ${p.likes}
        </button>
        <button class="btn-sm btn-outline" onclick="toggleComments(${p.id})">
          💬 ${p.comments}
        </button>
        ${mine ? `<button class="btn-sm btn-danger" onclick="deletePost(${p.id})">Delete</button>` : ''}
      </div>
      <div id="comments-${p.id}" style="display:none"></div>
    </article>`;
}

/* ── Like ────────────────────────────────────────────────────────────────── */
async function toggleLike(id) {
  if (!tok()) return showAuth('login');
  const btn = document.getElementById('likeBtn-' + id);
  try {
    const { liked } = await api('/posts/' + id + '/liked');
    if (liked) {
      await api('/posts/' + id + '/like', { method: 'DELETE' });
      btn.classList.remove('btn-liked');
    } else {
      await api('/posts/' + id + '/like', { method: 'POST' });
      btn.classList.add('btn-liked');
    }
    // Refresh just the count
    const posts = await api('/posts');
    const p = posts.find(x => x.id === id);
    if (p) btn.textContent = (liked ? '♡ ' : '♥ ') + p.likes;
  } catch (err) { toast(err.message, 'error'); }
}

/* ── Comments ────────────────────────────────────────────────────────────── */
async function toggleComments(id) {
  const el = document.getElementById('comments-' + id);
  if (el.style.display !== 'none') { el.style.display = 'none'; return; }
  el.style.display = 'block';
  await loadComments(id);
}

async function loadComments(id) {
  const el = document.getElementById('comments-' + id);
  try {
    const list = await api('/posts/' + id + '/comments');
    const items = list.map(c => `
      <div class="comment-item">
        <div class="comment-avatar">${avatarEl(c.avatar, 28)}</div>
        <div class="comment-body">
          <span class="comment-author">${esc(c.name)}</span>
          <span class="comment-time muted"> · ${timeAgo(c.created_at)}</span>
          <p class="comment-text">${esc(c.content)}</p>
        </div>
      </div>`).join('');

    const form = tok() ? `
      <div class="comment-form">
        <input id="cInput-${id}" placeholder="Write a comment…" maxlength="500"
          onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();postComment(${id})}" />
        <button class="btn-sm" onclick="postComment(${id})">Post</button>
      </div>` : `<p class="muted" style="margin-top:8px">Sign in to comment.</p>`;

    el.innerHTML = `<div class="comments-section">
      ${list.length ? items : '<p class="muted">No comments yet — be the first!</p>'}
      ${form}
    </div>`;
  } catch (err) { toast(err.message, 'error'); }
}

async function postComment(id) {
  const input = document.getElementById('cInput-' + id);
  const content = input.value.trim();
  if (!content) return;
  try {
    await api('/posts/' + id + '/comments', { method: 'POST', body: JSON.stringify({ content }) });
    input.value = '';
    await loadComments(id);
  } catch (err) { toast(err.message, 'error'); }
}

/* ── Delete post ─────────────────────────────────────────────────────────── */
async function deletePost(id) {
  if (!confirm('Delete this post?')) return;
  try {
    await api('/posts/' + id, { method: 'DELETE' });
    document.getElementById('post-' + id)?.remove();
    toast('Post deleted', 'success');
  } catch (err) { toast(err.message, 'error'); }
}

/* ── People ──────────────────────────────────────────────────────────────── */
async function loadPeople() {
  try {
    const people = await api('/people');
    document.getElementById('people').innerHTML = people.length
      ? people.map(p => `
          <div class="person-item">
            <div class="person-avatar" onclick="showProfilePage(${p.id})">${avatarEl(p.avatar, 36)}</div>
            <div class="person-info">
              <div class="person-name" onclick="showProfilePage(${p.id})">${esc(p.name)}</div>
              <div class="person-meta">${p.followers} followers</div>
            </div>
            ${myId && myId !== p.id ? `<button class="btn-sm btn-outline" onclick="quickFollow(${p.id}, this)">Follow</button>` : ''}
          </div>`).join('')
      : '<p class="muted">No members yet.</p>';
  } catch {}
}

async function quickFollow(uid, btn) {
  if (!tok()) return showAuth('login');
  try {
    await api('/users/' + uid + '/follow', { method: 'POST' });
    btn.textContent = '✓ Following';
    btn.disabled = true;
    toast('Followed ✓', 'success');
  } catch (err) { toast(err.message, 'error'); }
}

/* ── Nav actions ─────────────────────────────────────────────────────────── */
document.getElementById('navLogin').onclick = e => { e.preventDefault(); showAuth('login'); };
document.getElementById('navLogout').onclick = e => {
  e.preventDefault();
  localStorage.removeItem('token');
  updateNav();
  showHome();
  load();
  toast('Signed out', '');
};
document.getElementById('navProfile').onclick = e => {
  e.preventDefault();
  if (myId) showProfilePage(myId);
};
document.getElementById('navHome').onclick = e => {
  e.preventDefault();
  showHome();
  load();
};

/* ── Boot ────────────────────────────────────────────────────────────────── */
updateNav();
if (myId) {
  document.getElementById('heroSection').style.display = 'none';
}
load();
loadPeople();
