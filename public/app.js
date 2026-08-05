// ---------- Ndihmesa ----------
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
// Formatim me mijëshe & presje dhjetore (p.sh. 1.250,00 €)
const _fmt2 = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt = n => _fmt2.format(Number(n) || 0) + ' €';
// Lexon numra me presje ose pikë si dhjetore (p.sh. "270,4" ose "270.4")
const num = v => Number(String(v ?? '').replace(',', '.').trim()) || 0;
const todayStr = () => {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d - off * 60000).toISOString().slice(0, 10);
};

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add('hidden'), 2200);
}

// ---------- Gjendjet e ngarkimit (loading) ----------
let _pending = 0;
function beginLoad() { _pending++; const p = $('#progress'); if (p) p.classList.add('on'); }
function endLoad() { _pending = Math.max(0, _pending - 1); if (!_pending) { const p = $('#progress'); if (p) p.classList.remove('on'); } }

// Buton në gjendje "duke u përpunuar": e çaktivizon + i vë spinner
function busy(btn, on, label = '…') {
  if (!btn) return;
  if (on) {
    if (!btn.dataset.label) btn.dataset.label = btn.innerHTML;
    btn.disabled = true;
    btn.classList.add('busy');
    btn.innerHTML = `<span class="spinner"></span>${label}`;
  } else {
    btn.disabled = false;
    btn.classList.remove('busy');
    if (btn.dataset.label) btn.innerHTML = btn.dataset.label;
    delete btn.dataset.label;
  }
}

// Bllok i thjeshtë me spinner + tekst
function loadBlock(text = 'Duke ngarkuar…') {
  return `<div class="load-block"><span class="spinner dark"></span><span>${text}</span></div>`;
}

// Karta skeleton (shimmer) për listat
function skeletonCards(n = 3) {
  let h = '';
  for (let i = 0; i < n; i++) {
    h += `<div class="skel-card">
      <div class="skel-line skeleton w40"></div>
      <div class="skel-line skeleton w80"></div>
      <div class="skel-line skeleton w60"></div>
      <div class="skel-line skeleton w30"></div>
    </div>`;
  }
  return h;
}

const CATEGORIES = ['Kuzhina', 'Pije', 'Mishi', 'Perime/Fruta', 'Rroga', 'Qira', 'Rryma/Uji', 'Pastrim', 'Tjera'];

// Rrumbullakon fushën në 2 shifra kur del prej saj (blur), pa e prekur bosh
function roundInput(inp) { const v = inp.value.trim(); if (v !== '') inp.value = num(v).toFixed(2); }
function attachAmount(inp) {
  inp.addEventListener('input', recalc);
  inp.addEventListener('blur', () => { roundInput(inp); recalc(); });
}
// Kontrollon emra të dyfishtë të puntorëve
function warnDupName(inp) {
  const n = inp.value.trim().toLowerCase();
  if (!n) return;
  const same = $$('#workers-list .worker-block .w-name').filter(i => i.value.trim().toLowerCase() === n).length;
  if (same > 1) toast('⚠️ Ka dy puntorë me emrin "' + inp.value.trim() + '"');
}
// A ka ndonjë puntor të hapur (jo të përfunduar) me emër?
function hasUnfinishedWorker() {
  return $$('#workers-list .worker-block').some(b => !b.classList.contains('collapsed') && b.querySelector('.w-name').value.trim());
}

// ---------- Tabs ----------
$$('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.dataset.tab !== 'new' && hasUnfinishedWorker() &&
        !confirm('Ke një puntor pa përfunduar. Të vazhdohet pa e ruajtur?')) return;
    $$('.tab').forEach(b => b.classList.remove('active'));
    $$('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    $('#tab-' + btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'history') loadHistory();
  });
});

// Paralajmërim para refresh/mbylljes nëse ka puntor të hapur pa përfunduar
window.addEventListener('beforeunload', e => {
  if (hasUnfinishedWorker()) { e.preventDefault(); e.returnValue = ''; }
});

// ---------- Blloku i nje puntori (me shpenzimet e tij) ----------
function workerBlock(w = { name: '', amount: '', expenses: [] }, collapsed = false) {
  const div = document.createElement('div');
  div.className = 'worker-block';
  div.innerHTML = `
    <div class="worker-summary">
      <div class="ws-info">✓ <b class="ws-name"></b><span class="ws-sub"></span></div>
      <button type="button" class="ws-edit">✏️ Ndrysho</button>
    </div>
    <div class="worker-body">
      <div class="wb-namerow">
        <input class="grow w-name" type="text" placeholder="Emri i puntorit" value="${escapeAttr(w.name)}" />
        <button type="button" class="btn-del w-del">✕</button>
      </div>
      <div class="wb-row2">
        <div class="wb-field">
          <label>💵 Pazari (sa bëri)</label>
          <input class="w-amount" type="text" inputmode="decimal" placeholder="0" value="${w.amount ?? ''}" />
        </div>
        <div class="wb-field">
          <label>💰 Ngarkesa (opsionale)</label>
          <input class="w-ngarkesa" type="text" inputmode="decimal" placeholder="0" value="${w.ngarkesa ? w.ngarkesa : ''}" />
        </div>
      </div>
      <div class="wb-exp-section">
        <div class="wb-exp-label">🧾 Shpenzimet e tij</div>
        <div class="worker-expenses"></div>
        <button type="button" class="btn-add-sm add-w-expense">+ Shto shpenzim</button>
      </div>
      <div class="worker-net"><span>Dorëzon</span><b class="w-net-val">0.00 €</b></div>
      <div class="w-net-calc"></div>
      <button type="button" class="btn-done-worker">✓ Përfundo këtë puntor</button>
    </div>`;

  const expWrap = div.querySelector('.worker-expenses');
  (w.expenses || []).forEach(x => expWrap.appendChild(expenseRow(x)));

  div.querySelector('.add-w-expense').addEventListener('click', () => { expWrap.appendChild(expenseRow()); recalc(); });
  div.querySelector('.w-del').addEventListener('click', () => {
    const started = div.querySelector('.w-name').value.trim() || num(div.querySelector('.w-amount').value);
    if (started && !confirm('Të fshihet ky puntor?')) return;
    div.remove(); recalc();
  });
  attachAmount(div.querySelector('.w-amount'));
  attachAmount(div.querySelector('.w-ngarkesa'));
  div.querySelector('.w-name').addEventListener('blur', e => warnDupName(e.target));

  // Përfundo puntorin: validim → palos → mbetet te puntorët → ruajtje automatike
  div.querySelector('.btn-done-worker').addEventListener('click', () => {
    if (!div.querySelector('.w-name').value.trim()) return toast('Shëno emrin e puntorit');
    // çdo shpenzim që ka përshkrim/foto duhet të ketë edhe shumën
    const badExp = $$('.expense-item', div).some(r => {
      const amt = num(r.querySelector('.x-amount').value);
      const note = r.querySelector('.x-note').value.trim();
      const hasPhoto = (r._photos || []).length;
      return (note || hasPhoto) && amt <= 0;
    });
    if (badExp) return toast('Shëno shumën e shpenzimit');
    updateWorkerSummary(div);
    div.classList.add('collapsed');
    div.scrollIntoView({ block: 'center' }); // qëndro te puntorët, mos shko në fund
    autoSave(div.querySelector('.btn-done-worker')); // ruaj automatikisht (mbrojtje nga refresh-i)
  });
  // Rihapet VETËM me butonin "Ndrysho" (jo gjithë rreshti)
  div.querySelector('.ws-edit').addEventListener('click', () => div.classList.remove('collapsed'));

  if (collapsed) { updateWorkerSummary(div); div.classList.add('collapsed'); }
  return div;
}

