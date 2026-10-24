'use strict';
// HomeLogger feature screens: starter tasks, home info, projects, costs, history report, receipt scanning.
// Loaded before the main script. Nothing here runs at load time except event listeners; it uses the
// main script's helpers (S, sheet, api, load, render, go, esc, fmt, ...) when called.

// ---------- Money ----------
const num = x => { const n = parseFloat(String(x == null ? '' : x).replace(/[^0-9.\-]/g, '')); return isFinite(n) ? n : 0; };
const money = n => '$' + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const recCost = r => num(r.cost);
function spend(recs) {
  const yr = String(new Date().getFullYear()); let all = 0, thisYr = 0; const by = {};
  for (const r of recs) { const c = recCost(r); if (!c) continue; all += c; if ((r.date || '').startsWith(yr)) thisYr += c; by[r.type] = (by[r.type] || 0) + c; }
  return { all, yr: thisYr, by };
}
const spendCard = recs => {
  const sp = spend(recs); if (!sp.all) return '';
  return `<h2>Spending</h2><div class="card"><div class="two"><div><div class="small">This year</div><div class="big2">${money(sp.yr)}</div></div><div><div class="small">All time</div><div class="big2">${money(sp.all)}</div></div></div>
    <div class="chips" style="margin-bottom:0">${Object.entries(sp.by).map(([k, v]) => `<span class="pill">${esc((REC_TYPES[k] || k))} ${money(v)}</span>`).join('')}</div></div>`;
};

// ---------- Starter (suggested) tasks ----------
const SUGGEST = {
  'HVAC': [['Replace furnace / AC filter', '3'], ['Furnace tune-up', '12'], ['AC tune-up before summer', '12'], ['Clean condensate drain line', '6'], ['Clean outdoor condenser unit', '12'], ['Replace thermostat batteries', '12'], ['Clean vents and registers', '12'], ['Duct inspection / cleaning', '60']],
  'Roof': [['Inspect roof, flashing and vents', '12'], ['Clean gutters and downspouts', '6'], ['Remove moss and debris from roof', '12'], ['Trim branches near the roof', '12'], ['Check attic for leaks and ventilation', '12']],
  'Water heater': [['Flush the tank', '12'], ['Test pressure-relief valve', '12'], ['Inspect for leaks and corrosion', '6'], ['Check the anode rod', '36']],
  'Plumbing': [['Check under sinks for leaks', '6'], ['Test main water shutoff valve', '12'], ['Clean faucet aerators', '6'], ['Inspect washing machine hoses', '12'], ['Test sump pump', '6'], ['Drain outdoor faucets before winter', '12'], ['Pump septic tank', '36']],
  'Electrical': [['Test smoke and CO alarms', '6'], ['Replace smoke / CO alarm batteries', '12'], ['Test GFCI outlets', '6'], ['Replace smoke alarms (10-year life)', '120'], ['Check surge protectors', '12'], ['Test breakers / AFCI', '12']],
  'Kitchen': [['Clean range hood filter', '3'], ['Clean refrigerator coils', '6'], ['Replace fridge water filter', '6'], ['Clean dishwasher filter', '3'], ['Run dishwasher / disposal cleaner', '3'], ['Check fire extinguisher', '12']],
  'Laundry': [['Clean dryer vent duct', '12'], ['Clean washer drum and gasket', '3'], ['Replace washer hoses', '60']],
  'Garage': [['Lubricate garage door', '6'], ['Test door auto-reverse', '6'], ['Replace opener remote batteries', '12'], ['Check weatherstripping', '12']],
  'Yard': [['Winterize irrigation', '12'], ['Fertilize lawn', '3'], ['Aerate and overseed lawn', '12'], ['Inspect fence and deck', '12'], ['Seal or stain deck', '24'], ['Service lawn equipment', '12']],
  'Windows & doors': [['Check caulk and weatherstripping', '12'], ['Lubricate hinges and locks', '12'], ['Clean window tracks', '6'], ['Inspect screens', '12']],
  'Appliances': [['Clean refrigerator coils', '6'], ['Replace fridge water filter', '6'], ['Clean dishwasher filter', '3'], ['Descale coffee maker / kettle', '3'], ['Check dryer vent', '12']],
  'Pool': [['Test and balance water', '1'], ['Clean filter', '3'], ['Inspect pump and equipment', '12'], ['Open / close pool for the season', '12']],
  'Bathroom': [['Re-caulk tub and shower', '12'], ['Clean exhaust fan', '12'], ['Check toilet fill valves and seals', '12'], ['Clean drains', '6']],
  'Basement / crawlspace': [['Check for moisture and leaks', '6'], ['Inspect foundation for cracks', '12'], ['Empty and clean dehumidifier', '3'], ['Pest inspection', '12']],
  'Fireplace / chimney': [['Chimney inspection and sweep', '12'], ['Test damper', '12'], ['Check hearth and firebox', '12']],
  'General': [['Test smoke and CO alarms', '6'], ['Check fire extinguishers', '12'], ['Pest inspection', '12'], ['Review insurance and key documents', '12'], ['Check caulk and grout', '12']],
};
const SUGGEST_MATCH = [['HVAC', /hvac|furnace|heat|air ?cond|cooling|\ba\/?c\b/], ['Roof', /roof|gutter|attic/], ['Water heater', /water heater|hot water/], ['Plumbing', /plumb|sump|septic|well|pipe/], ['Electrical', /electr|panel|wiring|smoke/], ['Kitchen', /kitchen/], ['Laundry', /laundry|washer|dryer/], ['Garage', /garage/], ['Yard', /yard|lawn|garden|irrigation|outdoor|deck|fence|patio/], ['Windows & doors', /window|door/], ['Appliances', /appliance|fridge|refrigerator|dishwasher|oven|range/], ['Pool', /pool|spa|hot tub/], ['Bathroom', /bath|shower|toilet/], ['Basement / crawlspace', /basement|crawl|foundation/], ['Fireplace / chimney', /fireplace|chimney|stove/]];
const suggestKeyFor = name => { const n = String(name || '').toLowerCase(); for (const [k, re] of SUGGEST_MATCH) if (re.test(n)) return k; return 'General'; };

