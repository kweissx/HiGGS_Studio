// Higgsfield Studio front end. Talks only to the local server (server.js),
// which holds the API key. The key never reaches this page.

const $ = (sel) => document.querySelector(sel);
const state = { kind: 'image', model: null, uploads: {}, renderers: {}, polling: new Set(), estimateTimer: null, estimateSeq: 0 };

// ---------- Small helpers ----------

async function api(path, options = {}) {
  const resp = await fetch(path, options);
  let data = {};
  try { data = await resp.json(); } catch {}
  if (!resp.ok) throw new Error(data.error || `Request failed (${resp.status})`);
  return data;
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null) node.append(c);
  return node;
}

function timeAgo(iso) {
  const s = Math.round((Date.now() - new Date(iso)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
}

// ---------- Settings (API key) ----------

function applyStudioName(name) {
  $('#brandName').textContent = name;
  document.title = name;
  $('#studioName').value = name;
}

async function refreshKeyBadge() {
  const s = await api('/api/settings');
  applyStudioName(s.studioName);
  const badge = $('#keyBadge');
  badge.textContent = s.configured ? `Key ${s.keyIdPreview}` : 'No API key';
  badge.classList.toggle('ok', s.configured);
  return s;
}

function setupSettings() {
  const dlg = $('#settings');
  const msg = $('#settingsMsg');
  $('#openSettings').onclick = () => { msg.textContent = ''; dlg.showModal(); };
  $('#keyBadge').onclick = () => dlg.showModal();

  $('#brandName').onclick = () => { msg.textContent = ''; dlg.showModal(); $('#studioName').focus(); };

  $('#saveKey').onclick = async () => {
    msg.textContent = 'Saving…';
    try {
      await api('/api/studio-name', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: $('#studioName').value }),
      });
      if (!$('#keyId').value.trim() && !$('#keySecret').value.trim()) {
        await refreshKeyBadge();
        msg.textContent = 'Saved.';
        return;
      }
      await api('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyId: $('#keyId').value, keySecret: $('#keySecret').value }),
      });
      $('#keyId').value = '';
      $('#keySecret').value = '';
      await refreshKeyBadge();
      const t = await api('/api/settings/test', { method: 'POST' });
      msg.textContent = t.ok ? 'Saved. ' + t.message : 'Saved, but: ' + t.message;
    } catch (e) {
      msg.textContent = e.message;
    }
  };

  $('#testKey').onclick = async () => {
    msg.textContent = 'Checking…';
    try {
      const t = await api('/api/settings/test', { method: 'POST' });
      msg.textContent = t.message;
    } catch (e) {
      msg.textContent = e.message;
    }
  };
}

// ---------- Model picker and form ----------

function modelsForKind(kind) {
  return window.MODELS.filter((m) => m.kind === kind);
}

function selectKind(kind) {
  state.kind = kind;
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.kind === kind));
  const sel = $('#modelSelect');
  sel.innerHTML = '';
  for (const m of modelsForKind(kind)) sel.append(el('option', { value: m.id }, m.name));
  sel.parentElement.hidden = kind === 'custom';
  selectModel(sel.value);
}

function selectModel(id) {
  const model = window.MODELS.find((m) => m.id === id);
  state.model = model;
  state.uploads = {};
  state.renderers = {};
  $('#modelBlurb').innerHTML = '';
  $('#modelBlurb').append(model.blurb + ' ', el('a', { href: model.docs, target: '_blank', rel: 'noopener' }, 'Docs ↗'));
  $('#formError').hidden = true;

  const main = $('#fields');
  const adv = $('#advancedFields');
  main.innerHTML = '';
  adv.innerHTML = '';
  const fields = model.custom ? customFields() : model.fields;
  for (const f of fields) (f.advanced ? adv : main).append(renderField(f));
  if (model.shapeNote) main.append(el('div', { class: 'field' }, el('span', {}, 'Shape'), el('p', { class: 'hint small note' }, model.shapeNote)));

  // Models with a start and an end image get a button to swap them.
  const singles = fields.filter((f) => f.type === 'image');
  if (singles.length >= 2) {
    const [a, b] = singles;
    const swap = el('button', { type: 'button', class: 'btn small ghost swap', onclick: () => {
      [state.uploads[a.name], state.uploads[b.name]] = [state.uploads[b.name], state.uploads[a.name]];
      for (const k of [a.name, b.name]) if (state.uploads[k] == null) delete state.uploads[k];
      state.renderers[a.name]();
      state.renderers[b.name]();
      scheduleEstimate();
    } }, `⇅ Swap ${a.label.toLowerCase().replace(/ \(.*\)/, '')} and ${b.label.toLowerCase().replace(/ \(.*\)/, '')}`);
    const target = main.querySelector(`[data-field="${b.name}"]`);
    if (target) target.after(swap);
  }
  $('#advanced').hidden = !adv.children.length;
  scheduleEstimate();
}

