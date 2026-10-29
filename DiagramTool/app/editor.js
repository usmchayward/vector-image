// Diagram Tool editor: plain SVG + JS, no libraries. Loads any supported file, edits the scene graph, saves/exports.
(function (G) {
'use strict';
const DT = G.DT, NS = 'http://www.w3.org/2000/svg', $ = id => document.getElementById(id);
DT.editors = []; DT.active = null; DT.clip = null;
function makeEditor(pane, name, initial) {
const P = k => pane.querySelector('.k-' + k), svg = P('c'); let me = null;
const mine = fn => function (...a) { if (DT.active === me) return fn.apply(this, a); }; // global toolbar acts on the active pane only
const on = (id, ev, fn) => $(id).addEventListener(ev, mine(fn));
let scene = initial || DT.scene(1000, 700, 'new'); let lastPt = null;
function activate() { if (DT.active === me) return; DT.active = me; DT.editors.forEach(e => e.pane.classList.toggle('active', e === me)); } let tool = 'select', sel = new Set(), hist = [], fut = [], zoom = 1, drag = null, lastFile = null;
const status = (m, err) => { P('status').textContent = m || ''; P('status').style.background = err ? '#fcc' : '#ffd'; };
const snapOn = () => $('snap').checked, g10 = v => snapOn() ? Math.round(v / 10) * 10 : v;
function snap() { hist.push(JSON.stringify(scene)); if (hist.length > 300) hist.shift(); fut = []; }
function undo() { if (hist.length) { fut.push(JSON.stringify(scene)); scene = JSON.parse(hist.pop()); sel.clear(); render(); } }
function redo() { if (fut.length) { hist.push(JSON.stringify(scene)); scene = JSON.parse(fut.pop()); sel.clear(); render(); } }
const el = (t, a, p) => { const e = document.createElementNS(NS, t); for (const k in a) if (a[k] != null) e.setAttribute(k, a[k]); if (p) p.appendChild(e); return e; };
const find = id => { let f = null; DT.walk(scene.nodes, n => { if (n.id === id) f = n; }); return f || scene.edges.find(e => e.id === id); };
const topOf = id => scene.nodes.find(n => n.id === id || (n.children && contains(n, id))) || scene.edges.find(e => e.id === id);
const contains = (n, id) => (n.children || []).some(c => c.id === id || contains(c, id));
const idsIn = n => { const s = new Set(); DT.walk([n], x => s.add(x.id)); return s; };
function applyStyle(e, s) { s = s || {}; e.setAttribute('stroke', s.stroke || 'none'); e.setAttribute('fill', s.fill || 'none'); e.setAttribute('stroke-width', s.strokeWidth || 1); const d = DT.dashArray(s); if (d) e.setAttribute('stroke-dasharray', d); }
function drawNode(n, p) {
  let wrap = p; if (n.rotate || (n.opacity != null && n.opacity < 1) || n.hidden) { const b = DT.bbox(n); wrap = el('g', { transform: n.rotate ? `rotate(${n.rotate} ${(b[0] + b[2]) / 2} ${(b[1] + b[3]) / 2})` : null, opacity: n.opacity, display: n.hidden ? 'none' : null }, p); }
  let e; const s = n.style || {};
  if (n.type === 'rect') { e = el('rect', { x: n.x, y: n.y, width: Math.max(n.w, 0), height: Math.max(n.h, 0), rx: n.rx || 0 }, wrap); applyStyle(e, s); if (s.fill === 'none') e.setAttribute('pointer-events', 'visibleStroke'); }
  else if (n.type === 'ellipse') { e = el('ellipse', { cx: n.x + n.w / 2, cy: n.y + n.h / 2, rx: Math.abs(n.w / 2), ry: Math.abs(n.h / 2) }, wrap); applyStyle(e, s); if (s.fill === 'none') e.setAttribute('pointer-events', 'visibleStroke'); }
  else if (n.type === 'path') { e = el('path', { d: n.d }, wrap); applyStyle(e, s); }
  else if (n.type === 'image') { if (n.href) e = el('image', { x: n.x, y: n.y, width: n.w, height: n.h, href: n.href, preserveAspectRatio: 'none' }, wrap); else { e = el('rect', { x: n.x, y: n.y, width: n.w, height: n.h, fill: '#ddd', stroke: '#999' }, wrap); } }
  else if (n.type === 'text') { const fs = n.fontSize || 12, al = n.align || 'left', w = DT.textWidth(n); const ax = al === 'center' ? n.x + w / 2 : al === 'right' ? n.x + w : n.x;
    e = el('text', { x: ax, y: n.y, 'font-size': fs, 'font-family': 'Arial, sans-serif', 'text-anchor': al === 'center' ? 'middle' : al === 'right' ? 'end' : 'start', fill: s.fill && s.fill !== 'none' ? s.fill : '#000', 'font-weight': n.bold ? 'bold' : null }, wrap);
    String(n.text).split('\n').forEach((l, i) => { const t = el('tspan', { x: ax, dy: i ? fs * 1.2 : fs }, e); t.textContent = l; });
    if (n.conf != null && n.conf < 0.8) el('rect', { x: n.x - 2, y: n.y, width: 4, height: fs, fill: '#fc0', 'data-ui': 1 }, wrap); }
  else if (n.type === 'group') { e = el('g', {}, wrap); n.children.forEach(c => drawNode(c, e)); }
  if (e) { e.dataset.id = n.id; if (n.type !== 'group') e.style.cursor = n.locked ? 'default' : 'move'; }
}
function render() {
  svg.innerHTML = ''; svg.setAttribute('width', scene.width * zoom); svg.setAttribute('height', scene.height * zoom); svg.setAttribute('viewBox', `0 0 ${scene.width} ${scene.height}`);
  const defs = el('defs', {}, svg); el('rect', { width: '100%', height: '100%', fill: '#fff', 'data-bg': 1 }, svg);
  for (const n of scene.nodes) { if (n.locked && n.type === 'image' && !P('showbg').checked) continue; drawNode(n, svg); }
  for (const e of scene.edges) { const s = e.style || {}, pts = e.points.map(p => p.join(',')).join(' ');
    const hit = el('polyline', { points: pts, stroke: 'transparent', 'stroke-width': 10, fill: 'none', 'data-ui': 1 }, svg); hit.dataset.id = e.id; hit.style.cursor = 'move';
    const pl = el('polyline', { points: pts }, svg); applyStyle(pl, Object.assign({}, s, { fill: 'none' })); pl.style.pointerEvents = 'none';
    if (e.arrowEnd || e.arrowStart) { const mid = 'm_' + e.id.replace(/[^\w-]/g, '_'); const mk = el('marker', { id: mid, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse' }, defs); el('path', { d: 'M0,0L10,5L0,10z', fill: s.stroke || '#000' }, mk);
      if (e.arrowEnd) pl.setAttribute('marker-end', `url(#${mid})`); if (e.arrowStart) pl.setAttribute('marker-start', `url(#${mid})`); } }
  // text hit areas: padded, on top of everything, so labels are easy to grab (min ~12 screen px)
  { const pad = 3 / zoom, minH = 12 / zoom; DT.walk(scene.nodes.filter(n => !(n.locked && n.type === 'image')), n => { if (n.type !== 'text' || n.hidden) return; const b = DT.bbox(n);
      let h = b[3] - b[1], w = b[2] - b[0]; const cy = (b[1] + b[3]) / 2, cx = (b[0] + b[2]) / 2; h = Math.max(h + 2 * pad, minH); w = Math.max(w + 2 * pad, minH);
      const r = el('rect', { x: cx - w / 2, y: cy - h / 2, width: w, height: h, class: 'txthit', 'data-ui': 1, transform: n.rotate ? `rotate(${n.rotate} ${cx} ${cy})` : null }, svg); r.dataset.id = n.id; r.dataset.text = 1; }); }
  for (const id of sel) { const o = find(id); if (!o) continue;
    if (o.points) o.points.forEach((p, i) => { const h = el('circle', { cx: p[0], cy: p[1], r: 5 / zoom, fill: '#09f', stroke: '#fff', 'data-ui': 1 }, svg); h.dataset.handle = 'pt'; h.dataset.id = id; h.dataset.i = i; h.style.cursor = 'crosshair'; });
    else { const b = DT.bbox(o); el('rect', { x: b[0] - 2, y: b[1] - 2, width: b[2] - b[0] + 4, height: b[3] - b[1] + 4, fill: 'none', stroke: '#09f', 'stroke-dasharray': '4,2', 'pointer-events': 'none', 'data-ui': 1, transform: o.rotate ? `rotate(${o.rotate} ${(b[0] + b[2]) / 2} ${(b[1] + b[3]) / 2})` : null }, svg);
      const h = el('rect', { x: b[2] - 5 / zoom, y: b[3] - 5 / zoom, width: 10 / zoom, height: 10 / zoom, fill: '#09f', 'data-ui': 1 }, svg); h.dataset.handle = 'resize'; h.dataset.id = id; h.style.cursor = 'nwse-resize'; } }
  if (sel.size === 1) { const o = find([...sel][0]); if (o) { if (o.style) { $('dash').value = o.style.dash || 'solid'; } if (!o.points) $('rot').value = o.rotate || 0; else $('arrow').checked = !!o.arrowEnd; } }
  P('drop').style.display = scene.nodes.length || scene.edges.length ? 'none' : 'flex';
}
// ---------------- loading files ----------------
async function openFile(file, page) {
  lastFile = file; const name = file.name.toLowerCase(), ext = name.split('.').pop(); status('Opening ' + file.name + '…');
  try {
    const buf = await file.arrayBuffer(); let sc;
    if (ext === 'svg') sc = DT.importSVG(new TextDecoder().decode(buf));
    else if (ext === 'pdf') { sc = await DT.importPDF(buf, page || 1); P('pagebox').hidden = !(sc.pageCount > 1); P('page').max = sc.pageCount; }
    else if (ext === 'vsdx') sc = await DT.importVSDX(buf, page || 1);
    else if (ext === 'drawio' || ext === 'xml') sc = await DT.fromDrawio(new TextDecoder().decode(buf));
    else if (ext === 'json') sc = JSON.parse(new TextDecoder().decode(buf));
    else if (['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'].includes(ext)) sc = await DT.importRaster(buf, { recognise: P('recog').checked, log: m => status(m) });
    else throw new Error('Unsupported file type: .' + ext);
    snap(); scene = sc; sel.clear(); fit(); render();
    const s = DT.summary(sc); status(`${file.name}: ` + Object.entries(s).map(([k, v]) => `${k} ${v}`).join(', ') + (sc.notes.length ? ' — ' + sc.notes.join(' ') : ''));
    return sc;
  } catch (err) { console.error(err); status('Could not open ' + file.name + ': ' + err.message, true); throw err; }
}
P('open').onchange = ev => { const f = ev.target.files[0]; if (f) openFile(f); ev.target.value = ''; };
P('page').onchange = () => lastFile && openFile(lastFile, +P('page').value);
P('wrap').addEventListener('dragover', e => e.preventDefault());
P('wrap').addEventListener('drop', e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) openFile(f); });
// ---------------- interaction ----------------
function pt(ev) { const r = svg.getBoundingClientRect(); return [(ev.clientX - r.left) / zoom, (ev.clientY - r.top) / zoom]; }
function setTool(t) { tool = t; document.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === t)); }
document.querySelectorAll('[data-tool]').forEach(b => b.addEventListener('click', () => setTool(b.dataset.tool)));
function followEdges(moved, dx, dy) { // connectors attached to moved shapes follow; orthogonal bends stay orthogonal
  for (const e of scene.edges) { if (sel.has(e.id)) continue; const P = e.points;
    for (const end of ['from', 'to']) { if (!e[end] || !moved.has(e[end])) continue; const i = end === 'from' ? 0 : P.length - 1, j = end === 'from' ? 1 : P.length - 2;
      const old = P[i].slice(); P[i] = [P[i][0] + dx, P[i][1] + dy];
      if (P.length > 2) { if (Math.abs(P[j][1] - old[1]) < 0.5) P[j] = [P[j][0], P[j][1] + dy]; else if (Math.abs(P[j][0] - old[0]) < 0.5) P[j] = [P[j][0] + dx, P[j][1]]; } } }
}
function nodeAt(p, excludeId) { // for snapping line ends: smallest non-text shape whose border is within 10px
  let best = null; for (const n of scene.nodes) { if (n.locked || n.type === 'text' || n.id === excludeId) continue; const b = DT.bbox(n);
    const dx = Math.max(b[0] - p[0], 0, p[0] - b[2]), dy = Math.max(b[1] - p[1], 0, p[1] - b[3]); const out = Math.hypot(dx, dy); if (out > 10) continue;
    const a = (b[2] - b[0]) * (b[3] - b[1]); if (!best || a < best[0]) best = [a, n, b]; } return best && { n: best[1], b: best[2] }; }
function snapPoint(p) { if (!snapOn()) return { p, id: null }; const h = nodeAt(p); if (!h) return { p: [g10(p[0]), g10(p[1])], id: null };
  const b = h.b, c = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]; const cand = [[c[0], b[1]], [c[0], b[3]], [b[0], c[1]], [b[2], c[1]]]; // side midpoints
  let q = cand[0], d = 1e9; for (const k of cand) { const dd = Math.hypot(k[0] - p[0], k[1] - p[1]); if (dd < d) { d = dd; q = k; } }
  return d < 25 ? { p: q, id: h.n.id } : { p, id: h.n.id }; }
