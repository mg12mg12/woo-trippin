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
// 把 [[img:檔名]] 標記換成圖片(檔案放 web/image/ticket/);沒放圖時 onerror 顯示佔位框,不會壞版。點圖放大。
function richText(t) {
  return linkify(t).replace(/\[\[img:([\w.\-]+)\]\]/g, (m, f) =>
    `<img class="inlineimg" src="image/ticket/${f}" alt="說明圖" loading="lazy" onclick="openNoteLightbox('image/ticket/${f}')" onerror="this.classList.add('imgmiss')"/>`);
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
let PENDING_TICKET_SCROLL = false;   // 從搶票通知信連結(#...&go=ticket)進來,渲染後捲到搶票說明
let USER = null;  // 登入後的帳號 { email, name };本機 DEV 用示範帳號

// 預設頭像:之後把圖檔放進 web/avatars/ 資料夾,再把「檔名」列在這裡即可,例:
// const AVATARS = ['cat.png', 'dog.png', 'bear.png'];
const AVATAR_DIR = 'avatars/';
const AVATARS = ['1-removebg-preview.png', '2-removebg-preview.png', '3-removebg-preview.png'];
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

// ---------- 側邊欄 + 頭像 ----------
// 依帳號固定配一隻小動物(email 雜湊 → 清單),頭像佔位與筆記作者標籤共用
const ANIMALS = ['🐶', '🐱', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🐮', '🐷', '🐸', '🐹', '🐤', '🐧', '🦉', '🐿️'];
// 指定名單:想固定誰用哪個圖示,在這裡加一行「'email(小寫)': '圖示'」;沒列的帳號自動從上面清單配
const ANIMAL_OVERRIDES = {
  'a20819z@gmail.com': '🦄',
  // 'leelin36942@gmail.com': '🐶',
};
function animalOf(email) {
  const s = String(email || '').toLowerCase();
  if (ANIMAL_OVERRIDES[s]) return ANIMAL_OVERRIDES[s];
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return ANIMALS[h % ANIMALS.length];
}
function avatarKey() { return 'avatar:' + ((USER && USER.email) || 'demo'); }
function applyAvatar() {
  const img = $('#avatar-img'), ph = $('#avatar-ph');
  ph.textContent = animalOf((USER && USER.email) || 'demo');   // 沒選頭像時,顯示自己帳號的小動物
  const f = LS.getItem(avatarKey());
  if (f) {
    img.onerror = () => { img.hidden = true; ph.hidden = false; };
    img.src = AVATAR_DIR + f; img.hidden = false; ph.hidden = true;
  } else { img.hidden = true; ph.hidden = false; }
}
function refreshSideUser() {
  $('#side-name').textContent = (USER && USER.name) || (DEV ? '本機示範' : '未登入');
  $('#side-email').textContent = (USER && USER.email) || '';
  applyAvatar();
}
// ---- 掀頁動畫(corner fold):摺線從「頂邊 95% 寬」斜到「左邊 92% 高」(陡角度),
//      白色頁角尖端停在約 (0.8 寬, 0.5 高),邊緣帶紙張弧線。p = 動畫進度 0~1 ----
const FOLD = { D0: 88, extX: 0.95, extY: 0.92, extXd: 0.55, extYd: 0.62, tipX: 0.80, tipY: 0.50, dur: 750 };
let foldCur = 0, foldRaf = null;
function drawFold(p) {
  const W = innerWidth, H = innerHeight;
  const desk = W > 760;                              // 桌機:翻到一半就好,頁角才不會變形
  const exX = desk ? FOLD.extXd : FOLD.extX;
  const exY = desk ? FOLD.extYd : FOLD.extY;
  const DyT = desk ? Math.max(exY * H, 470) : exY * H;   // 矮視窗保底,選單項目不被摺線切到
  const Dx = FOLD.D0 + (exX * W - FOLD.D0) * p;
  const Dy = FOLD.D0 + (DyT - FOLD.D0) * p;
  const tx = (0.82 + (FOLD.tipX - 0.82) * p) * Dx;   // 尖端從按鈕形狀漸變到定位
  const ty = (0.82 + (FOLD.tipY - 0.82) * p) * Dy;
  // 摺線是直線;頁角兩側是「內凹」的紙張弧線(尖端銳利,像紙被拉緊)
  $('#menu-page').style.clipPath = `polygon(0 0, ${Dx}px 0, 0 ${Dy}px)`;
  const u1x = (Dx + tx) / 2 - 0.05 * Dx, u1y = ty / 2 - 0.05 * Dy;
  const l1x = tx / 2 - 0.05 * Dx, l1y = (ty + Dy) / 2 - 0.05 * Dy;
  $('#flap-path').setAttribute('d',
    `M${Dx} 0 Q ${u1x} ${u1y} ${tx} ${ty} Q ${l1x} ${l1y} 0 ${Dy} Z`);
}
function foldAnim(opening, done) {
  cancelAnimationFrame(foldRaf);
  const from = foldCur, to = opening ? 1 : 0;
  const ease = x => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  let t0 = null;
  const step = (ts) => {
    if (!t0) t0 = ts;
    const q = Math.min((ts - t0) / FOLD.dur, 1);
    foldCur = from + (to - from) * ease(q);
    drawFold(foldCur);
    if (q < 1) foldRaf = requestAnimationFrame(step); else if (done) done();
  };
  foldRaf = requestAnimationFrame(step);
}
window.addEventListener('resize', () => {
  if ($('#menu-page').classList.contains('open')) drawFold(foldCur);
});

function openSide() {
  refreshSideUser();
  $('#menu-page').classList.add('open'); $('#menu-page').setAttribute('aria-hidden', 'false');
  $('#menu-btn').classList.add('hide');       // 點了小摺角就消失,交給摺片
  $('#page-flap').classList.add('show');
  $('#side-mask').hidden = false;
  foldAnim(true);
}
function closeSide() {
  $('#menu-page').classList.remove('open'); $('#menu-page').setAttribute('aria-hidden', 'true');
  $('#side-mask').hidden = true;
  foldAnim(false, () => {                     // 收回到角落後,恢復小摺角
    $('#menu-page').style.clipPath = 'polygon(0 0,0 0,0 0)';
    $('#page-flap').classList.remove('show');
    $('#menu-btn').classList.remove('hide');
  });
}
$('#menu-btn').onclick = openSide;
$('#side-close').onclick = closeSide;
$('#side-mask').onclick = closeSide;
$('#menu-home').onclick = () => { closeSide(); if (guardDirty()) { showLoading(); showHome(); hideLoading(); } };
$('#menu-wish').onclick = () => { closeSide(); if (guardDirty()) { showWish(); } };  // showWish 會自行管理 loading(等圖載完)
$('#wish-back').onclick = () => { showLoading(); showHome(); hideLoading(); };
$('#wish-input').oninput = () => { $('#wish-btn').disabled = !$('#wish-input').value.trim() || WISH_BUSY; };
$('#wish-btn').onclick = async () => {
  const val = $('#wish-input').value.trim();
  if (!val || WISH_BUSY || DOG_THROWING) return;
  WISH_BUSY = true; $('#wish-btn').disabled = true;
  let animRes; const animDone = new Promise(r => { animRes = r; });
  playWishThrow(() => { floatWishText(); animRes(); });   // 動畫播完 → 飄字
  try {
    await saveWishRow([nowWishStr(), val, wishUser(), '', '']);
    $('#wish-input').value = '';
    WISH_PAGE = 0; renderWishBoard();
  } catch (e) { alert('許願送出失敗:' + e.message); }
  await animDone;
  WISH_BUSY = false;
  $('#wish-btn').disabled = !$('#wish-input').value.trim();
};

function openAvatarModal() {
  const grid = $('#avatar-grid');
  const cur = LS.getItem(avatarKey());
  grid.innerHTML = AVATARS.length
    ? AVATARS.map(f => `<button class="avatar-opt ${f === cur ? 'sel' : ''}" data-f="${esc(f)}" title="${esc(f)}"><img src="${AVATAR_DIR}${esc(f)}" alt="${esc(f)}"/></button>`).join('')
    : '<p class="muted" style="grid-column:1/-1;margin:4px 2px;line-height:1.8">還沒有頭像圖檔。<br/>把圖片放進 <b>web/avatars/</b> 資料夾,再把檔名加進 app.js 上方的 <b>AVATARS</b> 清單。</p>';
  grid.querySelectorAll('.avatar-opt').forEach(b => b.onclick = () => {
    LS.setItem(avatarKey(), b.dataset.f);   // 每個帳號各自記住選的頭像
    applyAvatar();
    $('#avatar-modal').hidden = true;
  });
  $('#avatar-modal').hidden = false;
}
$('#side-avatar').onclick = openAvatarModal;
$('#avatar-cancel').onclick = () => { $('#avatar-modal').hidden = true; };
$('#avatar-modal').onclick = (e) => { if (e.target.id === 'avatar-modal') $('#avatar-modal').hidden = true; };

// ---------- 至頂按鈕 ----------
const toTop = $('#to-top');
window.addEventListener('scroll', () => { toTop.hidden = window.scrollY < 300; });
toTop.onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });
if (window.lottie && window.TOTOP_ANIM) {
  lottie.loadAnimation({
    container: $('#to-top-anim'),
    renderer: 'svg', loop: true, autoplay: true,
    animationData: window.TOTOP_ANIM,
  });
}

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
  const key = 'tcache2:' + meta.spreadsheetId;
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
  try { localStorage.setItem('tcache2:' + TRIP.spreadsheetId, JSON.stringify(TRIP.sheets)); } catch (e) {}
}