function suggestSheet(areaId) {
  const a = areaOf(areaId);
  const have = new Set(S.tasks.filter(t => t.areaId === areaId).map(t => String(t.title).trim().toLowerCase()));
  const label = v => (INTERVALS.find(x => x[0] === v) || [v, 'Every ' + v + ' months'])[1];
  sheet(`<h3>Suggested tasks</h3><p class="small" style="margin-top:0">Tick the ones you want. Each one starts counting from today; you can change the dates afterwards.</p>
    <label>Suggestions for</label><select id="sgKey">${Object.keys(SUGGEST).map(k => `<option>${esc(k)}</option>`).join('')}</select>
    <div id="sgList" style="margin-top:8px"></div>
    <div class="actions"><button class="btn sec" id="cancel">Cancel</button><button class="btn" id="sgAdd">Add selected</button></div>`,
  el => {
    const sel = el.querySelector('#sgKey'); sel.value = suggestKeyFor(a && a.name);
    const draw = () => {
      el.querySelector('#sgList').innerHTML = SUGGEST[sel.value].map(([t, iv], i) => {
        const dup = have.has(t.toLowerCase());
        return `<label class="pick"><input type="checkbox" data-i="${i}" ${dup ? 'disabled checked' : ''}><span><b>${esc(t)}</b><span class="small"> · ${esc(label(iv))}${dup ? ' · already added' : ''}</span></span></label>`;
      }).join('');
    };
    sel.onchange = draw; draw();
    el.querySelector('#cancel').onclick = el.close;
    el.querySelector('#sgAdd').onclick = async () => {
      const picks = [...el.querySelectorAll('#sgList input:checked:not(:disabled)')].map(c => SUGGEST[sel.value][+c.dataset.i]);
      if (!picks.length) return toast('Tick at least one task');
      for (const [title, iv] of picks) await api('POST', '/api/tasks', { areaId, title, intervalMonths: iv, nextDue: addMonths(today(), parseInt(iv, 10)) });
      el.close(); await load(); render(); toast(picks.length + (picks.length === 1 ? ' task added' : ' tasks added'));
    };
  });
}

// ---------- Home info (shutoffs, paint, sizes, contacts) ----------
const FACT_CATS = [['Shutoffs', '🚨'], ['Paint & finishes', '🎨'], ['Sizes & specs', '📐'], ['Contacts', '📞'], ['Codes & access', '🔑'], ['Other', '📝']];
const FACT_QUICK = {
  'Shutoffs': ['Main water shutoff', 'Gas shutoff', 'Electrical panel (main breaker)', 'Water heater shutoff', 'Irrigation shutoff', 'Furnace power switch', 'Washing machine valves'],
  'Paint & finishes': ['Living room paint', 'Kitchen paint', 'Bedroom paint', 'Exterior paint', 'Trim paint', 'Cabinet finish', 'Flooring'],
  'Sizes & specs': ['Furnace filter size', 'Fridge water filter model', 'Light bulb types', 'Smoke alarm model', 'Garage door opener model'],
  'Contacts': ['Plumber', 'Electrician', 'HVAC company', 'Handyman', 'Insurance agent', 'Utility company', 'HOA / property manager'],
  'Codes & access': ['Alarm code', 'Garage keypad code', 'Wi-Fi network and password', 'Lockbox code'],
  'Other': [],
};
const factIcon = c => (FACT_CATS.find(x => x[0] === c) || FACT_CATS[5])[1];
const factPhotos = f => S.documents.filter(d => d.factId === f.id);