const curStyle = () => ({ stroke: $('color').value, fill: $('nofill').checked ? 'none' : $('fill').value, strokeWidth: +$('sw').value, dash: $('dash').value });
pane.addEventListener('mousedown', () => activate(), true);
svg.addEventListener('mousemove', ev => { lastPt = pt(ev); });
svg.addEventListener('mouseleave', () => { lastPt = null; });
svg.addEventListener('mousedown', ev => {
  if (ev.button !== 0) return; let p = pt(ev); const t = ev.target;
  if (ev.detail === 2 && tool === 'select' && !ev.altKey) { drag = null; editAt(ev); return; }
  if (tool === 'line') { snap(); const s = snapPoint(p); const e = { id: DT.newId('e'), points: [s.p, s.p.slice()], from: s.id, to: null, arrowEnd: $('arrow').checked, arrowStart: false, style: Object.assign(curStyle(), { fill: 'none' }) }; scene.edges.push(e); sel = new Set([e.id]); drag = { kind: 'pt', id: e.id, i: 1 }; render(); return; }
  if (tool === 'rect' || tool === 'ellipse') { snap(); p = [g10(p[0]), g10(p[1])]; const n = { id: DT.newId(), type: tool, x: p[0], y: p[1], w: 1, h: 1, rx: 0, style: curStyle() }; scene.nodes.push(n); sel = new Set([n.id]); drag = { kind: 'resize', id: n.id, b0: [p[0], p[1], p[0] + 1, p[1] + 1], snapshot: JSON.stringify(n) }; render(); return; }
  if (tool === 'text') { editText('', s => { if (!s) return; snap(); const n = { id: DT.newId('t'), type: 'text', x: p[0], y: p[1], text: s, fontSize: 14, style: DT.style('none', $('color').value) }; scene.nodes.push(n); sel = new Set([n.id]); render(); }); setTool('select'); return; }
  if (t.dataset.handle === 'pt') { snap(); drag = { kind: 'pt', id: t.dataset.id, i: +t.dataset.i }; return; }
  if (t.dataset.handle === 'resize') { snap(); const o = find(t.dataset.id); drag = { kind: 'resize', id: o.id, b0: DT.bbox(o), snapshot: JSON.stringify(o) }; return; }
  let id = t.dataset && t.dataset.id;
  if (ev.altKey) { // click-through: pick the shape underneath the label / top shape
    const under = document.elementsFromPoint(ev.clientX, ev.clientY).filter(e => e.dataset && e.dataset.id && !e.dataset.text && !e.dataset.handle);
    const cur = sel.size === 1 ? [...sel][0] : null; const tops = [...new Set(under.map(e => (topOf(e.dataset.id) || {}).id).filter(Boolean))];
    id = tops.length ? tops[(tops.indexOf(cur) + 1) % tops.length] : null; }
  if (!id) { sel.clear(); drag = { kind: 'marquee', start: p }; render(); return; }
  // a text label is selected on its own (even inside a group); other shapes select their top-level group
  const isText = t.dataset.text || (find(id) && find(id).type === 'text');
  const top = isText && !ev.altKey ? find(id) : topOf(id); if (!top) return; if (top.locked && !ev.altKey) { sel.clear(); drag = { kind: 'marquee', start: p }; render(); return; }
  if (ev.shiftKey) { sel.has(top.id) ? sel.delete(top.id) : sel.add(top.id); } else if (!sel.has(top.id)) sel = new Set([top.id]);
  snap(); drag = { kind: 'move', last: p, total: [0, 0], start: p }; render();
});
window.addEventListener('mousemove', ev => { if (!drag) return; const p = pt(ev);
  if (drag.kind === 'move') { pane.classList.add('dragsrc'); const want = [g10(p[0] - drag.start[0]), g10(p[1] - drag.start[1])]; const dx = want[0] - drag.total[0], dy = want[1] - drag.total[1];
    if (!dx && !dy) return; drag.total = want;
    const moved = new Set(); for (const id of sel) { const o = find(id); DT.xform(o, (x, y) => [x + dx, y + dy], 1, 1); if (!o.points) idsIn(o).forEach(i => moved.add(i)); }
    followEdges(moved, dx, dy); }
  else if (drag.kind === 'pt') { const e = find(drag.id); const s = snapPoint(p); e.points[drag.i] = s.p; if (drag.i === 0) e.from = s.id; else if (drag.i === e.points.length - 1) e.to = s.id; }
  else if (drag.kind === 'resize') { const i = scene.nodes.findIndex(n => n.id === drag.id); const o = JSON.parse(drag.snapshot); const b = drag.b0;
    const W = Math.max(b[2] - b[0], 1), H = Math.max(b[3] - b[1], 1), sx = Math.max(g10(p[0]) - b[0], 2) / W, sy = Math.max(g10(p[1]) - b[1], 2) / H;
    DT.xform(o, (x, y) => [b[0] + (x - b[0]) * sx, b[1] + (y - b[1]) * sy], sx, sy); if (i >= 0) scene.nodes[i] = o; else { const tgt = find(drag.id); if (tgt) Object.assign(tgt, o); } }
  else if (drag.kind === 'marquee') { drag.end = p; render(); const a = drag.start; el('rect', { x: Math.min(a[0], p[0]), y: Math.min(a[1], p[1]), width: Math.abs(p[0] - a[0]), height: Math.abs(p[1] - a[1]), fill: '#09f2', stroke: '#09f', 'data-ui': 1 }, svg); return; }
  render(); });