// ---------- 首頁(波浪小徑 + 腳印)----------
function showHome() {
  setHash(null);
  stopFountain();
  $('#trip-view').hidden = true; $('#wish-view').hidden = true; $('#home-view').hidden = false;
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

$('#home-link').onclick = () => { if (guardDirty()) { showLoading(); showHome(); hideLoading(); } };
$('#back').onclick = () => { if (guardDirty()) { showLoading(); showHome(); hideLoading(); } };
function guardDirty() { return !(mode === 'edit' && dirty) || confirm('有未儲存的修改,確定離開並放棄?'); }

// ---------- 通用讀取遮罩(所有換頁/等待時顯示)----------
let LOAD_N = 0, LOAD_EL = null, LOAD_AT = 0;
function showLoading(text) {
  LOAD_N++;
  if (LOAD_EL) return;
  LOAD_AT = Date.now();
  const ov = document.createElement('div');
  ov.className = 'fly2 loading-ov';
  ov.innerHTML = `<span class="cloud" style="top:13%;left:9%;font-size:74px">☁</span>
    <span class="cloud" style="top:24%;right:11%;font-size:92px;color:#e7eef0">☁</span>
    <span class="cloud" style="bottom:16%;left:16%;font-size:56px;color:#e7eef0">☁</span>
    <span class="cloud" style="bottom:28%;right:18%;font-size:70px">☁</span>
    <span class="plane">✈</span><span class="fly-load">讀取中…</span>`;
  if (text) ov.querySelector('.fly-load').textContent = text;
  document.body.appendChild(ov);
  LOAD_EL = ov;
}
async function hideLoading() {
  if (LOAD_N > 0) LOAD_N--;
  if (LOAD_N > 0 || !LOAD_EL) return;
  const el = LOAD_EL; LOAD_EL = null;
  const wait = 500 - (Date.now() - LOAD_AT);   // 至少顯示 0.5 秒,避免閃一下
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  el.style.opacity = '0';
  setTimeout(() => el.remove(), 400);
}

// ---------- 網址狀態(重整後停留在同一行程/同一分頁)----------
function setHash(tripId, sheet) {
  const h = tripId ? '#t=' + encodeURIComponent(tripId) + (sheet ? '&s=' + encodeURIComponent(sheet) : '') : '';
  try { history.replaceState(null, '', h || location.pathname + location.search); } catch (e) {}
}
function parseHash() {
  const out = {};
  location.hash.slice(1).split('&').forEach(kv => {
    const i = kv.indexOf('=');
    if (i > 0) { try { out[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1)); } catch (e) {} }
  });
  return out;
}
async function restoreFromHash() {
  const h = parseHash();
  if (h.p === 'wish') { showWish(); return; }
  if (h.t && homeTrips().some(t => t.id === h.t)) { await openTrip(h.t, h.s); return; }
  showHome();
}

// ---------- 功能許願池(噴泉 4x2 循環;小狗待機 4x2 循環/投幣 5x5 播一次)----------
let WISH_TIMER = null, THROW_TIMER = null, DOG_THROWING = false;
// 預先載入所有精靈圖並解碼,避免動畫開始時圖片還沒顯示(只做一次,之後走瀏覽器快取)
let WISH_ASSETS_P = null;
function preloadWishAssets() {
  if (WISH_ASSETS_P) return WISH_ASSETS_P;
  const files = ['image/fountain_spritesheet_4x2.png', 'image/dog_idle_4x2.png', 'image/throw_coins_no_well.png'];
  WISH_ASSETS_P = Promise.all(files.map(src => new Promise(resolve => {
    const img = new Image();
    const done = () => resolve();
    img.onload = () => { (img.decode ? img.decode() : Promise.resolve()).then(done, done); };
    img.onerror = done;                 // 載入失敗也放行,避免卡住 loading
    img.src = src;
  })));
  return WISH_ASSETS_P;
}
function startFountain() {
  stopFountain();
  const el = $('#fountain'), dog = $('#idle-dog');
  const pos = (i) => `${(i % 4) * 100 / 3}% ${Math.floor(i / 4) * 100}%`;
  let i = 0, j = 0, tick = 0;
  WISH_TIMER = setInterval(() => {
    tick++;
    i = (i + 1) % 8;                                  // 噴泉:每格 130ms
    el.style.backgroundPosition = pos(i);
    if (!DOG_THROWING && tick % 2 === 0) {            // 投幣中暫停待機動畫
      j = (j + 1) % 8; dog.style.backgroundPosition = pos(j);
    }
  }, 130);
}
function stopFountain() {
  if (WISH_TIMER) { clearInterval(WISH_TIMER); WISH_TIMER = null; }
  if (THROW_TIMER) { clearInterval(THROW_TIMER); THROW_TIMER = null; }
  DOG_THROWING = false; WISH_BUSY = false;
  const dog = $('#idle-dog');
  if (dog) { dog.classList.remove('throw'); dog.style.backgroundPosition = '0% 0%'; }
  const fl = $('#wish-float'); if (fl) fl.hidden = true;
}
// 許願:投幣 5x5 共 25 格,只播一次,播完換回待機循環,結束時呼叫 onDone
function playWishThrow(onDone) {
  if (DOG_THROWING) { if (onDone) onDone(); return; }
  DOG_THROWING = true;
  const dog = $('#idle-dog');
  dog.classList.add('throw');
  dog.style.backgroundPosition = '0% 0%';
  let k = 0;
  THROW_TIMER = setInterval(() => {
    k++;
    if (k >= 25) {
      clearInterval(THROW_TIMER); THROW_TIMER = null;
      dog.classList.remove('throw');
      dog.style.backgroundPosition = '0% 0%';   // 回到待機第 1 格,循環由主計時器接手
      DOG_THROWING = false;
      if (onDone) onDone();
      return;
    }
    dog.style.backgroundPosition = `${(k % 5) * 25}% ${Math.floor(k / 5) * 25}%`;
  }, 110);
}