function updateWorkerSummary(b) {
  const name = b.querySelector('.w-name').value.trim() || 'Pa emër';
  const amt = num(b.querySelector('.w-amount').value);
  const ng = num(b.querySelector('.w-ngarkesa').value);
  let wExp = 0;
  $$('.expense-item .x-amount', b).forEach(i => wExp += num(i.value));
  b.querySelector('.ws-name').textContent = name;
  const ngTxt = ng ? ` · ngarkesë ${fmt(ng)}` : '';
  b.querySelector('.ws-sub').textContent = ` · bëri ${fmt(amt)}${ngTxt} · dorëzon ${fmt(amt + ng - wExp)}`;
}

// ---------- Rreshtat e shpenzimeve ----------
function expenseRow(x = { category: 'Kuzhina', note: '', amount: '', photos: [] }) {
  const div = document.createElement('div');
  div.className = 'expense-item';
  const opts = CATEGORIES.map(c => `<option ${c === x.category ? 'selected' : ''}>${c}</option>`).join('');
  div.innerHTML = `
    <div class="row">
      <input class="grow x-note" type="text" placeholder="Përshkrimi (p.sh. mish viçi)" value="${escapeAttr(x.note)}" />
      <button type="button" class="btn-del">✕</button>
    </div>
    <div class="row">
      <select class="x-cat" style="flex:1">${opts}</select>
      <input class="amount x-amount" type="text" inputmode="decimal" placeholder="0 €" value="${x.amount ?? ''}" />
    </div>
    <div class="photo-actions">
      <label class="btn-photo">📷 Fotografo faturën
        <input type="file" class="x-file" accept="image/*" capture="environment" />
      </label>
      <label class="btn-photo alt">📁 Ngarko foto
        <input type="file" class="x-file" accept="image/*" multiple />
      </label>
    </div>
    <div class="photo-strip"></div>`;

  const strip = div.querySelector('.photo-strip');
  div._photos = [...(x.photos || [])];

  function renderPhotos() {
    strip.innerHTML = '';
    div._photos.forEach((p, i) => {
      const t = document.createElement('div');
      t.className = 'photo-thumb';
      t.innerHTML = `<img src="${p}" /><span class="x">✕</span>`;
      t.querySelector('img').addEventListener('click', () => openPhoto(p));
      t.querySelector('.x').addEventListener('click', () => { div._photos.splice(i, 1); renderPhotos(); });
      strip.appendChild(t);
    });
  }
  renderPhotos();

  div.querySelector('.btn-del').addEventListener('click', () => {
    const started = div.querySelector('.x-note').value.trim() || num(div.querySelector('.x-amount').value) || (div._photos || []).length;
    if (started && !confirm('Të fshihet ky shpenzim?')) return;
    div.remove(); recalc();
  });
  attachAmount(div.querySelector('.x-amount'));

  async function handlePhotos(e) {
    const files = [...e.target.files];
    if (!files.length) return;
    const btns = div.querySelectorAll('.btn-photo');
    const t = $('#toast');
    btns.forEach(b => b.classList.add('busy'));
    t.classList.add('loading');
    toast('Duke ngarkuar foton…');
    const ph = document.createElement('div');
    ph.className = 'photo-thumb skeleton';
    strip.appendChild(ph);
    const fd = new FormData();
    files.forEach(f => fd.append('photos', f));
    try {
      const res = await apiFetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json();
      (data.files || []).forEach(f => div._photos.push(f.url));
      renderPhotos();
      toast('Foto u shtua ✓');
    } catch (err) {
      toast('Gabim gjatë ngarkimit');
    } finally {
      if (ph.parentNode) ph.parentNode.removeChild(ph);
      t.classList.remove('loading');
      btns.forEach(b => b.classList.remove('busy'));
    }
    e.target.value = '';
  }
  div.querySelectorAll('.x-file').forEach(inp => inp.addEventListener('change', handlePhotos));
  return div;
}

// ---------- Recalc totalet ----------
function recalc() {
  let income = 0, expense = 0, handover = 0;
  $$('#workers-list .worker-block').forEach(b => {
    const amt = num(b.querySelector('.w-amount').value);
    const ng = num(b.querySelector('.w-ngarkesa').value);
    let wExp = 0;
    $$('.expense-item .x-amount', b).forEach(i => wExp += num(i.value));
    income += amt;       // ngarkesa NUK hyn te totali/fitimi
    expense += wExp;
    handover += amt + ng - wExp; // sa dorëzon ky puntor (cash)
    b.querySelector('.w-net-val').textContent = fmt(amt + ng - wExp); // dorëzon = pazar + ngarkesë − shpenzime
    // shpjegim i vogël nën "Dorëzon"
    const parts = [`pazar ${fmt(amt)}`];
    if (ng) parts.push(`ngarkesë +${fmt(ng)}`);
    if (wExp) parts.push(`shpenzime −${fmt(wExp)}`);
    b.querySelector('.w-net-calc').textContent = (ng || wExp) ? parts.join('  ') : '';
    if (b.classList.contains('collapsed')) updateWorkerSummary(b);
  });
  $$('#expenses-list .x-amount').forEach(i => expense += num(i.value));
  $('#t-income').textContent = fmt(income);
  $('#t-expense').textContent = fmt(expense);
  const net = income - expense;
  const netEl = $('#t-net');
  netEl.textContent = fmt(net);
  netEl.style.color = net < 0 ? 'var(--danger)' : 'var(--green)';
  const hoEl = $('#t-handover');
  if (hoEl) hoEl.textContent = fmt(handover);
}