window.addEventListener('mouseup', ev => { if (!drag) return;
  if (drag.kind === 'move' && ev && ev.clientX != null) { const under = document.elementFromPoint(ev.clientX, ev.clientY); const tp = under && under.closest && under.closest('.pane');
    const target = tp && tp !== pane && DT.editors.find(e => e.pane === tp);
    if (target && target.pane.querySelector('.k-wrap').contains(under)) { // dropped on the other pane: copy there, leave this pane as it was
      const moved = JSON.stringify(scene); scene = JSON.parse(hist.pop()); const items = clipOf(sel); drag = null; render();
      target.activateFrom(); target.paste(items, target.ptFromClient(ev.clientX, ev.clientY)); pane.classList.remove('dragsrc'); return; } }
  pane.classList.remove('dragsrc');
  if (drag.kind === 'marquee' && drag.end) { const a = drag.start, b = drag.end, x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
    if (x1 - x0 > 3) { for (const o of [...scene.nodes, ...scene.edges]) { if (o.locked) continue; const q = DT.bbox(o); if (q[0] >= x0 && q[2] <= x1 && q[1] >= y0 && q[3] <= y1) sel.add(o.id); }
      for (const g of scene.nodes) if (g.children && !sel.has(g.id)) DT.walk(g.children, n => { if (n.type !== 'text') return; const q = DT.bbox(n); if (q[0] >= x0 && q[2] <= x1 && q[1] >= y0 && q[3] <= y1) sel.add(n.id); }); } render(); }
  if (drag.kind === 'pt' || drag.kind === 'resize') setTool('select'); drag = null; });