// ---------- 許願資料(寫入第一個行程試算表的「願望清單」工作表)----------
const WISH_SHEET = '願望清單';
const WISH_HEADERS = ['日期', '內容', '許願人', '是否通過', '是否已完成'];
let WISHES = [], WISH_PAGE = 0, WISH_BUSY = false;
const wishUser = () => (USER && (USER.name || USER.email)) || '訪客';
const wishSid = () => (CFG.TRIPS && CFG.TRIPS[0] && CFG.TRIPS[0].spreadsheetId) || '';
function nowWishStr() {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
async function loadWishes() {
  if (DEV) { try { WISHES = JSON.parse(LS.getItem('wishes')) || []; } catch (e) { WISHES = []; } return; }
  const d = await apiPost('dump', { spreadsheetId: wishSid() });
  const sh = (d.sheets || {})[WISH_SHEET];
  if (!sh) { WISHES = []; return; }
  const H = sh.headers || [], ix = (n, f) => { const i = H.indexOf(n); return i === -1 ? f : i; };
  const cD = ix('日期', 0), cC = ix('內容', 1), cU = ix('許願人', 2), cP = ix('是否通過', 3), cF = ix('是否已完成', 4);
  WISHES = sh.rows.map(r => [r[cD] || '', r[cC] || '', r[cU] || '', r[cP] || '', r[cF] || '']);
}
async function saveWishRow(row) {
  if (DEV) { WISHES.push(row); LS.setItem('wishes', JSON.stringify(WISHES)); return; }
  const d = await apiPost('dump', { spreadsheetId: wishSid() });   // 先抓最新,避免覆蓋別人剛許的願
  const sh = (d.sheets || {})[WISH_SHEET] || { headers: WISH_HEADERS, rows: [] };
  const headers = (sh.headers && sh.headers.filter(h => h).length) ? sh.headers : WISH_HEADERS;
  const rows = (sh.rows || []).concat([row]);
  await apiPost('saveSheet', { spreadsheetId: wishSid(), sheetName: WISH_SHEET, headers, rows });
  WISHES = rows;
}

// ---------- 願望看板(最新在上,每頁 10 筆)----------
function renderWishBoard() {
  const list = WISHES.slice().reverse();
  const pages = Math.max(1, Math.ceil(list.length / 10));
  if (WISH_PAGE >= pages) WISH_PAGE = pages - 1;
  const rows = list.slice(WISH_PAGE * 10, WISH_PAGE * 10 + 10);
  const stamp = v => { const t = String(v == null ? '' : v).trim(); return t ? `<span class="wb-ok">${esc(t)}</span>` : '<span class="wb-no">─</span>'; };  // 直接顯示格子內容(表情/文字),空的才 ─
  const short = s => (s || '').replace(/^\d{4}-/, '').slice(0, 11);   // 顯示 MM-DD HH:mm
  $('#wb-rows').innerHTML = rows.length ? rows.map(w => `
    <div class="wb-row"><span class="wb-pin"></span>
      <span class="wd">${esc(short(w[0]))}</span>
      <span class="wc" title="${esc(w[1])}">${esc(w[1])}</span>
      <span class="wu" title="${esc(w[2])}">${esc(w[2])}</span>
      <span class="ws">${stamp(w[3])}</span>
      <span class="ws">${stamp(w[4])}</span>
    </div>`).join('') : '<p class="wb-empty">還沒有願望,當第一個許願的人!</p>';
  $('#wb-info').textContent = (WISH_PAGE + 1) + ' / ' + pages;
}
async function loadWishBoard() {
  $('#wb-rows').innerHTML = '<p class="wb-empty">載入中…</p>';
  try { await loadWishes(); } catch (e) { $('#wb-rows').innerHTML = '<p class="wb-empty">讀取失敗:' + esc(e.message) + '</p>'; return; }
  renderWishBoard();
}
$('#wb-prev').onclick = () => { if (WISH_PAGE > 0) { WISH_PAGE--; renderWishBoard(); } };
$('#wb-next').onclick = () => { const pages = Math.ceil(WISHES.length / 10); if (WISH_PAGE < pages - 1) { WISH_PAGE++; renderWishBoard(); } };

// ---------- 「心願已送達」飄字:整串字沿波浪曲線(約1.5個波)從雕像右上方出發,騎在波浪上一路往右滑行、右邊界淡出 ----------
function floatWishText() {
  const el = $('#wish-float'), box = $('#fountain');
  el.innerHTML = '心願已送達'.split('').map(ch => `<span>${ch}</span>`).join('');
  el.hidden = false; el.style.opacity = 1;
  el.style.left = '0'; el.style.top = '0'; el.style.transform = 'none';   // 交給各字自行定位
  const spans = el.children;
  const W = box.clientWidth, H = box.clientHeight;
  const fs = parseFloat(getComputedStyle(spans[0]).fontSize) || 20;
  const spacing = Math.max(fs * 1.15, W * 0.032);   // 字距
  const baseY = H * 0.26;                            // 波浪中線(與雕像上緣齊高)
  const amp = Math.max(12, H * 0.075);              // 振幅
  const startX = W * 0.58;                           // 起點:小狗雕像右側
  const endX = W + spacing * spans.length + 20;      // 終點:整串飄出右邊界
  const dist = endX - startX;
  const k = (2 * Math.PI * 1.5) / dist;             // 全程約 1.5 個波
  const waveY = (x) => baseY + amp * Math.sin(k * (x - startX) - Math.PI / 2); // 起點在波峰(字先高後下沉)
  const DUR = 2600;
  let t0 = null;
  const step = (ts) => {
    if (!t0) t0 = ts;
    const p = (ts - t0) / DUR;
    if (p >= 1) { el.hidden = true; return; }
    const head = startX + dist * p;                  // 領頭字(達,最右)目前的 x
    el.style.opacity = p > .82 ? (1 - p) / .18 : 1;  // 尾段淡出
    for (let i = 0; i < spans.length; i++) {
      const cx = head - (spans.length - 1 - i) * spacing; // 心在最左、達在最右(閱讀順序正確)
      const s = spans[i].style;
      s.position = 'absolute';
      s.left = cx + 'px';
      s.top = (waveY(cx) - fs / 2) + 'px';
    }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
async function showWish() {
  try { history.replaceState(null, '', '#p=wish'); } catch (e) {}
  $('#home-view').hidden = true; $('#trip-view').hidden = true; $('#wish-view').hidden = false;
  window.scrollTo(0, 0);
  showLoading();
  try { await preloadWishAssets(); }           // 等噴泉/小狗/投幣三張圖都載入解碼完
  finally { startFountain(); hideLoading(); }   // 圖備妥才開始動畫、收掉 loading
  loadWishBoard();                              // 看板資料另外載入,不擋動畫
}

// ---------- 開啟行程 ----------
async function openTrip(id, wantSheet) {
  if (parseHash().go === 'ticket') PENDING_TICKET_SCROLL = true;   // 先記下,稍後 setHash 會把 go 清掉
  const meta = homeTrips().find(t => t.id === id); if (!meta) { showHome(); return; }
  try { TRIP = await loadTrip(meta); } catch (e) { alert('讀取失敗:' + e.message); showHome(); return; }
  stopFountain();
  $('#home-view').hidden = true; $('#wish-view').hidden = true; $('#trip-view').hidden = false;
  $('#trip-head').innerHTML = `<span class="tn">${esc(TRIP.name)}</span>
    <span class="troute">${esc(TRIP.origin || '')} ✈ ${esc(TRIP.dest || '')}</span>
    <span class="tm">${esc(TRIP.dateRange || '')} · ${esc(TRIP.days || '')} 天</span>`;
  renderMap();
  const names = Object.keys(TRIP.sheets || {}).filter(n => n !== '支出' && n !== '願望清單' && n !== '旅遊筆記' && n !== '行李清單');
  let tabsHtml = names.map((n, i) =>
    `<button class="tab ${i === 0 ? 'active' : ''}" data-s="${esc(n)}"><span class="ic">${ICONS[n] || '•'}</span><span class="lab">${esc(n)}</span></button>`).join('');
  tabsHtml += `<button class="tab" data-s="__exp__"><span class="ic">💵</span><span class="lab">支出</span></button>`;
  tabsHtml += `<button class="tab" data-s="__notes__"><span class="ic">📓</span><span class="lab">旅遊筆記</span></button>`;
  tabsHtml += `<button class="tab" data-s="__pack__"><span class="ic">🧳</span><span class="lab">行李清單</span></button>`;
  $('#sectionnav').innerHTML = tabsHtml;
  $('#sectionnav').querySelectorAll('.tab').forEach(t => t.onclick = () => selectSheet(t.dataset.s));
  const target = (wantSheet && (names.indexOf(wantSheet) !== -1 || wantSheet === '__exp__' || wantSheet === '__notes__' || wantSheet === '__pack__')) ? wantSheet : names[0];
  curSheet = target; setActiveTab(target); setHash(id, target);
  if (target === '__exp__') { $('#toolbar').hidden = true; showLoading(); renderExpenses().finally(hideLoading); }
  else if (target === '__notes__') { $('#toolbar').hidden = true; showLoading(); renderNotes().finally(hideLoading); }
  else if (target === '__pack__') { $('#toolbar').hidden = true; showLoading(); renderPacking().finally(hideLoading); }
  else { $('#toolbar').hidden = false; setMode('view'); }
}
function setActiveTab(name) { $('#sectionnav').querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.s === name)); }
function selectSheet(name) {
  if (!guardDirty()) return;
  curSheet = name; setActiveTab(name); setHash(TRIP && TRIP.id, name);
  if (name === '__exp__') { $('#toolbar').hidden = true; showLoading(); renderExpenses().finally(hideLoading); }
  else if (name === '__notes__') { $('#toolbar').hidden = true; showLoading(); renderNotes().finally(hideLoading); }
  else if (name === '__pack__') { $('#toolbar').hidden = true; showLoading(); renderPacking().finally(hideLoading); }
  else { $('#toolbar').hidden = false; showLoading(); setMode('view'); hideLoading(); }
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
  if (curSheet !== '每日行程') { curSheet = '每日行程'; setActiveTab(curSheet); setHash(TRIP && TRIP.id, curSheet); setMode('view'); }
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

// ---------- 旅遊筆記(圖片存雲端硬碟,試算表記檔案ID)----------
// 兩種檢視:mine=自己的旅行筆記(含私人,可新增/編輯/刪除) / public=大家的旅行筆記(所有人的公開筆記,只有自己的可編輯)
let NOTES = [], NOTES_DESC = true, NOTE_IMGS = [], NOTE_BUSY = false, NOTES_SCOPE = 'mine', NOTE_EDIT = null;
const NOTE_MAX = 10;
const noteThumb = (x) => x.indexOf('data:') === 0 ? x : `https://drive.google.com/thumbnail?id=${encodeURIComponent(x)}&sz=w400`;
const noteFull = (x) => x.indexOf('data:') === 0 ? x : `https://drive.google.com/thumbnail?id=${encodeURIComponent(x)}&sz=w1600`;
function todayStr() { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; }

// 上傳前先在瀏覽器壓縮:最長邊 1600px、JPEG 85%
function compressImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAXS = 1600, sc = Math.min(1, MAXS / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * sc)), h = Math.max(1, Math.round(img.height * sc));
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve({ name: file.name || 'photo.jpg', dataURL: cv.toDataURL('image/jpeg', 0.85) });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('無法讀取圖片:' + (file.name || ''))); };
    img.src = url;
  });
}

