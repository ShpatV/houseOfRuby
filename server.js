const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { supabase, SUPABASE_URL } = require('./lib/supabase');

const app = express();
const PORT = process.env.PORT || 3000;

// Sa ditë lejohet ndryshimi/fshirja pa akses të plotë (nga data e barazimit)
const EDIT_WINDOW_DAYS = 2;
const LOCK_MSG = `Ky barazim është i mbyllur (kaluan më shumë se ${EDIT_WINDOW_DAYS} ditë). Vetëm një përdorues me akses të plotë mund ta ndryshojë.`;

// Dosje e përkohshme vetëm për upload (multer) — në Vercel përdoret /tmp
const UPLOAD_DIR = process.env.VERCEL ? path.join('/tmp', 'uploads') : path.join(__dirname, 'data', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// A është barazimi "i mbyllur" (kaluan më shumë se EDIT_WINDOW_DAYS nga data e tij)
function isLocked(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d)) return false;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((today - d) / 86400000);
  return diffDays > EDIT_WINDOW_DAYS;
}

// ---------- Supabase: barazimet (entries) ----------
async function rowToEntry(row) {
  // date/shift janë kolona — riktheji në objekt që fronti t'i ketë
  return row ? { id: row.id, date: row.date, shift: row.shift, ...row.data } : null;
}
async function selectEntryById(id) {
  const { data } = await supabase.from('entries').select('id,date,shift,data').eq('id', id).maybeSingle();
  return rowToEntry(data);
}
async function selectEntryByDateShift(date, shift) {
  const { data } = await supabase.from('entries').select('id,date,shift,data').eq('date', date).eq('shift', shift).maybeSingle();
  return rowToEntry(data);
}
async function selectAllEntries({ from, to } = {}) {
  let q = supabase.from('entries').select('id,date,shift,data').order('date', { ascending: false });
  if (from) q = q.gte('date', from);
  if (to) q = q.lte('date', to);
  const { data, error } = await q;
  if (error) throw error;
  return Promise.all((data || []).map(rowToEntry));
}
// Krijo ose përditëso një barazim (id, date, shift ruhen si kolona; pjesa tjetër si JSONB)
async function upsertEntry(entry) {
  const { id, date, shift, ...data } = entry;
  const { error } = await supabase.from('entries').upsert({ id, date, shift, data }, { onConflict: 'id' });
  if (error) throw error;
}
async function deleteEntryById(id) {
  const { error } = await supabase.from('entries').delete().eq('id', id);
  if (error) throw error;
}

// ---------- Supabase: përdoruesit & sesionet ----------
async function fetchUser(username) {
  const { data } = await supabase.from('users').select('*').eq('username', username).maybeSingle();
  return data || null;
}
async function fetchUsersList() {
  const { data } = await supabase.from('users').select('username,name,role').order('name');
  return data || [];
}
async function insertUser(u) {
  const { error } = await supabase.from('users').insert({ username: u.username, name: u.name, role: u.role, salt: u.salt, hash: u.hash });
  if (error) throw error;
}
async function deleteUser(username) {
  const { error } = await supabase.from('users').delete().eq('username', username);
  if (error) throw error;
}
async function updateUserPassword(username, salt, hash) {
  const { error } = await supabase.from('users').update({ salt, hash }).eq('username', username);
  if (error) throw error;
}
async function fetchSession(token) {
  const { data } = await supabase.from('sessions').select('token,username,created_at').eq('token', token).maybeSingle();
  return data ? { token: data.token, username: data.username, createdAt: data.created_at } : null;
}
async function insertSession(token, username) {
  const { error } = await supabase.from('sessions').insert({ token, username });
  if (error) throw error;
}
async function deleteSession(token) {
  await supabase.from('sessions').delete().eq('token', token);
}
async function deleteUserSessions(username) {
  await supabase.from('sessions').delete().eq('username', username);
}
// ③ Sesionet skadojnë pas 30 ditësh
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
function sessionExpired(sess) {
  const t = sess && sess.createdAt ? new Date(sess.createdAt).getTime() : 0;
  return !t || (Date.now() - t > SESSION_TTL_MS);
}
async function pruneSessions() {
  const cutoff = new Date(Date.now() - SESSION_TTL_MS).toISOString();
  await supabase.from('sessions').delete().lt('created_at', cutoff);
}