function factRow(f) {
  const n = factPhotos(f).length;
  return `<div class="row" data-fact="${f.id}"><div class="thumb">${factIcon(f.category)}</div><div class="grow"><div class="t">${esc(f.title)}</div><div class="s">${esc(f.value || f.notes || '')}</div></div>${n ? '<span class="pill">📷 ' + n + '</span>' : ''}</div>`;
}
function renderInfo() {
  const facts = S.facts.slice().sort((a, b) => String(a.title).localeCompare(String(b.title)));
  if (!facts.length) return `<div class="empty"><div class="big">🆘</div><p>Keep the things you need in a hurry in one place:<br>where the water, gas and power shut off (with photos), paint colors, filter sizes, who to call.</p><button class="btn" id="fabFact2">Add your first item</button></div><button class="fab" id="fabFact">+</button>`;
  let h = '';
  for (const [cat, ic] of FACT_CATS) {
    const list = facts.filter(f => (FACT_CATS.some(c => c[0] === f.category) ? f.category : 'Other') === cat); if (!list.length) continue;
    h += cat === 'Shutoffs' ? `<div class="banner bad" style="margin-top:6px"><b>${ic} In an emergency</b></div>` : `<h2>${ic} ${esc(cat)}</h2>`;
    h += list.map(factRow).join('');
  }
  return h + '<button class="fab" id="fabFact">+</button>';
}

function factForm(f) {
  f = f || {};
  let cat = f.category || 'Shutoffs';
  sheet(`<h3>${f.id ? 'Edit item' : 'Add to home info'}</h3>
    <label>Category</label><div class="chips" id="fcats">${FACT_CATS.map(([c, i]) => `<span class="chip${c === cat ? ' on' : ''}" data-c="${esc(c)}">${i} ${esc(c)}</span>`).join('')}</div>
    <label>What is it</label><input name="title" value="${esc(f.title)}" placeholder="e.g. Main water shutoff"><div class="chips" id="fq"></div>
    <label>Where / details</label><input name="value" value="${esc(f.value)}" placeholder="e.g. Basement, behind the furnace, blue handle">
    <label>Notes</label><textarea name="notes">${esc(f.notes)}</textarea>
    ${f.id ? '' : '<label>Photos (optional)</label><input type="file" name="file" accept="image/*" multiple>'}
    ${cat === 'Codes & access' || !f.id ? '<p class="small" id="codeNote" style="display:none">Codes are stored only on your phone and your own server, and they are left out of printed reports.</p>' : ''}
    <div class="actions">${f.id ? '<button class="btn bad" id="del">Delete</button>' : ''}<button class="btn sec" id="cancel">Cancel</button><button class="btn" id="ok">Save</button></div>`,
  el => {
    const paintQuick = () => {
      el.querySelector('#fq').innerHTML = (FACT_QUICK[cat] || []).map(q => `<span class="chip">${esc(q)}</span>`).join('');
      const n = el.querySelector('#codeNote'); if (n) n.style.display = cat === 'Codes & access' ? '' : 'none';
    };
    paintQuick();
    el.querySelector('#fcats').onclick = e => { const c = e.target.closest('[data-c]'); if (!c) return; cat = c.dataset.c; el.querySelectorAll('#fcats .chip').forEach(x => x.classList.toggle('on', x.dataset.c === cat)); paintQuick(); };
    el.querySelector('#fq').onclick = e => { if (e.target.classList.contains('chip')) el.querySelector('[name=title]').value = e.target.textContent; };
    el.querySelector('#cancel').onclick = el.close;
    if (f.id) el.querySelector('#del').onclick = async () => { if (!confirm('Delete this item and its photos?')) return; await api('DELETE', '/api/facts/' + f.id); el.close(); await load(); render(); toast('Deleted'); };
    el.querySelector('#ok').onclick = async () => {
      const title = val(el, 'title'); if (!title) return toast('What is it?');
      const body = { category: cat, title, value: val(el, 'value'), notes: val(el, 'notes') };
      const rec = f.id ? await api('PUT', '/api/facts/' + f.id, body) : await api('POST', '/api/facts', body);
      const fi = el.querySelector('[name=file]');
      if (fi) { el.querySelector('#ok').disabled = true; for (const file of fi.files) await uploadDoc(file, { factId: rec.id, areaId: '', category: 'Photo', title: file.name }); }
      el.close(); await load(); render(); toast('Saved');
    };
  });
}
function factView(f) {
  if (!f) return;
  const ph = factPhotos(f);
  sheet(`<h3>${factIcon(f.category)} ${esc(f.title)}</h3>
    <dl class="kv"><dt>Category</dt><dd>${esc(f.category || '')}</dd>${f.value ? '<dt>Where</dt><dd>' + esc(f.value) + '</dd>' : ''}${f.notes ? '<dt>Notes</dt><dd>' + esc(f.notes) + '</dd>' : ''}</dl>
    ${ph.length ? '<h2>Photos</h2><div class="phs">' + ph.map(d => (d.mime || '').startsWith('image/') ? `<img data-doc="${d.id}" src="${fileUrl(d.fileId)}">` : `<div class="thumb" data-doc="${d.id}">📄</div>`).join('') + '</div>' : ''}
    <div class="actions"><button class="btn sec" id="addPh">📷 Add photo</button><button class="btn" id="edit">Edit</button></div>`,
  el => {
    el.querySelector('#edit').onclick = () => { el.close(); factForm(f); };
    el.querySelector('#addPh').onclick = () => { el.close(); attachFilesSheet({ title: 'Add photos to ' + f.title, meta: { factId: f.id, areaId: '' }, cats: ['Photo'], accept: 'image/*' }); };
    el.querySelectorAll('[data-doc]').forEach(x => x.onclick = ev => { ev.stopPropagation(); el.close(); docView(S.documents.find(d => d.id === x.dataset.doc)); });
  });
}
// Small reusable "choose files and attach" sheet (project photos, fact photos).
function attachFilesSheet(o) {
  sheet(`<h3>${esc(o.title)}</h3>
    <label>File(s)</label><input type="file" name="file" multiple ${o.accept ? 'accept="' + o.accept + '"' : ''}>
    ${o.cats.length > 1 ? '<label>Type</label><select name="cat">' + o.cats.map(c => '<option>' + esc(c) + '</option>').join('') + '</select>' : '<input type="hidden" name="cat" value="' + esc(o.cats[0]) + '">'}
    <div class="actions"><button class="btn sec" id="cancel">Cancel</button><button class="btn" id="ok">Add</button></div>`,
  el => {
    el.querySelector('#cancel').onclick = el.close;
    el.querySelector('#ok').onclick = async () => {
      const files = el.querySelector('[name=file]').files; if (!files.length) return toast('Choose a file');
      el.querySelector('#ok').disabled = true; el.querySelector('#ok').textContent = 'Uploading…';
      for (const f of files) await uploadDoc(f, Object.assign({}, o.meta, { category: val(el, 'cat'), title: f.name }));
      el.close(); await load(); render(); toast('Added');
    };
  });
}