$('#add-worker').addEventListener('click', () => {
  // Pa përfunduar puntorin aktual, mos fillo tjetrin
  const open = $$('#workers-list .worker-block').find(b => !b.classList.contains('collapsed'));
  if (open) {
    if (open.querySelector('.w-name').value.trim()) {
      toast('Përfundo puntorin aktual më parë');
      open.querySelector('.btn-done-worker').scrollIntoView({ block: 'center' });
    } else {
      open.querySelector('.w-name').focus(); // bllok bosh — thjesht fokusoje
    }
    return;
  }
  const nb = workerBlock();
  $('#workers-list').appendChild(nb);
  recalc();
  nb.querySelector('.w-name').focus();
});
$('#add-expense').addEventListener('click', () => { $('#expenses-list').appendChild(expenseRow()); });

// Ruajtje automatike (thirret kur përfundohet një puntor) — pa reset, pa scroll
async function autoSave(btn) {
  const payload = collectForm();
  if (!payload.date) return;
  busy(btn, true, 'Duke u ruajtur…');
  try {
    const id = $('#entry-id').value;
    const url = id ? '/api/entries/' + id : '/api/entries';
    const method = id ? 'PUT' : 'POST';
    const res = await apiFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (res.status === 403) return; // i mbyllur — s'ruhet automatikisht
    if (res.ok) { const d = await res.json(); $('#entry-id').value = d.entry.id; clearDraft(); refreshDay(); toast('U ruajt ✓'); }
    else { saveDraft(payload); toast('⚠️ S\'u ruajt — provo prapë (shtyp Ruaj)'); }
  } catch (e) { saveDraft(payload); toast('⚠️ S\'u ruajt — kontrollo internetin dhe shtyp Ruaj'); }
  finally { busy(btn, false); }
}

// ---------- Ruajtja e formes ----------
function collectForm() {
  const workers = $$('#workers-list .worker-block').map(b => ({
    name: b.querySelector('.w-name').value,
    amount: num(b.querySelector('.w-amount').value),
    ngarkesa: num(b.querySelector('.w-ngarkesa').value),
    expenses: $$('.expense-item', b).map(r => ({
      category: r.querySelector('.x-cat').value,
      note: r.querySelector('.x-note').value,
      amount: num(r.querySelector('.x-amount').value),
      photos: r._photos || []
    }))
  }));
  const expenses = $$('#expenses-list .expense-item').map(r => ({
    category: r.querySelector('.x-cat').value,
    note: r.querySelector('.x-note').value,
    amount: num(r.querySelector('.x-amount').value),
    photos: r._photos || []
  }));
  return {
    date: $('#date').value,
    shift: currentShift,
    manager: $('#manager').value,
    workers,
    expenses,
    note: $('#note').value
  };
}

$('#entry-form').addEventListener('submit', async e => {
  e.preventDefault();
  const payload = collectForm();
  if (!payload.date) return toast('Zgjidh datën');
  const id = $('#entry-id').value;
  const url = id ? '/api/entries/' + id : '/api/entries';
  const method = id ? 'PUT' : 'POST';
  const saveBtn = $('#save-btn');
  busy(saveBtn, true, 'Duke u ruajtur…');
  try {
    const res = await apiFetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.status === 403) {
      const d = await res.json().catch(() => ({}));
      toast(d.error || 'I mbyllur për ndryshim');
      return;
    }
    if (!res.ok) throw new Error();
    const data = await res.json();
    $('#entry-id').value = data.entry.id; // qëndro në modalitet redaktimi
    clearDraft();
    toast(currentShift === 'dita' ? 'Barazimi i ditës u ruajt ✓' : 'Barazimi i natës u ruajt ✓');
    refreshManagers();
    await refreshDay();
  } catch (err) {
    saveDraft(payload); // mos e humb — ruaje lokalisht
    toast('⚠️ S\'u ruajt — kontrollo internetin dhe provo prapë');
  } finally {
    busy(saveBtn, false);
    setSaveLabel(); // rikthe etiketën e ndërrimit aktual
    updateLockBanner();
  }
});

// Enter kalon te fusha tjeter (nuk ruan barazimin). Vetem butoni "Ruaj" ruan.
$('#entry-form').addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const t = e.target;
  if (t.tagName === 'TEXTAREA') return; // ne shenime lejo rreshtin e ri
  if (t.tagName === 'INPUT' || t.tagName === 'SELECT') {
    e.preventDefault();
    const fields = $$('#entry-form input:not([type=hidden]):not([type=file]):not([type=radio]), #entry-form select, #entry-form textarea')
      .filter(el => el.offsetParent !== null); // vetem fushat e dukshme
    const i = fields.indexOf(t);
    if (i > -1 && fields[i + 1]) fields[i + 1].focus();
    else t.blur();
  }
});

// "Pastro" — zbraz formularin e ndërrimit aktual (pa fshirë të dhënat e ruajtura)
$('#cancel-edit').addEventListener('click', () => { clearForm(); });

// ---------- Ndërrimi aktiv (Dita / Nata) ----------
let currentShift = 'dita';

function setSaveLabel() {
  $('#save-btn').textContent = currentShift === 'dita'
    ? '💾 Ruaj Barazimin e Ditës' : '💾 Ruaj Barazimin e Natës';
  $('#totals-head').textContent = currentShift === 'dita'
    ? 'Totali i barazimit të ditës' : 'Totali i barazimit të natës';
}

// Zbraz fushat (formular bosh për ndërrimin aktual)
function clearForm() {
  $('#entry-id').value = '';
  $('#manager').value = currentUser ? currentUser.name : ''; // parashëno atë që është kyçur
  $('#note').value = '';
  $('#workers-list').innerHTML = '';
  $('#expenses-list').innerHTML = '';
  $('#workers-list').appendChild(workerBlock());
  recalc();
}

// Mbush formularin me një barazim ekzistues (ose një draft)
function populateForm(e) {
  $('#entry-id').value = e.id || '';
  $('#manager').value = e.manager || '';
  $('#note').value = e.note || '';
  $('#workers-list').innerHTML = '';
  $('#expenses-list').innerHTML = '';
  const ws = e.workers || [];
  (ws.length ? ws : [undefined]).forEach(w => $('#workers-list').appendChild(workerBlock(w, !!(w && w.name))));
  (e.expenses || []).forEach(x => $('#expenses-list').appendChild(expenseRow(x)));
  recalc();
}