function editText(cur, done) { $('ta').value = cur; $('modal').hidden = false; $('ta').focus(); $('taok').onclick = () => { $('modal').hidden = true; done($('ta').value); }; $('tacancel').onclick = () => { $('modal').hidden = true; }; }
function editAt(ev) { // the DOM is re-rendered between clicks, so look up what is under the pointer now
  const under = document.elementsFromPoint(ev.clientX, ev.clientY).filter(e => e.dataset && e.dataset.id && !e.dataset.handle); const hitT = under.find(e => e.dataset.text); const id = (hitT || under[0] || {}).dataset ? (hitT || under[0]).dataset.id : null; if (!id) return; let tn = find(id); if (!tn || tn.type !== 'text') { const top = topOf(id); tn = null; if (top && top.children) DT.walk(top.children, n => { if (!tn && n.type === 'text') tn = n; }); }
  if (!tn) return; editText(tn.text, s => { snap(); tn.text = s; delete tn.conf; render(); }); }
svg.addEventListener('dblclick', ev => { if ($('modal').hidden) editAt(ev); });
svg.addEventListener('contextmenu', ev => { const id = ev.target.dataset.id; const e = id && find(id); if (!e || !e.points) return; ev.preventDefault(); snap(); const p = pt(ev);
  let bi = 1, bd = 1e9; for (let i = 1; i < e.points.length; i++) { const a = e.points[i - 1], b = e.points[i]; const d = Math.hypot((a[0] + b[0]) / 2 - p[0], (a[1] + b[1]) / 2 - p[1]); if (d < bd) { bd = d; bi = i; } } e.points.splice(bi, 0, p); render(); });