function customFields() {
  return [
    { name: '__path', label: 'Endpoint (from the model\'s docs page, e.g. /kling-video/v3.0/pro/text-to-video)', type: 'text', required: true, placeholder: '/vendor/model/workflow' },
    { name: 'prompt', label: 'Prompt', type: 'prompt' },
    { name: '__image_field', label: 'Name of the image setting (if you add an image)', type: 'text', default: 'image_url' },
    { name: '__image', label: 'Image (optional)', type: 'image' },
    { name: '__json', label: 'Other settings as JSON (optional), e.g. {"duration": 5, "aspect_ratio": "16:9"}', type: 'json' },
  ];
}

function renderField(f) {
  const id = `f_${f.name}`;
  const label = f.label;
  switch (f.type) {
    case 'prompt':
      return el('label', { class: 'field' }, el('span', {}, label),
        el('textarea', { id, name: f.name, placeholder: 'Describe what you want to see…', required: f.required }));
    case 'text':
      return el('label', { class: 'field' }, el('span', {}, label),
        el('input', { id, name: f.name, type: 'text', value: f.default ?? '', placeholder: f.placeholder, required: f.required, spellcheck: 'false' }));
    case 'json':
      return el('label', { class: 'field' }, el('span', {}, label),
        el('textarea', { id, name: f.name, placeholder: '{ }', spellcheck: 'false', style: 'min-height:80px;font-family:monospace' }));
    case 'number':
      return el('label', { class: 'field' }, el('span', {}, label),
        el('input', { id, name: f.name, type: 'number', min: f.min, max: f.max, step: f.step || 1, value: f.default ?? '' }));
    case 'select': {
      if (f.name === 'aspect_ratio') return renderAspect(f);
      const s = el('select', { id, name: f.name });
      for (const o of f.options) s.append(el('option', { value: o, selected: o === f.default }, String(o)));
      return el('label', { class: 'field' }, el('span', {}, label), s);
    }
    case 'bool':
      return el('label', { class: 'check' }, el('input', { id, name: f.name, type: 'checkbox', checked: !!f.default }), label);
    case 'image':
    case 'images':
    case 'video':
      return renderUpload(f);
    case 'preset':
      return renderPresets(f);
  }
}

// Shape picker: one button per aspect ratio, each with a little preview of the shape.
function renderAspect(f) {
  const hidden = el('input', { type: 'hidden', name: f.name, value: f.default ?? f.options[0] });
  const row = el('div', { class: 'aspects' });
  for (const o of f.options) {
    let shape;
    if (o === 'auto') shape = el('span', { class: 'aspect-auto' }, 'A');
    else {
      const [w, h] = String(o).split(':').map(Number);
      const k = 22 / Math.max(w, h);
      shape = el('span', { class: 'aspect-box', style: `width:${Math.max(4, Math.round(w * k))}px;height:${Math.max(4, Math.round(h * k))}px` });
    }
    const btn = el('button', { type: 'button', class: 'aspect' + (o === hidden.value ? ' selected' : ''), title: o, onclick: () => {
      hidden.value = o;
      row.querySelectorAll('.aspect').forEach((b) => b.classList.toggle('selected', b === btn));
      scheduleEstimate();
    } }, el('span', { class: 'aspect-shape' }, shape), el('span', {}, o === 'auto' ? 'Auto' : o));
    row.append(btn);
  }
  return el('div', { class: 'field' }, el('span', {}, f.label), row, hidden);
}