// ---------- Projects ----------
const PSTATUS = { planned: '📝 Planned', active: '🚧 In progress', done: '✅ Done' };
const projSpent = p => S.records.filter(r => r.projectId === p.id).reduce((s, r) => s + recCost(r), 0);
const projPct = p => { const c = p.checklist || []; return c.length ? Math.round(100 * c.filter(x => x.done).length / c.length) : null; };
const bar = pct => pct == null ? '' : `<div class="prog"><div style="width:${pct}%"></div></div>`;

function renderProjects() {
  const f = view.pf || 'active';
  const list = S.projects.filter(p => f === 'all' || (p.status || 'planned') === f).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  let h = '<div class="chips">' + [['active', 'In progress'], ['planned', 'Planned'], ['done', 'Done'], ['all', 'All']].map(([k, l]) => `<span class="chip ${f === k ? 'on' : ''}" data-pf="${k}">${l}</span>`).join('') + '</div>';
  h += list.length ? list.map(p => {
    const a = areaOf(p.areaId), spent = projSpent(p), pc = projPct(p);
    return `<div class="row" data-proj="${p.id}"><div class="thumb">🏗️</div><div class="grow"><div class="t">${esc(p.title)}</div>
      <div class="s">${esc(PSTATUS[p.status || 'planned'])}${a ? ' · ' + esc(a.name) : ''}${spent ? ' · ' + money(spent) + (num(p.budget) ? ' of ' + money(num(p.budget)) : '') : (num(p.budget) ? ' · budget ' + money(num(p.budget)) : '')}</div>${bar(pc)}</div></div>`;
  }).join('') : `<div class="empty"><div class="big">🏗️</div><p>Bigger jobs live here: a new deck, a bathroom remodel, a roof.<br>Track the steps, the cost, the work done, and before / after photos.</p></div>`;
  return h + '<button class="fab" id="fabProj">+</button>';
}