// Emri i ditës nën datën (që të mos ngatërrohet barazimi)
const MONTHS_FULL = ['Janar', 'Shkurt', 'Mars', 'Prill', 'Maj', 'Qershor', 'Korrik', 'Gusht', 'Shtator', 'Tetor', 'Nëntor', 'Dhjetor'];
const DAYS_FULL = ['E Dielë', 'E Hënë', 'E Martë', 'E Mërkurë', 'E Enjte', 'E Premte', 'E Shtunë'];
function updateDayName() {
  const v = $('#date').value;
  const el = $('#date-dayname');
  if (!v) { el.textContent = ''; return; }
  const dt = new Date(v + 'T00:00:00');
  el.textContent = `${DAYS_FULL[dt.getDay()]}, ${dt.getDate()} ${MONTHS_FULL[dt.getMonth()]} ${dt.getFullYear()}`;
}

// ---------- Draft lokal (mbrojtje kur dështon ruajtja / refresh) ----------
const draftKey = () => `draft:${$('#date').value}:${currentShift}`;
function saveDraft(payload) { try { localStorage.setItem(draftKey(), JSON.stringify(payload)); } catch (e) {} }
function clearDraft() { try { localStorage.removeItem(draftKey()); } catch (e) {} }
function checkDraft() {
  let raw; try { raw = localStorage.getItem(draftKey()); } catch (e) { return; }
  if (!raw) return;
  let d; try { d = JSON.parse(raw); } catch (e) { clearDraft(); return; }
  if (confirm('Ke një kopje të paruajtur për këtë ndërrim (nga një ruajtje që dështoi). Ta rikthej?')) {
    populateForm({ id: $('#entry-id').value, manager: d.manager, note: d.note, workers: d.workers || [], expenses: d.expenses || [] });
    toast('Kopja u rikthye — shtyp "Ruaj Barazimin"');
  } else {
    clearDraft();
  }
}

async function fetchEntries(from, to) {
  const qs = new URLSearchParams();
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);
  const res = await apiFetch('/api/entries?' + qs.toString());
  const { entries } = await res.json();
  return entries;
}

// Zgjedh një ndërrim: ngjyros kartën, ngarko të dhënat e ruajtura ose lëre bosh
async function selectShift(shift) {
  currentShift = shift;
  $$('.shift-card').forEach(c => c.classList.toggle('active', c.dataset.shift === shift));
  setSaveLabel();
  await loadCurrentShift();
}

async function loadCurrentShift() {
  updateDayName();
  const date = $('#date').value;
  if (!date) { clearForm(); return; }
  const lists = [$('#workers-list'), $('#expenses-list')];
  const prev = lists.map(el => el.innerHTML);
  lists.forEach(el => { el.innerHTML = '<div class="skel-line skeleton tall" style="margin-bottom:10px"></div><div class="skel-line skeleton tall"></div>'; });
  try {
    const entries = await fetchEntries(date, date);
    const entry = entries.find(e => e.shift === currentShift);
    if (entry) populateForm(entry); else clearForm();
    refreshDay(entries);
  } catch (e) {
    lists.forEach((el, i) => el.innerHTML = prev[i]);
    toast('⚠️ S\'u ngarkua — provo prapë');
  }
  updateLockBanner();
  checkDraft();
}

// Përditëso statusin e të dy ndërrimeve + pazarin ditor
async function refreshDay(entries) {
  const date = $('#date').value;
  if (!entries) entries = date ? await fetchEntries(date, date) : [];
  const dita = entries.find(e => e.shift === 'dita');
  const nata = entries.find(e => e.shift === 'nata');
  updateStatus('dita', dita);
  updateStatus('nata', nata);
  renderDailyTotal(dita, nata);
}

function updateStatus(shift, entry) {
  const el = $('#status-' + shift);
  if (entry) {
    const net = entryIncome(entry) - entryExpense(entry);
    el.textContent = '✓ Ruajtur · ' + fmt(net);
    el.className = 's-status done';
  } else {
    el.textContent = 'I papërfunduar';
    el.className = 's-status pending';
  }
}

function renderDailyTotal(dita, nata) {
  const box = $('#daily-total');
  const net = e => e ? entryIncome(e) - entryExpense(e) : 0;
  if (dita && nata) {
    const dInc = entryIncome(dita) + entryIncome(nata);
    const dExp = entryExpense(dita) + entryExpense(nata);
    box.className = 'card daily-total complete';
    box.innerHTML = `
      <h2>🧮 Pazari ditor (komplet)</h2>
      <div class="total-row"><span>☀️ Dita (neto)</span><b>${fmt(net(dita))}</b></div>
      <div class="total-row"><span>🌙 Nata (neto)</span><b>${fmt(net(nata))}</b></div>
      <div class="total-row"><span>Bruto <small>(para shpenzimeve)</small></span><b>${fmt(dInc)}</b></div>
      <div class="total-row"><span>Shpenzime ditore</span><b>${fmt(dExp)}</b></div>
      <div class="total-row net"><span>NETO <small>(pas shpenzimeve)</small></span><b>${fmt(net(dita) + net(nata))}</b></div>`;
  } else if (dita || nata) {
    const done = dita ? '☀️ Dita' : '🌙 Nata';
    const missing = !dita ? '☀️ Ditën' : '🌙 Natën';
    box.className = 'card daily-total waiting';
    box.innerHTML = `<h2>🧮 Pazari ditor</h2>
      <p class="hint">U ruajt <b>${done}</b> (neto ${fmt(net(dita || nata))}). Plotëso edhe <b>${missing}</b> që të shohësh pazarin komplet të ditës.</p>`;
  } else {
    box.className = 'card daily-total empty-day';
    box.innerHTML = `<h2>🧮 Pazari ditor</h2>
      <p class="hint">Ende s'ka asnjë barazim për këtë datë. Plotëso Ditën dhe Natën.</p>`;
  }
}

// Ndryshimi i kartave dhe i datës
let lastDate = '';
$$('.shift-card').forEach(c => c.addEventListener('click', () => {
  if (c.dataset.shift === currentShift) return;
  if (hasUnfinishedWorker() && !confirm('Ke një puntor pa përfunduar. Të vazhdohet pa e ruajtur?')) return;
  selectShift(c.dataset.shift);
}));
$('#date').addEventListener('change', () => {
  if (hasUnfinishedWorker() && !confirm('Ke një puntor pa përfunduar. Të vazhdohet pa e ruajtur?')) {
    $('#date').value = lastDate; updateDayName(); return;
  }
  lastDate = $('#date').value;
  loadCurrentShift();
});

