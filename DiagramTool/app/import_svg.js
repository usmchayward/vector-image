// SVG -> scene (browser DOMParser). Transforms are flattened; <line>/<polyline> become connectors.
(function (G) {
'use strict';
const DT = G.DT;
const I = [1, 0, 0, 1, 0, 0];
const mul = (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
const ap = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
DT.geom = { I, mul, ap };
const num = s => (String(s || '').match(/[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) || []).map(Number);
const len = (v, d = 0) => { const m = num(v); return m.length ? m[0] : d; };
function parseTransform(t) {
  let m = I; const re = /(\w+)\s*\(([^)]*)\)/g; let x;
  while ((x = re.exec(t || ''))) { const v = num(x[2]); let n = null;
    if (x[1] === 'matrix' && v.length === 6) n = v; else if (x[1] === 'translate') n = [1, 0, 0, 1, v[0], v[1] || 0];
    else if (x[1] === 'scale') n = [v[0], 0, 0, v.length > 1 ? v[1] : v[0], 0, 0];
    else if (x[1] === 'rotate') { const a = v[0] * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); n = [c, s, -s, c, 0, 0]; if (v.length === 3) n = mul(mul([1, 0, 0, 1, v[1], v[2]], n), [1, 0, 0, 1, -v[1], -v[2]]); }
    if (n) m = mul(m, n); }
  return m;
}
DT.parsePath = function (d) { // -> [[cmd,[[x,y]..]]] absolute M/L/C/Q/Z
  const toks = String(d || '').match(/[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) || [];
  let i = 0, cx = 0, cy = 0, sx = 0, sy = 0, cmd = null, lc = null; const out = []; const n = () => +toks[i++];
  while (i < toks.length) {
    if (/[A-Za-z]/.test(toks[i])) cmd = toks[i++]; if (!cmd) break;
    const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase(), ox = rel ? cx : 0, oy = rel ? cy : 0;
    if (C === 'Z') { out.push(['Z', []]); cx = sx; cy = sy; cmd = null; continue; }
    if (i >= toks.length) break;
    if (C === 'M') { cx = n() + ox; cy = n() + oy; sx = cx; sy = cy; out.push(['M', [[cx, cy]]]); cmd = rel ? 'l' : 'L'; }
    else if (C === 'L') { cx = n() + ox; cy = n() + oy; out.push(['L', [[cx, cy]]]); }
    else if (C === 'H') { cx = n() + (rel ? cx : 0); out.push(['L', [[cx, cy]]]); }
    else if (C === 'V') { cy = n() + (rel ? cy : 0); out.push(['L', [[cx, cy]]]); }
    else if (C === 'C') { const p = [[n() + ox, n() + oy], [n() + ox, n() + oy], [n() + ox, n() + oy]]; out.push(['C', p]); [cx, cy] = p[2]; lc = p[1]; }
    else if (C === 'S') { const c1 = lc ? [2 * cx - lc[0], 2 * cy - lc[1]] : [cx, cy]; const p = [[n() + ox, n() + oy], [n() + ox, n() + oy]]; out.push(['C', [c1, ...p]]); [cx, cy] = p[1]; lc = p[0]; }
    else if (C === 'Q') { const p = [[n() + ox, n() + oy], [n() + ox, n() + oy]]; out.push(['Q', p]); [cx, cy] = p[1]; }
    else if (C === 'T') { const p = [n() + ox, n() + oy]; out.push(['Q', [[cx, cy], p]]); [cx, cy] = p; }
    else if (C === 'A') { for (let k = 0; k < 5; k++) n(); cx = n() + ox; cy = n() + oy; out.push(['L', [[cx, cy]]]); }
    if (C !== 'C' && C !== 'S') lc = null;
  }
  return out;
};
DT.fmtPath = cmds => cmds.map(([c, p]) => c + (p.length ? ' ' + p.map(q => DT.r(q[0]) + ',' + DT.r(q[1])).join(' ') : '')).join(' ');
function styleOf(el, inh) {
  const st = Object.assign({}, inh); for (const a of el.attributes) st[a.name] = a.value;
  for (const part of (el.getAttribute('style') || '').split(';')) { const i = part.indexOf(':'); if (i > 0) st[part.slice(0, i).trim()] = part.slice(i + 1).trim(); }
  return st;
}
const dashOf = st => { const da = st['stroke-dasharray']; if (!da || da === 'none') return 'solid'; const v = num(da); return (v[0] || 0) <= 2.5 * Math.max(len(st['stroke-width'], 1), 1) ? 'dotted' : 'dashed'; };
const sty = st => DT.style(st.stroke || 'none', st.fill || '#000000', len(st['stroke-width'], 1), dashOf(st));
DT.importSVG = function (text) {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml'); const root = doc.documentElement;
  if (root.nodeName === 'parsererror' || doc.querySelector('parsererror')) throw new Error('SVG could not be parsed');
  const meta = doc.getElementById('diagram-tool-scene');
  if (meta) { const sc0 = JSON.parse(decodeURIComponent(escape(atob(meta.textContent.trim())))); sc0.source = 'svg-diagramtool'; sc0.notes = (sc0.notes || []).filter(n => !/^Re-opened/.test(n)); sc0.notes.push('Re-opened from a Diagram Tool SVG: fully editable, nothing lost.'); return sc0; }
  const vb = num(root.getAttribute('viewBox'));
  const W = vb.length === 4 ? vb[2] : len(root.getAttribute('width'), 800), H = vb.length === 4 ? vb[3] : len(root.getAttribute('height'), 600);
  const sc = DT.scene(W, H, 'svg'); const base = vb.length === 4 ? [1, 0, 0, 1, -vb[0], -vb[1]] : I;
  const SKIP = new Set(['defs', 'style', 'title', 'desc', 'marker', 'metadata', 'clipPath', 'symbol', 'linearGradient', 'radialGradient', 'pattern', 'mask', 'filter']);
  const walk = (el, m, inh) => { const out = [];
    for (const c of el.children) {
      const t = c.localName; if (SKIP.has(t)) continue;
      const st = styleOf(c, inh); if (st.display === 'none') continue;
      const cm = mul(m, parseTransform(c.getAttribute('transform'))); let n = null;
      const inhNext = Object.fromEntries(Object.entries(st).filter(([k]) => !['transform', 'id', 'style', 'x', 'y', 'width', 'height', 'd', 'points', 'class'].includes(k)));
      if (t === 'g' || t === 'a' || t === 'svg') { const k = walk(c, cm, inhNext); if (k.length) n = { id: DT.newId('g'), type: 'group', children: k }; }
      else if (['rect', 'image', 'circle', 'ellipse'].includes(t)) {
        let x, y, w, h;
        if (t === 'circle') { const r = len(c.getAttribute('r')); x = len(c.getAttribute('cx')) - r; y = len(c.getAttribute('cy')) - r; w = h = 2 * r; }
        else if (t === 'ellipse') { const rx = len(c.getAttribute('rx')), ry = len(c.getAttribute('ry')); x = len(c.getAttribute('cx')) - rx; y = len(c.getAttribute('cy')) - ry; w = 2 * rx; h = 2 * ry; }
        else { x = len(c.getAttribute('x')); y = len(c.getAttribute('y')); w = len(c.getAttribute('width')); h = len(c.getAttribute('height')); }
        if (Math.abs(cm[1]) > 1e-6 || Math.abs(cm[2]) > 1e-6) { const P = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map(p => ap(cm, ...p)); n = { id: DT.newId(), type: 'path', d: DT.fmtPath([['M', [P[0]]], ...P.slice(1).map(p => ['L', [p]]), ['Z', []]]), style: sty(st) }; }
        else { const [x0, y0] = ap(cm, x, y), [x1, y1] = ap(cm, x + w, y + h);
          n = { id: DT.newId(), type: t === 'circle' || t === 'ellipse' ? 'ellipse' : t, x: DT.r(Math.min(x0, x1)), y: DT.r(Math.min(y0, y1)), w: DT.r(Math.abs(x1 - x0)), h: DT.r(Math.abs(y1 - y0)), style: sty(st) };
          if (t === 'rect') n.rx = len(c.getAttribute('rx')); if (t === 'image') n.href = c.getAttribute('href') || c.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || ''; }
      } else if (t === 'line' || t === 'polyline' || t === 'polygon') {
        let P; if (t === 'line') P = [[len(c.getAttribute('x1')), len(c.getAttribute('y1'))], [len(c.getAttribute('x2')), len(c.getAttribute('y2'))]];
        else { const v = num(c.getAttribute('points')); P = []; for (let k = 0; k + 1 < v.length; k += 2) P.push([v[k], v[k + 1]]); }
        P = P.map(p => ap(cm, ...p).map(DT.r));
        if (t === 'polygon') n = { id: DT.newId(), type: 'path', d: DT.fmtPath([['M', [P[0]]], ...P.slice(1).map(p => ['L', [p]]), ['Z', []]]), style: sty(st) };
        else sc.edges.push({ id: DT.newId('e'), points: P, from: null, to: null, arrowEnd: !!st['marker-end'] && st['marker-end'] !== 'none', arrowStart: !!st['marker-start'] && st['marker-start'] !== 'none', style: sty(Object.assign({}, st, { fill: 'none' })) });
      } else if (t === 'path') {
        const cmds = DT.parsePath(c.getAttribute('d')).map(([k, p]) => [k, p.map(q => ap(cm, ...q))]);
        const straight = cmds.every(([k]) => k === 'M' || k === 'L'), closed = cmds.some(([k]) => k === 'Z');
        if (straight && !closed && cmds.length >= 2 && cmds.filter(([k]) => k === 'M').length === 1 && (st.fill === 'none'))
          sc.edges.push({ id: DT.newId('e'), points: cmds.map(([, p]) => p[0].map(DT.r)), from: null, to: null, arrowEnd: !!st['marker-end'] && st['marker-end'] !== 'none', arrowStart: !!st['marker-start'] && st['marker-start'] !== 'none', style: sty(st) });
        else n = { id: DT.newId(), type: 'path', d: DT.fmtPath(cmds), style: sty(st) };
      } else if (t === 'text') {
        const lines = [...c.querySelectorAll('tspan')].length ? [...c.querySelectorAll('tspan')].map(s => s.textContent.trim()).filter(Boolean) : [c.textContent.trim()];
        const [x, y] = ap(cm, len(c.getAttribute('x')), len(c.getAttribute('y'))); const fs = len(st['font-size'], 12) * Math.hypot(cm[0], cm[1]);
        const anc = st['text-anchor']; const tn = { id: DT.newId('t'), type: 'text', x: DT.r(x), y: DT.r(y - fs), text: lines.join('\n'), fontSize: DT.r(fs), style: DT.style('none', st.fill || '#000000') };
        if (anc === 'middle' || anc === 'end') { const w = DT.textWidth(tn); tn.w = DT.r(w); tn.x = DT.r(anc === 'middle' ? x - w / 2 : x - w); tn.align = anc === 'middle' ? 'center' : 'right'; }
        if (/bold|[6-9]00/.test(st['font-weight'] || '')) tn.bold = true;
        if (lines.join('')) n = tn;
      }
      if (n) out.push(n);
    }
    return out; };
  sc.nodes = walk(root, base, {});
  return DT.postProcess(sc);
};
})(window);