function projectForm(p) {
  p = p || {};
  let status = p.status || 'planned';
  const areaOpts = '<option value="">Whole home</option>' + S.areas.map(a => `<option value="${a.id}"${(p.areaId || '') === a.id ? ' selected' : ''}>${esc(a.icon + ' ' + a.name)}</option>`).join('');
  sheet(`<h3>${p.id ? 'Edit project' : 'New project'}</h3>
    <label>Project</label><input name="title" value="${esc(p.title)}" placeholder="e.g. Replace deck, Kitchen remodel">
    <label>Status</label><div class="chips" id="pst">${Object.entries(PSTATUS).map(([k, l]) => `<span class="chip${k === status ? ' on' : ''}" data-s="${k}">${l}</span>`).join('')}</div>
    <label>Area</label><select name="area">${areaOpts}</select>
    <label>Start date</label><input type="date" name="start" value="${esc(p.startDate || '')}">
    <label>Finish date</label><input type="date" name="end" value="${esc(p.endDate || '')}">
    <label>Budget (optional)</label><input name="budget" inputmode="decimal" value="${p.budget ? esc(p.budget) : ''}" placeholder="0.00">
    <label>Steps (one per line)</label><textarea name="steps" placeholder="Get quotes&#10;Order materials&#10;Demo&#10;Install">${esc((p.checklist || []).map(x => x.t).join('\n'))}</textarea>
    <label>Notes</label><textarea name="notes">${esc(p.notes)}</textarea>
    <div class="actions"><button class="btn sec" id="cancel">Cancel</button><button class="btn" id="ok">Save</button></div>`,
  el => {
    el.querySelector('#pst').onclick = e => { const s = e.target.dataset.s; if (!s) return; status = s; el.querySelectorAll('#pst .chip').forEach(c => c.classList.toggle('on', c.dataset.s === s)); };
    el.querySelector('#cancel').onclick = el.close;
    el.querySelector('#ok').onclick = async () => {
      const title = val(el, 'title'); if (!title) return toast('Name the project');
      const old = new Map((p.checklist || []).map(x => [x.t, x.done]));
      const checklist = val(el, 'steps').split('\n').map(x => x.trim()).filter(Boolean).map(t => ({ t, done: !!old.get(t) }));
      const body = { title, status, areaId: val(el, 'area'), startDate: val(el, 'start'), endDate: val(el, 'end'), budget: val(el, 'budget') ? num(val(el, 'budget')) : '', notes: val(el, 'notes'), checklist };
      if (status === 'done' && !body.endDate) body.endDate = today();
      const rec = p.id ? await api('PUT', '/api/projects/' + p.id, body) : await api('POST', '/api/projects', body);
      el.close(); await load();
      if (!p.id) go({ name: 'project', id: rec.id }); else render();
    };
  });
}

function renderProject() {
  const p = S.projects.find(x => x.id === view.id); if (!p) { view = { name: 'projects' }; return renderProjects(); }
  const a = areaOf(p.areaId), recs = S.records.filter(r => r.projectId === p.id).sort((x, y) => x.date < y.date ? 1 : -1);
  const docs = S.documents.filter(d => d.projectId === p.id);
  const imgs = docs.filter(d => (d.mime || '').startsWith('image/')), others = docs.filter(d => !(d.mime || '').startsWith('image/'));
  const spent = projSpent(p), budget = num(p.budget), pc = projPct(p);
  let h = `<div class="hero"><div class="bigic">🏗️</div><div class="grow"><div class="small">${a ? esc(a.icon + ' ' + a.name) : 'Whole home'}${p.startDate ? ' · started ' + fmt(p.startDate) : ''}${p.endDate ? ' · finish ' + fmt(p.endDate) : ''}</div></div><button class="btn sec sm" id="editProj">Edit</button></div>`;
  h += '<div class="chips">' + Object.entries(PSTATUS).map(([k, l]) => `<span class="chip ${(p.status || 'planned') === k ? 'on' : ''}" data-pstatus="${k}">${l}</span>`).join('') + '</div>';
  if (spent || budget) {
    const over = budget && spent > budget;
    h += `<div class="card" style="margin:8px 0"><div class="two"><div><div class="small">Spent</div><div class="big2" ${over ? 'style="color:var(--bad)"' : ''}>${money(spent)}</div></div><div><div class="small">Budget</div><div class="big2">${budget ? money(budget) : '—'}</div></div></div>${budget ? bar(Math.min(100, Math.round(100 * spent / budget))) : ''}</div>`;
  }
  if (p.notes) h += `<div class="card" style="margin:8px 0">${esc(p.notes)}</div>`;
  h += '<h2>Steps' + (pc != null ? ' · ' + pc + '%' : '') + '</h2>';
  h += (p.checklist || []).length ? (p.checklist || []).map((x, i) => `<label class="pick"><input type="checkbox" data-chk="${i}" ${x.done ? 'checked' : ''}><span style="${x.done ? 'text-decoration:line-through;color:var(--mut)' : ''}">${esc(x.t)}</span></label>`).join('') : '<div class="small">No steps yet. Add some with Edit.</div>';
  h += '<h2>Photos</h2>';
  if (imgs.length) {
    for (const cat of ['Before', 'Progress', 'After']) {
      const g = imgs.filter(d => d.category === cat); if (!g.length) continue;
      h += `<div class="small" style="margin:6px 0 4px">${cat}</div><div class="phs">${g.map(d => `<img data-doc="${d.id}" src="${fileUrl(d.fileId)}">`).join('')}</div>`;
    }
    const rest = imgs.filter(d => !['Before', 'Progress', 'After'].includes(d.category));
    if (rest.length) h += `<div class="phs" style="margin-top:8px">${rest.map(d => `<img data-doc="${d.id}" src="${fileUrl(d.fileId)}">`).join('')}</div>`;
  } else h += '<div class="small">No photos yet.</div>';
  h += '<div class="actions"><button class="btn sec" id="projPhoto">📷 Add photos</button><button class="btn sec" id="projFile">📎 Add receipt / file</button></div>';
  if (others.length) h += '<h2>Files & receipts</h2>' + others.map(docRow).join('');
  h += '<h2>Work & costs</h2>' + (recs.length ? recs.map(recRow).join('') : '<div class="small">Nothing logged for this project yet.</div>');
  h += '<div class="actions"><button class="btn" id="projLog">+ Log work</button><button class="btn bad" id="delProj">Delete</button></div>';
  return h;
}

