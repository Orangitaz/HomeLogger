'use strict';
// HomeLogger 1.4 screens: appliance register (+ warranties, nameplate reading), belongings inventory, seasonal checklist.
// Loaded after features.js and before the main script; uses the main script's helpers when called.

// ---------- Appliance register ----------
const APPL_QUICK = ['Refrigerator', 'Dishwasher', 'Range / oven', 'Microwave', 'Washer', 'Dryer', 'Furnace', 'Air conditioner', 'Water heater', 'Water softener', 'Garage door opener', 'Sump pump', 'Dehumidifier', 'Garbage disposal'];
const BRANDS = ['Whirlpool', 'GE', 'Samsung', 'LG', 'Frigidaire', 'Kenmore', 'Bosch', 'Maytag', 'Carrier', 'Trane', 'Lennox', 'Rheem', 'A. O. Smith', 'Bradford White', 'Goodman', 'Navien', 'Rinnai', 'Kohler', 'Generac', 'Honeywell', 'Amana', 'KitchenAid', 'Electrolux', 'Haier', 'Hisense', 'Sharp', 'Panasonic', 'Miele', 'Viking', 'Sub-Zero', 'Delta', 'Moen', 'LiftMaster', 'Chamberlain', 'Ruud', 'York', 'Daikin', 'Mitsubishi', 'Fujitsu', 'Bryant', 'Whirlpool', 'Rheem', 'Weil-McLain', 'Burnham', 'Cuno', 'Culligan', 'Pentair', 'Zoeller', 'Wayne', 'Briggs & Stratton', 'Cummins'];