function devNotesAll() { try { return JSON.parse(LS.getItem('notes:' + TRIP.id)) || []; } catch (e) { return []; } }
function devNotesSave(all) { LS.setItem('notes:' + TRIP.id, JSON.stringify(all)); }
async function loadNotes() {
  if (DEV) {
    const all = devNotesAll().map(n => Object.assign({ mine: true, author: (USER && USER.email) || 'demo@local', isPublic: false }, n));
    NOTES = NOTES_SCOPE === 'public' ? all.filter(n => n.isPublic) : all.filter(n => n.mine);
    return;
  }
  const d = await apiPost('notes', { spreadsheetId: TRIP.spreadsheetId, scope: NOTES_SCOPE });
  NOTES = d.items || [];
}
function sortedNotes() {
  const list = NOTES.slice().sort((a, b) => {
    const k = (a.date || '').localeCompare(b.date || '') || (a.updatedAt || '').localeCompare(b.updatedAt || '');
    return NOTES_DESC ? -k : k;
  });
  return list;
}
async function renderNotes() {
  NOTE_EDIT = null;
  try { await loadNotes(); } catch (e) { $('#content').innerHTML = '<p class="muted">讀取筆記失敗:' + esc(e.message) + '</p>'; return; }
  NOTE_IMGS = [];
  drawNotes();
}
async function switchNoteScope(scope) {
  if (NOTES_SCOPE === scope || NOTE_BUSY) return;
  NOTES_SCOPE = scope;
  showLoading();
  try { await renderNotes(); } finally { hideLoading(); }
}
const noteAuthorName = (n) => n.mine ? '我' : esc(String(n.author || '').split('@')[0] || '旅伴');
function noteCardHtml(n) {
  if (NOTE_EDIT && NOTE_EDIT.id === n.id) return noteEditHtml(n);
  const pub = n.isPublic ? '<span class="notepub is-pub">🌏 公開</span>' : '<span class="notepub">🔒 私人</span>';
  return `
    <div class="notecard${n.mine ? '' : ' other'}">
      <div class="notehead">
        <span class="notedate">${esc((n.date || '').replace(/^\d{4}-/, ''))}</span>
        ${NOTES_SCOPE === 'public' ? `<span class="noteauthor" title="${esc(n.author || '')}">${animalOf(n.author)} ${noteAuthorName(n)}</span>` : ''}
        ${n.title ? `<span class="notetitle">${esc(n.title)}</span>` : ''}
        ${pub}
        ${n.mine ? `<button class="noteedit-btn" data-nedit="${esc(n.id)}" title="編輯這篇筆記">✎ 編輯</button>
        <button class="notedel" data-ndel="${esc(n.id)}" title="刪除這篇筆記">✕</button>` : ''}
      </div>
      ${n.text ? `<div class="notetext">${linkify(n.text)}</div>` : ''}
      ${n.images && n.images.length ? `<div class="notepics">${n.images.map(im =>
        `<button class="notepic" data-full="${esc(noteFull(im))}"><img src="${esc(noteThumb(im))}" loading="lazy" alt="筆記照片"/></button>`).join('')}</div>` : ''}
    </div>`;
}
function noteEditHtml(n) {
  return `
    <div class="notecard editing">
      <div class="noterow1">
        <input id="ne-date" type="date" value="${esc(n.date || todayStr())}"/>
        <input id="ne-title" maxlength="60" value="${esc(n.title || '')}" placeholder="標題"/>
      </div>
      <textarea id="ne-text" rows="3" maxlength="2000" placeholder="在金魚腦忘記之前記點筆記吧!">${esc(n.text || '')}</textarea>
      <div class="notekeeps" id="ne-keeps">${NOTE_EDIT.keep.map((im, i) =>
        `<span class="notepv"><img src="${esc(noteThumb(im))}" alt="照片"/><button data-kdel="${i}" title="移除這張照片">✕</button></span>`).join('')}${NOTE_EDIT.add.map((im, i) =>
        `<span class="notepv new"><img src="${esc(im.dataURL)}" alt="${esc(im.name)}"/><button data-adel="${i}" title="移除">✕</button></span>`).join('')}</div>
      <div class="noterow2">
        <label class="notepick" for="ne-files">📷 ＋ 加照片</label>
        <input id="ne-files" type="file" accept="image/*" multiple hidden/>
        <label class="notetog"><input id="ne-pub" type="checkbox" ${n.isPublic ? 'checked' : ''}/> 🌏 公開給大家看</label>
        <span class="notebtns">
          <button id="ne-cancel" class="btn-ghost">取消</button>
          <button id="ne-save" class="btn">儲存修改</button>
        </span>
      </div>
      <p id="ne-status" class="muted small" hidden></p>
    </div>`;
}
function drawNotes() {
  const list = sortedNotes();
  const mineView = NOTES_SCOPE === 'mine';
  const form = mineView ? `
    <div class="noteform">
      <div class="noterow1">
        <input id="n-date" type="date" value="${todayStr()}"/>
        <input id="n-title" maxlength="60" placeholder="標題(例:LCK初體驗!)"/>
      </div>
      <textarea id="n-text" rows="3" maxlength="2000" placeholder="在金魚腦忘記之前記點筆記吧!"></textarea>
      <div class="noterow2">
        <label class="notepick" for="n-files">📷 ＋ 加照片(可多張)</label>
        <input id="n-files" type="file" accept="image/*" multiple hidden/>
        <div id="n-previews" class="notepreviews"></div>
        <label class="notetog"><input id="n-pub" type="checkbox"/> 🌏 公開給大家看</label>
        <button id="n-add" class="btn noteadd">✎ 記下來</button>
      </div>
      <p id="n-status" class="muted small" hidden></p>
    </div>` : `<p class="notehint muted small">這裡是大家公開的筆記;想新增或修改,切回「${animalOf((USER && USER.email) || '')} 自己的旅行筆記」。你自己的公開筆記在這裡也能編輯。</p>`;
  $('#content').innerHTML = `
    <div class="section-title">📓 旅遊筆記 <span class="muted small">${mineView ? '(私人筆記只有你自己看得到)' : '(所有人的公開筆記)'}</span></div>
    <div class="seg noteseg">
      <button id="ns-mine" class="seg-btn ${mineView ? 'active' : ''}">${animalOf((USER && USER.email) || '')} 自己的旅行筆記</button>
      <button id="ns-all" class="seg-btn ${mineView ? '' : 'active'}">🌏 大家的旅行筆記</button>
    </div>
    ${form}
    <div class="notebar">
      <span class="muted small">共 ${list.length} 篇</span>
      <button id="n-sort" class="btn-ghost notesort">日期 ${NOTES_DESC ? '新 → 舊' : '舊 → 新'} ⇅</button>
    </div>
    ${list.map(noteCardHtml).join('') || `<p class="muted noteempty">${mineView ? '還沒有筆記,寫下這趟旅程的第一篇吧!' : '還沒有人公開筆記,當第一個分享的人!'}</p>`}`;
  $('#ns-mine').onclick = () => switchNoteScope('mine');
  $('#ns-all').onclick = () => switchNoteScope('public');
  $('#n-sort').onclick = () => { NOTES_DESC = !NOTES_DESC; drawNotes(); };
  if (mineView) {
    $('#n-files').onchange = onPickNoteImgs;
    $('#n-add').onclick = onAddNote;
    drawNotePreviews();
  }
  $('#content').querySelectorAll('[data-ndel]').forEach(b => b.onclick = () => onDelNote(b.dataset.ndel));
  $('#content').querySelectorAll('[data-nedit]').forEach(b => b.onclick = () => startNoteEdit(b.dataset.nedit));
  $('#content').querySelectorAll('[data-full]').forEach(b => b.onclick = () => openNoteLightbox(b.dataset.full));
  bindNoteEdit();
}
// ---- 編輯自己的筆記(兩種檢視都可,但只限自己的)----
function startNoteEdit(id) {
  const n = NOTES.find(x => x.id === id);
  if (!n || !n.mine || NOTE_BUSY) return;
  NOTE_EDIT = { id, keep: (n.images || []).slice(), add: [] };
  drawNotes();
}
function bindNoteEdit() {
  if (!NOTE_EDIT) return;
  const host = $('#content');
  host.querySelectorAll('[data-kdel]').forEach(b => b.onclick = () => { NOTE_EDIT.keep.splice(+b.dataset.kdel, 1); drawNotes(); });
  host.querySelectorAll('[data-adel]').forEach(b => b.onclick = () => { NOTE_EDIT.add.splice(+b.dataset.adel, 1); drawNotes(); });
  const files = $('#ne-files');
  if (files) files.onchange = async (e) => {
    const fs = Array.from(e.target.files || []); e.target.value = '';
    if (!fs.length) return;
    if (NOTE_EDIT.keep.length + NOTE_EDIT.add.length + fs.length > NOTE_MAX) { alert('一篇筆記最多 ' + NOTE_MAX + ' 張照片'); return; }
    // 先記住表單目前的值,重畫後回填
    const cur = { date: $('#ne-date').value, title: $('#ne-title').value, text: $('#ne-text').value, pub: $('#ne-pub').checked };
    try { for (const f of fs) NOTE_EDIT.add.push(await compressImage(f)); } catch (err) { alert(err.message); }
    drawNotes();
    $('#ne-date').value = cur.date; $('#ne-title').value = cur.title; $('#ne-text').value = cur.text; $('#ne-pub').checked = cur.pub;
  };
  const cancel = $('#ne-cancel'); if (cancel) cancel.onclick = () => { NOTE_EDIT = null; drawNotes(); };
  const save = $('#ne-save'); if (save) save.onclick = onSaveNoteEdit;
}
async function onSaveNoteEdit() {
  if (NOTE_BUSY || !NOTE_EDIT) return;
  const id = NOTE_EDIT.id;
  const date = $('#ne-date').value, title = $('#ne-title').value.trim(), text = $('#ne-text').value.trim();
  const isPublic = $('#ne-pub').checked;
  if (!date) { alert('請選日期'); return; }
  if (!title && !text && !NOTE_EDIT.keep.length && !NOTE_EDIT.add.length) { alert('筆記是空的:寫點什麼或放張照片吧'); return; }
  NOTE_BUSY = true; $('#ne-save').disabled = true;
  const st = $('#ne-status'); if (st) { st.hidden = false; st.textContent = NOTE_EDIT.add.length ? '上傳中…(照片較多時要等一下)' : '儲存中…'; }
  try {
    const i = NOTES.findIndex(x => x.id === id);
    if (DEV) {
      const all = devNotesAll();
      const j = all.findIndex(x => x.id === id);
      const upd = { date, title, text, isPublic, images: NOTE_EDIT.keep.concat(NOTE_EDIT.add.map(im => im.dataURL)) };
      if (j !== -1) { Object.assign(all[j], upd); devNotesSave(all); }
      if (i !== -1) Object.assign(NOTES[i], upd);
    } else {
      const newImages = NOTE_EDIT.add.map(im => ({ name: im.name, mime: 'image/jpeg', dataB64: im.dataURL.split(',')[1] }));
      const d = await apiPost('updateNote', { spreadsheetId: TRIP.spreadsheetId, noteId: id,
        note: { date, title, text, isPublic, keepImages: NOTE_EDIT.keep, newImages } });
      if (i !== -1) Object.assign(NOTES[i], { date, title, text, isPublic, images: d.images });
    }
    NOTE_EDIT = null;
    if (NOTES_SCOPE === 'public' && !isPublic) NOTES.splice(i, 1);   // 在大家的檢視裡改成私人 → 從清單消失
    drawNotes();
  } catch (e) { alert('儲存失敗:' + e.message); const b = $('#ne-save'); if (b) b.disabled = false; const s2 = $('#ne-status'); if (s2) s2.hidden = true; }
  finally { NOTE_BUSY = false; }
}
function drawNotePreviews() {
  const host = $('#n-previews'); if (!host) return;
  host.innerHTML = NOTE_IMGS.map((im, i) =>
    `<span class="notepv"><img src="${esc(im.dataURL)}" alt="${esc(im.name)}"/><button data-pvdel="${i}" title="移除">✕</button></span>`).join('');
  host.querySelectorAll('[data-pvdel]').forEach(b => b.onclick = () => { NOTE_IMGS.splice(+b.dataset.pvdel, 1); drawNotePreviews(); });
}
async function onPickNoteImgs(e) {
  const files = Array.from(e.target.files || []);
  e.target.value = '';
  if (!files.length) return;
  if (NOTE_IMGS.length + files.length > NOTE_MAX) { alert('一篇筆記最多 ' + NOTE_MAX + ' 張照片'); return; }
  noteStatus('照片壓縮中…');
  try {
    for (const f of files) NOTE_IMGS.push(await compressImage(f));
    noteStatus('');
  } catch (err) { noteStatus(''); alert(err.message); }
  drawNotePreviews();
}
function noteStatus(t) { const el = $('#n-status'); if (el) { el.hidden = !t; el.textContent = t; } }
async function onAddNote() {
  if (NOTE_BUSY) return;
  const date = $('#n-date').value, title = $('#n-title').value.trim(), text = $('#n-text').value.trim();
  const isPublic = $('#n-pub').checked;
  if (!date) { alert('請選日期'); return; }
  if (!title && !text && !NOTE_IMGS.length) { alert('筆記是空的:寫點什麼或放張照片吧'); return; }
  NOTE_BUSY = true; $('#n-add').disabled = true;
  noteStatus(NOTE_IMGS.length ? '上傳中…(照片較多時要等一下)' : '儲存中…');
  try {
    const base = { date, title, text, isPublic, mine: true, author: (USER && USER.email) || '', updatedAt: todayStr() };
    if (DEV) {
      const item = Object.assign({ id: 'n' + Date.now(), images: NOTE_IMGS.map(im => im.dataURL) }, base);
      const all = devNotesAll(); all.push(item); devNotesSave(all);
      NOTES.push(item);
    } else {
      const imgs = NOTE_IMGS.map(im => ({ name: im.name, mime: 'image/jpeg', dataB64: im.dataURL.split(',')[1] }));
      const d = await apiPost('addNote', { spreadsheetId: TRIP.spreadsheetId, note: { date, title, text, isPublic, images: imgs } });
      NOTES.push(Object.assign({ id: d.id, images: d.images }, base));
    }
    NOTE_IMGS = [];
    drawNotes();
  } catch (e) { alert('儲存失敗:' + e.message); }
  finally { NOTE_BUSY = false; const b = $('#n-add'); if (b) b.disabled = false; noteStatus(''); }
}
async function onDelNote(id) {
  const n = NOTES.find(x => x.id === id);
  if (!n || !n.mine) return;
  if (!confirm('確定刪除這篇筆記?照片也會一起刪除。')) return;
  const i = NOTES.findIndex(x => x.id === id); if (i === -1) return;
  const removed = NOTES.splice(i, 1)[0];
  try {
    if (DEV) { devNotesSave(devNotesAll().filter(x => x.id !== id)); }
    else await apiPost('deleteNote', { spreadsheetId: TRIP.spreadsheetId, noteId: id });
  } catch (e) { alert('刪除失敗:' + e.message); NOTES.splice(i, 0, removed); }
  drawNotes();
}
function openNoteLightbox(src) {
  const ov = document.createElement('div');
  ov.className = 'notelight';
  ov.innerHTML = `<img src="${esc(src)}" alt="筆記照片"/><span class="notelight-x">✕ 點一下關閉</span>`;
  ov.onclick = () => ov.remove();
  document.body.appendChild(ov);
}