function eachSelStyle(fn) { if (!sel.size) return; snap(); for (const id of sel) { const o = find(id); if (o.points) fn(o.style, o); else DT.walk([o], n => { if (n.style && n.type !== 'image') fn(n.style, n); }); } render(); }
on('dash', 'change', () => eachSelStyle(s => s.dash = $('dash').value));
on('color', 'change', () => eachSelStyle((s, n) => { if (n.type === 'text') s.fill = $('color').value; else if (s.stroke !== 'none') s.stroke = $('color').value; }));
on('fill', 'change', () => { $('nofill').checked = false; eachSelStyle((s, n) => { if (n.type !== 'text' && !n.points) s.fill = $('fill').value; }); });
on('nofill', 'change', () => { if ($('nofill').checked) eachSelStyle((s, n) => { if (n.type !== 'text' && !n.points) s.fill = 'none'; }); });
on('sw', 'change', () => eachSelStyle((s, n) => { if (n.type !== 'text') s.strokeWidth = +$('sw').value; }));
on('arrow', 'change', () => { snap(); for (const id of sel) { const o = find(id); if (o.points) o.arrowEnd = $('arrow').checked; } render(); });
on('rot', 'change', () => { snap(); for (const id of sel) { const o = find(id); if (!o.points) o.rotate = (+$('rot').value) % 360 || 0; } render(); });
function del() { if (!sel.size) return; snap(); const gone = new Set(); for (const id of sel) { const o = find(id); if (o && !o.points) idsIn(o).forEach(i => gone.add(i)); }
  const prune = arr => arr.filter(n => !sel.has(n.id)).map(n => { if (n.children) n.children = prune(n.children); return n; }).filter(n => n.type !== 'group' || n.children.length);
  scene.nodes = prune(scene.nodes); scene.edges = scene.edges.filter(e => !sel.has(e.id)); for (const e of scene.edges) { if (gone.has(e.from)) e.from = null; if (gone.has(e.to)) e.to = null; } sel.clear(); render(); }