// Read model / serial / brand out of text recognized from an appliance nameplate.
function parseNameplate(text) {
  const lines = String(text || '').split(/\r?\n/).map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const out = { model: '', serial: '', brand: '' };
  const tokenFrom = s => {
    for (const w of String(s).split(/[\s:;|]+/)) {
      const t = w.replace(/^[#:.\-]+|[.,;:]+$/g, '');
      if (t.length >= 3 && t.length <= 26 && /\d/.test(t) && /^[A-Za-z0-9][A-Za-z0-9\-\/.]*$/.test(t) && !/^\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}$/.test(t)) return t.toUpperCase();
    }
    return '';
  };
  const MODEL = /\b(model\s*(?:no\.?|number|num\.?|#)?|mod\.?(?:\s*no\.?)?|m\/n|mdl)(?![a-z])/i;
  const SERIAL = /\b(serial\s*(?:no\.?|number|num\.?|#)?|ser\.?\s*(?:no\.?|#)?|s\/n|sn)(?![a-z])/i;
  const find = re => {
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(re); if (!m) continue;
      const after = lines[i].slice(m.index + m[0].length).replace(/^\s*(?:de\s+)?(?:mod[eè]le|s[eé]rie|n[uú]mero)?\s*/i, '');
      let t = tokenFrom(after);
      if (!t && lines[i + 1] && !MODEL.test(lines[i + 1]) && !SERIAL.test(lines[i + 1])) t = tokenFrom(lines[i + 1]);
      if (t) return t;
    }
    return '';
  };
  out.model = find(MODEL);
  out.serial = find(SERIAL);
  if (out.serial && out.serial === out.model) out.serial = '';
  const all = ' ' + lines.join(' ').toLowerCase().replace(/[^a-z0-9&. ]/g, ' ') + ' ';
  for (const b of BRANDS) { if (all.includes(' ' + b.toLowerCase().replace(/[^a-z0-9&. ]/g, ' ') + ' ')) { out.brand = b; break; } }
  return out;
}

const applPhotos = x => S.documents.filter(d => d.applianceId === x.id);
const warrantyInfo = x => {
  if (!x.warrantyEnd) return null;
  const n = days(x.warrantyEnd);
  return n < 0 ? { cls: '', txt: 'Expired ' + fmt(x.warrantyEnd), n } : n <= 90 ? { cls: 'warn', txt: n + 'd left', n } : { cls: 'ok', txt: 'Until ' + fmt(x.warrantyEnd), n };
};
function applRow(x) {
  const w = warrantyInfo(x), ph = applPhotos(x).find(d => (d.mime || '').startsWith('image/'));
  return `<div class="row" data-appl="${x.id}">${ph ? '<img class="thumb" loading="lazy" src="' + fileUrl(ph.fileId) + '">' : '<div class="thumb">🔌</div>'}<div class="grow"><div class="t">${esc(x.name)}</div>
    <div class="s">${esc([x.brand, x.model].filter(Boolean).join(' · ') || 'No model yet')}${x.areaId && areaOf(x.areaId) ? ' · ' + esc(areaOf(x.areaId).name) : ''}</div></div>${w ? '<span class="pill ' + w.cls + '">' + esc(w.txt) + '</span>' : ''}</div>`;
}
function renderAppliances() {
  const list = S.appliances.slice().sort((a, b) => String(a.name).localeCompare(String(b.name)));
  if (!list.length) return `<div class="empty"><div class="big">🔌</div><p>List your appliances and systems with model, serial number and warranty.<br>Snap the nameplate and the app can read the model and serial for you.</p><button class="btn" id="fabAppl2">Add your first appliance</button></div><button class="fab" id="fabAppl">+</button>`;
  const soon = list.filter(x => { const w = warrantyInfo(x); return w && w.n >= 0 && w.n <= 90; }).length;
  return `<div class="actions" style="margin:0 0 8px"><button class="btn sec" data-go="warranties">🛡️ Warranties${soon ? ' · ' + soon + ' ending soon' : ''}</button></div>` + list.map(applRow).join('') + '<button class="fab" id="fabAppl">+</button>';
}
function renderWarranties() {
  const withW = S.appliances.filter(x => x.warrantyEnd), none = S.appliances.filter(x => !x.warrantyEnd);
  const sorted = withW.slice().sort((a, b) => a.warrantyEnd < b.warrantyEnd ? -1 : 1);
  const active = sorted.filter(x => days(x.warrantyEnd) >= 0), expired = sorted.filter(x => days(x.warrantyEnd) < 0).reverse();
  const soon = active.filter(x => days(x.warrantyEnd) <= 90), later = active.filter(x => days(x.warrantyEnd) > 90);
  const wdocs = S.documents.filter(d => d.category === 'Warranty' && d.expires).sort((a, b) => a.expires < b.expires ? -1 : 1);
  let h = '';
  if (!S.appliances.length && !wdocs.length) return '<div class="empty"><div class="big">🛡️</div><p>Add appliances with a warranty end date and they will show up here.</p></div>';
  if (soon.length) h += '<div class="banner"><b>' + soon.length + ' ending within 90 days</b></div>' + soon.map(applRow).join('');
  if (later.length) h += '<h2>Covered</h2>' + later.map(applRow).join('');
  if (wdocs.length) h += '<h2>Warranty documents</h2>' + wdocs.map(docRow).join('');
  if (expired.length) h += '<h2>Expired</h2>' + expired.map(applRow).join('');
  if (none.length) h += '<h2>No warranty date</h2>' + none.map(applRow).join('');
  return h;
}

function applianceForm(x, preset) {
  x = Object.assign({}, preset, x || {});
  const areaOpts = '<option value="">Not linked</option>' + S.areas.map(a => `<option value="${a.id}"${(x.areaId || '') === a.id ? ' selected' : ''}>${esc(a.icon + ' ' + a.name)}</option>`).join('');
  sheet(`<h3>${x.id ? 'Edit appliance' : 'Add appliance'}</h3>
    <label>Name</label><input name="name" value="${esc(x.name)}" placeholder="e.g. Kitchen refrigerator"><div class="chips" id="aq">${APPL_QUICK.map(q => `<span class="chip">${esc(q)}</span>`).join('')}</div>
    ${x.id ? '' : '<label>Nameplate photo (optional)</label><input type="file" name="file" accept="image/*" multiple>' + (OCR() ? '<button type="button" class="btn sec sm" id="scanNp" style="margin-top:6px">✨ Read model & serial from the photo</button><div class="small" id="scanNote"></div>' : '')}
    <label>Brand</label><input name="brand" value="${esc(x.brand)}">
    <label>Model number</label><input name="model" value="${esc(x.model)}" autocapitalize="characters">
    <label>Serial number</label><input name="serial" value="${esc(x.serial)}" autocapitalize="characters">
    <label>Purchase / install date</label><input type="date" name="purchaseDate" value="${esc(x.purchaseDate)}">
    <label>Warranty ends</label><input type="date" name="warrantyEnd" value="${esc(x.warrantyEnd)}">
    <div class="chips" id="wq"><span class="chip" data-y="1">+1 yr</span><span class="chip" data-y="2">+2 yr</span><span class="chip" data-y="5">+5 yr</span><span class="chip" data-y="10">+10 yr</span></div>
    <label>Price (optional)</label><input name="price" inputmode="decimal" value="${x.price ? esc(x.price) : ''}" placeholder="0.00">
    <label>Bought from</label><input name="store" value="${esc(x.store)}">
    <label>Area</label><select name="area">${areaOpts}</select>
    <label>Notes</label><textarea name="notes">${esc(x.notes)}</textarea>
    <div class="actions">${x.id ? '<button class="btn bad" id="del">Delete</button>' : ''}<button class="btn sec" id="cancel">Cancel</button><button class="btn" id="ok">Save</button></div>`,
  el => {
    const f = n => el.querySelector('[name=' + n + ']');
    el.querySelector('#aq').onclick = e => { if (e.target.classList.contains('chip')) f('name').value = e.target.textContent; };
    el.querySelector('#wq').onclick = e => {
      const y = e.target.dataset.y; if (!y) return;
      f('warrantyEnd').value = addMonths(f('purchaseDate').value || today(), 12 * +y);
    };
    el.querySelector('#cancel').onclick = el.close;
    const sc = el.querySelector('#scanNp');
    if (sc) sc.onclick = async () => {
      const img = [...(f('file').files || [])].find(z => (z.type || '').startsWith('image/'));
      if (!img) return toast('Choose a photo of the nameplate first');
      sc.disabled = true; const old = sc.textContent; sc.textContent = 'Reading…';
      try {
        const r = parseNameplate(await ocrImage(img)), got = [];
        for (const k of ['brand', 'model', 'serial']) if (r[k] && !f(k).value) { f(k).value = r[k]; got.push(k); }
        el.querySelector('#scanNote').textContent = got.length ? 'Filled in: ' + got.join(', ') + '. Please check it against the label.' : "Couldn't find a model or serial. Try a closer, sharper photo, or type it in.";
      } catch (e) { toast('Could not read the photo'); }
      sc.disabled = false; sc.textContent = old;
    };
    if (x.id) el.querySelector('#del').onclick = async () => { if (!confirm('Delete this appliance and its photos?')) return; await api('DELETE', '/api/appliances/' + x.id); el.close(); await load(); render(); toast('Deleted'); };
    el.querySelector('#ok').onclick = async () => {
      const name = val(el, 'name'); if (!name) return toast('Name the appliance');
      const body = { name, brand: val(el, 'brand'), model: val(el, 'model'), serial: val(el, 'serial'), purchaseDate: val(el, 'purchaseDate'), warrantyEnd: val(el, 'warrantyEnd'), price: val(el, 'price') ? num(val(el, 'price')) : '', store: val(el, 'store'), areaId: val(el, 'area'), notes: val(el, 'notes') };
      const rec = x.id ? await api('PUT', '/api/appliances/' + x.id, body) : await api('POST', '/api/appliances', body);
      const fi = f('file');
      if (fi) { el.querySelector('#ok').disabled = true; for (const file of fi.files) await uploadDoc(file, { applianceId: rec.id, areaId: '', category: 'Photo', title: 'Nameplate' + (fi.files.length > 1 ? ' ' + file.name : '') }); }
      el.close(); await load(); render(); toast('Saved');
      if (!x.id) { const fresh = S.appliances.find(z => z.id === rec.id); if (fresh && applTaskList(fresh)) setTimeout(() => applianceTasksSheet(fresh), 250); }
    };
  });
}
function applianceView(x) {
  if (!x) return;
  const ph = applPhotos(x), w = warrantyInfo(x), a = areaOf(x.areaId);
  const img = d => (d.mime || '').startsWith('image/');
  sheet(`<h3>🔌 ${esc(x.name)}</h3>
    <dl class="kv">${x.brand ? '<dt>Brand</dt><dd>' + esc(x.brand) + '</dd>' : ''}${x.model ? '<dt>Model</dt><dd>' + esc(x.model) + '</dd>' : ''}${x.serial ? '<dt>Serial</dt><dd>' + esc(x.serial) + '</dd>' : ''}${x.purchaseDate ? '<dt>Purchased</dt><dd>' + fmt(x.purchaseDate) + '</dd>' : ''}${w ? '<dt>Warranty</dt><dd>' + (w.n < 0 ? 'Expired ' : 'Until ') + fmt(x.warrantyEnd) + '</dd>' : ''}${num(x.price) ? '<dt>Price</dt><dd>' + money(num(x.price)) + '</dd>' : ''}${x.store ? '<dt>Bought from</dt><dd>' + esc(x.store) + '</dd>' : ''}${a ? '<dt>Area</dt><dd>' + esc(a.name) + '</dd>' : ''}${x.notes ? '<dt>Notes</dt><dd>' + esc(x.notes) + '</dd>' : ''}</dl>
    ${ph.length ? '<h2>Photos & files</h2><div class="phs">' + ph.map(d => img(d) ? `<img data-doc="${d.id}" src="${fileUrl(d.fileId)}">` : `<div class="thumb" data-doc="${d.id}">📄</div>`).join('') + '</div>' : ''}
    <div class="actions">${applTaskList(x) ? '<button class="btn sec" id="appTasks">🛠️ Maintenance tasks</button>' : ''}<button class="btn sec" id="addPh">📎 Add photo / manual</button><button class="btn" id="edit">Edit</button></div>`,
  el => {
    const at = el.querySelector('#appTasks'); if (at) at.onclick = () => { el.close(); applianceTasksSheet(x); };
    el.querySelector('#edit').onclick = () => { el.close(); applianceForm(x); };
    el.querySelector('#addPh').onclick = () => { el.close(); attachFilesSheet({ title: 'Add to ' + x.name, meta: { applianceId: x.id, areaId: '' }, cats: ['Photo', 'Manual', 'Warranty', 'Receipt', 'Other'] }); };
    el.querySelectorAll('[data-doc]').forEach(z => z.onclick = ev => { ev.stopPropagation(); el.close(); docView(S.documents.find(d => d.id === z.dataset.doc)); });
  });
}


// ---------- Appliance -> suggested maintenance tasks ----------
const APPL_TASKS = [
  [/refrigerator|fridge|freezer/i, '🧊', [['Clean refrigerator coils', '6'], ['Replace water filter', '6'], ['Check door seals and temperature', '12']]],
  [/dishwasher/i, '🍽️', [['Clean dishwasher filter', '3'], ['Run a dishwasher cleaner cycle', '3'], ['Check door gasket and spray arms', '12']]],
  [/range|oven|stove|cooktop/i, '🍳', [['Run self-clean / deep clean oven', '6'], ['Check oven door seal and burners', '12'], ['Clean range hood filter', '3']]],
  [/microwave/i, '📻', [['Clean microwave and replace charcoal filter', '6']]],
  [/washer|washing/i, '🧺', [['Clean washer drum and gasket', '3'], ['Inspect washer hoses', '12'], ['Replace washer hoses', '60']]],
  [/dryer/i, '🌀', [['Clean dryer vent duct', '12'], ['Clean lint trap housing', '6']]],
  [/water heater/i, '🚿', [['Flush the water heater tank', '12'], ['Test pressure-relief valve', '12'], ['Check the anode rod', '36']]],
  [/furnace|boiler|heat pump|heater/i, '🔥', [['Replace furnace filter', '3'], ['Furnace tune-up', '12'], ['Test CO alarms near the furnace', '6']]],
  [/air ?cond|\ba\/?c\b|mini.?split|condenser/i, '❄️', [['AC tune-up before summer', '12'], ['Clean outdoor condenser unit', '12'], ['Clean condensate drain line', '6'], ['Replace air filter', '3']]],
  [/softener|water filter|reverse osmosis|\bro\b/i, '💧', [['Add salt / check the softener', '3'], ['Replace water filter cartridges', '6'], ['Sanitize the softener', '12']]],
  [/garage door/i, '🚪', [['Lubricate garage door', '6'], ['Test door auto-reverse', '6'], ['Replace opener remote batteries', '12']]],
  [/sump/i, '🪣', [['Test sump pump', '6'], ['Clean sump pit and pump intake', '12']]],
  [/dehumidifier/i, '💨', [['Empty and clean dehumidifier', '3'], ['Clean dehumidifier filter', '3']]],
  [/disposal/i, '♻️', [['Clean garbage disposal', '3']]],
  [/smoke|co alarm|detector/i, '🚨', [['Test smoke and CO alarms', '6'], ['Replace alarm batteries', '12']]],
  [/generator/i, '🔌', [['Run generator under load', '3'], ['Change generator oil', '12']]],
];
const applTaskList = x => { const n = [x.name, x.model].join(' '); const m = APPL_TASKS.find(r => r[0].test(n)); return m ? { icon: m[1], list: m[2] } : null; };
function applianceTasksSheet(x) {
  const m = applTaskList(x);
  if (!m) return;
  const have = new Set(S.tasks.map(t => String(t.title).trim().toLowerCase() + '|' + (t.areaId || '')));
  const label = v => (INTERVALS.find(z => z[0] === v) || [v, 'Every ' + v + ' months'])[1];
  const same = x.areaId ? null : S.areas.find(a => String(a.name).trim().toLowerCase() === String(x.name).trim().toLowerCase()); // reuse an area that already has this name
  const pre = x.areaId || (same && same.id) || '';
  const areaOpts = S.areas.map(a => `<option value="${a.id}"${a.id === pre ? ' selected' : ''}>${esc(a.icon + ' ' + a.name)}</option>`).join('') + `<option value="__new"${!pre ? ' selected' : ''}>＋ New area: ${esc(x.name)}</option>`;
  sheet(`<h3>${m.icon} Maintenance for ${esc(x.name)}</h3><p class="small" style="margin-top:0">Tick the jobs you want. Each starts counting from today.</p>
    <label>Add them to</label><select id="atArea">${areaOpts}</select>
    <div id="atList" style="margin-top:8px"></div>
    <div class="actions"><button class="btn sec" id="cancel">Not now</button><button class="btn" id="atAdd">Add selected</button></div>`,
  el => {
    const sel = el.querySelector('#atArea');
    const draw = () => {
      const aid = sel.value === '__new' ? '' : sel.value;
      el.querySelector('#atList').innerHTML = m.list.map(([t, iv], i) => {
        const dup = aid && have.has(t.toLowerCase() + '|' + aid);
        return `<label class="pick"><input type="checkbox" data-i="${i}" ${dup ? 'disabled checked' : 'checked'}><span><b>${esc(t)}</b><span class="small"> · ${esc(label(iv))}${dup ? ' · already added' : ''}</span></span></label>`;
      }).join('');
    };
    sel.onchange = draw; draw();
    el.querySelector('#cancel').onclick = el.close;
    el.querySelector('#atAdd').onclick = async () => {
      const picks = [...el.querySelectorAll('#atList input:checked:not(:disabled)')].map(c => m.list[+c.dataset.i]);
      if (!picks.length) return toast('Tick at least one job');
      el.querySelector('#atAdd').disabled = true;
      let aid = sel.value;
      if (aid === '__new') { const a = await api('POST', '/api/areas', { name: x.name, icon: m.icon, color: '' }); aid = a.id; }
      if (x.areaId !== aid) await api('PUT', '/api/appliances/' + x.id, { areaId: aid });
      for (const [title, iv] of picks) await api('POST', '/api/tasks', { areaId: aid, title, intervalMonths: iv, nextDue: addMonths(today(), parseInt(iv, 10)), notes: 'For: ' + x.name + (x.model ? ' (' + x.model + ')' : '') });
      el.close(); await load(); render(); toast(picks.length + (picks.length === 1 ? ' task added' : ' tasks added'));
    };
  });
}

// ---------- Barcode scanning (Android app) ----------
const BARCODE = () => LOCAL && typeof AndroidBridge.scanBarcode === 'function';
const barcodeWaiters = {};
window.__barcodeDone = (id, value, err) => { const w = barcodeWaiters[id]; if (w) { delete barcodeWaiters[id]; w({ value, err }); } };
const scanBarcodeCode = () => new Promise(res => { const id = rid() + rid(); barcodeWaiters[id] = res; AndroidBridge.scanBarcode(id); });
// Pick the product name / model out of an upcitemdb.com lookup answer.
function parseUpc(j) {
  const it = j && Array.isArray(j.items) ? j.items[0] : null;
  if (!it) return null;
  const clean = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  let title = clean(it.title), brand = clean(it.brand), model = clean(it.model);
  if (title.length > 90) title = title.slice(0, 90).replace(/\s+\S*$/, '');
  if (brand && title && !title.toLowerCase().includes(brand.toLowerCase())) title = brand + ' ' + title;
  return title || brand || model ? { name: title || brand, model } : null;
}
async function lookupBarcode(code) {
  if (!/^\d{8,14}$/.test(code)) return { status: 'text' };
  try {
    const r = await nativeFetch('https://api.upcitemdb.com/prod/trial/lookup?upc=' + code, { method: 'GET' });
    if (r.status === 429) return { status: 'limit' };
    if (!r.ok) return { status: 'error' };
    const p = parseUpc(await r.json());
    return p ? { status: 'ok', product: p } : { status: 'unknown' };
  } catch (e) { return { status: 'error' }; }
}

// ---------- Belongings inventory ----------
const ROOM_DEFAULTS = ['Living room', 'Kitchen', 'Dining room', 'Bedroom', 'Bathroom', 'Office', 'Garage', 'Basement', 'Attic', 'Outdoors'];
const belQty = b => Math.max(1, parseInt(b.qty, 10) || 1);
const belTotal = b => num(b.value) * belQty(b);
const belPhotos = b => S.documents.filter(d => d.belongingId === b.id);
const roomsUsed = () => [...new Set(S.belongings.map(b => b.room || 'Other'))];
function belRow(b) {
  const ph = belPhotos(b).find(d => (d.mime || '').startsWith('image/'));
  return `<div class="row" data-bel="${b.id}">${ph ? '<img class="thumb" loading="lazy" src="' + fileUrl(ph.fileId) + '">' : '<div class="thumb">📦</div>'}<div class="grow"><div class="t">${esc(b.name)}${belQty(b) > 1 ? ' × ' + belQty(b) : ''}</div><div class="s">${esc([b.serial, b.notes].filter(Boolean).join(' · '))}</div></div>${num(b.value) ? '<span class="pill">' + money(belTotal(b)) + '</span>' : ''}</div>`;
}
function renderBelongings() {
  if (!S.belongings.length) return `<div class="empty"><div class="big">🛋️</div><p>Walk through your home room by room and list what you own, with photos and what it is worth.<br>Handy for insurance, and you can add it to your report.</p><button class="btn" id="fabBel2">Add your first item</button></div><button class="fab" id="fabBel">+</button>`;
  const total = S.belongings.reduce((s, b) => s + belTotal(b), 0), n = S.belongings.reduce((s, b) => s + belQty(b), 0);
  let h = `<div class="card" style="margin:0 0 8px"><div class="two"><div><div class="small">Items</div><div class="big2">${n}</div></div><div><div class="small">Estimated value</div><div class="big2">${money(total)}</div></div></div>
    <div class="actions" style="margin-bottom:0"><button class="btn sec sm" id="expBel">⬇️ Export spreadsheet (CSV)</button><button class="btn sec sm" data-go="report" data-inv="1">📄 Add to report</button></div></div>`;
  const rooms = roomsUsed().sort((a, b) => a.localeCompare(b));
  for (const r of rooms) {
    const list = S.belongings.filter(b => (b.room || 'Other') === r).sort((a, b) => String(a.name).localeCompare(String(b.name)));
    const sub = list.reduce((s, b) => s + belTotal(b), 0);
    h += `<h2>${esc(r)}${sub ? ' · ' + money(sub) : ''}</h2>` + list.map(belRow).join('');
  }
  return h + '<button class="fab" id="fabBel">+</button>';
}
function belongingForm(b, preset) {
  b = Object.assign({}, preset, b || {});
  const rooms = [...new Set([...ROOM_DEFAULTS, ...roomsUsed()])];
  sheet(`<h3>${b.id ? 'Edit item' : 'Add item'}</h3>
    <label>Room</label><input name="room" value="${esc(b.room)}" placeholder="e.g. Living room"><div class="chips" id="rq">${rooms.map(r => `<span class="chip">${esc(r)}</span>`).join('')}</div>
    <label>Item</label><input name="name" value="${esc(b.name)}" placeholder="e.g. 65-inch TV, Laptop, Wedding ring">${BARCODE() ? '<button type="button" class="btn sec sm" id="scanBc" style="margin-top:6px">📷 Scan barcode</button><div class="small" id="bcNote">The barcode number is sent to upcitemdb.com to look up the product name.</div>' : ''}
    <div class="two"><div><label>How many</label><input name="qty" inputmode="numeric" value="${esc(b.qty || 1)}"></div><div><label>Value each (optional)</label><input name="value" inputmode="decimal" value="${b.value ? esc(b.value) : ''}" placeholder="0.00"></div></div>
    <label>Bought on (optional)</label><input type="date" name="purchaseDate" value="${esc(b.purchaseDate)}">
    <label>Model / serial (optional)</label><input name="serial" value="${esc(b.serial)}">
    <label>Notes</label><textarea name="notes">${esc(b.notes)}</textarea>
    ${b.id ? '' : '<label>Photos (optional)</label><input type="file" name="file" accept="image/*" multiple>'}
    <div class="actions">${b.id ? '<button class="btn bad" id="del">Delete</button>' : '<button class="btn sec" id="again">Save & add another</button>'}<button class="btn sec" id="cancel">Cancel</button><button class="btn" id="ok">Save</button></div>`,
  el => {
    el.querySelector('#rq').onclick = e => { if (e.target.classList.contains('chip')) el.querySelector('[name=room]').value = e.target.textContent; };
    const sb = el.querySelector('#scanBc');
    if (sb) sb.onclick = async () => {
      const f = n => el.querySelector('[name=' + n + ']'), note = el.querySelector('#bcNote');
      sb.disabled = true; const old = sb.textContent;
      try {
        const { value, err } = await scanBarcodeCode();
        if (err === 'cancelled' || (!value && !err)) { note.textContent = ''; return; }
        if (err) { note.textContent = 'Could not scan: ' + err; return; }
        sb.textContent = 'Looking up…';
        const tag = 'Barcode ' + value;
        if (!f('notes').value.includes(tag)) f('notes').value = (f('notes').value ? f('notes').value + '\n' : '') + tag;
        const r = await lookupBarcode(value);
        if (r.status === 'ok') {
          const got = [];
          if (!f('name').value) { f('name').value = r.product.name; got.push('name'); }
          if (r.product.model && !f('serial').value) { f('serial').value = r.product.model; got.push('model'); }
          note.textContent = got.length ? 'Filled in: ' + got.join(', ') + '. Please check it.' : 'Found: ' + r.product.name + '. Your own entries were kept.';
        } else note.textContent = { text: 'Saved the code in the notes.', unknown: 'Barcode ' + value + " isn't in the product list. Type the name in; the code is saved in the notes.", limit: 'Lookup limit reached for today. Type the name in; the code is saved in the notes.', error: "Couldn't look the product up (no internet?). Type the name in; the code is saved in the notes." }[r.status];
      } catch (e) { note.textContent = 'Could not scan.'; }
      finally { sb.disabled = false; sb.textContent = old; }
    };
    el.querySelector('#cancel').onclick = el.close;
    if (b.id) el.querySelector('#del').onclick = async () => { if (!confirm('Delete this item and its photos?')) return; await api('DELETE', '/api/belongings/' + b.id); el.close(); await load(); render(); toast('Deleted'); };
    const save = again => async () => {
      const name = val(el, 'name'); if (!name) return toast('What is it?');
      const room = val(el, 'room') || 'Other';
      const body = { room, name, qty: Math.max(1, parseInt(val(el, 'qty'), 10) || 1), value: val(el, 'value') ? num(val(el, 'value')) : '', purchaseDate: val(el, 'purchaseDate'), serial: val(el, 'serial'), notes: val(el, 'notes') };
      el.querySelectorAll('button').forEach(x => x.disabled = true);
      const rec = b.id ? await api('PUT', '/api/belongings/' + b.id, body) : await api('POST', '/api/belongings', body);
      const fi = el.querySelector('[name=file]');
      if (fi) for (const file of fi.files) await uploadDoc(file, { belongingId: rec.id, areaId: '', category: 'Photo', title: name });
      el.close(); await load(); render(); toast('Saved');
      if (again) belongingForm(null, { room });
    };
    el.querySelector('#ok').onclick = save(false);
    const ag = el.querySelector('#again'); if (ag) ag.onclick = save(true);
  });
}
function belongingView(b) {
  if (!b) return;
  const ph = belPhotos(b);
  sheet(`<h3>📦 ${esc(b.name)}</h3>
    <dl class="kv"><dt>Room</dt><dd>${esc(b.room || 'Other')}</dd>${belQty(b) > 1 ? '<dt>Quantity</dt><dd>' + belQty(b) + '</dd>' : ''}${num(b.value) ? '<dt>Value</dt><dd>' + money(num(b.value)) + (belQty(b) > 1 ? ' each · ' + money(belTotal(b)) + ' total' : '') + '</dd>' : ''}${b.purchaseDate ? '<dt>Bought</dt><dd>' + fmt(b.purchaseDate) + '</dd>' : ''}${b.serial ? '<dt>Model / serial</dt><dd>' + esc(b.serial) + '</dd>' : ''}${b.notes ? '<dt>Notes</dt><dd>' + esc(b.notes) + '</dd>' : ''}</dl>
    ${ph.length ? '<h2>Photos</h2><div class="phs">' + ph.map(d => (d.mime || '').startsWith('image/') ? `<img data-doc="${d.id}" src="${fileUrl(d.fileId)}">` : `<div class="thumb" data-doc="${d.id}">📄</div>`).join('') + '</div>' : ''}
    <div class="actions"><button class="btn sec" id="addPh">📷 Add photo / receipt</button><button class="btn" id="edit">Edit</button></div>`,
  el => {
    el.querySelector('#edit').onclick = () => { el.close(); belongingForm(b); };
    el.querySelector('#addPh').onclick = () => { el.close(); attachFilesSheet({ title: 'Add to ' + b.name, meta: { belongingId: b.id, areaId: '' }, cats: ['Photo', 'Receipt', 'Other'] }); };
    el.querySelectorAll('[data-doc]').forEach(z => z.onclick = ev => { ev.stopPropagation(); el.close(); docView(S.documents.find(d => d.id === z.dataset.doc)); });
  });
}
const csvCell = v => { v = String(v == null ? '' : v); if (/^[=+@\t\r]|^-(?![0-9.]+$)/.test(v)) v = "'" + v; // stop spreadsheet apps treating text as a formula
  return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
function belongingsCsv() {
  const rows = [['Room', 'Item', 'Quantity', 'Value each', 'Total value', 'Bought', 'Model / serial', 'Notes']];
  for (const b of S.belongings.slice().sort((a, c) => (a.room || '').localeCompare(c.room || '') || String(a.name).localeCompare(String(c.name))))
    rows.push([b.room || 'Other', b.name, belQty(b), num(b.value) || '', num(b.value) ? belTotal(b).toFixed(2) : '', b.purchaseDate || '', b.serial || '', b.notes || '']);
  return rows.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
function saveTextFile(name, mime, text) {
  if (LOCAL && typeof AndroidBridge.beginSave === 'function') { AndroidBridge.beginSave(name, mime, 'download'); AndroidBridge.writeText(text); AndroidBridge.endSave(); return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: mime })); a.download = name; document.body.appendChild(a); a.click(); a.remove();
}
// Section for the history report.
function reportInventory(o) {
  if (!S.belongings.length) return '<h2>Belongings inventory</h2><div class="small">Nothing listed yet.</div>';
  const total = S.belongings.reduce((s, b) => s + belTotal(b), 0);
  let h = `<h2>Belongings inventory</h2><div class="small">${S.belongings.reduce((s, b) => s + belQty(b), 0)} items${o.costs && total ? ' · estimated value ' + money(total) : ''}</div>`;
  for (const r of roomsUsed().sort((a, b) => a.localeCompare(b))) {
    const list = S.belongings.filter(b => (b.room || 'Other') === r).sort((a, b) => String(a.name).localeCompare(String(b.name)));
    const sub = list.reduce((s, b) => s + belTotal(b), 0);
    h += `<h3>${esc(r)}${o.costs && sub ? ' <span class="small">· ' + money(sub) + '</span>' : ''}</h3><table>` + list.map(b => {
      const imgs = o.photos ? belPhotos(b).filter(d => (d.mime || '').startsWith('image/')) : [];
      return `<tr><td><b>${esc(b.name)}</b>${belQty(b) > 1 ? ' × ' + belQty(b) : ''}${b.serial ? '<br>' + esc(b.serial) : ''}${b.notes ? '<br>' + esc(b.notes) : ''}${imgs.length ? '<div class="rimgs">' + imgs.map(d => `<img src="${fileUrl(d.fileId)}">`).join('') + '</div>' : ''}</td>${o.costs ? `<td class="nw r">${num(b.value) ? money(belTotal(b)) : ''}</td>` : ''}</tr>`;
    }).join('') + '</table>';
  }
  return h;
}

// ---------- This season ----------
const SEASONS = {
  spring: { icon: '🌷', name: 'Spring', jobs: ['Clean gutters and downspouts', 'Inspect the roof for winter damage', 'Service the air conditioner before summer', 'Check the foundation and drainage', 'Turn on outdoor faucets and test irrigation', 'Wash windows and clean screens', 'Power-wash the deck, siding and walkways', 'Test smoke and CO alarms', 'Look for signs of pests'] },
  summer: { icon: '☀️', name: 'Summer', jobs: ['Clean the dryer vent', 'Clean the refrigerator coils', 'Inspect the deck and fence', 'Check caulk around windows and doors', 'Clean the outdoor AC unit', 'Flush the water heater', 'Trim trees and shrubs away from the house', 'Check garage door and weatherstripping'] },
  fall: { icon: '🍂', name: 'Fall', jobs: ['Clean gutters and downspouts', 'Winterize irrigation and drain outdoor faucets', 'Service the furnace and replace the filter', 'Have the chimney inspected and swept', 'Seal gaps and replace weatherstripping', 'Reverse ceiling fans for winter', 'Test smoke and CO alarms', 'Disconnect hoses and cover outdoor taps', 'Check the roof and flashing before winter'] },
  winter: { icon: '❄️', name: 'Winter', jobs: ['Replace the furnace filter', 'Check pipes for freezing and insulate exposed ones', 'Keep snow clear of vents, meters and exhausts', 'Test the sump pump', 'Look for ice dams and attic leaks', 'Test GFCI outlets', 'Check for drafts around doors and windows', 'Review insurance and key documents'] },
};
function seasonOf(date) { const m = (date || new Date()).getMonth(); return m >= 2 && m <= 4 ? 'spring' : m >= 5 && m <= 7 ? 'summer' : m >= 8 && m <= 10 ? 'fall' : 'winter'; }
// Winter runs Dec–Feb, so January and February belong to the winter that began the year before.
function seasonYear(season, date) { date = date || new Date(); const y = date.getFullYear(), m = date.getMonth(); return season === 'winter' && m <= 1 ? y - 1 : y; }
const seasonKey = (season, job, date) => seasonYear(season, date) + '-' + season + ':' + job.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const seasonDone = key => (S.checks || []).some(c => c.key === key && c.done);
function seasonItems(season) { return SEASONS[season].jobs.map(job => ({ job, key: seasonKey(season, job), done: seasonDone(seasonKey(season, job)) })); }
async function seasonToggle(key, done) {
  const have = (S.checks || []).filter(c => c.key === key);
  if (have.length) for (const c of have) await api('PUT', '/api/checks/' + c.id, { done });
  else await api('POST', '/api/checks', { key, done });
  await load(); render();
}
const seasonBox = it => `<label class="pick"><input type="checkbox" data-sk="${esc(it.key)}" ${it.done ? 'checked' : ''}><span style="${it.done ? 'text-decoration:line-through;color:var(--mut)' : ''}">${esc(it.job)}</span></label>`;
function seasonCard() {
  const s = seasonOf(), items = seasonItems(s), done = items.filter(i => i.done).length, left = items.filter(i => !i.done);
  return `<div class="card" style="margin:8px 0"><div class="row" data-go="season" style="border:0;padding:0;margin:0;background:none"><div class="thumb">${SEASONS[s].icon}</div><div class="grow"><div class="t">This season · ${SEASONS[s].name}</div><div class="s">${left.length ? done + ' of ' + items.length + ' done' : 'All done. Nice work.'}</div></div><span class="pill">${items.length ? Math.round(100 * done / items.length) : 0}%</span></div>
    ${bar(items.length ? Math.round(100 * done / items.length) : 0)}${left.slice(0, 4).map(seasonBox).join('')}${left.length > 4 ? '<div class="small" data-go="season" style="margin-top:4px;cursor:pointer">+ ' + (left.length - 4) + ' more</div>' : ''}</div>`;
}
function renderSeason() {
  const cur = seasonOf(), s = view.season || cur, items = seasonItems(s), done = items.filter(i => i.done).length;
  return '<div class="chips">' + Object.entries(SEASONS).map(([k, v]) => `<span class="chip ${k === s ? 'on' : ''}" data-season="${k}">${v.icon} ${v.name}${k === cur ? ' (now)' : ''}</span>`).join('') + '</div>'
    + `<h2>${SEASONS[s].icon} ${SEASONS[s].name} jobs · ${done} of ${items.length}</h2>${bar(items.length ? Math.round(100 * done / items.length) : 0)}` + items.map(seasonBox).join('')
    + '<p class="small">Ticks reset each year. These are general suggestions for a house in the northern hemisphere; add your own recurring jobs as tasks on an area.</p>';
}

// ---------- Search additions ----------
function searchExtra2(q) {
  const m = (...f) => f.some(x => String(x || '').toLowerCase().includes(q));
  const ap = S.appliances.filter(x => m(x.name, x.brand, x.model, x.serial, x.store, x.notes));
  const be = S.belongings.filter(b => m(b.name, b.room, b.serial, b.notes));
  let h = '';
  if (ap.length) h += '<h2>Appliances</h2>' + ap.map(applRow).join('');
  if (be.length) h += '<h2>Belongings</h2>' + be.map(belRow).join('');
  return h;
}

// ---------- Events ----------
document.addEventListener('click', e => {
  const q = s => e.target.closest(s); let el;
  if (q('[data-sk]') || q('label.pick')) return; // checkbox rows are handled by the change event
  if ((el = q('[data-appl]'))) return applianceView(S.appliances.find(x => x.id === el.dataset.appl));
  if ((el = q('[data-bel]'))) return belongingView(S.belongings.find(x => x.id === el.dataset.bel));
  if (q('#fabAppl') || q('#fabAppl2')) return applianceForm();
  if (q('#fabBel') || q('#fabBel2')) return belongingForm();
  if ((el = q('[data-season]'))) { view.season = el.dataset.season; return render(); }
  if (q('#expBel')) return saveTextFile('homelogger-belongings-' + today() + '.csv', 'text/csv', belongingsCsv());
});
// "Add to report" on the belongings screen turns the inventory option on.
document.addEventListener('click', e => { const b = e.target.closest('[data-inv]'); if (b) setTimeout(() => { if (view.name === 'report') { view.rep = Object.assign({ area: '', photos: true, costs: true }, view.rep, { inv: true }); render(); } }, 0); }, true);
document.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset && t.dataset.sk) seasonToggle(t.dataset.sk, t.checked);
  else if (t.id === 'repInv') { view.rep.inv = t.checked; render(); }
});