// ---------- Receipt scanning (Android app: on-device text recognition) ----------
const OCR = () => LOCAL && typeof AndroidBridge.ocrBegin === 'function';
const ocrWaiters = {};
window.__ocrDone = (id, text, err) => { const w = ocrWaiters[id]; if (w) { delete ocrWaiters[id]; w({ text, err }); } };
// Straighten (camera photos carry a rotation flag) and shrink the photo before sending it for reading.
async function prepImage(file) {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const k = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    return (await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9))) || file;
  } catch (e) { return file; }
}
async function ocrImage(file) {
  const id = rid() + rid();
  const img = await prepImage(file);
  AndroidBridge.ocrBegin(id);
  await eachB64(img, c => AndroidBridge.ocrBody(id, c));
  const done = new Promise(res => { ocrWaiters[id] = res; });
  AndroidBridge.ocrRun(id);
  const { text, err } = await done;
  if (err) throw new Error(err);
  return text || '';
}
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
function parseReceipt(text) {
  const lines = String(text || '').split(/\r?\n/).map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const out = { vendor: '', date: '', total: 0 };
  const yearNow = new Date().getFullYear();
  const iso = (y, m, d) => {
    y = +y; m = +m; d = +d; if (y < 100) y += 2000;
    if (y < 2000 || y > yearNow + 1 || m < 1 || m > 12 || d < 1 || d > 31) return '';
    return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  };
  // vendor: first reasonable line near the top
  for (const l of lines.slice(0, 8)) {
    if (!/[A-Za-z]{3,}/.test(l) || l.length > 40) continue;
    if (/^(receipt|invoice|order|thank|welcome|tel|phone|store|date|www\.|http|cashier|register|sale)\b/i.test(l) || /\d{3}[-. ]\d{3,4}/.test(l) || /@/.test(l)) continue;
    out.vendor = (l === l.toUpperCase() ? l.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase()) : l).replace(/[^A-Za-z0-9&'.,\- ]/g, '').trim();
    if (out.vendor) break;
  }
  // date
  for (const l of lines) {
    let m;
    if ((m = l.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/))) { out.date = iso(m[1], m[2], m[3]); }
    else if ((m = l.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2}|\d{2})\b/))) { let a = +m[1], b = +m[2]; if (a > 12 && b <= 12) [a, b] = [b, a]; out.date = iso(m[3], a, b); }
    else if ((m = l.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d{2})\b/i))) { out.date = iso(m[3], MONTHS.indexOf(m[1].toLowerCase()) + 1, m[2]); }
    if (out.date) break;
  }
  // total
  const amounts = l => [...l.matchAll(/(?:\$\s*)?(\d{1,3}(?:,\d{3})+|\d+)[.,](\d{2})\b/g)].map(m => parseFloat(m[1].replace(/,/g, '') + '.' + m[2]));
  let best = 0, anyMax = 0;
  lines.forEach((l, i) => {
    let a = amounts(l);
    const isTotal = /\b(grand\s*total|total\s*due|amount\s*due|balance\s*due|order\s*total|total)\b/i.test(l) && !/sub\s*-?\s*total|tax|saving|discount|change|tender|points/i.test(l);
    if (isTotal && !a.length && lines[i + 1]) a = amounts(lines[i + 1]);
    if (isTotal && a.length) best = Math.max(best, ...a);
    if (!/change|cash|tender|card|saving|discount/i.test(l) && a.length) anyMax = Math.max(anyMax, ...a);
  });
  out.total = best || anyMax || 0;
  return out;
}
const scanBtn = () => OCR() ? '<button type="button" class="btn sec sm" id="scan" style="margin-top:6px">✨ Read receipt from the photo</button><div class="small" id="scanNote"></div>' : '';
function wireScan(el, fill) {
  const b = el.querySelector('#scan'); if (!b) return;
  b.onclick = async () => {
    const f = [...(el.querySelector('[name=file]').files || [])].find(x => (x.type || '').startsWith('image/'));
    if (!f) return toast('Choose a photo of the receipt first');
    b.disabled = true; const old = b.textContent; b.textContent = 'Reading…';
    try {
      const r = parseReceipt(await ocrImage(f));
      const got = fill(r);
      el.querySelector('#scanNote').textContent = got.length ? 'Filled in: ' + got.join(', ') + '. Please check it.' : "Couldn't find anything to fill in. You can type it in.";
    } catch (e) { toast('Could not read the receipt'); }
    b.disabled = false; b.textContent = old;
  };
}