function copy() { if (!sel.size) return; snap(); const ns = new Set(), map = {};
  for (const id of sel) { const o = JSON.parse(JSON.stringify(find(id))); const fix = n => { const nid = DT.newId(n.type === 'text' ? 't' : 'n'); map[n.id] = nid; n.id = nid; (n.children || []).forEach(fix); };
    if (o.points) { o.id = DT.newId('e'); o.points = o.points.map(p => [p[0] + 20, p[1] + 20]); scene.edges.push(o); } else { fix(o); DT.xform(o, (x, y) => [x + 20, y + 20], 1, 1); scene.nodes.push(o); } ns.add(o.id); }
  for (const id of ns) { const e = scene.edges.find(x => x.id === id); if (e) { e.from = map[e.from] || null; e.to = map[e.to] || null; } } sel = ns; render(); }
function group() { const items = scene.nodes.filter(n => sel.has(n.id)); if (items.length < 2) return; snap(); const g = { id: DT.newId('g'), type: 'group', children: items };
  const firstIdx = scene.nodes.findIndex(n => sel.has(n.id)); scene.nodes = scene.nodes.filter(n => !sel.has(n.id)); scene.nodes.splice(firstIdx, 0, g); sel = new Set([g.id]); render(); }
function ungroup() { snap(); const out = new Set(); for (const id of [...sel]) { const i = scene.nodes.findIndex(n => n.id === id); const g = scene.nodes[i]; if (!g || g.type !== 'group') continue;
  if (g.rotate) g.children.forEach(c => c.rotate = ((c.rotate || 0) + g.rotate) % 360); scene.nodes.splice(i, 1, ...g.children); g.children.forEach(c => out.add(c.id)); } sel = out; render(); }