// ---------- Historiku ----------
let currentRange = 'week';

$$('.chip').forEach(c => c.addEventListener('click', () => {
  $$('.chip').forEach(x => x.classList.remove('active'));
  c.classList.add('active');
  currentRange = c.dataset.range;
  $('#f-from').value = '';
  $('#f-to').value = '';
  loadHistory();
}));
$('#f-from').addEventListener('change', () => { currentRange = 'custom'; $$('.chip').forEach(x => x.classList.remove('active')); loadHistory(); });
$('#f-to').addEventListener('change', () => { currentRange = 'custom'; $$('.chip').forEach(x => x.classList.remove('active')); loadHistory(); });

function rangeDates() {
  if (currentRange === 'custom') return { from: $('#f-from').value, to: $('#f-to').value };
  if (currentRange === 'all') return {};
  const now = new Date();
  if (currentRange === 'week') {
    const day = (now.getDay() + 6) % 7; // e hene = 0
    const start = new Date(now); start.setDate(now.getDate() - day);
    return { from: iso(start), to: iso(now) };
  }
  if (currentRange === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: iso(start), to: iso(now) };
  }
  return {};
}
const iso = d => { const off = d.getTimezoneOffset(); return new Date(d - off * 60000).toISOString().slice(0, 10); };

const sum = (arr, k) => arr.reduce((a, x) => a + (Number(x[k]) || 0), 0);

// Llogaritje qe marrin parasysh shpenzimet per puntor + te pergjithshme
const workerExp = w => sum(w.expenses || [], 'amount');
const entryIncome = e => sum(e.workers || [], 'amount');
const entryExpense = e => (e.workers || []).reduce((a, w) => a + workerExp(w), 0) + sum(e.expenses || [], 'amount');
const photoStrip = (photos, big) => (photos && photos.length)
  ? `<div class="photo-strip${big ? ' big' : ''}">${photos.map(p => `<div class="photo-thumb"><img src="${p}" data-full="${p}"/></div>`).join('')}</div>`
  : '';

async function loadHistory() {
  const { from, to } = rangeDates();
  const wrap = $('#history-list');
  wrap.innerHTML = skeletonCards(3);
  try {
    const qs = new URLSearchParams();
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    const res = await apiFetch('/api/entries?' + qs.toString());
    const { entries } = await res.json();
    renderHistory(entries);
  } catch (e) {
    wrap.innerHTML = '<div class="load-block"><span>⚠️ Nuk u ngarkua historiku — provo prapë</span></div>';
  }
}

function renderHistory(entries) {
  const wrap = $('#history-list');
  wrap.innerHTML = '';
  if (!entries.length) {
    wrap.innerHTML = '<div class="empty">Nuk ka barazime për këtë periudhë.</div>';
    return;
  }

  // Grupo sipas dates
  const byDate = {};
  entries.forEach(e => { (byDate[e.date] = byDate[e.date] || []).push(e); });

  // Permbledhje periudhe
  const gIncome = entries.reduce((a, e) => a + entryIncome(e), 0);
  const gExpense = entries.reduce((a, e) => a + entryExpense(e), 0);
  const summary = document.createElement('div');
  summary.className = 'card totals';
  summary.innerHTML = `
    <div class="total-row"><span>Të ardhurat gjithsej</span><b>${fmt(gIncome)}</b></div>
    <div class="total-row"><span>Shpenzimet gjithsej</span><b>${fmt(gExpense)}</b></div>
    <div class="total-row net"><span>Neto</span><b style="color:${gIncome - gExpense < 0 ? 'var(--danger)' : 'var(--green)'}">${fmt(gIncome - gExpense)}</b></div>`;
  wrap.appendChild(summary);

  Object.keys(byDate).sort((a, b) => b.localeCompare(a)).forEach(date => {
    wrap.appendChild(dayCard(date, byDate[date]));
  });
}

// Një kartë për të gjithë DITËN (dita + nata bashkë)
function dayCard(date, entries) {
  const dInc = entries.reduce((a, e) => a + entryIncome(e), 0);
  const dExp = entries.reduce((a, e) => a + entryExpense(e), 0);
  const dNet = dInc - dExp;
  const dita = entries.find(e => e.shift === 'dita');
  const nata = entries.find(e => e.shift === 'nata');
  const workerCount = entries.reduce((a, e) => a + (e.workers ? e.workers.length : 0), 0);
  let pending = '';
  if (dita && !nata) pending = '🌙 Nata mungon';
  else if (nata && !dita) pending = '☀️ Dita mungon';

  const card = document.createElement('div');
  card.className = 'card entry-card compact fade-in';
  card.innerHTML = `
    <div class="day-card-date">${formatDate(date)}</div>
    <div class="day-badges">
      ${dita ? '<span class="badge dita">☀️ Dita</span>' : ''}
      ${nata ? '<span class="badge nata">🌙 Nata</span>' : ''}
      ${pending ? `<span class="badge pending">${pending}</span>` : ''}
    </div>
    <div class="mini-net"><span>Pazari ditor</span><span class="val ${dNet < 0 ? 'neg' : ''}">${fmt(dNet)}</span></div>
    <div class="mini-sub">Bruto ${fmt(dInc)} · Shpenzime ${fmt(dExp)} · ${workerCount} puntorë</div>
    <div class="tap-hint">Prek për detajet (Dita & Nata) →</div>`;
  card.addEventListener('click', () => openDayDetail(date, entries));
  return card;
}