// ---------- Supabase: regjistër veprimesh (audit) ----------
async function logAction(user, action, details = {}) {
  try {
    await supabase.from('audit_log').insert({ user_name: user, action, details });
  } catch (e) { console.error('audit:', e.message); }
}
async function fetchAudit() {
  const { data, error } = await supabase.from('audit_log').select('*').order('id', { ascending: false }).limit(100);
  if (error) throw error;
  return (data || []).map(r => ({ at: r.at, user: r.user_name, action: r.action, ...(r.details || {}) }));
}

// ---------- Përdoruesit & autentikimi ----------
function hashPassword(password, salt) {
  return crypto.scryptSync(String(password), salt, 64).toString('hex');
}
function makeUser(name, role, password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return { username: name.toLowerCase(), name, role, salt, hash: hashPassword(password, salt) };
}
// Fillimisht krijo 4 përdoruesit (fjalëkalim fillestar: 1234). Blini = akses i plotë.
const SEED_USERS = [
  { username: 'blini', name: 'Blini', role: 'admin', salt: '40f6782d8b8c8fb9262ba9e879198b92', hash: '9056805acdc0806cc6c0946008a2bd5643c20e75032976f6a79bcee5539f48c3cbb6c685eabd393adaf51eabbd7a131c33de583318325672d07cdad454dd667f' },
  { username: 'dardani', name: 'Dardani', role: 'user', salt: 'fcae077bc8d777f9b13cb16086151476', hash: '305be2205efd524f036861b4cd6fca5379b3e1691ed5d0058062ee9baa34af90defc513c00fa7df5cc5a98c319c6d4ab488a2edbe79d48876d94211fe1355edd' },
  { username: 'edoni', name: 'Edoni', role: 'user', salt: '07c2103f561998b02d9388f3bed6e286', hash: 'e01a47d2fc3742f8d9583a4b1f242b317e4dffd9d180795c99f46fcbbadca67b7a34ef1589cdd7bce46d64b268d04366d66aa0757dc18693b361031add5bd886' },
  { username: 'arti', name: 'Arti', role: 'user', salt: 'd589dcd45a7e2cde59bcbd2d2dbd06e6', hash: '9217c099116a6601e49f865a82e23390dfb38d5571733a294243c0a060b24e9d73790e40f7f61e255c1c8f689a0846dd7067be4ffb025f213571e1db3c48ed1a' }
];
async function seedUsers() {
  try {
    const { data, error } = await supabase.from('users').select('username').limit(1);
    if (error || (data && data.length)) return;
    await supabase.from('users').insert(SEED_USERS, { onConflict: 'username', ignoreDuplicates: true });
    console.log('Seed: 4 përdoruesit fillestarë u krijuan.');
  } catch (e) { console.error('seed:', e.message); }
}
seedUsers();

