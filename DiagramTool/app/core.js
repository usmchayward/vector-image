// Diagram Tool core: scene graph helpers shared by importers, editor and exporters (no dependencies).
// Scene: {version,width,height,source,notes[],nodes[],edges[]}; see docs/DESIGN.md.
(function (G) {
'use strict';
let _id = 1;
const DT = G.DT = G.DT || {};
DT.newId = p => (p || 'n') + (Date.now() % 1e6).toString(36) + '_' + (_id++);
DT.style = (stroke = '#000000', fill = 'none', w = 1, dash = 'solid') => ({ stroke, fill, strokeWidth: Math.round(w * 1000) / 1000, dash });
DT.scene = (w, h, source) => ({ version: 1, width: w, height: h, source: source || '', notes: [], nodes: [], edges: [] });
DT.r = v => Math.round(v * 100) / 100;
DT.dashArray = s => { const w = Math.max((s && s.strokeWidth) || 1, 1); return s && s.dash === 'dashed' ? `${6 * w},${4 * w}` : s && s.dash === 'dotted' ? `${w},${2 * w}` : null; };
DT.esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---------- geometry ----------
DT.pathNums = (d, f) => d.replace(/(-?[\d.]+(?:e-?\d+)?),(-?[\d.]+(?:e-?\d+)?)/g, (m, x, y) => { const p = f(+x, +y); return DT.r(p[0]) + ',' + DT.r(p[1]); });
DT.textWidth = n => n.w || Math.max(...String(n.text).split('\n').map(l => l.length)) * (n.fontSize || 12) * 0.55;
DT.bbox = function bbox(n) {
  if (n.points) { const xs = n.points.map(p => p[0]), ys = n.points.map(p => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; }
  if (n.type === 'group') { let b = null; for (const c of n.children || []) { const q = bbox(c); b = b ? [Math.min(b[0], q[0]), Math.min(b[1], q[1]), Math.max(b[2], q[2]), Math.max(b[3], q[3])] : q; } return b || [0, 0, 0, 0]; }
  if (n.type === 'path') { const xs = [], ys = []; DT.pathNums(n.d, (x, y) => { xs.push(x); ys.push(y); return [x, y]; }); return xs.length ? [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] : [0, 0, 0, 0]; }
  if (n.type === 'text') { const L = String(n.text).split('\n').length, fs = n.fontSize || 12; return [n.x, n.y, n.x + DT.textWidth(n), n.y + L * fs * 1.2]; }
  return [n.x, n.y, n.x + n.w, n.y + n.h];
};
DT.xform = function xform(n, f, sx, sy) {
  if (n.points) { n.points = n.points.map(p => f(p[0], p[1])); return; }
  if (n.type === 'group') { n.children.forEach(c => xform(c, f, sx, sy)); return; }
  if (n.type === 'path') { n.d = DT.pathNums(n.d, f); return; }
  const p = f(n.x, n.y); n.x = DT.r(p[0]); n.y = DT.r(p[1]);
  if (n.type === 'text') { n.fontSize = DT.r((n.fontSize || 12) * Math.min(sx, sy)); if (n.w) n.w *= sx; return; }
  n.w = DT.r(n.w * sx); n.h = DT.r(n.h * sy);
};
DT.walk = function walk(nodes, fn) { for (const n of nodes) { fn(n); if (n.children) walk(n.children, fn); } };
DT.summary = sc => { const c = {}; DT.walk(sc.nodes, n => c[n.type] = (c[n.type] || 0) + 1); c.edges = sc.edges.length; c.edges_attached = sc.edges.filter(e => e.from || e.to).length; c.edges_both_ends = sc.edges.filter(e => e.from && e.to).length; c.arrows = sc.edges.filter(e => e.arrowEnd || e.arrowStart).length; c.dashed_or_dotted = sc.edges.filter(e => e.style.dash !== 'solid').length + (function () { let k = 0; DT.walk(sc.nodes, n => { if (n.style && n.style.dash && n.style.dash !== 'solid') k++; }); return k; })(); return c; };

// ---------- post-processing shared by PDF / SVG / raster importers ----------
// 1) Arrowheads drawn as small filled triangles -> become the line's arrow (so they follow the line).
DT.mergeArrowheads = function (sc, tol = 4) {
  const isHead = n => n.type === 'path' && n.style && n.style.fill !== 'none' && (() => { const b = DT.bbox(n); const m = Math.max(b[2] - b[0], b[3] - b[1]); return m > 1 && m <= 30; })() && !/C/.test(n.d) && (n.d.match(/[ML]/g) || []).length <= 5;
  const heads = sc.nodes.filter(isHead); const used = new Set(); let merged = 0;
  for (const e of sc.edges) for (const end of ['end', 'start']) {
    const P = e.points, p = end === 'end' ? P[P.length - 1] : P[0], prev = end === 'end' ? P[P.length - 2] : P[1];
    let best = null;
    for (const h of heads) { if (used.has(h.id)) continue; const b = DT.bbox(h); if (p[0] >= b[0] - tol && p[0] <= b[2] + tol && p[1] >= b[1] - tol && p[1] <= b[3] + tol) { best = h; break; } }
    if (!best) continue;
    const pts = []; DT.pathNums(best.d, (x, y) => { pts.push([x, y]); return [x, y]; });
    let tip = pts[0], dmax = -1; for (const q of pts) { const d = Math.hypot(q[0] - prev[0], q[1] - prev[1]); if (d > dmax) { dmax = d; tip = q; } }
    const dp = Math.hypot(p[0] - prev[0], p[1] - prev[1]); if (dmax < dp - tol) continue; // head points the other way
    if (end === 'end') { P[P.length - 1] = [DT.r(tip[0]), DT.r(tip[1])]; e.arrowEnd = true; } else { P[0] = [DT.r(tip[0]), DT.r(tip[1])]; e.arrowStart = true; }
    if (best.style.fill && best.style.fill !== 'none') e.style.stroke = e.style.stroke === 'none' ? best.style.fill : e.style.stroke;
    used.add(best.id); merged++;
  }
  sc.nodes = sc.nodes.filter(n => !used.has(n.id));
  return merged;
};
// 2) Text lines that belong together (same size, stacked, aligned) -> one multi-line text block.
DT.groupText = function (sc) {
  const T = sc.nodes.filter(n => n.type === 'text' && !String(n.text).includes('\n')).sort((a, b) => a.y - b.y || a.x - b.x);
  const blocks = [];
  for (const t of T) {
    const fs = t.fontSize || 12, w = DT.textWidth(t), cx = t.x + w / 2;
    let hit = null;
    for (const b of blocks) {
      if (Math.abs(b.fs - fs) > 0.2 * fs) continue;
      const gap = t.y - b.bottom; if (gap < -0.3 * fs || gap > 0.7 * fs) continue;
      const lastW = b.lastW, lastX = b.lastX;
      const centred = Math.abs((lastX + lastW / 2) - cx) < Math.max(4, 0.15 * Math.max(w, lastW));
      const left = Math.abs(lastX - t.x) < Math.max(3, fs * 0.3);
      if (centred || left) { hit = b; b.align = b.lines.length === 1 ? (left && !centred ? 'left' : centred && !left ? 'center' : 'left') : b.align; break; }
    }
    if (hit) { hit.lines.push(t); hit.bottom = t.y + fs * 1.2; hit.lastW = w; hit.lastX = t.x; }
    else blocks.push({ lines: [t], fs, bottom: t.y + fs * 1.2, lastW: w, lastX: t.x, align: 'left' });
  }
  const drop = new Set(); let n = 0;
  for (const b of blocks) {
    if (b.lines.length < 2) continue;
    const f = b.lines[0]; const x0 = Math.min(...b.lines.map(l => l.x)), x1 = Math.max(...b.lines.map(l => l.x + DT.textWidth(l)));
    f.text = b.lines.map(l => l.text).join('\n'); f.x = DT.r(x0); f.w = DT.r(x1 - x0); f.align = b.align;
    b.lines.slice(1).forEach(l => drop.add(l.id)); n++;
  }
  sc.nodes = sc.nodes.filter(x => !drop.has(x.id));
  return n;
};
// 3) Connector ends -> the box/icon they touch (formats without connection data).
DT.attachEdges = function (sc, tol = 8) {
  const cands = sc.nodes.filter(n => n.type !== 'text' && !n.locked).map(n => [n.id, DT.bbox(n)]);
  const hit = p => {
    let best = null;
    for (const [id, b] of cands) {
      const [x0, y0, x1, y1] = b; const w = x1 - x0, h = y1 - y0; if (w < 2 && h < 2) continue;
      const inside = p[0] >= x0 && p[0] <= x1 && p[1] >= y0 && p[1] <= y1;
      const dx = Math.max(x0 - p[0], 0, p[0] - x1), dy = Math.max(y0 - p[1], 0, p[1] - y1);
      const out = Math.hypot(dx, dy);
      const depth = inside ? Math.min(p[0] - x0, x1 - p[0], p[1] - y0, y1 - p[1]) : 0;
      const small = w * h < 120 * 120;
      if (out > tol) continue; if (depth > tol && !small) continue; // deep inside a big container = not its end
      const score = out + depth * 0.5 + Math.sqrt(w * h) * 0.01;
      if (!best || score < best[0]) best = [score, id];
    }
    return best ? best[1] : null;
  };
  let n = 0;
  for (const e of sc.edges) { if (!e.from) e.from = hit(e.points[0]); if (!e.to) e.to = hit(e.points[e.points.length - 1]); if (e.from || e.to) n++; }
  return n;
};
DT.postProcess = function (sc, opts = {}) {
  const a = DT.mergeArrowheads(sc), t = DT.groupText(sc), c = DT.attachEdges(sc, opts.tol || 8);
  sc.stats = { arrowheads_merged: a, text_blocks: t, connectors_attached: c };
  return sc;
};

// ---------- SVG export ----------
DT.nodeSVG = function nodeSVG(n) {
  const s = n.style || {}; const da = DT.dashArray(s);
  const st = `stroke="${s.stroke || 'none'}" fill="${s.fill || 'none'}" stroke-width="${s.strokeWidth || 1}"${da ? ` stroke-dasharray="${da}"` : ''}`;
  let out = '';
  if (n.type === 'rect') out = `<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="${n.rx || 0}" ${st}/>`;
  else if (n.type === 'ellipse') out = `<ellipse cx="${n.x + n.w / 2}" cy="${n.y + n.h / 2}" rx="${n.w / 2}" ry="${n.h / 2}" ${st}/>`;
  else if (n.type === 'path') out = `<path d="${n.d}" ${st}/>`;
  else if (n.type === 'image') out = `<image x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" href="${n.href || ''}" preserveAspectRatio="none"/>`;
  else if (n.type === 'text') {
    const fs = n.fontSize || 12, al = n.align || 'left', w = DT.textWidth(n);
    const ax = al === 'center' ? n.x + w / 2 : al === 'right' ? n.x + w : n.x, anc = al === 'center' ? 'middle' : al === 'right' ? 'end' : 'start';
    const col = s.fill && s.fill !== 'none' ? s.fill : '#000';
    out = `<text x="${ax}" y="${n.y}" font-size="${fs}" font-family="Arial, sans-serif" text-anchor="${anc}" fill="${col}"${n.bold ? ' font-weight="bold"' : ''}>` + String(n.text).split('\n').map((l, i) => `<tspan x="${ax}" dy="${i ? fs * 1.2 : fs}">${DT.esc(l)}</tspan>`).join('') + '</text>';
  } else if (n.type === 'group') out = '<g>' + (n.children || []).map(nodeSVG).join('') + '</g>';
  const extra = [];
  if (n.rotate) { const b = DT.bbox(n); extra.push(`transform="rotate(${n.rotate} ${(b[0] + b[2]) / 2} ${(b[1] + b[3]) / 2})"`); }
  if (n.opacity != null && n.opacity < 1) extra.push(`opacity="${n.opacity}"`);
  return extra.length ? `<g ${extra.join(' ')}>${out}</g>` : out;
};
DT.edgeSVG = function (e) {
  const s = e.style || {}, da = DT.dashArray(s), mid = 'm_' + e.id.replace(/[^\w-]/g, '_');
  let m = '';
  if (e.arrowEnd || e.arrowStart) m = `<defs><marker id="${mid}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" fill="${s.stroke || '#000'}"/></marker></defs>`;
  return m + `<polyline points="${e.points.map(p => p.join(',')).join(' ')}" fill="none" stroke="${s.stroke || '#000'}" stroke-width="${s.strokeWidth || 1}"${da ? ` stroke-dasharray="${da}"` : ''}${e.arrowEnd ? ` marker-end="url(#${mid})"` : ''}${e.arrowStart ? ` marker-start="url(#${mid})"` : ''}/>`;
};
DT.toSVG = sc => [`<svg xmlns="http://www.w3.org/2000/svg" width="${sc.width}" height="${sc.height}" viewBox="0 0 ${sc.width} ${sc.height}">`, '<rect width="100%" height="100%" fill="#ffffff"/>',
  ...sc.nodes.filter(n => !n.hidden).map(DT.nodeSVG), ...sc.edges.map(DT.edgeSVG), '</svg>'].join('\n');
})(typeof window !== 'undefined' ? window : globalThis);