// ---------- History report (print / save as PDF) ----------
function renderReport() {
  const o = view.rep = Object.assign({ area: '', photos: true, costs: true }, view.rep);
  const areas = o.area ? S.areas.filter(a => a.id === o.area) : S.areas.slice().sort((a, b) => (a.order ?? 1e9) - (b.order ?? 1e9));
  const inScope = r => !o.area || r.areaId === o.area;
  const recs = S.records.filter(inScope);
  const sp = spend(recs);
  const imgOk = d => (d.mime || '').startsWith('image/');
  const recRows = list => list.sort((x, y) => x.date < y.date ? 1 : -1).map(r => {
    const docs = S.documents.filter(d => d.recordId === r.id);
    const imgs = o.photos ? docs.filter(imgOk) : [], files = docs.filter(d => !(o.photos && imgOk(d)));
    return `<tr><td class="nw">${fmt(r.date)}</td><td class="nw">${esc(REC_TYPES[r.type] || '')}</td><td><b>${esc(r.title)}</b>${r.vendor ? '<br>' + esc(r.vendor) : ''}${r.parts ? '<br><i>' + esc(r.parts) + '</i>' : ''}${r.notes ? '<br>' + esc(r.notes) : ''}
      ${imgs.length ? '<div class="rimgs">' + imgs.map(d => `<img src="${fileUrl(d.fileId)}">`).join('') + '</div>' : ''}${files.length ? '<div class="small">📎 ' + files.map(d => esc(d.title)).join(', ') + '</div>' : ''}</td>${o.costs ? `<td class="nw r">${recCost(r) ? money(recCost(r)) : ''}</td>` : ''}</tr>`;
  }).join('');
  const th = o.costs ? '<th>Date</th><th>Type</th><th>Work</th><th class="r">Cost</th>' : '<th>Date</th><th>Type</th><th>Work</th>';
  let h = `<div class="noprint"><div class="card"><label style="margin-top:0">Report for</label><select id="repArea"><option value="">The whole home</option>${S.areas.map(a => `<option value="${a.id}"${o.area === a.id ? ' selected' : ''}>${esc(a.icon + ' ' + a.name)}</option>`).join('')}</select>
    <label class="pick"><input type="checkbox" id="repPh" ${o.photos ? 'checked' : ''}><span>Include photos</span></label><label class="pick"><input type="checkbox" id="repCost" ${o.costs ? 'checked' : ''}><span>Include costs</span></label>
    <div class="actions"><button class="btn" id="printRep">🖨️ Print / Save as PDF</button></div></div></div>`;
  h += `<div class="rep"><h1>Home maintenance report</h1><div class="small">${o.area ? esc((areaOf(o.area) || {}).name || '') + ' · ' : ''}Prepared ${fmt(today())}</div>
    <div class="two" style="margin:10px 0"><div><b>${areas.length}</b> ${areas.length === 1 ? 'area' : 'areas'}</div><div><b>${recs.length}</b> work entries</div>${o.costs && sp.all ? `<div><b>${money(sp.all)}</b> spent</div>` : ''}</div>`;
  if (!o.area) {
    const facts = S.facts.filter(f => f.category !== 'Codes & access').sort((a, b) => String(a.title).localeCompare(String(b.title)));
    if (facts.length) h += '<h2>Home information</h2><table>' + facts.map(f => `<tr><td class="nw"><b>${esc(f.title)}</b></td><td>${esc([f.category, f.value, f.notes].filter(Boolean).join(' · '))}</td></tr>`).join('') + '</table>';
  }
  for (const a of areas) {
    const d = a.details || {}, filled = DETAIL_FIELDS.filter(([k]) => d[k]);
    const arecs = S.records.filter(r => r.areaId === a.id), tasks = S.tasks.filter(t => t.areaId === a.id);
    const docs = S.documents.filter(x => x.areaId === a.id && !x.recordId && !x.projectId && !x.factId);
    h += `<h2>${esc(a.icon)} ${esc(a.name)}</h2>`;
    if (filled.length) h += '<table>' + filled.map(([k, l]) => `<tr><td class="nw">${l}</td><td>${esc(d[k])}</td></tr>`).join('') + '</table>';
    if (tasks.length) h += '<h3>Maintenance schedule</h3><table>' + tasks.map(t => `<tr><td><b>${esc(t.title)}</b></td><td class="nw">${t.intervalMonths ? 'every ' + (t.intervalMonths % 12 === 0 ? t.intervalMonths / 12 + ' yr' : t.intervalMonths + ' mo') : 'one-time'}</td><td class="nw">${t.lastDone ? 'last ' + fmt(t.lastDone) : ''}</td><td class="nw">${t.nextDue ? 'next ' + fmt(t.nextDue) : ''}</td></tr>`).join('') + '</table>';
    if (arecs.length) h += `<h3>Work history</h3><table><tr>${th}</tr>${recRows(arecs)}</table>`;
    if (docs.length) h += '<h3>Documents</h3><table>' + docs.map(x => `<tr><td><b>${esc(x.title)}</b></td><td>${esc(x.category || '')}</td><td class="nw">${x.expires ? 'until ' + fmt(x.expires) : ''}</td></tr>`).join('') + '</table>';
  }
  const projs = S.projects.filter(p => !o.area || p.areaId === o.area);
  if (projs.length) {
    h += '<h2>Projects</h2>' + projs.map(p => {
      const imgs = o.photos ? S.documents.filter(d => d.projectId === p.id && imgOk(d)) : [];
      const pr = S.records.filter(r => r.projectId === p.id);
      return `<h3>${esc(p.title)} <span class="small">· ${esc(PSTATUS[p.status || 'planned'])}${p.endDate ? ' · ' + fmt(p.endDate) : ''}${o.costs && projSpent(p) ? ' · ' + money(projSpent(p)) : ''}</span></h3>
        ${p.notes ? '<div>' + esc(p.notes) + '</div>' : ''}${(p.checklist || []).length ? '<div class="small">' + p.checklist.map(x => (x.done ? '☑ ' : '☐ ') + esc(x.t)).join(' &nbsp; ') + '</div>' : ''}
        ${pr.length ? `<table><tr>${th}</tr>${recRows(pr)}</table>` : ''}${imgs.length ? '<div class="rimgs">' + imgs.map(d => `<img src="${fileUrl(d.fileId)}">`).join('') + '</div>' : ''}`;
    }).join('');
  }
  return h + '</div>';
}
async function printReport() {
  const imgs = [...document.querySelectorAll('.rep img')];
  await Promise.race([Promise.all(imgs.map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; }))), new Promise(r => setTimeout(r, 6000))]);
  if (LOCAL && typeof AndroidBridge.printPage === 'function') AndroidBridge.printPage('HomeLogger report'); else window.print();
}