// ---------- 行李清單(依帳號隔離;打勾=已準備,出發前一天未勾會寄信提醒)----------
let PACK = [], PACK_BUSY = false;
const NOTIFY_ADMINS_FE = ['a20819z@gmail.com'];   // 顯示「寄通知信」按鈕的帳號(後端也會驗證)
const isNotifyAdminFE = () => DEV || NOTIFY_ADMINS_FE.indexOf(((USER && USER.email) || '').toLowerCase()) !== -1;

function sharedPackDefaults() {   // 從「行李清單」分頁抓帳號=「共用」的預設項目
  const sh = TRIP.sheets && TRIP.sheets['行李清單'];
  if (!sh || !sh.headers) return [];
  const cE = sh.headers.indexOf('帳號'), cN = sh.headers.indexOf('物品');
  if (cE === -1 || cN === -1) return [];
  return (sh.rows || []).filter(r => String(r[cE] || '') === '共用' && String(r[cN] || '').trim())
    .map(r => ({ name: String(r[cN]), done: false }));
}
async function loadPacking() {
  if (DEV) {
    const raw = LS.getItem('pack:' + TRIP.id);
    if (raw === null) { PACK = sharedPackDefaults(); return; }   // 沒存過 → 用共用預設清單起手
    try { PACK = JSON.parse(raw) || []; } catch (e) { PACK = []; }
    return;
  }
  const d = await apiPost('packing', { spreadsheetId: TRIP.spreadsheetId });
  PACK = d.items || [];
}
async function persistPacking() {
  if (DEV) { LS.setItem('pack:' + TRIP.id, JSON.stringify(PACK)); return; }
  await apiPost('savePacking', { spreadsheetId: TRIP.spreadsheetId, items: PACK });
}
async function renderPacking() {
  try { await loadPacking(); } catch (e) { $('#content').innerHTML = '<p class="muted">讀取行李清單失敗:' + esc(e.message) + '</p>'; return; }
  drawPacking();
}
function drawPacking() {
  const total = PACK.length, done = PACK.filter(p => p.done).length;
  const pct = total ? Math.round(done / total * 100) : 0;
  const rows = PACK.map((p, i) => `
    <div class="packrow ${p.done ? 'done' : ''}">
      <label class="packchk"><input type="checkbox" data-ptog="${i}" ${p.done ? 'checked' : ''}/><span class="packbox"></span><span class="packname">${esc(p.name)}</span></label>
      <button class="packdel" data-pdel="${i}" title="刪除">✕</button>
    </div>`).join('');
  $('#content').innerHTML = `
    <div class="section-title">🧳 行李清單 <span class="muted small">(只有你自己看得到)</span>
      ${isNotifyAdminFE() ? '<button id="p-notify" class="btn-ghost packnotify">📮 寄通知信</button>' : ''}
    </div>
    <div class="packwrap">
      <div class="packrings">${'<span class="packring"></span>'.repeat(8)}</div>
      <div class="packpad">
        <div class="packhead">
          <span class="packtitle">🧳 行李清單</span>
          <span class="packcount">${done}/${total}</span>
          <span class="padbar"><span class="padbar-fill" style="width:${pct}%"></span></span>
          <span class="packlbl">已準備${total && done === total ? ' 🎉' : ''}</span>
        </div>
        ${rows || '<p class="packempty">本子還是空的,把要帶的東西寫上來吧!<br/><span class="small">出發前一天還沒打勾的項目,會寄Email轟炸你 📨。</span></p>'}
        <div class="packadd">
          <span class="packbox ghost"></span>
          <input id="p-name" maxlength="60" placeholder="✎ 在這行寫下要帶的東西…"/>
          <button id="p-add" class="btn packplus" title="加入">＋</button>
        </div>
      </div>
    </div>
    <p class="muted small packhint">☑ 打勾=已放進行李;出發前一天早上會自動檢查,未打勾的項目前一天我就會寄信轟炸了(「 ゜Д゜)「📨。</p>`;
  $('#p-add').onclick = onAddPack;
  $('#p-name').onkeydown = (e) => { if (e.key === 'Enter') onAddPack(); };
  $('#content').querySelectorAll('[data-ptog]').forEach(b => b.onchange = () => onTogglePack(+b.dataset.ptog));
  $('#content').querySelectorAll('[data-pdel]').forEach(b => b.onclick = () => onDelPack(+b.dataset.pdel));
  const nb = $('#p-notify'); if (nb) nb.onclick = openNotifyModal;
}
async function packSave(revert) {
  if (PACK_BUSY) return false;
  PACK_BUSY = true;
  try { await persistPacking(); return true; }
  catch (e) { alert('儲存失敗:' + e.message); if (revert) revert(); return false; }
  finally { PACK_BUSY = false; }
}
async function onAddPack() {
  const inp = $('#p-name'), name = inp.value.trim();
  if (!name) return;
  PACK.push({ name, done: false });
  inp.value = '';
  await packSave(() => PACK.pop());
  drawPacking();
}
async function onTogglePack(i) {
  if (!PACK[i]) return;
  PACK[i].done = !PACK[i].done;
  await packSave(() => { PACK[i].done = !PACK[i].done; });
  drawPacking();
}
async function onDelPack(i) {
  if (!PACK[i]) return;
  if (!confirm('刪除「' + PACK[i].name + '」?')) return;
  const removed = PACK.splice(i, 1)[0];
  await packSave(() => PACK.splice(i, 0, removed));
  drawPacking();
}

