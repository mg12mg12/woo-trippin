// 旅程(檢視 + 編輯)— Trippin/Wandr 風格 v2:真實地圖、波浪小徑、點擊放大轉場、至頂鈕。
const $ = (s) => document.querySelector(s);
const DEV = ['localhost', '127.0.0.1', ''].indexOf(location.hostname) !== -1;
const DEMO = (window.DEMO_DATA || { trips: [] });
const CFG = (window.CONFIG || {});
const LS = window.localStorage;

const esc = (s) => (s ?? '').toString().replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function linkify(t) {
  t = (t ?? '').toString();
  const re = /(https?:\/\/[^\s]+)/g; let out = '', last = 0, m;
  while ((m = re.exec(t))) { out += esc(t.slice(last, m.index)); out += `<a href="${m[1].replace(/"/g, '%22')}" target="_blank" rel="noopener">開啟 ↗</a>`; last = m.index + m[1].length; }
  out += esc(t.slice(last)); return out;
}
const ICONS = { '每日行程': '📅', '匯率': '💱', '住宿推薦': '🏨', '美食建議': '🍜', '雨天避暑方案': '🌧️', '預算開銷': '💰', 'LCK彈性方案': '🎮', '交通指南': '🚇', '出發前預約清單': '✅', '景點重點資訊': '📌' };
const THEMES = [
  { light: '#d9f3ec', base: '#19b89a', dark: '#0c7d70', sun: '#ffc857' },
  { light: '#ffe6dd', base: '#ff7a5c', dark: '#e0563a', sun: '#ffd27a' },
  { light: '#e2f0fb', base: '#5ab0e2', dark: '#2f86bd', sun: '#ffd27a' },
  { light: '#ece8ff', base: '#8b7cf6', dark: '#6a5ad6', sun: '#ffd27a' },
  { light: '#fdeaf2', base: '#e1467c', dark: '#b92e60', sun: '#ffd27a' },
  { light: '#fff2d6', base: '#f4b740', dark: '#cf9213', sun: '#ff9f5c' },
];
function orbSvg(t) {
  return `<svg viewBox="0 0 16 16" shape-rendering="crispEdges" preserveAspectRatio="none" aria-hidden="true">
    <rect width="16" height="16" fill="${t.light}"/>
    <rect x="12" y="2" width="3" height="3" fill="${t.sun}"/>
    <rect x="2" y="3" width="3" height="1" fill="#ffffff"/><rect x="3" y="2" width="2" height="1" fill="#ffffff"/>
    <rect x="6" y="6" width="1" height="1" fill="#ffffff"/><rect x="7" y="5" width="2" height="1" fill="#ffffff"/><rect x="9" y="6" width="1" height="1" fill="#ffffff"/>
    <rect x="0" y="10" width="16" height="6" fill="${t.base}"/>
    <rect x="0" y="13" width="16" height="3" fill="${t.dark}"/>
    <rect x="3" y="9" width="3" height="1" fill="${t.base}"/><rect x="10" y="9" width="3" height="1" fill="${t.base}"/>
  </svg>`;
}

let TRIP = null, curSheet = null, mode = 'view', editModel = null, dirty = false, MAP = null;
let SEASON = 'summer';
let ID_TOKEN = null;  // 上線時 Google 登入取得的憑證(本機 DEV 不需要)
// 各季圖釘:檔名 + 顯示尺寸 + 綠底圓心(% 相對圖釘),數字壓在圓心
const PINS = {
  spring: { file: 'pin-spring', w: 66, h: 76, cx: 49.9, cy: 37.3 },
  summer: { file: 'pin-summer', w: 66, h: 76, cx: 48.3, cy: 35.7 },
  autumn: { file: 'pin-fall',   w: 66, h: 76, cx: 48.8, cy: 37.7 },
  winter: { file: 'pin-winter', w: 66, h: 79, cx: 47.5, cy: 41.6 },
};

if (DEV) $('#env-badge').hidden = false;

// ---------- 至頂按鈕 ----------
const toTop = $('#to-top');
window.addEventListener('scroll', () => { toTop.hidden = window.scrollY < 300; });
toTop.onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });

