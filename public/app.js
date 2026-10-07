// Higgsfield Studio front end. Talks only to the local server (server.js),
// which holds the API key. The key never reaches this page.

const $ = (sel) => document.querySelector(sel);
const state = { kind: 'image', model: null, uploads: {}, polling: new Set() };

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

async function refreshKeyBadge() {
  const s = await api('/api/settings');
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

  $('#saveKey').onclick = async () => {
    msg.textContent = 'Saving…';
    try {
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
  $('#modelBlurb').innerHTML = '';
  $('#modelBlurb').append(model.blurb + ' ', el('a', { href: model.docs, target: '_blank', rel: 'noopener' }, 'Docs ↗'));
  $('#formError').hidden = true;

  const main = $('#fields');
  const adv = $('#advancedFields');
  main.innerHTML = '';
  adv.innerHTML = '';
  const fields = model.custom ? customFields() : model.fields;
  for (const f of fields) (f.advanced ? adv : main).append(renderField(f));
  $('#advanced').hidden = !adv.children.length;
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
      const s = el('select', { id, name: f.name });
      for (const o of f.options) s.append(el('option', { value: o, selected: o === f.default }, String(o)));
      return el('label', { class: 'field' }, el('span', {}, label), s);
    }
    case 'bool':
      return el('label', { class: 'check' }, el('input', { id, name: f.name, type: 'checkbox', checked: !!f.default }), label);
    case 'image':
    case 'images':
      return renderUpload(f);
  }
}

function renderUpload(f) {
  const multiple = f.type === 'images';
  const input = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', hidden: true, multiple });
  const box = el('div', { class: 'drop', tabindex: 0 }, multiple ? 'Click or drop images here' : 'Click or drop an image here');
  const thumbs = el('div', { class: 'thumbs' });

  const handle = async (files) => {
    files = [...files].slice(0, f.max || (multiple ? 10 : 1));
    if (!files.length) return;
    box.textContent = 'Uploading…';
    try {
      const urls = [];
      for (const file of files) {
        const r = await api('/api/upload', { method: 'POST', headers: { 'Content-Type': file.type }, body: file });
        urls.push(r.url);
      }
      state.uploads[f.name] = multiple ? urls : urls[0];
      box.textContent = multiple ? `${urls.length} image(s) ready. Click to replace.` : '';
      thumbs.innerHTML = '';
      if (multiple) urls.forEach((u) => thumbs.append(el('img', { src: u, alt: '' })));
      else box.prepend(el('img', { src: urls[0], alt: '' }), 'Image ready. Click to replace.');
    } catch (e) {
      box.textContent = e.message;
      delete state.uploads[f.name];
    }
  };

  box.onclick = () => input.click();
  box.onkeydown = (e) => (e.key === 'Enter' || e.key === ' ') && input.click();
  input.onchange = () => handle(input.files);
  box.ondragover = (e) => { e.preventDefault(); box.classList.add('drag'); };
  box.ondragleave = () => box.classList.remove('drag');
  box.ondrop = (e) => { e.preventDefault(); box.classList.remove('drag'); handle(e.dataTransfer.files); };

  return el('div', { class: 'field' }, el('span', {}, f.label), box, input, thumbs);
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
    if (f.type === 'image' || f.type === 'images') {
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
    actions.append(el('button', { class: 'btn small ghost', title: 'Removes it from this list. Downloaded files stay in the outputs folder.', onclick: async () => {
      await api(`/api/history/${item.request_id}`, { method: 'DELETE' });
      loadGallery();
    } }, 'Remove'));
  }

  return el('div', { class: 'card', id: `card-${item.request_id}` }, media,
    el('div', { class: 'card-body' },
      el('div', { class: 'card-prompt' }, item.prompt || '(no prompt)'),
      el('div', { class: 'card-meta' }, `${item.model} · ${timeAgo(item.created_at)}`),
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
setupSettings();
selectKind('image');
refreshKeyBadge().then((s) => { if (!s.configured) $('#settings').showModal(); });
loadGallery();
