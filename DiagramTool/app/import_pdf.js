// Vector PDF -> scene using Mozilla pdf.js (Apache-2.0), fully in the browser.
// We read the page's drawing instructions (operator list): rectangles -> boxes, open straight
// strokes -> connectors, other outlines -> paths, embedded pictures -> image nodes (cropped
// from a 2x render of the page), text from pdf.js text content.
(function (G) {
'use strict';
const DT = G.DT;
const hex = a => '#' + [0, 1, 2].map(i => Math.max(0, Math.min(255, Math.round(a[i]))).toString(16).padStart(2, '0')).join('');
DT.importPDF = async function (buf, pageNo = 1, opts = {}) {
  const pdfjsLib = G.pdfjsLib; if (!pdfjsLib) throw new Error('pdf.js not loaded');
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf), isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0 }).promise;
  if (!opts.ignoreEmbedded) { const att = await doc.getAttachments().catch(() => null);
    const a = att && (att[DT.SCENE_ATTACHMENT] || Object.values(att).find(x => x.filename === DT.SCENE_ATTACHMENT));
    if (a) { const sc0 = JSON.parse(new TextDecoder().decode(a.content)); sc0.notes = (sc0.notes || []).filter(n => !/^Re-opened/.test(n)); sc0.notes.push('Re-opened from a Diagram Tool PDF: fully editable, nothing lost.'); sc0.source = 'pdf-diagramtool'; return sc0; } }
  const page = await doc.getPage(pageNo); const OPS = pdfjsLib.OPS;
  const vp = page.getViewport({ scale: 1 }); const W = vp.width, H = vp.height;
  const sc = DT.scene(DT.r(W), DT.r(H), 'pdf');
  // 2x render: used for picture crops and to read text colours
  const S = opts.renderScale || 2; const canvas = document.createElement('canvas'); canvas.width = Math.ceil(W * S); canvas.height = Math.ceil(H * S);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  await page.render({ canvasContext: ctx, viewport: page.getViewport({ scale: S }) }).promise;
  const { mul, ap } = DT.geom;
  const ol = await page.getOperatorList();
  let st = { ctm: vp.transform.slice(), lw: 1, dash: [], stroke: '#000000', fill: '#000000' }; const stack = [];
  let path = null; const nodes = [], edges = [];
  const dashName = (arr, lw) => !arr || !arr.length || !arr.some(Boolean) ? 'solid' : (arr[0] <= 2.5 * Math.max(lw, 1) ? 'dotted' : 'dashed');
  const scaleOf = m => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
  const paint = (stroke, fill, close) => {
    if (!path || !path.cmds.length) { path = null; return; }
    if (close) path.cmds.push(['Z', []]);
    const lw = st.lw * scaleOf(path.ctm);
    const style = DT.style(stroke ? st.stroke : 'none', fill ? st.fill : 'none', Math.max(lw, 0.5), dashName(st.dash, st.lw));
    const cmds = path.cmds; const subpaths = cmds.filter(c => c[0] === 'M').length;
    const pts = cmds.flatMap(c => c[1]); const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const bb = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    // white full-page background -> skip
    if (!stroke && fill && (bb[2] - bb[0]) > 0.95 * W && (bb[3] - bb[1]) > 0.95 * H && /^#f[0-9a-f]f[0-9a-f]f[0-9a-f]$/i.test(st.fill)) { path = null; return; }
    const straight = cmds.every(c => c[0] === 'M' || c[0] === 'L'); const closed = cmds.some(c => c[0] === 'Z');
    const isRect = path.rects === 1 && cmds.length === 5 || (closed && straight && subpaths === 1 && pts.length === 4 && new Set(xs.map(DT.r)).size === 2 && new Set(ys.map(DT.r)).size === 2);
    if (isRect) nodes.push({ id: DT.newId(), type: 'rect', x: DT.r(bb[0]), y: DT.r(bb[1]), w: DT.r(bb[2] - bb[0]), h: DT.r(bb[3] - bb[1]), rx: 0, style });
    else if (straight && !closed && stroke && !fill && subpaths === 1) edges.push({ id: DT.newId('e'), points: pts.map(p => [DT.r(p[0]), DT.r(p[1])]), from: null, to: null, arrowEnd: false, arrowStart: false, style: Object.assign(style, { fill: 'none' }) });
    else if (straight && !closed && stroke && !fill && subpaths > 1) { // several separate strokes in one path -> one connector each
      let cur = null; for (const [k, p] of cmds) { if (k === 'M') { if (cur && cur.length > 1) edges.push({ id: DT.newId('e'), points: cur, from: null, to: null, arrowEnd: false, arrowStart: false, style: Object.assign({}, style, { fill: 'none' }) }); cur = [p[0].map(DT.r)]; } else cur.push(p[0].map(DT.r)); }
      if (cur && cur.length > 1) edges.push({ id: DT.newId('e'), points: cur, from: null, to: null, arrowEnd: false, arrowStart: false, style: Object.assign({}, style, { fill: 'none' }) });
    } else nodes.push({ id: DT.newId(), type: 'path', d: DT.fmtPath(cmds), style });
    path = null;
  };
  const imageBox = () => { const P = [[0, 0], [1, 0], [0, 1], [1, 1]].map(p => ap(st.ctm, ...p)); const xs = P.map(p => p[0]), ys = P.map(p => p[1]);
    const x0 = Math.min(...xs), y0 = Math.min(...ys), w = Math.max(...xs) - x0, h = Math.max(...ys) - y0; if (w < 1 || h < 1) return;
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w * S)); c.height = Math.max(1, Math.round(h * S));
    c.getContext('2d').drawImage(canvas, x0 * S, y0 * S, w * S, h * S, 0, 0, c.width, c.height);
    nodes.push({ id: DT.newId('i'), type: 'image', x: DT.r(x0), y: DT.r(y0), w: DT.r(w), h: DT.r(h), href: c.toDataURL('image/png'), style: DT.style() }); };
  const { fnArray: fns, argsArray: args } = ol;
  for (let i = 0; i < fns.length; i++) {
    const fn = fns[i], a = args[i];
    switch (fn) {
      case OPS.save: stack.push(Object.assign({}, st, { ctm: st.ctm.slice(), dash: st.dash.slice() })); break;
      case OPS.restore: if (stack.length) st = stack.pop(); break;
      case OPS.transform: st.ctm = mul(st.ctm, a); break;
      case OPS.paintFormXObjectBegin: stack.push(Object.assign({}, st, { ctm: st.ctm.slice() })); if (a[0]) st.ctm = mul(st.ctm, a[0]); break;
      case OPS.paintFormXObjectEnd: if (stack.length) st = stack.pop(); break;
      case OPS.setLineWidth: st.lw = a[0]; break;
      case OPS.setDash: st.dash = Array.from(a[0] || []); break;
      case OPS.setGState: for (const [k, v] of a[0]) { if (k === 'LW') st.lw = v; if (k === 'D') st.dash = Array.from(v[0] || []); } break;
      case OPS.setStrokeRGBColor: st.stroke = typeof a[0] === 'string' ? a[0] : hex(a); break;
      case OPS.setFillRGBColor: st.fill = typeof a[0] === 'string' ? a[0] : hex(a); break;
      case OPS.constructPath: {
        if (!path) path = { cmds: [], ctm: st.ctm.slice(), rects: 0 };
        const ops = a[0], v = a[1]; let j = 0, cur = [0, 0]; const T = (x, y) => ap(st.ctm, x, y);
        for (const op of ops) {
          if (op === OPS.moveTo) { cur = [v[j], v[j + 1]]; path.cmds.push(['M', [T(...cur)]]); j += 2; }
          else if (op === OPS.lineTo) { cur = [v[j], v[j + 1]]; path.cmds.push(['L', [T(...cur)]]); j += 2; }
          else if (op === OPS.curveTo) { path.cmds.push(['C', [T(v[j], v[j + 1]), T(v[j + 2], v[j + 3]), T(v[j + 4], v[j + 5])]]); cur = [v[j + 4], v[j + 5]]; j += 6; }
          else if (op === OPS.curveTo2) { path.cmds.push(['C', [T(...cur), T(v[j], v[j + 1]), T(v[j + 2], v[j + 3])]]); cur = [v[j + 2], v[j + 3]]; j += 4; }
          else if (op === OPS.curveTo3) { path.cmds.push(['C', [T(v[j], v[j + 1]), T(v[j + 2], v[j + 3]), T(v[j + 2], v[j + 3])]]); cur = [v[j + 2], v[j + 3]]; j += 4; }
          else if (op === OPS.closePath) path.cmds.push(['Z', []]);
          else if (op === OPS.rectangle) { const [x, y, w, h] = [v[j], v[j + 1], v[j + 2], v[j + 3]]; j += 4; path.rects++;
            path.cmds.push(['M', [T(x, y)]], ['L', [T(x + w, y)]], ['L', [T(x + w, y + h)]], ['L', [T(x, y + h)]], ['Z', []]); cur = [x, y]; }
        }
        break; }
      case OPS.stroke: paint(true, false, false); break;
      case OPS.closeStroke: paint(true, false, true); break;
      case OPS.fill: case OPS.eoFill: paint(false, true, false); break;
      case OPS.fillStroke: case OPS.eoFillStroke: paint(true, true, false); break;
      case OPS.closeFillStroke: case OPS.closeEOFillStroke: paint(true, true, true); break;
      case OPS.endPath: path = null; break; // clipping paths
      case OPS.paintImageXObject: case OPS.paintInlineImageXObject: case OPS.paintImageMaskXObject: case OPS.paintImageXObjectRepeat: imageBox(); break;
    }
  }
  // text: merge pdf.js pieces on the same baseline, colour sampled from the render
  const tc = await page.getTextContent(); const items = [];
  for (const it of tc.items) {
    if (!it.str || !it.str.trim()) { if (items.length && it.str === ' ') items[items.length - 1].str += ' '; continue; }
    const m = mul(vp.transform, it.transform); const fs = Math.hypot(m[2], m[3]) || it.height; const [bx, by] = [m[4], m[5]];
    const w = it.width * (vp.scale || 1);
    const prev = items[items.length - 1];
    if (prev && Math.abs(prev.by - by) < fs * 0.2 && Math.abs(prev.fs - fs) < fs * 0.15 && bx - (prev.x + prev.w) < fs * 0.6 && bx - (prev.x + prev.w) > -fs * 0.3) {
      const gap = bx - (prev.x + prev.w); prev.str += (gap > fs * 0.15 && !prev.str.endsWith(' ') ? ' ' : '') + it.str; prev.w = bx + w - prev.x; continue; }
    items.push({ str: it.str, x: bx, by, fs, w });
  }
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const colorAt = (x0, y0, x1, y1) => { let best = null, cnt = 0; const acc = [0, 0, 0];
    for (let y = Math.max(0, Math.floor(y0 * S)); y < Math.min(canvas.height, y1 * S); y += 1) for (let x = Math.max(0, Math.floor(x0 * S)); x < Math.min(canvas.width, x1 * S); x += 2) {
      const k = (y * canvas.width + x) * 4; const lum = img[k] * 0.3 + img[k + 1] * 0.59 + img[k + 2] * 0.11; if (best === null || lum < best) best = lum;
      if (lum < 110) { acc[0] += img[k]; acc[1] += img[k + 1]; acc[2] += img[k + 2]; cnt++; } }
    return cnt ? hex(acc.map(v => v / cnt)) : '#000000'; };
  for (const t of items) {
    const top = t.by - t.fs * 0.9; const tn = { id: DT.newId('t'), type: 'text', x: DT.r(t.x), y: DT.r(top - t.fs * 0.1), w: DT.r(t.w), text: t.str.trim(), fontSize: DT.r(t.fs * 0.95), style: DT.style('none', colorAt(t.x, top, t.x + t.w, t.by)) };
    nodes.push(tn);
  }
  sc.nodes = nodes.filter(n => n.type !== 'text').concat(nodes.filter(n => n.type === 'text')); sc.edges = edges;
  if (!nodes.some(n => n.type !== 'text' && n.type !== 'image') && !edges.length) sc.notes.push('No vector shapes found: this PDF looks like a scanned picture. Try opening it as an image (PNG) for recognition.');
  sc.pageCount = doc.numPages; if (doc.numPages > 1) sc.notes.push(`PDF has ${doc.numPages} pages; showing page ${pageNo}.`);
  return DT.postProcess(sc);
};
})(window);