// Përmbajtja e detajeve për një ndërrim (puntorët + shpenzimet + shënimet)
function shiftBodyHtml(e) {
  const workersHtml = e.workers.length
    ? e.workers.map(w => {
        const wExp = workerExp(w);
        const exps = (w.expenses || []).length
          ? (w.expenses || []).map(x => `
              <div class="wd-exp">
                <div class="wd-exp-row">
                  <span class="wd-exp-note">${escapeHtml(x.note || '—')} <span class="cat">${escapeHtml(x.category)}</span></span>
                  <b class="neg-amt">−${fmt(x.amount)}</b>
                </div>
                ${photoStrip(x.photos, true)}
              </div>`).join('')
          : '<div class="wd-noexp">Pa shpenzime</div>';
        const ng = Number(w.ngarkesa) || 0;
        const ngHtml = ng ? `
              <div class="wd-exp-row wd-ngarkesa">
                <span class="wd-exp-note">💰 Ngarkesa</span>
                <b class="pos-amt">+${fmt(ng)}</b>
              </div>` : '';
        return `
          <div class="wd-card">
            <div class="wd-top">
              <span class="wd-name">${escapeHtml(w.name || '—')}</span>
              <span class="wd-made">bëri <b>${fmt(w.amount)}</b></span>
            </div>
            ${exps}
            ${ngHtml}
            <div class="wd-net"><span>Dorëzon</span><b>${fmt((w.amount || 0) + ng - wExp)}</b></div>
          </div>`;
      }).join('')
    : '<div class="mini-sub">Pa puntorë</div>';

  const generalHtml = (e.expenses && e.expenses.length)
    ? `<h4>🧾 Shpenzime të përgjithshme</h4>` + e.expenses.map(x => `
        <div class="wd-exp standalone">
          <div class="wd-exp-row">
            <span class="wd-exp-note">${escapeHtml(x.note || '—')} <span class="cat">${escapeHtml(x.category)}</span></span>
            <b class="neg-amt">−${fmt(x.amount)}</b>
          </div>
          ${photoStrip(x.photos, true)}
        </div>`).join('')
    : '';

  const noteHtml = e.note ? `<h4>📝 Shënime</h4><div class="sheet-note">${escapeHtml(e.note)}</div>` : '';
  const madeBy = e.createdBy ? `<div class="made-by">Krijuar nga <b>${escapeHtml(e.createdBy)}</b>${e.updatedBy && e.updatedBy !== e.createdBy ? ` · ndryshuar nga <b>${escapeHtml(e.updatedBy)}</b>` : ''}</div>` : '';
  return `<h4>👤 Puntorët (${e.workers.length})</h4>${workersHtml}${generalHtml}${noteHtml}${madeBy}`;
}

// Detaji i një DITE — Dita dhe Nata të ndara qartë
function openDayDetail(date, entries) {
  const dita = entries.find(e => e.shift === 'dita');
  const nata = entries.find(e => e.shift === 'nata');
  const dInc = entries.reduce((a, e) => a + entryIncome(e), 0);
  const dExp = entries.reduce((a, e) => a + entryExpense(e), 0);
  const dNet = dInc - dExp;

  const section = (e, label) => {
    if (!e) return `<div class="shift-missing">${label} — i papërfunduar</div>`;
    const net = entryIncome(e) - entryExpense(e);
    return `
      <div class="shift-block" data-id="${e.id}">
        <div class="shift-head">
          <span class="badge ${e.shift}">${label}</span>
          ${e.manager ? `<span class="badge mgr">👔 ${escapeHtml(e.manager)}</span>` : ''}
          <span class="shift-net ${net < 0 ? 'neg' : ''}">Neto ${fmt(net)}</span>
        </div>
        ${shiftBodyHtml(e)}
        ${actionsHtml(e)}
      </div>`;
  };

  $('#detail-body').innerHTML = `
    <div class="sheet-head">
      <div><div class="sheet-date">${formatDate(date)}</div></div>
      <button class="sheet-close" id="detail-close">✕</button>
    </div>
    <div class="sheet-net"><span>Pazari ditor</span><b class="${dNet < 0 ? 'neg' : ''}">${fmt(dNet)}</b></div>
    <div class="detail-totals">
      <div><span>Bruto</span><b>${fmt(dInc)}</b></div>
      <div><span>Shpenzime</span><b class="neg-amt">${fmt(dExp)}</b></div>
    </div>
    ${section(dita, '☀️ Barazimi i Ditës')}
    ${section(nata, '🌙 Barazimi i Natës')}`;

  const modal = $('#detail-modal');
  const body = $('#detail-body');
  body.classList.remove('fade-in');
  modal.classList.remove('hidden');
  void body.offsetWidth; // rikthe animacionin fade-in
  body.classList.add('fade-in');
  $('#detail-close').addEventListener('click', closeDetail);
  $('#detail-body').querySelectorAll('.photo-thumb img').forEach(img => {
    img.addEventListener('click', () => openPhoto(img.dataset.full));
  });
  $$('#detail-body .shift-block').forEach(block => {
    const e = entries.find(x => x.id === block.dataset.id);
    if (!e) return;
    const eb = block.querySelector('.edit');
    const db = block.querySelector('.del');
    if (eb) eb.addEventListener('click', () => { closeDetail(); editEntry(e); });
    if (db) db.addEventListener('click', () => deleteEntry(e.id, db));
  });
}

// Butonat Ndrysho/Fshij ose njoftimi i mbylljes, sipas rregullit të 2 ditëve
function actionsHtml(e) {
  const locked = isLockedDate(e.date);
  if (locked && !adminMode) {
    return `<div class="lock-note">🔒 I mbyllur për ndryshim (kaluan më shumë se ${EDIT_WINDOW_DAYS} ditë).</div>`;
  }
  return `
    ${locked ? '<div class="lock-note admin">🔓 Barazim i mbyllur, por ti mund ta ndryshosh ose fshish.</div>' : ''}
    <div class="sheet-actions">
      <button class="btn-ghost edit">✏️ Ndrysho</button>
      <button class="btn-ghost del">🗑️ Fshij</button>
    </div>`;
}

function closeDetail() { $('#detail-modal').classList.add('hidden'); }

async function deleteEntry(id, btn) {
  if (!confirm('Të fshihet ky barazim?')) return;
  busy(btn, true, '');
  try {
    const res = await apiFetch('/api/entries/' + id, { method: 'DELETE' });
    if (res.status === 403) {
      const d = await res.json().catch(() => ({}));
      return toast(d.error || 'I mbyllur për ndryshim');
    }
    toast('U fshi');
    closeDetail();
    loadHistory();
  } finally {
    busy(btn, false);
  }
}

