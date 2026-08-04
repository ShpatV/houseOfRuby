const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Sa ditë lejohet ndryshimi/fshirja pa akses të plotë (nga data e barazimit)
const EDIT_WINDOW_DAYS = 2;
const LOCK_MSG = `Ky barazim është i mbyllur (kaluan më shumë se ${EDIT_WINDOW_DAYS} ditë). Vetëm një përdorues me akses të plotë mund ta ndryshojë.`;

const DATA_DIR = path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

// A është barazimi "i mbyllur" (kaluan më shumë se EDIT_WINDOW_DAYS nga data e tij)
function isLocked(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d)) return false;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((today - d) / 86400000);
  return diffDays > EDIT_WINDOW_DAYS;
}

// Sigurohu qe direktoriumet ekzistojne
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify({ entries: [] }, null, 2));
}

// --- Ndihmesa per bazen e te dhenave (JSON i thjeshte) ---
function readDB() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
  } catch (e) {
    return { entries: [] };
  }
}
// ① Shkrim ATOMIK: shkruaj në skedar të përkohshëm, pastaj zëvendëso (rename) — kurrë s'prishet
function writeJsonAtomic(file, data) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}
// ② Backup ditor me rrotacion (mban 30 të fundit)
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
function backupDB(db) {
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const today = new Date().toISOString().slice(0, 10);
    fs.writeFileSync(path.join(BACKUP_DIR, `db-${today}.json`), JSON.stringify(db, null, 2));
    const files = fs.readdirSync(BACKUP_DIR).filter(f => /^db-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
    while (files.length > 30) { try { fs.unlinkSync(path.join(BACKUP_DIR, files.shift())); } catch (e) {} }
  } catch (e) { console.error('backup:', e.message); }
}
function writeDB(db) {
  writeJsonAtomic(DB_FILE, db);
  backupDB(db);
}
function newId() {
  return crypto.randomBytes(8).toString('hex');
}
const round2 = n => Math.round((Number(n) || 0) * 100) / 100; // ⑥ rrumbullakim 2 shifra

// ④ Ndihmesa për fshirjen e fotove të palidhura
function entryPhotos(e) {
  const urls = [];
  (e && e.workers || []).forEach(w => (w.expenses || []).forEach(x => (x.photos || []).forEach(p => urls.push(p))));
  (e && e.expenses || []).forEach(x => (x.photos || []).forEach(p => urls.push(p)));
  return urls;
}
function deletePhotos(urls) {
  (urls || []).forEach(u => {
    const name = path.basename(String(u || ''));
    if (!name) return;
    const fp = path.join(UPLOAD_DIR, name);
    if (fp.startsWith(UPLOAD_DIR + path.sep)) { try { fs.unlinkSync(fp); } catch (e) {} }
  });
}

// ⑦ Regjistër veprimesh (audit log) — mban 1000 të fundit
const AUDIT_FILE = path.join(DATA_DIR, 'audit.json');
function logAction(user, action, details = {}) {
  try {
    let arr = [];
    try { arr = JSON.parse(fs.readFileSync(AUDIT_FILE, 'utf-8')); } catch (e) {}
    arr.push({ at: new Date().toISOString(), user, action, ...details });
    if (arr.length > 1000) arr = arr.slice(-1000);
    writeJsonAtomic(AUDIT_FILE, arr);
  } catch (e) {}
}

// ---------- Përdoruesit & autentikimi ----------
function hashPassword(password, salt) {
  return crypto.scryptSync(String(password), salt, 64).toString('hex');
}
function makeUser(name, role, password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return { username: name.toLowerCase(), name, role, salt, hash: hashPassword(password, salt) };
}
function readUsers() {
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
  } catch (e) {
    return { users: [], sessions: {} };
  }
}
function writeUsers(data) {
  writeJsonAtomic(USERS_FILE, data);
}
// ③ Sesionet skadojnë pas 30 ditësh
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
function sessionExpired(sess) {
  const t = sess && sess.createdAt ? new Date(sess.createdAt).getTime() : 0;
  return !t || (Date.now() - t > SESSION_TTL_MS);
}
function pruneSessions(data) {
  let changed = false;
  for (const tok of Object.keys(data.sessions || {})) {
    if (sessionExpired(data.sessions[tok])) { delete data.sessions[tok]; changed = true; }
  }
  return changed;
}
// Fillimisht krijo 4 përdoruesit (fjalëkalim fillestar: 1234). Blini = akses i plotë.
if (!fs.existsSync(USERS_FILE)) {
  const seed = {
    users: [
      makeUser('Blini', 'admin', '1234'),
      makeUser('Dardani', 'user', '1234'),
      makeUser('Edoni', 'user', '1234'),
      makeUser('Arti', 'user', '1234')
    ],
    sessions: {}
  };
  writeUsers(seed);
}