// 依目前季節自動選首頁背景(北半球;3-5 春 6-8 夏 9-11 秋 其餘 冬)
(function () {
  const m = new Date().getMonth() + 1;
  const s = (m >= 3 && m <= 5) ? 'spring' : (m >= 6 && m <= 8) ? 'summer' : (m >= 9 && m <= 11) ? 'autumn' : 'winter';
  const img = document.getElementById('hero-img');
  const mq = window.matchMedia('(min-width:761px)');
  const deskName = { spring: 'spring-d', summer: 'summer-d', autumn: 'fall-d', winter: 'winter-d' }[s];
  function setSrc(){ if (img) img.src = 'bg/' + (mq.matches ? deskName : s) + '.png'; }
  setSrc();
  if (mq.addEventListener) mq.addEventListener('change', setSrc);
  else if (mq.addListener) mq.addListener(setSrc);
  SEASON = s;
  const h = document.getElementById('hero'); if (h) h.classList.add('s-' + s);
})();

// ---------- 資料來源 ----------
function homeTrips() { return DEV ? DEMO.trips : (CFG.TRIPS || []); }
function devClone(id) {
  const c = LS.getItem('demo:' + id); if (c) { try { return JSON.parse(c); } catch (e) {} }
  const t = DEMO.trips.find(x => x.id === id); return t ? JSON.parse(JSON.stringify(t)) : null;
}
function devPersist() { if (DEV && TRIP) LS.setItem('demo:' + TRIP.id, JSON.stringify(TRIP)); }
async function loadTrip(meta) {
  if (DEV) return devClone(meta.id) || meta;
  const key = 'tcache:' + meta.spreadsheetId;
  const fetchFresh = (async () => {
    const res = await fetch(CFG.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'dump', spreadsheetId: meta.spreadsheetId, idToken: ID_TOKEN }) });
    const d = await res.json(); if (!d.ok) throw new Error(d.error || '讀取失敗');
    try { localStorage.setItem(key, JSON.stringify(d.data.sheets)); } catch (e) {}
    return d.data.sheets;
  })();
  let cached = null; try { const s = localStorage.getItem(key); if (s) cached = JSON.parse(s); } catch (e) {}
  if (cached) { fetchFresh.catch(() => {}); return Object.assign({}, meta, { sheets: cached }); }
  return Object.assign({}, meta, { sheets: await fetchFresh });
}
async function saveSheetRemote(name, sheet) {
  if (DEV) { TRIP.sheets[name] = sheet; devPersist(); return; }
  const res = await fetch(CFG.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'saveSheet', spreadsheetId: TRIP.spreadsheetId, idToken: ID_TOKEN, sheetName: name, headers: sheet.headers, rows: sheet.rows }) });
  const d = await res.json(); if (!d.ok) throw new Error(d.error || '儲存失敗');
  TRIP.sheets[name] = sheet;
  try { localStorage.setItem('tcache:' + TRIP.spreadsheetId, JSON.stringify(TRIP.sheets)); } catch (e) {}
}

// ---------- 首頁(波浪小徑 + 腳印)----------
function showHome() {
  $('#trip-view').hidden = true; $('#home-view').hidden = false;
  const trips = homeTrips();
  const items = trips.map((t, i) => {
    const th = THEMES[i % THEMES.length];
    const intro = t.intro || `${t.days || ''} 天行程,從 ${t.origin || ''} 到 ${t.dest || ''}。`;
    return `<div class="bubble" data-id="${esc(t.id)}" data-i="${i}">
      <div class="orb" data-open="${esc(t.id)}">${orbSvg(th)}<span class="code">${esc(t.dest || t.origin || '')}</span></div>
      <div class="bn">${esc(t.name)}</div><div class="bd">${esc(t.dateRange || '')}</div>
      <div class="pop"><div class="pr"><span>${esc(t.origin || '')}</span> ✈ <span>${esc(t.dest || '')}</span> · ${esc(t.days || '')}天</div>
        <div class="px">${esc(intro)}</div><button class="btn" data-open="${esc(t.id)}">查看行程 →</button></div>
    </div>`;
  });
  items.push(`<div class="bubble add" id="addbubble"><div class="orb">＋</div><div class="bn">新增行程</div><div class="bd">建立新試算表</div></div>`);
  $('#passes').innerHTML = items.join('<span class="paw" aria-hidden="true">👣</span>');
  $('#passes').querySelectorAll('.bubble:not(.add)').forEach(el => {
    const id = el.dataset.id, th = THEMES[(+el.dataset.i) % THEMES.length];
    el.querySelectorAll('[data-open]').forEach(o => o.onclick = (e) => { e.stopPropagation(); flyToTrip(el, id, th); });
    el.onclick = () => flyToTrip(el, id, th);
  });
  $('#addbubble').onclick = () => {
    const el = $('#add-help'); el.hidden = !el.hidden;
    el.textContent = '新增行程:\n1. 把現有試算表「製作副本」當範本,填入新行程(每日行程記得填「緯度/經度」才會出現在地圖)。\n2. 複製新試算表 ID(網址 /d/ 後那段)。\n3. 加進 config.js 的 TRIPS 清單,重新部署即可。';
  };
}