// 載入可寄送名單(管理員)
async function loadNotifyEmails() {
  if (DEV) return [((USER && USER.email) || 'demo@local'), 'a20819z@gmail.com', 'leelin36942@gmail.com'];
  const d = await apiPost('notifyEmails', { spreadsheetId: TRIP.spreadsheetId });
  return d.emails || [];
}
// 收件人區塊(白名單勾選 + 全選 + 測試信箱),通知信/搶票說明共用
function recipientBlockHtml(emails) {
  return `
      <div class="nmodal-sec">收件人(白名單全員):</div>
      <label class="notetog nm-all"><input id="nm-all" type="checkbox"/> 全選</label>
      <div class="nmodal-list">${emails.map(em =>
        `<label class="notetog"><input type="checkbox" class="nm-to" value="${esc(em)}"/> ${animalOf(em)} ${esc(em)}</label>`).join('')}</div>
      <div class="nmodal-sec">測試寄送(白名單以外,逗號分隔,最多5個):</div>
      <input id="nm-extra" placeholder="例:test1@gmail.com, test2@gmail.com"/>`;
}
// 名單載入中的小轉圈(取代全頁 loading)
function recipientLoadingHtml() {
  return '<div class="nm-loading"><span class="spin"></span> 載入名單中…</div>';
}
// 非同步載入名單填入 #nm-rcpt,完成後綁全選、啟用送出鈕
async function fillRecipients(ov) {
  const host = ov.querySelector('#nm-rcpt');
  try {
    const emails = await loadNotifyEmails();
    host.innerHTML = recipientBlockHtml(emails);
    const all = ov.querySelector('#nm-all');
    if (all) all.onchange = (e) => ov.querySelectorAll('.nm-to').forEach(c => { c.checked = e.target.checked; });
    const send = ov.querySelector('#nm-send'); if (send) send.disabled = false;
  } catch (e) { host.innerHTML = '<p class="muted small" style="padding:8px 0">讀取名單失敗:' + esc(e.message) + '</p>'; }
}
// 從收件人區塊收集並驗證;回傳 {to, extra, total} 或 null(驗證失敗已跳 alert)
function collectRecipients(ov) {
  const to = Array.from(ov.querySelectorAll('.nm-to:checked')).map(c => c.value);
  const extraEl = ov.querySelector('#nm-extra');
  const extra = (extraEl ? extraEl.value : '').split(/[,;、\s]+/).map(s => s.trim()).filter(Boolean);
  if (!to.length && !extra.length) { alert('請至少勾選或輸入一個收件人'); return null; }
  if (extra.length > 5) { alert('測試收件人最多 5 個'); return null; }
  const bad = extra.find(t => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t));
  if (bad) { alert('Email 格式不對:' + bad); return null; }
  const total = to.length + extra.filter(t => to.indexOf(t.toLowerCase()) === -1).length;
  return { to, extra, total };
}