function verifyPassword(user, password) {
  const h = hashPassword(password, user.salt);
  // krahasim me kohë-konstante
  const a = Buffer.from(h, 'hex');
  const b = Buffer.from(user.hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function publicUser(u) { return { username: u.username, name: u.name, role: u.role }; }

// Middleware: kërkon një sesion të vlefshëm
function requireAuth(req, res, next) {
  const token = String(req.headers['x-session-token'] || '');
  const data = readUsers();
  const sess = token && data.sessions[token];
  if (!sess) return res.status(401).json({ error: 'Kërkohet hyrje (login).' });
  if (sessionExpired(sess)) { // ③ sesioni skaduar → hiqe dhe kërko hyrje
    delete data.sessions[token]; writeUsers(data);
    return res.status(401).json({ error: 'Sesioni skadoi. Hyr përsëri.' });
  }
  const user = data.users.find(u => u.username === sess.username);
  if (!user) return res.status(401).json({ error: 'Kërkohet hyrje (login).' });
  req.user = user;
  next();
}
function isFullAccess(req) { return req.user && req.user.role === 'admin'; }
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: 'Nuk keni leje për këtë veprim.' });
  next();
}

// --- Ngarkimi i fotove ---
// ⑤ Prapashtesa caktohet nga lloji (mime), jo nga emri i skedarit
const EXT_BY_MIME = { 'image/jpeg': '.jpg', 'image/jpg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'image/heic': '.heic', 'image/heif': '.heif' };
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = EXT_BY_MIME[file.mimetype] || '.jpg';
    cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB per foto
  fileFilter: (req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(new Error('Vetem foto lejohen'));
  }
});

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOAD_DIR));

// ---------- Autentikimi ----------
// Hyrje (login)
app.post('/api/login', (req, res) => {
  const username = String((req.body && req.body.username) || '').trim().toLowerCase();
  const password = String((req.body && req.body.password) || '');
  const data = readUsers();
  const user = data.users.find(u => u.username === username);
  if (!user || !verifyPassword(user, password)) {
    return res.status(401).json({ error: 'Përdoruesi ose fjalëkalimi gabim.' });
  }
  pruneSessions(data); // ③ pastro sesionet e skaduara që skedari të mos rritet pafund
  const token = crypto.randomBytes(24).toString('hex');
  data.sessions[token] = { username: user.username, createdAt: new Date().toISOString() };
  writeUsers(data);
  res.json({ token, user: publicUser(user) });
});

// Dil (logout)
app.post('/api/logout', requireAuth, (req, res) => {
  const token = String(req.headers['x-session-token'] || '');
  const data = readUsers();
  delete data.sessions[token];
  writeUsers(data);
  res.json({ ok: true });
});

// Kush jam (validon sesionin)
app.get('/api/me', requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));

// Ndrysho fjalëkalimin
app.post('/api/change-password', requireAuth, (req, res) => {
  const oldPassword = String((req.body && req.body.oldPassword) || '');
  const newPassword = String((req.body && req.body.newPassword) || '');
  if (newPassword.length < 4) return res.status(400).json({ error: 'Fjalëkalimi i ri duhet të ketë të paktën 4 shenja.' });
  const data = readUsers();
  const user = data.users.find(u => u.username === req.user.username);
  if (!verifyPassword(user, oldPassword)) return res.status(400).json({ error: 'Fjalëkalimi aktual është gabim.' });
  user.salt = crypto.randomBytes(16).toString('hex');
  user.hash = hashPassword(newPassword, user.salt);
  writeUsers(data);
  logAction(req.user.name, 'ndryshoi fjalëkalimin e vet');
  res.json({ ok: true });
});

// Lista e përdoruesve (vetëm për Blinin/adminin)
app.get('/api/users', requireAuth, requireAdmin, (req, res) => {
  const data = readUsers();
  res.json({ users: data.users.map(u => ({ username: u.username, name: u.name, role: u.role })) });
});