async function uploadFiles(files) {
  const urls = [];
  for (const file of files) {
    const r = await api('/api/upload', { method: 'POST', headers: { 'Content-Type': file.type }, body: file });
    urls.push(r.url);
  }
  return urls;
}

// Upload area. Each uploaded file shows as a tile you can replace, remove or move left/right.
function renderUpload(f) {
  const multiple = f.type === 'images';
  const isVideo = f.type === 'video';
  const max = f.max || (multiple ? 10 : 1);
  const accept = isVideo ? 'video/mp4' : 'image/png,image/jpeg,image/webp,image/gif';
  const addInput = el('input', { type: 'file', accept, hidden: true, multiple });
  const replaceInput = el('input', { type: 'file', accept, hidden: true });
  const tiles = el('div', { class: 'tiles' });
  const box = el('div', { class: 'drop', tabindex: 0 });
  const status = el('p', { class: 'hint small upload-status', hidden: true });
  let replaceIndex = 0;

  const list = () => (multiple ? state.uploads[f.name] || [] : state.uploads[f.name] ? [state.uploads[f.name]] : []);
  const setList = (urls) => {
    if (!urls.length) delete state.uploads[f.name];
    else state.uploads[f.name] = multiple ? urls : urls[0];
    render();
    scheduleEstimate();
  };

  const render = () => {
    const urls = list();
    tiles.innerHTML = '';
    urls.forEach((u, i) => {
      const media = isVideo ? el('video', { src: u, muted: true, autoplay: true, loop: true, playsinline: true }) : el('img', { src: u, alt: '' });
      const move = (d) => { const next = [...urls]; [next[i], next[i + d]] = [next[i + d], next[i]]; setList(next); };
      tiles.append(el('div', { class: 'tile' + (isVideo ? ' wide' : '') }, media,
        multiple && urls.length > 1 ? el('span', { class: 'tile-num' }, String(i + 1)) : null,
        el('div', { class: 'tile-actions' },
          multiple && i > 0 ? el('button', { type: 'button', title: 'Move left', onclick: () => move(-1) }, '←') : null,
          multiple && i < urls.length - 1 ? el('button', { type: 'button', title: 'Move right', onclick: () => move(1) }, '→') : null,
          el('button', { type: 'button', title: 'Replace', onclick: () => { replaceIndex = i; replaceInput.click(); } }, '↻'),
          el('button', { type: 'button', title: 'Remove', onclick: () => setList(urls.filter((_, j) => j !== i)) }, '✕'))));
    });
    const room = max - urls.length;
    box.hidden = room <= 0;
    box.textContent = urls.length
      ? `+ Add more (${room} left)`
      : isVideo ? 'Click or drop an MP4 video here' : multiple ? `Click or drop images here (up to ${max})` : 'Click or drop an image here';
  };

  const add = async (files) => {
    files = [...files].slice(0, max - list().length);
    if (!files.length) return;
    status.hidden = false;
    status.textContent = 'Uploading…';
    try {
      const urls = await uploadFiles(files);
      setList([...list(), ...urls]);
      status.hidden = true;
    } catch (e) {
      status.textContent = e.message;
    }
  };

  const replace = async (file) => {
    if (!file) return;
    status.hidden = false;
    status.textContent = 'Uploading…';
    try {
      const [url] = await uploadFiles([file]);
      const next = [...list()];
      next[replaceIndex] = url;
      setList(next);
      status.hidden = true;
    } catch (e) {
      status.textContent = e.message;
    }
  };

  box.onclick = () => addInput.click();
  box.onkeydown = (e) => (e.key === 'Enter' || e.key === ' ') && addInput.click();
  addInput.onchange = () => { add(addInput.files); addInput.value = ''; };
  replaceInput.onchange = () => { replace(replaceInput.files[0]); replaceInput.value = ''; };
  box.ondragover = (e) => { e.preventDefault(); box.classList.add('drag'); };
  box.ondragleave = () => box.classList.remove('drag');
  box.ondrop = (e) => { e.preventDefault(); box.classList.remove('drag'); add(e.dataTransfer.files); };

  state.renderers[f.name] = render;
  render();
  return el('div', { class: 'field', 'data-field': f.name }, el('span', {}, f.label), tiles, box, status, addInput, replaceInput);
}