// ---------- 管理員:寄搶票說明(內建教學步驟 + 日期/時間/備註)----------
const TICKET_STEPS =
`〔開賣前〕
· 售票平台Interpark Global;未開賣的場點「buy now」會顯示幾點開搶
· 第一場07/27開賣;07/30那場可先拿來練手
〔開賣當下〕
· 人多會排隊,不用狂按,等系統自動排進去
· 進場後輸入驗證碼(全大寫)
〔選位〕
· 先選上方General Seat(紫色/綠色常被搶完)
· 選好座位區,下方兩個按鈕才會亮:左=輸入張數自動選位、右=自己手動選位
· 自動選位可連續三次,三次後跳掉要再按一次
〔釋票＆撿漏〕
· 韓國15:00／台灣14:00開賣;不會整場釋票,03分、08分再點進去(有人15分才刷到)
〔刷卡付款〕
· 資料務必正確:Email、電話、護照號碼、刷卡卡號
· 刷卡人姓名要與護照一致;電話格式 +886 9xxxxxxxx(去掉開頭0)`;
function openTicketModal() {
  const ov = document.createElement('div');
  ov.className = 'nmodal';
  ov.innerHTML = `
    <div class="nmodal-card">
      <div class="nmodal-title">🎫 寄搶票通知</div>
      <div class="nmodal-sec">比賽場次</div>
      <input id="tk-match" maxlength="60" placeholder="例:8/5(三) M1 BRO vs NS"/>
      <div class="nmodal-sec">搶票日期</div>
      <input id="tk-date" type="date"/>
      <div class="nmodal-sec">開賣時間</div>
      <input id="tk-time" maxlength="40" placeholder="例:韓國16:00 / 台灣15:00"/>
      <div class="nmodal-sec">其他備註(選填,會放在時間下方)</div>
      <textarea id="tk-note" rows="2" maxlength="500" placeholder="例:記得先開好Interpark帳號、刷卡資料備妥"></textarea>
      <div id="nm-rcpt">${recipientLoadingHtml()}</div>
      <p class="muted small" style="margin:8px 0 0">📄 搶票步驟教學已內建,會自動附在信裡並帶「看完整說明」連結,不用重打。</p>
      <div class="nmodal-btns">
        <button id="nm-cancel" class="btn-ghost">取消</button>
        <button id="nm-send" class="btn" disabled>寄出</button>
      </div>
      <p id="nm-status" class="muted small" hidden></p>
    </div>`;
  document.body.appendChild(ov);
  ov.onclick = (e) => { if (e.target === ov) ov.remove(); };
  ov.querySelector('#nm-cancel').onclick = () => ov.remove();
  fillRecipients(ov);   // 名單用小轉圈就地載入,不跳全頁 loading
  ov.querySelector('#nm-send').onclick = async () => {
    const rcpt = collectRecipients(ov); if (!rcpt) return;
    const match = ov.querySelector('#tk-match').value.trim();
    const date = ov.querySelector('#tk-date').value, time = ov.querySelector('#tk-time').value.trim();
    const note = ov.querySelector('#tk-note').value.trim();
    if (!date && !time) { alert('請至少填搶票日期或開賣時間'); return; }
    const linkUrl = location.origin + location.pathname + '#t=' + encodeURIComponent(TRIP.id) + '&s=' + encodeURIComponent('LCK彈性方案') + '&go=ticket';
    const payload = { match, date, time, note, to: rcpt.to, extra: rcpt.extra, linkUrl };
    const btn = ov.querySelector('#nm-send'), st = ov.querySelector('#nm-status');
    btn.disabled = true; st.hidden = false; st.textContent = '寄送中…';
    try {
      if (DEV) await new Promise(r => setTimeout(r, 600));
      else await apiPost('sendTicketNotify', { spreadsheetId: TRIP.spreadsheetId, payload });
      st.textContent = '已寄出給 ' + rcpt.total + ' 人!';
      setTimeout(() => ov.remove(), 900);
    } catch (e) { btn.disabled = false; st.hidden = true; alert('寄送失敗:' + e.message); }
  };
}