// Shto një përdorues të ri (vetëm admini)
app.post('/api/admin/users', requireAuth, requireAdmin, (req, res) => {
  const name = String((req.body && req.body.name) || '').trim();
  const password = String((req.body && req.body.password) || '');
  const role = (req.body && req.body.role) === 'admin' ? 'admin' : 'user';
  if (!name) return res.status(400).json({ error: 'Shëno emrin.' });
  if (password.length < 4) return res.status(400).json({ error: 'Fjalëkalimi duhet të ketë të paktën 4 shenja.' });
  const data = readUsers();
  const username = name.toLowerCase();
  if (data.users.some(u => u.username === username)) return res.status(400).json({ error: 'Ekziston një përdorues me këtë emër.' });
  data.users.push(makeUser(name, role, password));
  writeUsers(data);
  logAction(req.user.name, 'shtoi përdoruesin', { target: name });
  res.json({ ok: true, name });
});

// Fshi një përdorues (vetëm admini) — jo veten
app.delete('/api/admin/users/:username', requireAuth, requireAdmin, (req, res) => {
  const username = String(req.params.username || '').toLowerCase();
  if (username === req.user.username) return res.status(400).json({ error: 'Nuk mund të fshish veten.' });
  const data = readUsers();
  const idx = data.users.findIndex(u => u.username === username);
  if (idx === -1) return res.status(404).json({ error: 'Nuk u gjet.' });
  const removedName = data.users[idx].name;
  data.users.splice(idx, 1);
  for (const t of Object.keys(data.sessions)) {
    if (data.sessions[t].username === username) delete data.sessions[t];
  }
  writeUsers(data);
  logAction(req.user.name, 'fshiu përdoruesin', { target: removedName });
  res.json({ ok: true });
});

// Rivendos fjalëkalimin e një përdoruesi (vetëm admini) — kur dikush e harron
app.post('/api/admin/reset-password', requireAuth, requireAdmin, (req, res) => {
  const username = String((req.body && req.body.username) || '').trim().toLowerCase();
  const newPassword = String((req.body && req.body.newPassword) || '');
  if (newPassword.length < 4) return res.status(400).json({ error: 'Fjalëkalimi i ri duhet të ketë të paktën 4 shenja.' });
  const data = readUsers();
  const user = data.users.find(u => u.username === username);
  if (!user) return res.status(404).json({ error: 'Përdoruesi nuk u gjet.' });
  user.salt = crypto.randomBytes(16).toString('hex');
  user.hash = hashPassword(newPassword, user.salt);
  writeUsers(data);
  logAction(req.user.name, 'rivendosi fjalëkalimin', { target: user.name });
  res.json({ ok: true, name: user.name });
});

// Regjistri i veprimeve (vetëm admini) — 100 të fundit
app.get('/api/audit', requireAuth, requireAdmin, (req, res) => {
  let arr = [];
  try { arr = JSON.parse(fs.readFileSync(AUDIT_FILE, 'utf-8')); } catch (e) {}
  res.json({ log: arr.slice(-100).reverse() });
});

// Ngarko nje ose disa foto -> kthen emrat e file-ve (kërkon hyrje)
app.post('/api/upload', requireAuth, upload.array('photos', 10), (req, res) => {
  const files = (req.files || []).map(f => ({
    filename: f.filename,
    url: `/uploads/${f.filename}`
  }));
  res.json({ files });
});

// Merr te gjitha barazimet (me filtrim opsional ?from=YYYY-MM-DD&to=YYYY-MM-DD)
app.get('/api/entries', requireAuth, (req, res) => {
  const db = readDB();
  let entries = db.entries.slice();
  const { from, to } = req.query;
  if (from) entries = entries.filter(e => e.date >= from);
  if (to) entries = entries.filter(e => e.date <= to);
  // Rendit: data me e re me pare, pastaj dita para nates
  entries.sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return (a.shift === 'dita' ? 0 : 1) - (b.shift === 'dita' ? 0 : 1);
  });
  res.json({ entries });
});

// Merr nje barazim
app.get('/api/entries/:id', requireAuth, (req, res) => {
  const db = readDB();
  const entry = db.entries.find(e => e.id === req.params.id);
  if (!entry) return res.status(404).json({ error: 'Nuk u gjet' });
  res.json({ entry });
});