on('del', 'click', del); on('copy', 'click', copy); on('undo', 'click', undo); on('redo', 'click', redo); on('group', 'click', group); on('ungroup', 'click', ungroup);
on('front', 'click', () => { snap(); scene.nodes = [...scene.nodes.filter(n => !sel.has(n.id)), ...scene.nodes.filter(n => sel.has(n.id))]; render(); });
on('back', 'click', () => { snap(); const bg = scene.nodes.filter(n => n.locked); scene.nodes = [...bg, ...scene.nodes.filter(n => sel.has(n.id) && !n.locked), ...scene.nodes.filter(n => !sel.has(n.id) && !n.locked)]; render(); });
function fit() { const w = P('wrap').clientWidth - 30, h = P('wrap').clientHeight - 30; zoom = Math.max(0.1, Math.min(2, w / scene.width, h / scene.height)) || 1; }
P('zin').onclick = () => { zoom *= 1.25; render(); }; P('zout').onclick = () => { zoom /= 1.25; render(); }; P('zfit').onclick = () => { fit(); render(); }; P('showbg').onchange = render;
window.addEventListener('keydown', ev => { if (DT.active !== me || /INPUT|SELECT|TEXTAREA/.test(ev.target.tagName) || !$('modal').hidden) return; const k = ev.key.toLowerCase(), c = ev.ctrlKey || ev.metaKey;
  if (c && k === 'z') { ev.preventDefault(); ev.shiftKey ? redo() : undo(); } else if (c && k === 'y') { ev.preventDefault(); redo(); } else if (c && k === 'd') { ev.preventDefault(); copy(); }
  else if (c && k === 'c') { ev.preventDefault(); copySel(); } else if (c && k === 'x') { ev.preventDefault(); copySel(); del(); } else if (c && k === 'v') { ev.preventDefault(); paste(DT.clip); } else if (c && k === 'a') { ev.preventDefault(); sel = new Set([...scene.nodes.filter(n => !n.locked).map(n => n.id), ...scene.edges.map(e => e.id)]); render(); }
  else if (c && k === 'g') { ev.preventDefault(); ev.shiftKey ? ungroup() : group(); } else if (k === 'delete' || k === 'backspace') del();
  else if (!c && ({ v: 'select', l: 'line', r: 'rect', e: 'ellipse', t: 'text' })[k]) setTool(({ v: 'select', l: 'line', r: 'rect', e: 'ellipse', t: 'text' })[k]);
  else if (k.startsWith('arrow') && sel.size) { ev.preventDefault(); snap(); const d = ev.shiftKey ? 10 : 1, dx = k === 'arrowleft' ? -d : k === 'arrowright' ? d : 0, dy = k === 'arrowup' ? -d : k === 'arrowdown' ? d : 0; const moved = new Set();
    for (const id of sel) { const o = find(id); DT.xform(o, (x, y) => [x + dx, y + dy], 1, 1); if (!o.points) idsIn(o).forEach(i => moved.add(i)); } followEdges(moved, dx, dy); render(); } });
// ---------------- saving / exporting (all local downloads) ----------------
function download(name, data, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); }
const baseName = () => (lastFile ? lastFile.name.replace(/\.[^.]+$/, '') : 'diagram');
const exportSVG = () => DT.toSVGWithScene(visibleScene());
const visibleScene = () => Object.assign({}, scene, { nodes: scene.nodes.filter(n => !(n.locked && n.type === 'image' && !P('showbg').checked)) });
async function exportPNG(scale = 2) { const img = new Image(); img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(exportSVG()))); await img.decode();
  const c = document.createElement('canvas'); c.width = scene.width * scale; c.height = scene.height * scale; c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); return new Promise(r => c.toBlob(r, 'image/png')); }
P('savesvg').onclick = () => download(baseName() + '.svg', exportSVG(), 'image/svg+xml');
P('savejson').onclick = () => download(baseName() + '.diagram.json', JSON.stringify(scene), 'application/json');
P('savedrawio').onclick = () => download(baseName() + '.drawio', DT.toDrawio(visibleScene()), 'application/xml');
P('savepng').onclick = async () => download(baseName() + '.png', await exportPNG(), 'image/png');
P('savepdf').onclick = async () => { status('Building PDF…'); download(baseName() + '.pdf', await DT.toPDF(visibleScene()), 'application/pdf'); status('PDF saved. It opens in any PDF viewer, and re-opens here fully editable.'); };
// ---------------- clipboard (shared by both panes) ----------------
function clipOf(ids) { // deep copy of the selection: shapes, labels, groups, pictures and the connectors between them
  const nodes = [], edges = [], inSel = new Set();
  for (const id of ids) { const o = find(id); if (!o) continue; if (o.points) edges.push(JSON.parse(JSON.stringify(o))); else { nodes.push(JSON.parse(JSON.stringify(o))); idsIn(o).forEach(i => inSel.add(i)); } }
  for (const e of scene.edges) if (!ids.has(e.id) && e.from && e.to && inSel.has(e.from) && inSel.has(e.to)) edges.push(JSON.parse(JSON.stringify(e)));
  for (const e of edges) { if (e.from && !inSel.has(e.from)) e.from = null; if (e.to && !inSel.has(e.to)) e.to = null; }
  return nodes.length || edges.length ? { nodes, edges } : null;
}
function copySel() { const c = clipOf(sel); if (c) { DT.clip = c; status(`Copied ${c.nodes.length} item(s) and ${c.edges.length} line(s). Click where you want them in either pane and press Ctrl+V.`); } return c; }
function visibleCenter() { const w = P('wrap'), r = svg.getBoundingClientRect(), wr = w.getBoundingClientRect();
  return [((wr.left + wr.right) / 2 - r.left) / zoom, ((wr.top + wr.bottom) / 2 - r.top) / zoom]; }