// ---------- 點擊放大轉場 ----------
async function flyToTrip(bubbleEl, id, theme) {
  if (!guardDirty()) return;
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion:reduce)').matches;
  const orb = bubbleEl.querySelector('.orb');
  const r = orb ? orb.getBoundingClientRect() : { width: 0 };
  if (reduce || !r.width) { await openTrip(id); window.scrollTo(0, 0); return; }
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const ov = document.createElement('div'); ov.className = 'fly2';
  const cp0 = `circle(0px at ${cx}px ${cy}px)`;
  ov.style.clipPath = cp0; ov.style.webkitClipPath = cp0;
  ov.innerHTML = `<span class="cloud" style="top:13%;left:9%;font-size:74px">☁</span>
    <span class="cloud" style="top:24%;right:11%;font-size:92px;color:#e7eef0">☁</span>
    <span class="cloud" style="bottom:16%;left:16%;font-size:56px;color:#e7eef0">☁</span>
    <span class="cloud" style="bottom:28%;right:18%;font-size:70px">☁</span>
    <span class="plane">✈</span><span class="fly-load">讀取中…</span>`;
  document.body.appendChild(ov);
  const R = Math.hypot(innerWidth, innerHeight);
  requestAnimationFrame(() => { const cp = `circle(${R}px at ${cx}px ${cy}px)`; ov.style.clipPath = cp; ov.style.webkitClipPath = cp; });
  window.scrollTo(0, 0);
  const started = Date.now();
  const loadTimer = setTimeout(() => { const l = ov.querySelector('.fly-load'); if (l) l.style.opacity = '1'; }, 1700);
  try { await openTrip(id); } catch (e) {}
  clearTimeout(loadTimer);
  const minMs = 1500, elapsed = Date.now() - started;
  if (elapsed < minMs) await new Promise(res => setTimeout(res, minMs - elapsed));
  ov.style.transition = 'transform .55s ease-in, opacity .5s';
  ov.style.transform = 'translateY(-110%)'; ov.style.opacity = '0';
  setTimeout(() => ov.remove(), 600);
}

$('#home-link').onclick = () => { if (guardDirty()) showHome(); };
$('#back').onclick = () => { if (guardDirty()) showHome(); };
function guardDirty() { return !(mode === 'edit' && dirty) || confirm('有未儲存的修改,確定離開並放棄?'); }

// ---------- 開啟行程 ----------
async function openTrip(id) {
  const meta = homeTrips().find(t => t.id === id); if (!meta) return;
  try { TRIP = await loadTrip(meta); } catch (e) { alert('讀取失敗:' + e.message); return; }
  $('#home-view').hidden = true; $('#trip-view').hidden = false;
  $('#trip-head').innerHTML = `<span class="tn">${esc(TRIP.name)}</span>
    <span class="troute">${esc(TRIP.origin || '')} ✈ ${esc(TRIP.dest || '')}</span>
    <span class="tm">${esc(TRIP.dateRange || '')} · ${esc(TRIP.days || '')} 天</span>`;
  renderMap();
  const names = Object.keys(TRIP.sheets || {}).filter(n => n !== '支出');
  let tabsHtml = names.map((n, i) =>
    `<button class="tab ${i === 0 ? 'active' : ''}" data-s="${esc(n)}"><span class="ic">${ICONS[n] || '•'}</span><span class="lab">${esc(n)}</span></button>`).join('');
  tabsHtml += `<button class="tab" data-s="__exp__"><span class="ic">💵</span><span class="lab">支出</span></button>`;
  $('#sectionnav').innerHTML = tabsHtml;
  $('#sectionnav').querySelectorAll('.tab').forEach(t => t.onclick = () => selectSheet(t.dataset.s));
  curSheet = names[0]; setActiveTab(curSheet); $('#toolbar').hidden = false; setMode('view');
}
function setActiveTab(name) { $('#sectionnav').querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.s === name)); }
function selectSheet(name) {
  if (!guardDirty()) return;
  curSheet = name; setActiveTab(name);
  if (name === '__exp__') { $('#toolbar').hidden = true; renderExpenses(); }
  else { $('#toolbar').hidden = false; setMode('view'); }
}