function sanitizeExpenses(list) {
  return Array.isArray(list) ? list
    .map(x => ({
      category: String(x.category || 'Tjera').trim(),
      note: String(x.note || '').trim(),
      amount: round2(x.amount), // ⑥ rrumbullakim para ruajtjes
      photos: Array.isArray(x.photos) ? x.photos.filter(Boolean) : []
    }))
    .filter(x => x.note || x.amount || x.photos.length) : [];
}

function sanitizeEntry(body) {
  const workers = Array.isArray(body.workers) ? body.workers
    .map(w => ({
      name: String(w.name || '').trim(),
      amount: round2(w.amount),      // ⑥
      ngarkesa: round2(w.ngarkesa),  // ⑥
      expenses: sanitizeExpenses(w.expenses)
    }))
    .filter(w => w.name || w.amount || w.ngarkesa || w.expenses.length) : [];
  const expenses = sanitizeExpenses(body.expenses);
  return {
    date: String(body.date || '').slice(0, 10),
    shift: body.shift === 'nata' ? 'nata' : 'dita',
    manager: String(body.manager || '').trim(),
    workers,
    expenses,
    note: String(body.note || '').trim()
  };
}

// Krijo (ose perditeso) barazim — nje i vetem per (date + shift)
app.post('/api/entries', requireAuth, (req, res) => {
  const data = sanitizeEntry(req.body);
  if (!data.date) return res.status(400).json({ error: 'Data mungon' });
  if (isLocked(data.date) && !isFullAccess(req)) return res.status(403).json({ error: LOCK_MSG });
  const db = readDB();
  const who = req.user.name;
  const now = new Date().toISOString();
  // Nese ekziston nje barazim per te njejten date + nderrim, perditesoje (mos krijo dyfish)
  const existing = db.entries.find(e => e.date === data.date && e.shift === data.shift);
  if (existing) {
    const oldPhotos = entryPhotos(existing);
    Object.assign(existing, data, { updatedAt: now, updatedBy: who });
    writeDB(db);
    deletePhotos(oldPhotos.filter(p => !entryPhotos(existing).includes(p))); // ④ fshi fotot e hequra
    logAction(who, 'ndryshoi barazimin', { date: data.date, shift: data.shift }); // ⑦
    return res.json({ entry: existing });
  }
  const entry = { id: newId(), ...data, createdAt: now, createdBy: who, updatedBy: who };
  db.entries.push(entry);
  writeDB(db);
  logAction(who, 'krijoi barazimin', { date: data.date, shift: data.shift }); // ⑦
  res.json({ entry });
});

// Perditeso barazim
app.put('/api/entries/:id', requireAuth, (req, res) => {
  const db = readDB();
  const idx = db.entries.findIndex(e => e.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Nuk u gjet' });
  const data = sanitizeEntry(req.body);
  if ((isLocked(db.entries[idx].date) || isLocked(data.date)) && !isFullAccess(req)) {
    return res.status(403).json({ error: LOCK_MSG });
  }
  const oldPhotos = entryPhotos(db.entries[idx]);
  db.entries[idx] = { ...db.entries[idx], ...data, updatedAt: new Date().toISOString(), updatedBy: req.user.name };
  writeDB(db);
  deletePhotos(oldPhotos.filter(p => !entryPhotos(db.entries[idx]).includes(p))); // ④
  logAction(req.user.name, 'ndryshoi barazimin', { date: data.date, shift: data.shift }); // ⑦
  res.json({ entry: db.entries[idx] });
});

// Fshij barazim
app.delete('/api/entries/:id', requireAuth, (req, res) => {
  const db = readDB();
  const idx = db.entries.findIndex(e => e.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Nuk u gjet' });
  if (isLocked(db.entries[idx].date) && !isFullAccess(req)) {
    return res.status(403).json({ error: LOCK_MSG });
  }
  const [removed] = db.entries.splice(idx, 1);
  writeDB(db);
  deletePhotos(entryPhotos(removed)); // ④ fshi fotot e barazimit të fshirë
  logAction(req.user.name, 'fshiu barazimin', { date: removed.date, shift: removed.shift }); // ⑦
  res.json({ ok: true, removed });
});

app.use((err, req, res, next) => {
  console.error(err.message);
  res.status(400).json({ error: err.message });
});

app.listen(PORT, () => {
  console.log(`Barazimet e restorantit -> http://localhost:${PORT}`);
});