// ---------- Search additions ----------
function searchExtra(q) {
  const m = (...f) => f.some(x => String(x || '').toLowerCase().includes(q));
  const facts = S.facts.filter(f => m(f.title, f.value, f.notes, f.category));
  const projs = S.projects.filter(p => m(p.title, p.notes));
  let h = '';
  if (facts.length) h += '<h2>Home info</h2>' + facts.map(factRow).join('');
  if (projs.length) h += '<h2>Projects</h2>' + projs.map(p => `<div class="row" data-proj="${p.id}"><div class="thumb">🏗️</div><div class="grow"><div class="t">${esc(p.title)}</div><div class="s">${esc(PSTATUS[p.status || 'planned'])}</div></div></div>`).join('');
  return h;
}

// ---------- Events for these screens ----------
document.addEventListener('click', async e => {
  const t = e.target, q = s => t.closest(s); let el;
  if ((el = q('[data-go]'))) return go({ name: el.dataset.go });
  if ((el = q('[data-fact]'))) return factView(S.facts.find(x => x.id === el.dataset.fact));
  if ((el = q('[data-proj]'))) return go({ name: 'project', id: el.dataset.proj });
  if ((el = q('[data-pf]'))) { view.pf = el.dataset.pf; return render(); }
  if (q('#fabFact') || q('#fabFact2')) return factForm();
  if (q('#fabProj')) return projectForm();
  if (q('#suggestTasks')) return suggestSheet(view.id);
  if (q('#editProj')) return projectForm(S.projects.find(x => x.id === view.id));
  if ((el = q('[data-pstatus]'))) {
    const p = S.projects.find(x => x.id === view.id), body = { status: el.dataset.pstatus };
    if (body.status === 'done' && !p.endDate) body.endDate = today();
    await api('PUT', '/api/projects/' + p.id, body); await load(); return render();
  }
  if ((el = q('[data-chk]'))) {
    const p = S.projects.find(x => x.id === view.id), list = (p.checklist || []).map(x => Object.assign({}, x));
    list[+el.dataset.chk].done = !list[+el.dataset.chk].done;
    await api('PUT', '/api/projects/' + p.id, { checklist: list }); await load(); return render();
  }
  if (q('#projPhoto')) { const p = S.projects.find(x => x.id === view.id); return attachFilesSheet({ title: 'Add photos', meta: { projectId: p.id, areaId: p.areaId || '' }, cats: ['Before', 'Progress', 'After'], accept: 'image/*' }); }
  if (q('#projFile')) { const p = S.projects.find(x => x.id === view.id); return attachFilesSheet({ title: 'Add receipt / file', meta: { projectId: p.id, areaId: p.areaId || '' }, cats: ['Receipt', 'Contract', 'Permit', 'Warranty', 'Manual', 'Other'] }); }
  if (q('#projLog')) { const p = S.projects.find(x => x.id === view.id); return recordForm(p.areaId || '', null, { projectId: p.id, type: 'upgrade' }); }
  if (q('#delProj')) {
    const p = S.projects.find(x => x.id === view.id);
    if (!confirm('Delete "' + p.title + '" with its photos and files? Work entries stay in the history.')) return;
    await api('DELETE', '/api/projects/' + p.id); await load(); view = stack.pop() || { name: 'projects' }; render(); return toast('Project deleted');
  }
  if (q('#printRep')) return printReport();
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'repArea') { view.rep.area = t.value; render(); }
  else if (t.id === 'repPh') { view.rep.photos = t.checked; render(); }
  else if (t.id === 'repCost') { view.rep.costs = t.checked; render(); }
});