function verifyPassword(user, password) {
  const h = hashPassword(password, user.salt);
  // krahasim me kohë-konstante
  const a = Buffer.from(h, 'hex');
  const b = Buffer.from(user.hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function publicUser(u) { return { username: u.username, name: u.name, role: u.role }; }

// Middleware: kërkon një sesion të vlefshëm
async function requireAuth(req, res, next) {
  const token = String(req.headers['x-session-token'] || '');
  const sess = token ? await fetchSession(token) : null;
  if (!sess) return res.status(401).json({ error: 'Kërkohet hyrje (login).' });
  if (sessionExpired(sess)) { // ③ sesioni skaduar → hiqe dhe kërko hyrje
    await deleteSession(token);
    return res.status(401).json({ error: 'Sesioni skadoi. Hyr përsëri.' });
  }
  const user = await fetchUser(sess.username);
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

// ④ Ndihmesa për fshirjen e fotove të palidhura (nga Supabase Storage)
function entryPhotos(e) {
  const urls = [];
  (e && e.workers || []).forEach(w => (w.expenses || []).forEach(x => (x.photos || []).forEach(p => urls.push(p))));
  (e && e.expenses || []).forEach(x => (x.photos || []).forEach(p => urls.push(p)));
  return urls;
}
async function deletePhotos(urls) {
  const names = (urls || [])
    .map(u => path.basename(String(u || '').split('?')[0]))
    .filter(Boolean);
  if (!names.length) return;
  try { await supabase.storage.from('photos').remove(names); } catch (e) { console.error('deletePhotos:', e.message); }
}

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---------- Autentikimi ----------
// Hyrje (login)
app.post('/api/login', async (req, res) => {
  const username = String((req.body && req.body.username) || '').trim().toLowerCase();
  const password = String((req.body && req.body.password) || '');
  const user = await fetchUser(username);
  if (!user || !verifyPassword(user, password)) {
    return res.status(401).json({ error: 'Përdoruesi ose fjalëkalimi gabim.' });
  }
  await pruneSessions(); // ③ pastro sesionet e skaduara që të mos grumbullohen
  const token = crypto.randomBytes(24).toString('hex');
  await insertSession(token, user.username);
  res.json({ token, user: publicUser(user) });
});

// Dil (logout)
app.post('/api/logout', requireAuth, async (req, res) => {
  const token = String(req.headers['x-session-token'] || '');
  await deleteSession(token);
  res.json({ ok: true });
});

// Kush jam (validon sesionin)
app.get('/api/me', requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));

// Ndrysho fjalëkalimin
app.post('/api/change-password', requireAuth, async (req, res) => {
  const oldPassword = String((req.body && req.body.oldPassword) || '');
  const newPassword = String((req.body && req.body.newPassword) || '');
  if (newPassword.length < 4) return res.status(400).json({ error: 'Fjalëkalimi i ri duhet të ketë të paktën 4 shenja.' });
  if (!verifyPassword(req.user, oldPassword)) return res.status(400).json({ error: 'Fjalëkalimi aktual është gabim.' });
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashPassword(newPassword, salt);
  await updateUserPassword(req.user.username, salt, hash);
  await logAction(req.user.name, 'ndryshoi fjalëkalimin e vet');
  res.json({ ok: true });
});

// Lista e përdoruesve (vetëm për Blinin/adminin)
app.get('/api/users', requireAuth, requireAdmin, async (req, res) => {
  res.json({ users: await fetchUsersList() });
});

// Shto një përdorues të ri (vetëm admini)
app.post('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
  const name = String((req.body && req.body.name) || '').trim();
  const password = String((req.body && req.body.password) || '');
  const role = (req.body && req.body.role) === 'admin' ? 'admin' : 'user';
  if (!name) return res.status(400).json({ error: 'Shëno emrin.' });
  if (password.length < 4) return res.status(400).json({ error: 'Fjalëkalimi duhet të ketë të paktën 4 shenja.' });
  const username = name.toLowerCase();
  if (await fetchUser(username)) return res.status(400).json({ error: 'Ekziston një përdorues me këtë emër.' });
  await insertUser(makeUser(name, role, password));
  await logAction(req.user.name, 'shtoi përdoruesin', { target: name });
  res.json({ ok: true, name });
});

// Fshi një përdorues (vetëm admini) — jo veten
app.delete('/api/admin/users/:username', requireAuth, requireAdmin, async (req, res) => {
  const username = String(req.params.username || '').toLowerCase();
  if (username === req.user.username) return res.status(400).json({ error: 'Nuk mund të fshish veten.' });
  const user = await fetchUser(username);
  if (!user) return res.status(404).json({ error: 'Nuk u gjet.' });
  await deleteUserSessions(username);
  await deleteUser(username);
  await logAction(req.user.name, 'fshiu përdoruesin', { target: user.name });
  res.json({ ok: true });
});

// Rivendos fjalëkalimin e një përdoruesi (vetëm admini) — kur dikush e harron
app.post('/api/admin/reset-password', requireAuth, requireAdmin, async (req, res) => {
  const username = String((req.body && req.body.username) || '').trim().toLowerCase();
  const newPassword = String((req.body && req.body.newPassword) || '');
  if (newPassword.length < 4) return res.status(400).json({ error: 'Fjalëkalimi i ri duhet të ketë të paktën 4 shenja.' });
  const user = await fetchUser(username);
  if (!user) return res.status(404).json({ error: 'Përdoruesi nuk u gjet.' });
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashPassword(newPassword, salt);
  await updateUserPassword(username, salt, hash);
  await logAction(req.user.name, 'rivendosi fjalëkalimin', { target: user.name });
  res.json({ ok: true, name: user.name });
});

// Regjistri i veprimeve (vetëm admini) — 100 të fundit
app.get('/api/audit', requireAuth, requireAdmin, async (req, res) => {
  res.json({ log: await fetchAudit() });
});

// Ngarko nje ose disa foto -> kthen URL-të publike të Supabase Storage (kërkon hyrje)
app.post('/api/upload', requireAuth, upload.array('photos', 10), async (req, res) => {
  const files = [];
  for (const f of (req.files || [])) {
    try {
      const buf = fs.readFileSync(f.path);
      const { error } = await supabase.storage.from('photos').upload(f.filename, buf, {
        contentType: f.mimetype,
        upsert: false
      });
      if (error) throw error;
      files.push({ url: `${SUPABASE_URL}/storage/v1/object/public/photos/${f.filename}` });
    } catch (e) {
      console.error('upload:', e.message);
    }
    try { fs.unlinkSync(f.path); } catch (e) { /* injoro */ }
  }
  res.json({ files });
});

// Merr te gjitha barazimet (me filtrim opsional ?from=YYYY-MM-DD&to=YYYY-MM-DD)
app.get('/api/entries', requireAuth, async (req, res) => {
  const entries = await selectAllEntries(req.query);
  // Rendit: data me e re me pare, pastaj dita para nates
  entries.sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return (a.shift === 'dita' ? 0 : 1) - (b.shift === 'dita' ? 0 : 1);
  });
  res.json({ entries });
});