function editEntry(e) {
  $$('.tab').forEach(b => b.classList.remove('active'));
  $$('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelector('.tab[data-tab="new"]').classList.add('active');
  $('#tab-new').classList.add('active');

  $('#date').value = e.date;
  lastDate = e.date;
  selectShift(e.shift); // ngarkon barazimin e ruajtur për këtë datë+ndërrim
  window.scrollTo(0, 0);
}

// ---------- Modal foto ----------
function openPhoto(url) {
  $('#photo-modal-img').src = url;
  $('#photo-modal').classList.remove('hidden');
}
$('#photo-modal').addEventListener('click', () => $('#photo-modal').classList.add('hidden'));

// ---------- Utils ----------
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function escapeAttr(s) { return escapeHtml(s); }
function formatDate(d) {
  const days = ['E Dielë', 'E Hënë', 'E Martë', 'E Mërkurë', 'E Enjte', 'E Premte', 'E Shtunë'];
  const months = ['Jan', 'Shk', 'Mar', 'Pri', 'Maj', 'Qer', 'Kor', 'Gsh', 'Sht', 'Tet', 'Nën', 'Dhj'];
  const dt = new Date(d + 'T00:00:00');
  return `${days[dt.getDay()]}, ${dt.getDate()} ${months[dt.getMonth()]} ${dt.getFullYear()}`;
}

// ---------- Sugjerimet e menaxhereve ----------
async function refreshManagers() {
  try {
    const res = await apiFetch('/api/entries?');
    const { entries } = await res.json();
    const names = [...new Set(entries.map(e => (e.manager || '').trim()).filter(Boolean))];
    $('#managers-list').innerHTML = names.map(n => `<option value="${escapeAttr(n)}"></option>`).join('');
  } catch (e) { /* injoro */ }
}

// ---------- Autentikimi, rolet & mbyllja pas 2 ditësh ----------
const EDIT_WINDOW_DAYS = 2;
let token = localStorage.getItem('token') || '';
let currentUser = null;
let adminMode = false; // = përdoruesi ka rol "admin" (akses i plotë)

function isLockedDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d)) return false;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.floor((today - d) / 86400000) > EDIT_WINDOW_DAYS;
}
function authHeaders() { return token ? { 'x-session-token': token } : {}; }

// Wrapper për të gjitha thirrjet /api — shton token-in dhe kap 401 (sesion i skaduar)
async function apiFetch(url, opts = {}) {
  beginLoad();
  try {
    const headers = { ...(opts.headers || {}), ...authHeaders() };
    const res = await fetch(url, { ...opts, headers });
    if (res.status === 401) { doLogout(true); throw new Error('unauth'); }
    return res;
  } finally {
    endLoad();
  }
}

function updateLockBanner() {
  const date = $('#date').value;
  const banner = $('#lock-banner');
  const locked = date && isLockedDate(date);
  if (locked && !adminMode) {
    banner.className = 'lock-banner';
    banner.innerHTML = `🔒 Kjo datë është e mbyllur për ndryshim (kaluan më shumë se ${EDIT_WINDOW_DAYS} ditë).`;
    $('#save-btn').disabled = true;
  } else if (locked && adminMode) {
    banner.className = 'lock-banner admin';
    banner.innerHTML = `🔓 Po ndryshon një barazim të mbyllur (më i vjetër se ${EDIT_WINDOW_DAYS} ditë).`;
    $('#save-btn').disabled = false;
  } else {
    banner.className = 'lock-banner hidden';
    $('#save-btn').disabled = false;
  }
}

// ----- Ekrani i hyrjes -----
function showLogin() {
  $('#login-screen').classList.remove('hidden');
  $('#app').classList.add('hidden');
}
function showApp() {
  $('#login-screen').classList.add('hidden');
  $('#app').classList.remove('hidden');
}