function paste(clip, at) {
  if (!clip) { status('Nothing copied yet: select something (in either pane) and press Ctrl+C.'); return; }
  snap(); const c = JSON.parse(JSON.stringify(clip)), map = {};
  const fix = n => { const nid = DT.newId(n.type === 'text' ? 't' : n.type === 'group' ? 'g' : n.type === 'image' ? 'i' : 'n'); map[n.id] = nid; n.id = nid; delete n.locked; (n.children || []).forEach(fix); };
  c.nodes.forEach(fix); c.edges.forEach(e => { e.id = DT.newId('e'); e.from = map[e.from] || null; e.to = map[e.to] || null; });
  const boxes = [...c.nodes.map(DT.bbox), ...c.edges.map(DT.bbox)]; const b = [Math.min(...boxes.map(q => q[0])), Math.min(...boxes.map(q => q[1])), Math.max(...boxes.map(q => q[2])), Math.max(...boxes.map(q => q[3]))];
  const target = at || lastPt || visibleCenter(); let dx = target[0] - (b[0] + b[2]) / 2, dy = target[1] - (b[1] + b[3]) / 2;
  if (snapOn()) { dx = Math.round(dx / 10) * 10; dy = Math.round(dy / 10) * 10; }
  c.nodes.forEach(n => DT.xform(n, (x, y) => [x + dx, y + dy], 1, 1)); c.edges.forEach(e => { e.points = e.points.map(p => [p[0] + dx, p[1] + dy]); });
  // grow the page if pasted items land outside it
  const nb = [b[0] + dx, b[1] + dy, b[2] + dx, b[3] + dy]; if (nb[2] > scene.width) scene.width = Math.ceil(nb[2] + 20); if (nb[3] > scene.height) scene.height = Math.ceil(nb[3] + 20);
  scene.nodes.push(...c.nodes); scene.edges.push(...c.edges); sel = new Set([...c.nodes.map(n => n.id), ...c.edges.map(e => e.id)]); render();
  status(`Pasted ${c.nodes.length} item(s) and ${c.edges.length} line(s). They are selected: drag to place them.`); return [...sel];
}
const ptFromClient = (x, y) => { const r = svg.getBoundingClientRect(); return [(x - r.left) / zoom, (y - r.top) / zoom]; };
me = { name, pane, get scene() { return scene; }, set scene(v) { scene = v; render(); }, get sel() { return sel; }, set sel(v) { sel = v; render(); }, openFile, exportSVG, exportPDF: () => DT.toPDF(visibleScene()), exportPNG, undo, redo, render, setTool, find, group, ungroup, copy, del, fit,
  copySel, paste, ptFromClient, activateFrom: () => activate(), get zoom() { return zoom; }, set zoom(v) { zoom = v; render(); }, get modified() { return hist.length > 0; } };
DT.editors.push(me); if (initial) fit(); render(); return me;
}
// ---------------- two panes ----------------
const main = makeEditor(document.getElementById('paneA'), 'main', G.DT_INITIAL_SCENE);
const lib = makeEditor(document.getElementById('paneB'), 'library');
G.DTE = main; G.DTE2 = lib; main.activateFrom();
const panes = $('panes'), divider = $('divider'), paneA = $('paneA'), paneB = $('paneB');
function showLib(on) { paneB.hidden = !on; divider.hidden = !on; $('libtoggle').classList.toggle('on', on); if (!on && DT.active === lib) main.activateFrom(); }
$('libtoggle').addEventListener('click', () => showLib(paneB.hidden)); showLib(false);
divider.addEventListener('mousedown', ev => { ev.preventDefault(); const r = panes.getBoundingClientRect();
  const mv = e => { const f = Math.max(0.15, Math.min(0.85, (e.clientX - r.left) / r.width)); paneA.style.flex = `0 0 ${f * 100}%`; paneB.style.flex = '1 1 0'; };
  const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); }; window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up); });
G.DTUI = { showLib };
})(window);