// Merr nje barazim
app.get('/api/entries/:id', requireAuth, async (req, res) => {
  const entry = await selectEntryById(req.params.id);
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
app.post('/api/entries', requireAuth, async (req, res) => {
  const data = sanitizeEntry(req.body);
  if (!data.date) return res.status(400).json({ error: 'Data mungon' });
  if (isLocked(data.date) && !isFullAccess(req)) return res.status(403).json({ error: LOCK_MSG });
  const who = req.user.name;
  const now = new Date().toISOString();
  // Nese ekziston nje barazim per te njejten date + nderrim, perditesoje (mos krijo dyfish)
  const existing = await selectEntryByDateShift(data.date, data.shift);
  if (existing) {
    const oldPhotos = entryPhotos(existing);
    Object.assign(existing, data, { updatedAt: now, updatedBy: who });
    await upsertEntry(existing);
    await deletePhotos(oldPhotos.filter(p => !entryPhotos(existing).includes(p))); // ④ fshi fotot e hequra
    await logAction(who, 'ndryshoi barazimin', { date: data.date, shift: data.shift }); // ⑦
    return res.json({ entry: existing });
  }
  const entry = { id: newId(), ...data, createdAt: now, createdBy: who, updatedBy: who };
  await upsertEntry(entry);
  await logAction(who, 'krijoi barazimin', { date: data.date, shift: data.shift }); // ⑦
  res.json({ entry });
});

// Perditeso barazim
app.put('/api/entries/:id', requireAuth, async (req, res) => {
  const existing = await selectEntryById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Nuk u gjet' });
  const data = sanitizeEntry(req.body);
  if ((isLocked(existing.date) || isLocked(data.date)) && !isFullAccess(req)) {
    return res.status(403).json({ error: LOCK_MSG });
  }
  const oldPhotos = entryPhotos(existing);
  const next = { ...existing, ...data, updatedAt: new Date().toISOString(), updatedBy: req.user.name };
  await upsertEntry(next);
  await deletePhotos(oldPhotos.filter(p => !entryPhotos(next).includes(p))); // ④
  await logAction(req.user.name, 'ndryshoi barazimin', { date: data.date, shift: data.shift }); // ⑦
  res.json({ entry: next });
});

// Fshij barazim
app.delete('/api/entries/:id', requireAuth, async (req, res) => {
  const existing = await selectEntryById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Nuk u gjet' });
  if (isLocked(existing.date) && !isFullAccess(req)) {
    return res.status(403).json({ error: LOCK_MSG });
  }
  await deleteEntryById(existing.id);
  await deletePhotos(entryPhotos(existing)); // ④ fshi fotot e barazimit të fshirë
  await logAction(req.user.name, 'fshiu barazimin', { date: existing.date, shift: existing.shift }); // ⑦
  res.json({ ok: true, removed: existing });
});

const round2 = n => Math.round((Number(n) || 0) * 100) / 100; // ⑥ rrumbullakim 2 shifra
const newId = () => crypto.randomBytes(8).toString('hex');

app.use((err, req, res, next) => {
  console.error(err.message);
  res.status(400).json({ error: err.message });
});

// Vendore: nis serverin. Në Vercel (serverless) e eksportojmë app-in si handler.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Barazimet e restorantit -> http://localhost:${PORT}`);
  });
}

module.exports = app;