// ---------- 真實地圖(Leaflet)----------
function mapPoints() {
  const sh = TRIP.sheets['每日行程']; if (!sh) return [];
  const H = sh.headers, idx = (l) => H.indexOf(l);
  const cD = idx('日期'), cT = idx('時間'), cA = idx('行程'), cL = idx('地點/地址'), cLa = idx('緯度'), cLn = idx('經度');
  if (cLa === -1 || cLn === -1) return [];
  let di = -1, curD = '', out = [];
  sh.rows.forEach(r => {
    if (r[cD]) { curD = r[cD]; di++; }
    const la = parseFloat(r[cLa]), ln = parseFloat(r[cLn]);
    if (!isNaN(la) && !isNaN(ln)) out.push({ lat: la, lng: ln, day: Math.max(di, 0), date: curD, time: r[cT] || '', act: r[cA] || '', loc: r[cL] || '' });
  });
  return out;
}
function renderMap() {
  const host = $('#tripmap');
  if (MAP) { try { MAP.remove(); } catch (e) {} MAP = null; }
  host.innerHTML = '';
  if (typeof L === 'undefined') { host.innerHTML = '<div style="padding:16px" class="muted">地圖元件需要網路連線才能載入。</div>'; return; }
  const pts = mapPoints();
  if (!pts.length) { host.innerHTML = '<div style="padding:16px" class="muted">「每日行程」尚未填經緯度,無法顯示地圖。在試算表加「緯度」「經度」欄即可。</div>'; return; }
  MAP = L.map(host, { scrollWheelZoom: false }).setView([pts[0].lat, pts[0].lng], 11);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(MAP);
  const latlngs = [], seen = {};
  pts.forEach((p, i) => {
    const key = p.lat.toFixed(4) + ',' + p.lng.toFixed(4);
    const k = (seen[key] = (seen[key] || 0) + 1);
    const off = (k - 1) * 0.0013;
    const la = p.lat + off, ln = p.lng + off;
    latlngs.push([la, ln]);
    const pc = PINS[SEASON] || PINS.summer;
    const icon = L.divIcon({ className: '', iconSize: [pc.w, pc.h], iconAnchor: [pc.w / 2, pc.h], popupAnchor: [0, -pc.h + 6],
      html: `<div style="width:${pc.w}px;height:${pc.h}px;position:relative;background:url('pins/${pc.file}.png') center/contain no-repeat">`
          + `<span style="position:absolute;left:${pc.cx}%;top:${pc.cy}%;width:${Math.round(pc.w*0.5)}px;height:${Math.round(pc.w*0.5)}px;transform:translate(-50%,-50%);display:flex;align-items:center;justify-content:center;font-family:var(--px,monospace);font-size:13px;color:#ffffff;line-height:1;text-shadow:0 1px 2px rgba(20,45,32,.55)">${i + 1}</span></div>` });
    L.marker([la, ln], { icon }).addTo(MAP).bindPopup(
      `<div class="map-pop"><div class="mt">${esc(p.date)} ${esc(p.time)}</div><div class="ma">${esc(p.act)}</div><div class="ml">${esc(p.loc)}</div><button class="pjump" onclick="window.__jumpDay(${p.day})">跳到當天行程 →</button></div>`);
  });
  L.polyline(latlngs, { color: '#13a594', weight: 3, opacity: .85, dashArray: '1 9', lineCap: 'round' }).addTo(MAP);
  MAP.fitBounds(L.latLngBounds(latlngs).pad(0.18));
  setTimeout(() => { try { MAP.invalidateSize(); } catch (e) {} }, 60);
}
window.__jumpDay = (i) => { if (MAP) MAP.closePopup(); jumpToDay(i); };
function jumpToDay(i) {
  if (!guardDirty()) return;
  if (curSheet !== '每日行程') { curSheet = '每日行程'; setActiveTab(curSheet); setMode('view'); }
  const el = document.getElementById('day-' + i); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------- 模式 ----------
$('#mode-view').onclick = () => { if (guardDirty()) setMode('view'); };
$('#mode-edit').onclick = () => setMode('edit');
$('#add-row').onclick = () => { editModel.rows.push(new Array(editModel.cols).fill('')); dirty = true; renderEdit(); };
$('#save-btn').onclick = saveCurrent;
function setMode(m) {
  mode = m; dirty = false;
  $('#mode-view').classList.toggle('active', m === 'view');
  $('#mode-edit').classList.toggle('active', m === 'edit');
  $('#edit-actions').hidden = m !== 'edit';
  if (m === 'view') renderView(); else enterEdit();
}

// ---------- 檢視 ----------
// ---------- 支出頁 ----------
const EXP_CATS = ['餐飲', '交通', '住宿', '購物', '門票/娛樂', '體驗', '其他'];
const EXP_COLORS = ['#ff7a5c', '#5aa0d8', '#8b7cf6', '#f6cf63', '#e0728a', '#46c5a1', '#9aa6a0'];
let EXP = [];
let EXPCHART = null;

function getDefaultRate() {
  const sh = TRIP && TRIP.sheets && TRIP.sheets['匯率'];
  if (!sh) return 1;
  const j = sh.headers.indexOf('數值'); const col = j === -1 ? 1 : j;
  for (const r of sh.rows) { const v = parseFloat(r[col]); if (!isNaN(v) && v > 0) return v; }
  return 1;
}
async function loadExpenses() {
  if (DEV) { try { return JSON.parse(localStorage.getItem('exp:' + TRIP.id)) || []; } catch (e) { return []; } }
  const d = await apiPost('expenses', { spreadsheetId: TRIP.spreadsheetId }); return d.items || [];
}
async function persistExpenses() {
  if (DEV) { localStorage.setItem('exp:' + TRIP.id, JSON.stringify(EXP)); return; }
  await apiPost('saveExpenses', { spreadsheetId: TRIP.spreadsheetId, items: EXP });
}
const twdOf = (e) => Math.round((Number(e.amount) || 0) * (Number(e.qty) || 1) * (Number(e.rate) || 0));
const totOf = (e) => (Number(e.amount) || 0) * (Number(e.qty) || 1);

async function renderExpenses() {
  const rate0 = getDefaultRate();
  try { EXP = await loadExpenses(); } catch (e) { $('#content').innerHTML = '<p class="muted">讀取支出失敗:' + esc(e.message) + '</p>'; return; }
  drawExpenses(rate0);
}
function drawExpenses(rate0) {
  const sorted = EXP.map((e, i) => ({ e, i })).sort((a, b) => twdOf(b.e) - twdOf(a.e));
  const totalTwd = EXP.reduce((s, e) => s + twdOf(e), 0);
  const catSum = {}; EXP_CATS.forEach(c => catSum[c] = 0);
  EXP.forEach(e => { const c = EXP_CATS.indexOf(e.category) === -1 ? '其他' : e.category; catSum[c] += twdOf(e); });
  const catList = EXP_CATS.map(c => ({ c, v: catSum[c] })).filter(x => x.v > 0).sort((a, b) => b.v - a.v);
  const catRows = catList.map(x => { const pct = totalTwd ? Math.round(x.v / totalTwd * 100) : 0; const col = EXP_COLORS[EXP_CATS.indexOf(x.c)];
    return `<div class="expcat-row"><span class="cdot" style="background:${col}"></span><span class="cnm">${x.c}</span><span class="camt">NT$${x.v.toLocaleString()}</span><span class="cpct">${pct}%</span></div>`; }).join('');
  const opts = EXP_CATS.map(c => `<option value="${c}">${c}</option>`).join('');
  const rows = sorted.map(({ e, i }) => `
    <tr>
      <td>${esc(e.name)}</td>
      <td><span class="ecat">${esc(e.category || '其他')}</span></td>
      <td class="num">${e.qty || 1}</td>
      <td class="num">${(Number(e.amount) || 0).toLocaleString()}</td>
      <td class="num">${totOf(e).toLocaleString()}</td>
      <td class="num">NT$${twdOf(e).toLocaleString()}</td>
      <td class="rowdel"><button data-del="${i}" title="刪除">✕</button></td>
    </tr>`).join('');
  $('#content').innerHTML = `
    <div class="section-title">💵 支出 <span class="muted small">(只有你自己看得到)</span></div>
    <div class="expform">
      <input id="e-name" placeholder="商品名稱"/>
      <select id="e-cat">${opts}</select>
      <input id="e-qty" type="number" min="1" placeholder="數量(預設1)" inputmode="numeric"/>
      <input id="e-amt" type="number" min="0" placeholder="金額(單價)" inputmode="decimal"/>
      <input id="e-rate" type="number" step="0.0001" value="${rate0}" title="匯率"/>
      <button id="e-add" class="btn">＋ 新增</button>
    </div>
    <div class="exptotal">台幣總計 <b>NT$${totalTwd.toLocaleString()}</b></div>
    <div class="expchart-wrap">${EXP.length ? '<canvas id="expchart"></canvas>' : '<p class="muted" style="padding:16px">還沒有支出,先在上面新增一筆。</p>'}</div>
    ${EXP.length ? `<div class="expcats">${catRows}</div>` : ''}
    <div class="tablewrap"${EXP.length ? '' : ' hidden'}>
      <table class="tbl"><thead><tr><th>商品</th><th>分類</th><th>數量</th><th>單價</th><th>總額</th><th>台幣</th><th></th></tr></thead>
      <tbody>${rows}</tbody></table>
    </div>`;
  $('#e-add').onclick = onAddExpense;
  $('#content').querySelectorAll('[data-del]').forEach(b => b.onclick = () => onDelExpense(+b.dataset.del));
  drawExpChart();
}
async function onAddExpense() {
  const name = $('#e-name').value.trim();
  const amount = parseFloat($('#e-amt').value);
  if (!name || isNaN(amount)) { alert('請至少輸入商品名稱和金額'); return; }
  const qty = parseInt($('#e-qty').value, 10); const rate = parseFloat($('#e-rate').value);
  EXP.push({ name, category: $('#e-cat').value, qty: (qty > 0 ? qty : 1), amount, rate: (isNaN(rate) ? getDefaultRate() : rate) });
  $('#e-add').disabled = true;
  try { await persistExpenses(); } catch (e) { alert('儲存失敗:' + e.message); EXP.pop(); }
  $('#e-add').disabled = false;
  drawExpenses(getDefaultRate());
}
async function onDelExpense(i) {
  if (!confirm('確定刪除這筆支出?')) return;
  const removed = EXP.splice(i, 1);
  try { await persistExpenses(); } catch (e) { alert('刪除失敗:' + e.message); EXP.splice(i, 0, removed[0]); }
  drawExpenses(getDefaultRate());
}
function drawExpChart() {
  if (EXPCHART) { try { EXPCHART.destroy(); } catch (e) {} EXPCHART = null; }
  if (!EXP.length || typeof Chart === 'undefined') return;
  const sums = {}; EXP_CATS.forEach(c => sums[c] = 0);
  EXP.forEach(e => { const c = EXP_CATS.indexOf(e.category) === -1 ? '其他' : e.category; sums[c] += twdOf(e); });
  const labels = EXP_CATS.filter(c => sums[c] > 0);
  const data = labels.map(c => sums[c]);
  const colors = labels.map(c => EXP_COLORS[EXP_CATS.indexOf(c)]);
  const ctx = document.getElementById('expchart'); if (!ctx) return;
  EXPCHART = new Chart(ctx, { type: 'pie', data: { labels, datasets: [{ data, backgroundColor: colors, borderColor: '#fff', borderWidth: 2 }] },
    options: { plugins: { legend: { position: 'bottom', labels: { font: { family: 'DotGothic16' } } } } } });
}

function renderView() {
  const sh = TRIP.sheets[curSheet];
  const title = `<div class="section-title">${ICONS[curSheet] || ''} ${esc(curSheet)}</div>`;
  $('#content').innerHTML = title + (curSheet === '每日行程' ? renderTimeline(sh) : renderTable(sh));
}
function renderTimeline(sh) {
  const H = sh.headers, idx = (l, d) => { const i = H.indexOf(l); return i === -1 ? d : i; };
  const cD = idx('日期', 0), cW = idx('星期', 1), cT = idx('時間', 2), cA = idx('行程', 3), cL = idx('地點/地址', 4), cV = idx('交通方式', 5), cN = idx('備註', 6);
  let curD = '', curW = '', groups = [];
  sh.rows.forEach(r => {
    if (r[cD]) { curD = r[cD]; curW = r[cW]; }
    const d = r[cD] || curD;
    if (!groups.length || groups[groups.length - 1].date !== d) groups.push({ date: d, dow: (r[cD] ? r[cW] : curW), slots: [] });
    groups[groups.length - 1].slots.push(r);
  });
  return groups.map((g, gi) => `
    <div class="day" id="day-${gi}">
      <div class="day-head"><span class="day-date">${esc(g.date)}</span><span class="day-dow">${esc(g.dow)}</span></div>
      <div class="slots">
        ${g.slots.map(r => {
          const meta = [];
          if (r[cL] && r[cL] !== '—') meta.push(`<span class="tagpill loc">📍 ${esc(r[cL])}</span>`);
          if (r[cV] && r[cV] !== '—') meta.push(`<span class="tagpill via">🚇 ${esc(r[cV])}</span>`);
          return `<div class="slot"><div class="slot-time">${esc(r[cT])}</div>
            <div class="slot-body"><div class="act">${esc(r[cA])}</div>
              ${meta.length ? `<div class="slot-meta">${meta.join('')}</div>` : ''}
              ${r[cN] && r[cN] !== '—' ? `<div class="slot-note">${linkify(r[cN])}</div>` : ''}
            </div></div>`;
        }).join('')}
      </div>
    </div>`).join('');
}
function renderTable(sh) {
  const all = [sh.headers].concat(sh.rows); let cols = 0;
  all.forEach(r => { for (let i = 0; i < r.length; i++) if ((r[i] ?? '') !== '') cols = Math.max(cols, i + 1); });
  const headers = sh.headers.slice(0, cols); const notes = [], bodyRows = [];
  sh.rows.forEach(r => {
    const filled = r.slice(0, cols).filter(c => (c ?? '') !== '');
    if (filled.length <= 1) { if (filled.length === 1) notes.push(filled[0]); } else bodyRows.push(r.slice(0, cols));
  });
  const hasHeader = headers.some(h => h !== '');
  const thead = hasHeader ? `<thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>` : '';
  const tbody = bodyRows.map(r => `<tr>${r.map(c => { const v = (c ?? '').toString(); return `<td>${/https?:\/\//.test(v) ? linkify(v) : esc(v)}</td>`; }).join('')}</tr>`).join('');
  let html = '';
  if (bodyRows.length) html += `<div class="tablewrap"><table class="tbl">${thead}<tbody>${tbody}</tbody></table></div>`;
  if (notes.length) html += `<div class="notes">${notes.map(n => `<div class="note">${linkify(n)}</div>`).join('')}</div>`;
  return html || '<p class="muted">這個分頁沒有內容。</p>';
}

// ---------- 編輯 ----------
function enterEdit() {
  const sh = TRIP.sheets[curSheet]; let cols = sh.headers.length;
  sh.rows.forEach(r => cols = Math.max(cols, r.length)); cols = Math.max(cols, 1);
  const pad = a => { const x = (a || []).slice(0, cols); while (x.length < cols) x.push(''); return x.map(v => (v ?? '').toString()); };
  editModel = { cols, headers: pad(sh.headers), rows: sh.rows.map(pad) };
  renderEdit();
}
function renderEdit() {
  const em = editModel;
  const title = `<div class="section-title">${ICONS[curSheet] || ''} ${esc(curSheet)} · 編輯</div>`;
  const head = `<thead><tr>${em.headers.map((h, c) => `<th><input data-h="${c}" value="${esc(h)}" placeholder="欄名"/></th>`).join('')}<th class="rowdel"></th></tr></thead>`;
  const body = em.rows.map((row, r) => `<tr>${row.map((cell, c) => `<td><textarea data-r="${r}" data-c="${c}" rows="1">${esc(cell)}</textarea></td>`).join('')}<td class="rowdel"><button data-del="${r}" title="刪除這列">✕</button></td></tr>`).join('');
  $('#content').innerHTML = title + `<div class="editwrap"><table class="grid">${head}<tbody>${body}</tbody></table></div>` +
    `<div class="colbtns"><button class="btn-ghost" id="add-col">＋ 新增欄</button></div>` +
    `<p class="edit-hint">直接點格子修改;空白列在儲存時會自動移除。「每日行程」可在「緯度/經度」欄填座標,該地點就會出現在上方地圖。改完按上方「儲存」。</p>`;
  const c = $('#content');
  c.querySelectorAll('input[data-h]').forEach(el => el.oninput = () => { em.headers[+el.dataset.h] = el.value; dirty = true; });
  c.querySelectorAll('textarea[data-r]').forEach(el => { autosize(el); el.oninput = () => { em.rows[+el.dataset.r][+el.dataset.c] = el.value; dirty = true; autosize(el); }; });
  c.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { em.rows.splice(+b.dataset.del, 1); dirty = true; renderEdit(); });
  $('#add-col').onclick = () => { em.cols++; em.headers.push(''); em.rows.forEach(r => r.push('')); dirty = true; renderEdit(); };
}
function autosize(el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }
async function saveCurrent() {
  const rows = editModel.rows.map(r => r.map(c => (c ?? '').toString())).filter(r => r.some(c => c.trim() !== ''));
  const sheet = { headers: editModel.headers.map(h => (h ?? '').toString()), rows };
  $('#save-btn').disabled = true; $('#save-status').textContent = '儲存中…';
  try {
    await saveSheetRemote(curSheet, sheet); dirty = false; $('#save-status').textContent = '已儲存';
    if (curSheet === '每日行程') renderMap();
    setMode('view');
  } catch (e) { $('#save-status').textContent = '儲存失敗:' + e.message; }
  finally { $('#save-btn').disabled = false; }
}

// ---------- 登入(僅上線時需要;本機 DEV 自動略過)----------
async function apiPost(action, params) {
  const res = await fetch(CFG.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(Object.assign({ action, idToken: ID_TOKEN }, params)) });
  const d = await res.json(); if (!d.ok) throw new Error(d.error || '錯誤'); return d.data;
}
function startLogin() {
  const gate = $('#login-gate'); if (gate) gate.hidden = false;
  if (!CFG.GOOGLE_CLIENT_ID) { showLoginErr('尚未設定 GOOGLE_CLIENT_ID(請編輯 config.js)'); return; }
  (function init() {
    if (!(window.google && google.accounts && google.accounts.id)) return setTimeout(init, 200);
    google.accounts.id.initialize({ client_id: CFG.GOOGLE_CLIENT_ID, callback: onCredential, auto_select: true });
    google.accounts.id.renderButton($('#gbtn'), { theme: 'filled_blue', size: 'large', text: 'signin_with', shape: 'rectangular' });
    try { google.accounts.id.prompt(); } catch (e) {}
  })();
}
function showLoginErr(msg) { const e = $('#login-err'); if (e) { e.hidden = false; e.textContent = msg; } }
async function onCredential(resp) {
  ID_TOKEN = resp.credential;
  try {
    await apiPost('me', {});               // 後端驗證 token + email 白名單
    try { localStorage.setItem('idt', ID_TOKEN); } catch (e) {}
    $('#login-gate').hidden = true;
    showHome();
  } catch (e) {
    ID_TOKEN = null;
    showLoginErr('登入失敗:' + e.message);
  }
}

// ---------- 啟動 ----------
async function boot() {
  if (DEV) { showHome(); return; }
  const saved = (function(){ try { return localStorage.getItem('idt'); } catch (e) { return null; } })();
  if (saved) {
    ID_TOKEN = saved;
    try { await apiPost('me', {}); const g = $('#login-gate'); if (g) g.hidden = true; showHome(); return; }
    catch (e) { ID_TOKEN = null; try { localStorage.removeItem('idt'); } catch (e2) {} }
  }
  startLogin();
}
boot();
