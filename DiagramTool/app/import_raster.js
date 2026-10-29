// PNG/JPG -> editable boxes, connectors, icons and text. BEST EFFORT.
// Text: Tesseract OCR (Apache-2.0, wasm build from tesseract.js-core, English model from tessdata_best, Apache-2.0).
// Shapes: OpenCV.js (Apache-2.0) image processing. Everything runs locally in the page; nothing is uploaded.
(function (G) {
'use strict';
const DT = G.DT;
const loadScript = src => new Promise((ok, bad) => { if (document.querySelector(`script[data-src="${src}"]`)) return ok(); const s = document.createElement('script'); s.src = src; s.dataset.src = src; s.onload = ok; s.onerror = () => bad(new Error('could not load ' + src)); document.head.appendChild(s); });
const base = () => (G.DT_BASE || 'vendor/');
let cvReady = null, tess = null;
DT.loadOpenCV = () => cvReady || (cvReady = (async () => { await loadScript(base() + 'opencv.js');
  const t0 = Date.now(); while (!(G.cv && G.cv.Mat && G.cv.morphologyEx)) { if (Date.now() - t0 > 120000) throw new Error('OpenCV did not start'); await new Promise(r => setTimeout(r, 100)); }
  return { cv: G.cv }; })()); // wrapped: cv is a 'thenable' and would hang an await
DT.loadOCR = () => tess || (tess = (async () => {
  await loadScript(base() + 'tesseract-core-lstm.wasm.js'); await loadScript(base() + 'eng_traineddata.js');
  const T = await G.TesseractCore(); const gz = Uint8Array.from(atob(G.DT_ENG_TRAINEDDATA_GZ_B64), c => c.charCodeAt(0));
  const data = new Uint8Array(await new Response(new Blob([gz]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
  T.FS.writeFile('/eng.traineddata', data);
  const api = new T.TessBaseAPI(); if (api.Init('/', 'eng', 1) !== 0) throw new Error('OCR init failed');
  return { T, api };
})());
const hex = (r, g, b) => '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
async function ocr(canvas, psm) {
  const { T, api } = await DT.loadOCR();
  const blob = await new Promise(r => canvas.toBlob(r, 'image/png')); T.FS.writeFile('/input', new Uint8Array(await blob.arrayBuffer()));
  api.SetVariable('tessedit_pageseg_mode', String(psm || 12)); // sparse text: diagrams have scattered labels
  if (api.SetImageFile(1, 0) === 1) throw new Error('OCR could not read image');
  api.Recognize(null); const tsv = api.GetTSVText(0);
  const lines = {};
  for (const row of tsv.split('\n')) { const c = row.split('\t'); if (c.length < 12 || c[0] !== '5') continue; const conf = +c[10], txt = c[11];
    if (!txt || !txt.trim() || conf < 0) continue; const key = c.slice(1, 5).join('_'); const [x, y, w, h] = c.slice(6, 10).map(Number);
    const L = lines[key] = lines[key] || { words: [] }; L.words.push({ x, y, w, h, conf, txt }); }
  return Object.values(lines).map(L => { const ws = L.words.sort((a, b) => a.x - b.x); const x0 = Math.min(...ws.map(w => w.x)), y0 = Math.min(...ws.map(w => w.y));
    return { box: [x0, y0, Math.max(...ws.map(w => w.x + w.w)), Math.max(...ws.map(w => w.y + w.h))], text: ws.map(w => w.txt).join(' '), conf: ws.reduce((a, w) => a + w.conf, 0) / ws.length / 100, h: Math.max(...ws.map(w => w.h)) }; });
}
DT._ocr = ocr;
DT.importRaster = async function (buf, opts = {}) {
  const log = opts.log || (() => {});
  const blob = new Blob([buf]); const bmp = await createImageBitmap(blob);
  const W = bmp.width, H = bmp.height; const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); ctx.drawImage(bmp, 0, 0);
  const px = ctx.getImageData(0, 0, W, H).data;
  const sc = DT.scene(W, H, 'raster-recognised');
  const bgImg = { id: DT.newId('bg'), type: 'image', x: 0, y: 0, w: W, h: H, locked: true, opacity: 0.25, href: canvas.toDataURL('image/png'), style: DT.style() };
  if (opts.recognise === false) { bgImg.opacity = 1; sc.nodes.push(bgImg); sc.notes.push('Picture placed as a locked background (recognition off).'); return sc; }
  log('Loading OpenCV…'); const { cv } = await DT.loadOpenCV();
  // background = median of border pixels
  const border = []; for (let x = 0; x < W; x += 3) { border.push(x, (H - 1) * W + x); } for (let y = 0; y < H; y += 3) { border.push(y * W, y * W + W - 1); }
  const med = ch => { const v = border.map(i => px[i * 4 + ch]).sort((a, b) => a - b); return v[v.length >> 1]; }; const bg = [med(0), med(1), med(2)];
  const ink = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) { const d = Math.max(Math.abs(px[i * 4] - bg[0]), Math.abs(px[i * 4 + 1] - bg[1]), Math.abs(px[i * 4 + 2] - bg[2])); ink[i] = d > 60 ? 255 : 0; }
  const sat = i => { const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2]; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx ? (mx - mn) / mx * 255 : 0; };
  // ---- text ----
  let texts = [];
  if (opts.ocr !== false) { log('Reading text (OCR)…');
    const s = W < 1000 ? 2 : 1; const big = document.createElement('canvas'); big.width = W * s; big.height = H * s; const bctx = big.getContext('2d'); bctx.imageSmoothingQuality = 'high'; bctx.drawImage(canvas, 0, 0, W * s, H * s);
    texts = (await ocr(big, opts.psm)).map(t => Object.assign(t, { box: t.box.map(v => v / s), h: t.h / s })).filter(t => { const al = (t.text.match(/[A-Za-z0-9]/g) || []).length; return t.conf >= 0.5 && al >= 2 && al / t.text.replace(/\s/g, '').length >= 0.6 && !(t.text.length <= 3 && t.conf < 0.85); });
  }
  const work = ink.slice();
  const clearBox = (x0, y0, x1, y1) => { for (let y = Math.max(0, Math.floor(y0)); y < Math.min(H, Math.ceil(y1)); y++) work.fill(0, y * W + Math.max(0, Math.floor(x0)), y * W + Math.min(W, Math.ceil(x1))); };
  for (const t of texts) { const [x0, y0, x1, y1] = t.box; let fr = 0; const sum = [0, 0, 0];
    for (let y = Math.floor(y0); y < y1; y++) for (let x = Math.floor(x0); x < x1; x++) { const i = y * W + x; if (ink[i]) { fr++; sum[0] += px[i * 4]; sum[1] += px[i * 4 + 1]; sum[2] += px[i * 4 + 2]; } }
    t.color = fr ? hex(sum[0] / fr, sum[1] / fr, sum[2] / fr) : '#000000'; clearBox(x0 - 1, y0 - 1, x1 + 1, y1 + 1); }
  // ---- boxes & icons ----
  log('Finding boxes, icons and lines…');
  const k = Math.max(3, Math.round(Math.min(W, H) / 250) | 1);
  const mat = cv.matFromArray(H, W, cv.CV_8UC1, work); const closed = new cv.Mat();
  const ker = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(Math.max(9, Math.round(k * 1.6) | 1), Math.max(9, Math.round(k * 1.6) | 1))); cv.morphologyEx(mat, closed, cv.MORPH_CLOSE, ker);
  const cnts = new cv.MatVector(), hier = new cv.Mat(); cv.findContours(closed, cnts, hier, cv.RETR_TREE, cv.CHAIN_APPROX_SIMPLE);
  const boxes = [], icons = [], ovals = [];
  const inkFrac = (x0, y0, x1, y1) => { let n = 0, t = 0; for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) { t++; if (work[y * W + x]) n++; } return t ? n / t : 1; };
  for (let i = 0; i < cnts.size(); i++) {
    const c = cnts.get(i); const r = cv.boundingRect(c); const { x, y, width: w, height: h } = r; const area = cv.contourArea(c); c.delete();
    if (w < 12 || h < 12 || w * h > 0.95 * W * H) continue; const fillratio = area / (w * h);
    if (fillratio > 0.74 && fillratio < 0.82 && w > 30 && h > 20 && inkFrac(x + 2 * k, y + 2 * k, x + w - 2 * k, y + h - 2 * k) < 0.35 && (() => { let hit = 0; for (let a = 0; a < 48; a++) { const cx = x + w / 2 + Math.cos(a / 48 * 2 * Math.PI) * (w / 2 - k / 2), cy = y + h / 2 + Math.sin(a / 48 * 2 * Math.PI) * (h / 2 - k / 2); let f = 0; for (let dy = -k; dy <= k; dy++) for (let dx = -k; dx <= k; dx++) { const xx = Math.round(cx + dx), yy = Math.round(cy + dy); if (xx >= 0 && yy >= 0 && xx < W && yy < H && work[yy * W + xx]) f = 1; } hit += f; } return hit >= 40; })()) { // outline oval
      let sr = 0, sg = 0, sb = 0, n = 0; for (let xx = x; xx < x + w; xx++) { const i2 = (y + (h >> 1)) * W + xx; if (work[i2]) { sr += px[i2 * 4]; sg += px[i2 * 4 + 1]; sb += px[i2 * 4 + 2]; n++; } }
      ovals.push({ x, y, w, h, stroke: n ? hex(sr / n, sg / n, sb / n) : '#000000' }); continue; }
    if (fillratio < 0.86) continue;
    const innerInk = inkFrac(x + 2 * k, y + 2 * k, x + w - 2 * k, y + h - 2 * k);
    let ss = 0, sn = 0; for (let yy = y; yy < y + h; yy += 3) for (let xx = x; xx < x + w; xx += 3) { if (ink[yy * W + xx]) { ss += sat(yy * W + xx); sn++; } } const S = sn ? ss / sn : 0;
    if (innerInk > 0.35 || (w < 0.12 * W && h < 0.12 * H && S > 60 && w < 2.2 * h && h < 2.2 * w)) { if (Math.max(w, h) < 0.15 * Math.max(W, H)) icons.push([x, y, w, h]); continue; }
    if (w < 30 || h < 20) continue;
    let cov = 0, tot = 0; const t = k; const on = (xx, yy) => { let m = 0; for (let d = 0; d < t; d++) { if (work[(yy) * W + xx]) m = 1; } return m; };
    for (let xx = x; xx < x + w; xx++) { tot += 2; let a = 0, b = 0; for (let d = 0; d < t; d++) { if (work[(y + d) * W + xx]) a = 1; if (work[(y + h - 1 - d) * W + xx]) b = 1; } cov += a + b; }
    for (let yy = y; yy < y + h; yy++) { tot += 2; let a = 0, b = 0; for (let d = 0; d < t; d++) { if (work[yy * W + x + d]) a = 1; if (work[yy * W + x + w - 1 - d]) b = 1; } cov += a + b; }
    const cover = cov / tot; let sr = 0, sg = 0, sb = 0, n = 0;
    for (let xx = x; xx < x + w; xx += 2) for (let d = 0; d < t; d++) { const i2 = (y + d) * W + xx; if (work[i2]) { sr += px[i2 * 4]; sg += px[i2 * 4 + 1]; sb += px[i2 * 4 + 2]; n++; } }
    let thick = 0; for (let d = 0; d < 3 * k; d++) if (work[(y + d) * W + x + (w >> 1)]) thick++;
    boxes.push({ x, y, w, h, dash: cover > 0.8 ? 'solid' : cover < 0.45 ? 'dotted' : 'dashed', stroke: n ? hex(sr / n, sg / n, sb / n) : '#000000', sw: Math.max(1, Math.min(6, thick || 1)), rx: DT.r(Math.min(w, h) * Math.min(0.25, (1 - fillratio) * 4)) });
  }
  [mat, closed, ker, cnts, hier].forEach(m => m.delete());
  boxes.sort((a, b) => b.w * b.h - a.w * a.h); const kept = [];
  for (const b of boxes) if (!kept.some(o => Math.abs(b.x - o.x) < 3 * k && Math.abs(b.y - o.y) < 3 * k && Math.abs(b.w - o.w) < 6 * k && Math.abs(b.h - o.h) < 6 * k)) kept.push(b);
  const nodes = [];
  for (const b of kept) { nodes.push({ id: DT.newId(), type: 'rect', x: b.x, y: b.y, w: b.w, h: b.h, rx: b.rx, style: DT.style(b.stroke, 'none', b.sw, b.dash) });
    const t = 2 * k + b.sw; clearBox(b.x - t, b.y - t, b.x + b.w + t, b.y + t); clearBox(b.x - t, b.y + b.h - t, b.x + b.w + t, b.y + b.h + t); clearBox(b.x - t, b.y - t, b.x + t, b.y + b.h + t); clearBox(b.x + b.w - t, b.y - t, b.x + b.w + t, b.y + b.h + t); }
  const ok2 = []; for (const o of ovals.sort((a, b) => b.w * b.h - a.w * a.h)) if (!ok2.some(q => Math.abs(q.x - o.x) < 4 * k && Math.abs(q.y - o.y) < 4 * k)) ok2.push(o);
  for (const o of ok2) { nodes.push({ id: DT.newId(), type: 'ellipse', x: o.x, y: o.y, w: o.w, h: o.h, style: DT.style(o.stroke, 'none', 2, 'solid') }); clearBox(o.x - k, o.y - k, o.x + o.w + k, o.y + o.h + k); }
  // icons (after boxes are removed): compact, dense blobs (coloured service icons, people, globes…)
  const icons0 = [];
  for (const solid of [false, true]) { const m0 = cv.matFromArray(H, W, cv.CV_8UC1, work), m1 = new cv.Mat(), kk = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(k, k)); cv.morphologyEx(m0, m1, cv.MORPH_CLOSE, kk);
    if (solid) { const t = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(9, 9)); cv.morphologyEx(m1, m1, cv.MORPH_OPEN, t); cv.dilate(m1, m1, t); t.delete(); } // drop thin lines touching filled icons
    const lab = new cv.Mat(), st = new cv.Mat(), ce = new cv.Mat(); const n = cv.connectedComponentsWithStats(m1, lab, st, ce); const M = Math.max(W, H);
    for (let i = 1; i < n; i++) { const x = st.intAt(i, 0), y = st.intAt(i, 1), w = st.intAt(i, 2), h = st.intAt(i, 3), a = st.intAt(i, 4);
      if (w < Math.max(16, 0.012 * M) || h < Math.max(16, 0.012 * M) || w > 0.08 * M || h > 0.08 * M || w > 2 * h || h > 2 * w) continue; if (a / (w * h) < 0.22) continue; if (!icons0.some(o => x >= o[0] - 3 && y >= o[1] - 3 && x + w <= o[0] + o[2] + 3 && y + h <= o[1] + o[3] + 3)) icons0.push([x, y, w, h]); }
    [m0, m1, kk, lab, st, ce].forEach(z => z.delete()); }
  for (const [x, y, w, h] of icons0) clearBox(x - 1, y - 1, x + w + 1, y + h + 1);
  icons.push(...icons0); icons.sort((a, b) => b[2] * b[3] - a[2] * a[3]); const ik = [];
  for (const r of icons) if (!ik.some(o => r[0] >= o[0] - 2 && r[1] >= o[1] - 2 && r[0] + r[2] <= o[0] + o[2] + 2 && r[1] + r[3] <= o[1] + o[3] + 2)) ik.push(r);
  for (const [x, y, w, h] of ik) { const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(canvas, x, y, w, h, 0, 0, w, h);
    nodes.push({ id: DT.newId('i'), type: 'image', x, y, w, h, href: c.toDataURL('image/png'), style: DT.style() }); clearBox(x, y, x + w, y + h); }
  // ---- connectors: horizontal / vertical strokes ----
  const L = Math.max(15, Math.floor(Math.min(W, H) / 60)); const wm = cv.matFromArray(H, W, cv.CV_8UC1, work);
  const segs = [];
  const masks = [];
  for (const [kw, kh, o] of [[L, 1, 'h'], [1, L, 'v']]) {
    const m = new cv.Mat(), kk = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(kw, kh)); cv.morphologyEx(wm, m, cv.MORPH_OPEN, kk);
    const lab = new cv.Mat(), stats = new cv.Mat(), cen = new cv.Mat(); const n = cv.connectedComponentsWithStats(m, lab, stats, cen);
    const LD = lab.data32S;
    for (let i = 1; i < n; i++) { const x = stats.intAt(i, 0), y = stats.intAt(i, 1), w = stats.intAt(i, 2), h = stats.intAt(i, 3);
      if (o === 'h' && (w < L || h > 12)) continue; if (o === 'v' && (h < L || w > 12)) continue;
      let sr = 0, sg = 0, sb = 0, c = 0; for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx += 2) { const j = yy * W + xx; if (LD[j] === i) { sr += px[j * 4]; sg += px[j * 4 + 1]; sb += px[j * 4 + 2]; c++; } }
      const P = o === 'h' ? [[x, y + h / 2], [x + w, y + h / 2]] : [[x + w / 2, y], [x + w / 2, y + h]];
      segs.push({ pts: P, rgb: c ? [sr / c, sg / c, sb / c] : [0, 0, 0], sw: Math.max(1, o === 'h' ? h : w) }); }
    masks.push(new Uint8Array(m.data)); [m, kk, lab, stats, cen].forEach(z => z.delete());
  }
  wm.delete();
  const tol = 8, near = (a, b) => Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol, cclose = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i]))) < 60;
  let merged = true;
  while (merged) { merged = false;
    outer: for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) { if (!cclose(segs[i].rgb, segs[j].rgb)) continue;
      for (const ra of [0, 1]) for (const rb of [0, 1]) { const A = ra ? segs[i].pts.slice().reverse() : segs[i].pts, B = rb ? segs[j].pts.slice().reverse() : segs[j].pts;
        if (near(A[A.length - 1], B[0])) { const a1 = A[A.length - 1], a0 = A[A.length - 2]; const horiz = Math.abs(a1[1] - a0[1]) < 1;
          const corner = horiz ? [B[0][0], a1[1]] : [a1[0], B[0][1]]; segs[i].pts = A.slice(0, -1).concat([corner], B.slice(1)); segs.splice(j, 1); merged = true; break outer; } } } }
  // diagonal connectors: probabilistic Hough on what is left
  { const rest = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) rest[i] = work[i] && !masks[0][i] && !masks[1][i] ? 255 : 0;
    const rm = cv.matFromArray(H, W, cv.CV_8UC1, rest), lines = new cv.Mat(); cv.HoughLinesP(rm, lines, 1, Math.PI / 180, 30, 3 * L, 6);
    const cand = []; for (let i = 0; i < lines.rows; i++) { const [x1, y1, x2, y2] = [lines.data32S[i * 4], lines.data32S[i * 4 + 1], lines.data32S[i * 4 + 2], lines.data32S[i * 4 + 3]];
      const ang = Math.abs(Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI) % 90; if (ang < 8 || ang > 82) continue; cand.push([x1, y1, x2, y2, Math.hypot(x2 - x1, y2 - y1)]); }
    cand.sort((a, b) => b[4] - a[4]); const dist = (p, a) => { const [x1, y1, x2, y2] = a, dx = x2 - x1, dy = y2 - y1, t = Math.max(0, Math.min(1, ((p[0] - x1) * dx + (p[1] - y1) * dy) / (dx * dx + dy * dy))); return Math.hypot(x1 + t * dx - p[0], y1 + t * dy - p[1]); };
    const keptL = []; for (const c of cand) if (!keptL.some(q => dist([c[0], c[1]], q) < 6 && dist([c[2], c[3]], q) < 6)) keptL.push(c);
    for (const [x1, y1, x2, y2] of keptL) { let sr = 0, sg = 0, sb = 0, n = 0; for (let t = 0; t <= 1; t += 0.02) { const xx = Math.round(x1 + t * (x2 - x1)), yy = Math.round(y1 + t * (y2 - y1)), j = yy * W + xx; if (ink[j]) { sr += px[j * 4]; sg += px[j * 4 + 1]; sb += px[j * 4 + 2]; n++; } }
      const solidness = n / 51; segs.push({ pts: [[x1, y1], [x2, y2]], rgb: n ? [sr / n, sg / n, sb / n] : [0, 0, 0], sw: 2, diag: true, dash: solidness > 0.8 ? 'solid' : solidness > 0.45 ? 'dashed' : 'dotted' }); }
    rm.delete(); lines.delete(); }
  const inkAt = (x, y) => { x = Math.round(x); y = Math.round(y); return x >= 0 && y >= 0 && x < W && y < H && ink[y * W + x]; };
  const widthAt = (q, n) => { let c = 0; for (let t = -18; t <= 18; t++) if (inkAt(q[0] + n[0] * t, q[1] + n[1] * t)) c++; return c; };
  const arrowAt = (end, prev) => { const dx = prev[0] - end[0], dy = prev[1] - end[1], d = Math.hypot(dx, dy) || 1, u = [dx / d, dy / d], n = [-u[1], u[0]];
    const mid = [end[0] + u[0] * Math.min(d / 2, 40), end[1] + u[1] * Math.min(d / 2, 40)], base = widthAt(mid, n); let mx = 0;
    for (let k2 = 3; k2 <= 16; k2 += 1) mx = Math.max(mx, widthAt([end[0] + u[0] * k2, end[1] + u[1] * k2], n)); return mx >= base + 5 && mx <= 30; };
  const edges = segs.filter(s => { let len = 0; for (let i = 1; i < s.pts.length; i++) len += Math.hypot(s.pts[i][0] - s.pts[i - 1][0], s.pts[i][1] - s.pts[i - 1][1]); return len >= 2 * L; }).map(s => { const P = s.pts.map(p => [DT.r(p[0]), DT.r(p[1])]); return { id: DT.newId('e'), points: P, from: null, to: null, arrowEnd: arrowAt(P[P.length - 1], P[P.length - 2]), arrowStart: arrowAt(P[0], P[1]), style: DT.style(hex(...s.rgb), 'none', Math.min(s.sw, 6), s.dash || 'solid') }; });
  for (const t of texts) { const [x0, y0, x1, y1] = t.box; const fs = DT.r(Math.max(7, (y1 - y0) * 0.8));
    nodes.push({ id: DT.newId('t'), type: 'text', x: DT.r(x0), y: DT.r(y0 + (y1 - y0 - fs * 1.2) / 2), w: DT.r(x1 - x0), text: t.text, fontSize: fs, conf: DT.r(t.conf), style: DT.style('none', t.color) }); }
  if (opts.background !== false) sc.nodes.push(bgImg);
  sc.nodes.push(...nodes); sc.edges = edges;
  DT.groupText(sc); DT.attachEdges(sc, 12);
  const low = texts.filter(t => t.conf < 0.8).length;
  sc.stats = { boxes: kept.length, icons: ik.length, lines: edges.length, text_lines: texts.length, low_confidence_text: low };
  sc.notes.push(`Recognised from a picture (best effort): ${kept.length} boxes, ${ik.length} icons, ${edges.length} lines, ${texts.length} text lines (${low} low-confidence, shown with a yellow mark). Faint original kept underneath (locked); delete it when done.`);
  return sc;
};
})(window);