async function doLogin() {
  const username = $('#login-user').value.trim();
  const password = $('#login-pass').value;
  const msg = $('#login-msg');
  if (!username || !password) { msg.className = 'al-msg err'; msg.textContent = 'Plotëso përdoruesin dhe fjalëkalimin.'; return; }
  busy($('#login-btn'), true, 'Po hy…');
  msg.textContent = '';
  beginLoad();
  try {
    const res = await fetch('/api/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) { msg.className = 'al-msg err'; msg.textContent = data.error || 'Hyrja dështoi.'; return; }
    token = data.token; currentUser = data.user;
    localStorage.setItem('token', token);
    $('#login-pass').value = '';
    onLoggedIn();
  } catch (e) {
    msg.className = 'al-msg err'; msg.textContent = 'Gabim gjatë hyrjes.';
  } finally {
    endLoad();
    busy($('#login-btn'), false);
  }
}

function onLoggedIn() {
  adminMode = currentUser.role === 'admin';
  $('#user-name').textContent = currentUser.name;
  showApp();
  $('#date').value = todayStr();
  lastDate = todayStr();
  selectShift(defaultShift());
  refreshManagers();
}

// Pas orës 15:00 hapet automatikisht ndërrimi i natës
function defaultShift() {
  return new Date().getHours() >= 15 ? 'nata' : 'dita';
}

async function doLogout(expired) {
  if (!expired) {
    try { await apiFetch('/api/logout', { method: 'POST' }); } catch (e) { /* injoro */ }
  }
  token = ''; currentUser = null; adminMode = false;
  localStorage.removeItem('token');
  closeUserModal();
  showLogin();
  if (expired) toast('Sesioni skadoi — hyr përsëri');
}

// ----- Menuja e përdoruesit -----
function openUserModal() {
  if (!currentUser) return;
  $('#um-name').textContent = currentUser.name;
  $('#pw-old').value = ''; $('#pw-new').value = ''; $('#pw-new2').value = '';
  $('#pw-msg').textContent = '';
  // Seksioni i menaxhimit shfaqet vetëm për Blinin (aksesin e plotë)
  if (currentUser.role === 'admin') {
    $('#admin-reset').classList.remove('hidden');
    $('#ar-msg').textContent = '';
    $('#au-msg').textContent = '';
    loadAdminUsers();
    loadAudit();
  } else {
    $('#admin-reset').classList.add('hidden');
  }
  $('#user-modal').classList.remove('hidden');
}

// Regjistri i veprimeve (vetëm admini)
async function loadAudit() {
  const el = $('#audit-log');
  el.innerHTML = '<div class="load-block" style="padding:14px"><span class="spinner dark"></span><span>Duke ngarkuar…</span></div>';
  try {
    const res = await apiFetch('/api/audit');
    const { log } = await res.json();
    if (!log.length) { el.innerHTML = '<div class="mini-sub">Ende s\'ka veprime.</div>'; return; }
    el.innerHTML = log.map(a => {
      const d = new Date(a.at);
      const p = n => String(n).padStart(2, '0');
      const when = `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
      const what = a.target ? `${a.action} (${escapeHtml(a.target)})`
        : (a.date ? `${a.action} — ${a.date} ${a.shift === 'nata' ? '🌙' : (a.shift === 'dita' ? '☀️' : '')}` : a.action);
      return `<div class="audit-row"><span class="au-when">${when}</span><span class="au-body"><b>${escapeHtml(a.user || '—')}</b> ${what}</span></div>`;
    }).join('');
  } catch (e) { el.innerHTML = '<div class="mini-sub">S\'u ngarkua regjistri.</div>'; }
}

async function loadAdminUsers() {
  const ul = $('#user-list');
  ul.innerHTML = '<div class="load-block" style="padding:14px"><span class="spinner dark"></span><span>Duke ngarkuar…</span></div>';
  $('#ar-user').innerHTML = '<option>Duke ngarkuar…</option>';
  try {
    const res = await apiFetch('/api/users');
    const { users } = await res.json();
    // dropdown për rivendosjen e fjalëkalimit
    $('#ar-user').innerHTML = users.map(u => `<option value="${escapeAttr(u.username)}">${escapeHtml(u.name)}</option>`).join('');
    // lista me mundësi fshirjeje
    ul.innerHTML = users.map(u => `
      <div class="user-row">
        <span class="ur-name">${escapeHtml(u.name)}${u.username === currentUser.username ? ' <small>(ti)</small>' : ''}</span>
        ${u.username === currentUser.username ? '' : `<button class="ur-del" data-u="${escapeAttr(u.username)}">🗑️</button>`}
      </div>`).join('');
    ul.querySelectorAll('.ur-del').forEach(b => {
      b.addEventListener('click', () => deleteUser(b.dataset.u, b.closest('.user-row').querySelector('.ur-name').textContent.trim(), b));
    });
  } catch (e) { ul.innerHTML = '<div class="mini-sub">S\'u ngarkuan përdoruesit.</div>'; }
}

async function addUser() {
  const name = $('#au-name').value.trim();
  const password = $('#au-pass').value;
  const msg = $('#au-msg');
  if (!name) { msg.className = 'al-msg err'; msg.textContent = 'Shëno emrin.'; return; }
  if (password.length < 4) { msg.className = 'al-msg err'; msg.textContent = 'Fjalëkalimi duhet të ketë të paktën 4 shenja.'; return; }
  busy($('#au-save'), true, 'Duke u shtuar…');
  try {
    const res = await apiFetch('/api/admin/users', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, password })
    });
    const d = await res.json();
    if (!res.ok) { msg.className = 'al-msg err'; msg.textContent = d.error || 'Dështoi.'; return; }
    msg.className = 'al-msg ok';
    msg.textContent = `✓ ${d.name} u shtua (fjalëkalimi: "${password}").`;
    $('#au-name').value = ''; $('#au-pass').value = '1234';
    loadAdminUsers();
    refreshManagers();
  } catch (e) { msg.className = 'al-msg err'; msg.textContent = 'Gabim.'; }
  finally { busy($('#au-save'), false); }
}

async function deleteUser(username, label, btn) {
  if (!confirm(`Të fshihet përdoruesi "${label}"?`)) return;
  busy(btn, true, '');
  try {
    const res = await apiFetch('/api/admin/users/' + encodeURIComponent(username), { method: 'DELETE' });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { toast(d.error || 'Dështoi'); return; }
    toast('U fshi');
    loadAdminUsers();
  } catch (e) { toast('Gabim'); }
  finally { busy(btn, false); }
}

async function resetUserPassword() {
  const username = $('#ar-user').value;
  const newPassword = $('#ar-pass').value;
  const msg = $('#ar-msg');
  if (newPassword.length < 4) { msg.className = 'al-msg err'; msg.textContent = 'Fjalëkalimi i ri duhet të ketë të paktën 4 shenja.'; return; }
  busy($('#ar-save'), true, 'Duke u rivendosur…');
  try {
    const res = await apiFetch('/api/admin/reset-password', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, newPassword })
    });
    const d = await res.json();
    if (!res.ok) { msg.className = 'al-msg err'; msg.textContent = d.error || 'Dështoi.'; return; }
    msg.className = 'al-msg ok';
    msg.textContent = `✓ Fjalëkalimi i ${d.name} u rivendos në "${newPassword}".`;
  } catch (e) { msg.className = 'al-msg err'; msg.textContent = 'Gabim.'; }
  finally { busy($('#ar-save'), false); }
}
function closeUserModal() { $('#user-modal').classList.add('hidden'); }

async function changePassword() {
  const oldPassword = $('#pw-old').value;
  const newPassword = $('#pw-new').value;
  const confirm2 = $('#pw-new2').value;
  const msg = $('#pw-msg');
  if (newPassword.length < 4) { msg.className = 'al-msg err'; msg.textContent = 'Fjalëkalimi i ri duhet të ketë të paktën 4 shenja.'; return; }
  if (newPassword !== confirm2) { msg.className = 'al-msg err'; msg.textContent = 'Fjalëkalimet e reja nuk përputhen.'; return; }
  busy($('#pw-save'), true, 'Duke u ruajtur…');
  try {
    const res = await apiFetch('/api/change-password', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldPassword, newPassword })
    });
    const data = await res.json();
    if (!res.ok) { msg.className = 'al-msg err'; msg.textContent = data.error || 'Dështoi.'; return; }
    msg.className = 'al-msg ok'; msg.textContent = '✓ Fjalëkalimi u ndryshua.';
    $('#pw-old').value = ''; $('#pw-new').value = ''; $('#pw-new2').value = '';
  } catch (e) { msg.className = 'al-msg err'; msg.textContent = 'Gabim.'; }
  finally { busy($('#pw-save'), false); }
}

$('#login-btn').addEventListener('click', doLogin);
$('#login-pass').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
$('#user-chip').addEventListener('click', openUserModal);
$('#logout-btn').addEventListener('click', () => doLogout(false));
$('#pw-save').addEventListener('click', changePassword);
$('#ar-save').addEventListener('click', resetUserPassword);
$('#au-save').addEventListener('click', addUser);

// ---------- Init ----------
async function init() {
  const boot = $('#boot');
  const hideBoot = () => boot.classList.add('hidden');
  if (!token) { showLogin(); hideBoot(); return; }
  beginLoad();
  try {
    const res = await fetch('/api/me', { headers: authHeaders() });
    if (!res.ok) { showLogin(); return; }
    const data = await res.json();
    currentUser = data.user;
    onLoggedIn();
  } catch (e) { showLogin(); }
  finally { endLoad(); hideBoot(); }
}
init();