// A picker filled from Higgsfield's live style catalog (e.g. Genjutsu Restyle presets).
function renderPresets(f) {
  const hidden = el('input', { type: 'hidden', name: f.name });
  const grid = el('div', { class: 'presets' }, el('span', { class: 'hint small' }, 'Loading styles…'));
  api(`/api/presets?path=${encodeURIComponent(f.source)}`)
    .then((data) => {
      grid.innerHTML = '';
      const items = data.items || [];
      if (!items.length) grid.append(el('span', { class: 'hint small' }, 'No styles available right now.'));
      for (const p of items) {
        const btn = el('button', { type: 'button', class: 'preset', title: p.name, onclick: () => {
          hidden.value = p.id;
          grid.querySelectorAll('.preset').forEach((b) => b.classList.toggle('selected', b === btn));
        } }, p.preview_url ? el('img', { src: p.preview_url, alt: '', loading: 'lazy' }) : null, el('span', {}, p.name));
        grid.append(btn);
      }
    })
    .catch((e) => { grid.innerHTML = ''; grid.append(el('span', { class: 'error' }, e.message)); });
  return el('div', { class: 'field' }, el('span', {}, f.label), grid, hidden);
}

function collectBody() {
  const model = state.model;
  const form = $('#genForm');
  const body = {};

  if (model.custom) {
    const path = form.elements.__path.value.trim();
    if (!path.startsWith('/')) throw new Error('The endpoint should start with "/". Copy it from the model\'s docs page.');
    const raw = form.elements.__json.value.trim();
    if (raw) {
      try { Object.assign(body, JSON.parse(raw)); } catch { throw new Error('"Other settings" is not valid JSON. Check quotes and commas.'); }
    }
    const p = form.elements.prompt.value.trim();
    if (p) body.prompt = p;
    if (state.uploads.__image) body[form.elements.__image_field.value.trim() || 'image_url'] = state.uploads.__image;
    return { path, body, name: path, kind: 'custom' };
  }

  for (const f of model.fields) {
    const input = form.elements[f.name];
    if (f.type === 'image' || f.type === 'images' || f.type === 'video') {
      if (state.uploads[f.name]) body[f.name] = state.uploads[f.name];
      else if (f.required) throw new Error(`Please add: ${f.label}.`);
      continue;
    }
    if (f.type === 'bool') { body[f.name] = input.checked; continue; }
    const v = input.value.trim();
    if (v === '') {
      if (f.required) throw new Error(`Please fill in: ${f.label}.`);
      continue;
    }
    if (f.type === 'number' || (f.type === 'select' && typeof f.options[0] === 'number')) {
      const n = Number(v);
      if (Number.isNaN(n)) throw new Error(`${f.label} must be a number.`);
      if ((f.min != null && n < f.min) || (f.max != null && n > f.max)) throw new Error(`${f.label} must be between ${f.min} and ${f.max}.`);
      body[f.name] = n;
    } else {
      body[f.name] = v;
    }
  }
  return { path: model.path, body, name: model.name, kind: model.kind };
}

// ---------- Price before you generate ----------

function scheduleEstimate() {
  clearTimeout(state.estimateTimer);
  state.estimateTimer = setTimeout(updateEstimate, 600);
}

async function updateEstimate() {
  const box = $('#priceBox');
  const seq = ++state.estimateSeq;
  let req;
  try {
    req = collectBody();
  } catch {
    box.className = 'price muted';
    box.textContent = 'Fill in the required parts to see the price.';
    return;
  }
  box.className = 'price muted';
  box.textContent = 'Checking price…';
  try {
    const c = await api('/api/estimate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: req.path, body: req.body }),
    });
    if (seq !== state.estimateSeq) return;
    box.innerHTML = '';
    if (!c.available) {
      box.className = 'price muted';
      box.append("Higgsfield doesn't give a price for this model before it runs. Check ",
        el('a', { href: 'https://open.higgsfield.ai', target: '_blank', rel: 'noopener' }, 'Pricing ↗'), '.',
        el('div', { class: 'price-raw' }, `Higgsfield's answer: ${JSON.stringify(c.raw)}`));
      return;
    }
    box.className = 'price';
    box.append('Price: ', el('b', {}, money(c.usd)), c.credits != null ? el('span', { class: 'muted' }, ` · ${c.credits} credits`) : null);
  } catch (e) {
    if (seq !== state.estimateSeq) return;
    box.className = 'price muted';
    box.textContent = /API key/i.test(e.message) ? 'Add your API key to see prices.' : `Price not available: ${e.message}`;
  }
}

