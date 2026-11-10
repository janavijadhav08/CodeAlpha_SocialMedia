require('dotenv').config();
const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const db = new sqlite3.Database('./social.db');
const SECRET = process.env.JWT_SECRET || 'dev-only-change-me';

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ── Database setup ────────────────────────────────────────────────────────────
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users(
    id INTEGER PRIMARY KEY,
    name TEXT,
    email TEXT UNIQUE,
    password TEXT,
    bio TEXT DEFAULT '',
    avatar TEXT DEFAULT ''
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS posts(
    id INTEGER PRIMARY KEY,
    user_id INTEGER,
    content TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS comments(
    id INTEGER PRIMARY KEY,
    post_id INTEGER,
    user_id INTEGER,
    content TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS likes(
    user_id INTEGER,
    post_id INTEGER,
    PRIMARY KEY(user_id, post_id)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS follows(
    follower_id INTEGER,
    following_id INTEGER,
    PRIMARY KEY(follower_id, following_id)
  )`);
});

// ── Auth middleware ────────────────────────────────────────────────────────────
const auth = (req, res, next) => {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Sign in required' });
  }
};

// ── Auth routes ───────────────────────────────────────────────────────────────
app.post('/api/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password || password.length < 8)
    return res.status(400).json({ error: 'All fields required; password must be 8+ chars' });
  const hash = await bcrypt.hash(password, 10);
  db.run(
    'INSERT INTO users(name, email, password) VALUES(?,?,?)',
    [name.trim(), email.toLowerCase(), hash],
    function (e) {
      if (e) return res.status(409).json({ error: 'Email already in use' });
      res.json({ token: jwt.sign({ id: this.lastID, name: name.trim() }, SECRET), name: name.trim() });
    }
  );
});

app.post('/api/login', (req, res) => {
  db.get('SELECT * FROM users WHERE email=?', [String(req.body.email || '').toLowerCase()], async (e, u) => {
    if (!u || !(await bcrypt.compare(req.body.password || '', u.password)))
      return res.status(401).json({ error: 'Invalid email or password' });
    res.json({ token: jwt.sign({ id: u.id, name: u.name }, SECRET), name: u.name, id: u.id });
  });
});

// ── Profile routes ────────────────────────────────────────────────────────────
app.get('/api/me', auth, (req, res) => {
  db.get('SELECT id, name, bio, avatar FROM users WHERE id=?', [req.user.id], (e, u) => res.json(u || {}));
});

app.put('/api/me', auth, (req, res) => {
  const { name, bio, avatar } = req.body;
  db.run(
    'UPDATE users SET name=?, bio=?, avatar=? WHERE id=?',
    [String(name || '').trim() || req.user.name, String(bio || '').slice(0, 300), String(avatar || ''), req.user.id],
    (e) => res.json({ ok: !e })
  );
});

app.get('/api/users/:id', (req, res) => {
  db.get(
    `SELECT id, name, bio, avatar,
      (SELECT COUNT(*) FROM posts WHERE user_id=users.id) posts_count,
      (SELECT COUNT(*) FROM follows WHERE following_id=users.id) followers,
      (SELECT COUNT(*) FROM follows WHERE follower_id=users.id) following
     FROM users WHERE id=?`,
    [req.params.id],
    (e, u) => u ? res.json(u) : res.status(404).json({ error: 'User not found' })
  );
});

// ── Post routes ───────────────────────────────────────────────────────────────
app.get('/api/posts', (req, res) => {
  const userId = req.query.user_id ? Number(req.query.user_id) : null;
  const likedBy = req.query.liked_by ? Number(req.query.liked_by) : null;
  let query = `
    SELECT p.id, p.content, p.created_at, u.id user_id, u.name, u.avatar,
      (SELECT COUNT(*) FROM likes l WHERE l.post_id=p.id) likes,
      (SELECT COUNT(*) FROM comments c WHERE c.post_id=p.id) comments
    FROM posts p JOIN users u ON u.id=p.user_id
  `;
  const params = [];
  if (userId) { query += ' WHERE p.user_id=?'; params.push(userId); }
  else if (likedBy) { query += ' WHERE EXISTS(SELECT 1 FROM likes l WHERE l.post_id=p.id AND l.user_id=?)'; params.push(likedBy); }
  query += ' ORDER BY p.id DESC LIMIT 50';
  db.all(query, params, (e, rows) => res.json(rows));
});

app.post('/api/posts', auth, (req, res) => {
  const content = String(req.body.content || '').trim();
  if (!content || content.length > 1000)
    return res.status(400).json({ error: 'Post must be 1–1000 characters' });
  db.run('INSERT INTO posts(user_id, content) VALUES(?,?)', [req.user.id, content], function (e) {
    res.json({ id: this.lastID });
  });
});

app.delete('/api/posts/:id', auth, (req, res) => {
  db.run('DELETE FROM posts WHERE id=? AND user_id=?', [req.params.id, req.user.id], function (e) {
    if (this.changes === 0) return res.status(403).json({ error: 'Not your post' });
    db.run('DELETE FROM likes WHERE post_id=?', [req.params.id]);
    db.run('DELETE FROM comments WHERE post_id=?', [req.params.id]);
    res.json({ ok: true });
  });
});

// ── Like routes ───────────────────────────────────────────────────────────────
app.get('/api/posts/:id/liked', auth, (req, res) => {
  db.get('SELECT 1 FROM likes WHERE user_id=? AND post_id=?', [req.user.id, req.params.id], (e, row) => {
    res.json({ liked: !!row });
  });
});

app.post('/api/posts/:id/like', auth, (req, res) => {
  db.run('INSERT OR IGNORE INTO likes(user_id, post_id) VALUES(?,?)', [req.user.id, req.params.id], (e) =>
    res.json({ ok: true })
  );
});

app.delete('/api/posts/:id/like', auth, (req, res) => {
  db.run('DELETE FROM likes WHERE user_id=? AND post_id=?', [req.user.id, req.params.id], (e) =>
    res.json({ ok: true })
  );
});

// ── Comment routes ────────────────────────────────────────────────────────────
app.get('/api/posts/:id/comments', (req, res) => {
  db.all(
    'SELECT c.id, c.content, c.created_at, u.name, u.avatar FROM comments c JOIN users u ON u.id=c.user_id WHERE c.post_id=? ORDER BY c.id',
    [req.params.id],
    (e, r) => res.json(r)
  );
});

app.post('/api/posts/:id/comments', auth, (req, res) => {
  const content = String(req.body.content || '').trim();
  if (!content) return res.status(400).json({ error: 'Comment cannot be empty' });
  db.run(
    'INSERT INTO comments(post_id, user_id, content) VALUES(?,?,?)',
    [req.params.id, req.user.id, content],
    function (e) { res.json({ id: this.lastID, ok: true }); }
  );
});

app.delete('/api/comments/:id', auth, (req, res) => {
  db.run('DELETE FROM comments WHERE id=? AND user_id=?', [req.params.id, req.user.id], function (e) {
    res.json({ ok: this.changes > 0 });
  });
});

// ── Follow routes ─────────────────────────────────────────────────────────────
app.post('/api/users/:id/follow', auth, (req, res) => {
  if (+req.params.id === req.user.id) return res.status(400).json({ error: 'Cannot follow yourself' });
  db.run('INSERT OR IGNORE INTO follows(follower_id, following_id) VALUES(?,?)', [req.user.id, req.params.id], (e) =>
    res.json({ ok: true })
  );
});

app.delete('/api/users/:id/follow', auth, (req, res) => {
  db.run('DELETE FROM follows WHERE follower_id=? AND following_id=?', [req.user.id, req.params.id], (e) =>
    res.json({ ok: true })
  );
});

app.get('/api/users/:id/follow-status', auth, (req, res) => {
  db.get('SELECT 1 FROM follows WHERE follower_id=? AND following_id=?', [req.user.id, req.params.id], (e, r) =>
    res.json({ following: !!r })
  );
});

// ── People route ──────────────────────────────────────────────────────────────
app.get('/api/people', (req, res) => {
  db.all(
    `SELECT id, name, bio, avatar,
      (SELECT COUNT(*) FROM follows f WHERE f.following_id=users.id) followers
     FROM users ORDER BY id DESC LIMIT 30`,
    [],
    (e, r) => res.json(r)
  );
});

app.get('/api/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✦ Gather Social running at http://localhost:${PORT}`));