// ---------- 管理員:寄通知信(收件人=登入白名單,勾選寄送)----------
function openNotifyModal() {
  const ov = document.createElement('div');
  ov.className = 'nmodal';
  ov.innerHTML = `
    <div class="nmodal-card">
      <div class="nmodal-title">📮 寄通知信</div>
      <div id="nm-rcpt">${recipientLoadingHtml()}</div>
      <input id="nm-subject" maxlength="60" placeholder="主旨(預設:旅程通知)"/>
      <textarea id="nm-msg" rows="5" maxlength="2000" placeholder="要通知大家什麼?"></textarea>
      <div class="nmodal-btns">
        <button id="nm-cancel" class="btn-ghost">取消</button>
        <button id="nm-send" class="btn" disabled>寄出</button>
      </div>
      <p id="nm-status" class="muted small" hidden></p>
    </div>`;
  document.body.appendChild(ov);
  ov.onclick = (e) => { if (e.target === ov) ov.remove(); };
  ov.querySelector('#nm-cancel').onclick = () => ov.remove();
  fillRecipients(ov);   // 名單用小轉圈就地載入,不跳全頁 loading
  ov.querySelector('#nm-send').onclick = async () => {
    const rcpt = collectRecipients(ov); if (!rcpt) return;
    const subject = ov.querySelector('#nm-subject').value.trim() || '旅程通知';
    const message = ov.querySelector('#nm-msg').value.trim();
    if (!message) { alert('通知內容是空的'); return; }
    const btn = ov.querySelector('#nm-send'), st = ov.querySelector('#nm-status');
    btn.disabled = true; st.hidden = false; st.textContent = '寄送中…';
    try {
      if (DEV) await new Promise(r => setTimeout(r, 600));
      else await apiPost('sendNotify', { spreadsheetId: TRIP.spreadsheetId, to: rcpt.to, extra: rcpt.extra, subject, message });
      st.textContent = '已寄出給 ' + rcpt.total + ' 人!';
      setTimeout(() => ov.remove(), 900);
    } catch (e) { btn.disabled = false; st.hidden = true; alert('寄送失敗:' + e.message); }
  };
}

function renderView() {
  const sh = TRIP.sheets[curSheet];
  // LCK彈性方案:管理員可在此寄「搶票說明」通知信(右上角)
  const btn = (curSheet === 'LCK彈性方案' && isNotifyAdminFE())
    ? '<button id="tk-notify" class="btn-ghost packnotify">🎫 寄搶票說明</button>' : '';
  const title = `<div class="section-title">${ICONS[curSheet] || ''} ${esc(curSheet)}${btn}</div>`;
  $('#content').innerHTML = title + (curSheet === '每日行程' ? renderTimeline(sh) : renderTable(sh));
  const tk = $('#tk-notify'); if (tk) tk.onclick = openTicketModal;
  // 從搶票通知信連結進來:捲到搶票說明(旗標只觸發一次)
  if (curSheet === 'LCK彈性方案' && PENDING_TICKET_SCROLL) { PENDING_TICKET_SCROLL = false; scrollToTicket(); }
}
// 捲到搶票說明;內含圖片會邊載入邊撐高,故載入後再校正一次位置
function scrollToTicket() {
  const el = document.getElementById('ticket-guide');
  if (!el) return;
  const go = () => el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  setTimeout(go, 300);
  el.querySelectorAll('img').forEach(img => { if (!img.complete) img.addEventListener('load', () => setTimeout(go, 60), { once: true }); });
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
  const headers = sh.headers.slice(0, cols); let notes = [], bodyRows = [];
  sh.rows.forEach(r => {
    const filled = r.slice(0, cols).filter(c => (c ?? '') !== '');
    if (filled.length <= 1) { if (filled.length === 1) notes.push(filled[0]); } else bodyRows.push(r.slice(0, cols));
  });
  // 把「搶票教學」那段(從該標題列到最後)抽出來,做成結構化卡片,不跟前面的 note 混在一起
  let guide = [];
  const gi = notes.findIndex(n => /^搶票教學/.test(n));
  if (gi !== -1) { guide = notes.slice(gi); notes = notes.slice(0, gi); }
  const hasHeader = headers.some(h => h !== '');
  const thead = hasHeader ? `<thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>` : '';
  const tbody = bodyRows.map(r => `<tr>${r.map(c => { const v = (c ?? '').toString(); return `<td>${/https?:\/\//.test(v) ? linkify(v) : esc(v)}</td>`; }).join('')}</tr>`).join('');
  let html = '';
  if (bodyRows.length) html += `<div class="tablewrap"><table class="tbl">${thead}<tbody>${tbody}</tbody></table></div>`;
  if (notes.length) html += `<div class="notes">${notes.map(n => `<div class="note">${richText(n)}</div>`).join('')}</div>`;
  if (guide.length) html += renderTicketGuide(guide);
  return html || '<p class="muted">這個分頁沒有內容。</p>';
}
// 搶票教學:標題橫幅 + 分組(〔..〕小標)+ 編號步驟 + 內嵌圖(附說明),整段一張卡片
function renderTicketGuide(lines) {
  const head = (lines[0] || '').split('※');
  const title = (head[0] || '搶票教學').replace(/[:：]\s*$/, '').trim();
  const source = head[1] ? head[1].trim() : '';
  let body = '';
  lines.slice(1).forEach(raw => {
    const line = (raw || '').trim(); if (!line) return;
    const sec = line.match(/^〔(.+)〕$/);
    const img = line.match(/^\[\[img:([\w.\-]+)\]\]\s*(.*)$/);
    const step = line.match(/^(\d+)\.\s*(.*)$/);
    if (sec) body += `<div class="tksec">${esc(sec[1])}</div>`;
    else if (img) body += `<figure class="tkfig"><img class="inlineimg" src="image/ticket/${img[1]}" alt="搶票說明圖" loading="lazy" onclick="openNoteLightbox('image/ticket/${img[1]}')" onerror="this.classList.add('imgmiss')"/>${img[2] ? `<figcaption>${esc(img[2])}</figcaption>` : ''}</figure>`;
    else if (step) body += `<div class="tkstep"><span class="tknum">${step[1]}</span><span class="tktext">${richText(step[2])}</span></div>`;
    else body += `<div class="tkline">${richText(line)}</div>`;
  });
  return `<div class="tkguide" id="ticket-guide">
    <div class="tkguide-head">🎫 ${esc(title)}${source ? `<span class="tksrc">${esc(source)}</span>` : ''}</div>
    <div class="tkguide-body">${body}</div>
  </div>`;
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
    USER = await apiPost('me', {});        // 後端驗證 token + email 白名單
    try { localStorage.setItem('idt', ID_TOKEN); } catch (e) {}
    $('#login-gate').hidden = true;
    showLoading();
    try { await restoreFromHash(); } finally { hideLoading(); }
  } catch (e) {
    ID_TOKEN = null;
    showLoginErr('登入失敗:' + e.message);
  }
}

// ---------- 啟動 ----------
async function boot() {
  showLoading();
  if (DEV) { USER = { email: 'demo@local', name: '本機示範' }; try { await restoreFromHash(); } finally { hideLoading(); } return; }
  const saved = (function(){ try { return localStorage.getItem('idt'); } catch (e) { return null; } })();
  if (saved) {
    ID_TOKEN = saved;
    try {
      USER = await apiPost('me', {}); const g = $('#login-gate'); if (g) g.hidden = true;
      try { await restoreFromHash(); } finally { hideLoading(); }
      return;
    }
    catch (e) { ID_TOKEN = null; try { localStorage.removeItem('idt'); } catch (e2) {} }
  }
  hideLoading();   // 進登入畫面時收掉遮罩
  startLogin();
}
boot();