function money(n) {
  const v = Number(n) || 0;
  return '$' + (v > 0 && v < 0.1 ? v.toFixed(3) : v.toFixed(2));
}

// ---------- Spending and storage ----------

function formatBytes(b) {
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return `${(b / 1024 ** 3).toFixed(2)} GB`;
}

async function loadStats() {
  let st;
  try { st = await api('/api/stats'); } catch { return; }
  const tile = (label, value, sub) => el('div', { class: 'stat' }, el('div', { class: 'stat-label' }, label), el('div', { class: 'stat-value' }, value), el('div', { class: 'stat-sub' }, sub));
  const gens = (x) => `${x.count} generation${x.count === 1 ? '' : 's'}` + (x.unpriced ? ` · ${x.unpriced} without price` : '');
  const box = $('#stats');
  box.innerHTML = '';
  box.append(
    tile('Spent today', money(st.today.usd), gens(st.today)),
    tile('This month', money(st.month.usd), gens(st.month)),
    tile('All time', money(st.allTime.usd), gens(st.allTime)),
    tile('Stored on your computer', formatBytes(st.storage.bytes), `${st.storage.files} file${st.storage.files === 1 ? '' : 's'} in outputs`));
}

async function onGenerate(e) {
  e.preventDefault();
  const errBox = $('#formError');
  errBox.hidden = true;
  const btn = $('#generateBtn');
  try {
    const { path, body, name, kind } = collectBody();
    btn.disabled = true;
    btn.textContent = 'Sending…';
    const r = await api('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, body, model: name, kind }),
    });
    await loadGallery();
    poll(r.request_id);
    loadStats();
  } catch (err) {
    errBox.textContent = err.message;
    errBox.hidden = false;
    if (/API key/i.test(err.message)) $('#settings').showModal();
  } finally {
    btn.disabled = false;
    btn.textContent = 'Generate';
  }
}

// ---------- Gallery ----------

const ACTIVE = ['queued', 'in_progress'];

function mediaNode(out, attrs = {}) {
  const src = out.local || out.url;
  if (out.kind === 'video') return el('video', { src, controls: true, playsinline: true, preload: 'metadata', ...attrs });
  if (out.kind === 'audio') return el('audio', { src, controls: true, ...attrs });
  return el('img', { src, alt: '', loading: 'lazy', ...attrs });
}

function openViewer(item) {
  const body = $('#viewerBody');
  body.innerHTML = '';
  if (item.outputs.length === 1) body.append(mediaNode(item.outputs[0], { autoplay: true }));
  else body.append(el('div', { class: 'grid' }, item.outputs.map((o) => mediaNode(o))));
  body.append(el('p', {}, item.prompt || ''), el('p', { class: 'hint small' }, `${item.model} · ${new Date(item.created_at).toLocaleString()}`));
  $('#viewer').showModal();
}

function renderCard(item) {
  let media;
  if (item.status === 'completed' && item.outputs.length) {
    const first = mediaNode(item.outputs[0]);
    first.addEventListener('click', (e) => { if (first.tagName === 'IMG') { e.preventDefault(); openViewer(item); } });
    media = el('div', { class: 'media' }, first, item.outputs.length > 1 ? el('span', { class: 'multi' }, `+${item.outputs.length - 1}`) : null);
  } else if (ACTIVE.includes(item.status)) {
    media = el('div', { class: 'media' }, el('div', { class: 'status' }, el('div', { class: 'spinner' }),
      item.status === 'queued' ? 'Waiting in line…' : 'Creating…', el('br'), el('span', { class: 'small' }, 'Videos can take a few minutes.')));
  } else {
    media = el('div', { class: 'media' }, el('div', { class: 'status err' }, item.error || `Status: ${item.status}`));
  }

  const actions = el('div', { class: 'card-actions' });
  if (item.status === 'completed') {
    item.outputs.forEach((o, i) => actions.append(el('a', { class: 'btn small', href: o.local || o.url, download: '', target: '_blank' }, item.outputs.length > 1 ? `Download ${i + 1}` : 'Download')));
    actions.append(el('button', { class: 'btn small ghost', onclick: () => reuse(item) }, 'Reuse prompt'));
  }
  if (item.status === 'queued') {
    actions.append(el('button', { class: 'btn small ghost', onclick: async () => {
      try { await api(`/api/cancel/${item.request_id}`, { method: 'POST' }); loadGallery(); } catch (e) { alert(e.message); }
    } }, 'Cancel'));
  }
  if (!ACTIVE.includes(item.status)) {
    actions.append(el('button', { class: 'btn small ghost', title: 'Hides it from this list. The file stays in the outputs folder and still counts in your spending.', onclick: async () => {
      await api(`/api/history/${item.request_id}`, { method: 'DELETE' });
      loadGallery();
      loadStats();
    } }, 'Remove'));
  }

  return el('div', { class: 'card', id: `card-${item.request_id}` }, media,
    el('div', { class: 'card-body' },
      el('div', { class: 'card-prompt' }, item.prompt || '(no prompt)'),
      el('div', { class: 'card-meta' }, `${item.model} · ${timeAgo(item.created_at)}` + (item.cost_usd != null && item.status === 'completed' ? ` · ${money(item.cost_usd)}` : '')),
      actions));
}

function reuse(item) {
  const model = window.MODELS.find((m) => m.path === item.path);
  if (model) {
    selectKind(model.kind);
    $('#modelSelect').value = model.id;
    selectModel(model.id);
    const form = $('#genForm');
    for (const [k, v] of Object.entries(item.params || {})) {
      const input = form.elements[k];
      if (!input || typeof v === 'object') continue;
      if (input.type === 'checkbox') input.checked = !!v; else input.value = v;
    }
  } else {
    selectKind('custom');
    const form = $('#genForm');
    form.elements.__path.value = item.path;
    const { prompt, ...rest } = item.params || {};
    form.elements.prompt.value = prompt || '';
    form.elements.__json.value = Object.keys(rest).length ? JSON.stringify(rest, null, 2) : '';
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function loadGallery() {
  const items = await api('/api/history');
  const grid = $('#gallery');
  grid.innerHTML = '';
  items.forEach((i) => grid.append(renderCard(i)));
  $('#emptyGallery').hidden = items.length > 0;
  items.filter((i) => ACTIVE.includes(i.status)).forEach((i) => poll(i.request_id));
}

function poll(id) {
  if (state.polling.has(id)) return;
  state.polling.add(id);
  let delay = 3000;
  const tick = async () => {
    try {
      const item = await api(`/api/status/${id}`);
      if (!ACTIVE.includes(item.status)) {
        state.polling.delete(id);
        loadStats();
        const card = document.getElementById(`card-${id}`);
        if (card && item.created_at) card.replaceWith(renderCard(item));
        else loadGallery();
        return;
      }
    } catch (e) {
      console.warn(e);
    }
    delay = Math.min(delay * 1.2, 10000);
    setTimeout(tick, delay);
  };
  setTimeout(tick, delay);
}

// ---------- Start ----------

document.querySelectorAll('.tab').forEach((t) => (t.onclick = () => selectKind(t.dataset.kind)));
$('#modelSelect').onchange = (e) => selectModel(e.target.value);
$('#genForm').onsubmit = onGenerate;
$('#genForm').addEventListener('input', scheduleEstimate);
$('#genForm').addEventListener('change', scheduleEstimate);
setupSettings();
selectKind('image');
refreshKeyBadge().then((s) => { if (!s.configured) $('#settings').showModal(); });
loadGallery();
loadStats();
