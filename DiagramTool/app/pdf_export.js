// Scene -> real vector PDF, written by our own code (no library). The full scene JSON is embedded
// as a PDF file attachment "diagram.scene.json", so re-opening the PDF in this tool is lossless,
// while any other PDF viewer just shows the drawing.
(function (G) {
'use strict';
const DT = G.DT; const SCENE_NAME = 'diagram.scene.json';
DT.SCENE_ATTACHMENT = SCENE_NAME;
const enc = new TextEncoder();
const n2 = v => (Math.round(v * 100) / 100).toString();
const rgb = (h, d) => { if (!h || h === 'none') return null; const m = /^#?([0-9a-f]{6})$/i.exec(h) || /^#?([0-9a-f]{3})$/i.exec(h); if (!m) return d; let s = m[1]; if (s.length === 3) s = s.split('').map(c => c + c).join(''); return [0, 2, 4].map(i => n2(parseInt(s.substr(i, 2), 16) / 255)).join(' '); };
const pdfStr = s => '(' + String(s).replace(/[\\()]/g, m => '\\' + m).replace(/[^\x20-\x7e]/g, c => { const k = c.charCodeAt(0); return k < 256 ? '\\' + k.toString(8).padStart(3, '0') : '?'; }) + ')';
let measureCtx = null; const textW = (s, fs, bold) => { measureCtx = measureCtx || document.createElement('canvas').getContext('2d'); measureCtx.font = `${bold ? 'bold ' : ''}${fs}px Helvetica, Arial, sans-serif`; return measureCtx.measureText(s).width; };
async function jpegOf(href, w, h) {
  const img = new Image(); img.src = href; await img.decode();
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.min(img.naturalWidth || w, 2000)); c.height = Math.max(1, Math.round(c.width * (img.naturalHeight || h) / (img.naturalWidth || w)));
  const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
  const b64 = c.toDataURL('image/jpeg', 0.9).split(',')[1]; return { bytes: Uint8Array.from(atob(b64), ch => ch.charCodeAt(0)), w: c.width, h: c.height };
}
DT.toPDF = async function (sc, opts = {}) {
  const W = sc.width, H = sc.height; const ops = []; const images = []; const gstates = {};
  const strokeOps = s => { const out = []; const sc_ = rgb(s.stroke, null); if (sc_) out.push(sc_ + ' RG'); out.push(n2(s.strokeWidth || 1) + ' w');
    const da = DT.dashArray(s); out.push(da ? `[${da.split(',').map(Number).map(n2).join(' ')}] 0 d` : '[] 0 d'); return out; };
  const paintOp = s => { const f = rgb(s.fill, null), st = rgb(s.stroke, null); return f && st ? 'B' : f ? 'f' : st ? 'S' : 'n'; };
  const pathOps = cmds => { const o = []; let cur = [0, 0];
    for (const [c, p] of cmds) { if (c === 'M') { o.push(`${n2(p[0][0])} ${n2(p[0][1])} m`); cur = p[0]; } else if (c === 'L') { o.push(`${n2(p[0][0])} ${n2(p[0][1])} l`); cur = p[0]; }
      else if (c === 'C') { o.push(p.map(q => `${n2(q[0])} ${n2(q[1])}`).join(' ') + ' c'); cur = p[2]; }
      else if (c === 'Q') { const [q, e] = p; const c1 = [cur[0] + 2 / 3 * (q[0] - cur[0]), cur[1] + 2 / 3 * (q[1] - cur[1])], c2 = [e[0] + 2 / 3 * (q[0] - e[0]), e[1] + 2 / 3 * (q[1] - e[1])]; o.push([c1, c2, e].map(q2 => `${n2(q2[0])} ${n2(q2[1])}`).join(' ') + ' c'); cur = e; }
      else if (c === 'Z') o.push('h'); } return o; };
  const ellipse = (x, y, w, h) => { const k = 0.5523, rx = w / 2, ry = h / 2, cx = x + rx, cy = y + ry;
    return pathOps([['M', [[cx + rx, cy]]], ['C', [[cx + rx, cy + k * ry], [cx + k * rx, cy + ry], [cx, cy + ry]]], ['C', [[cx - k * rx, cy + ry], [cx - rx, cy + k * ry], [cx - rx, cy]]], ['C', [[cx - rx, cy - k * ry], [cx - k * rx, cy - ry], [cx, cy - ry]]], ['C', [[cx + k * rx, cy - ry], [cx + rx, cy - k * ry], [cx + rx, cy]]], ['Z', []]]); };
  const roundRect = (x, y, w, h, r) => { r = Math.min(r, w / 2, h / 2); const k = 0.5523 * r;
    return pathOps([['M', [[x + r, y]]], ['L', [[x + w - r, y]]], ['C', [[x + w - r + k, y], [x + w, y + r - k], [x + w, y + r]]], ['L', [[x + w, y + h - r]]], ['C', [[x + w, y + h - r + k], [x + w - r + k, y + h], [x + w - r, y + h]]],
      ['L', [[x + r, y + h]]], ['C', [[x + r - k, y + h], [x, y + h - r + k], [x, y + h - r]]], ['L', [[x, y + r]]], ['C', [[x, y + r - k], [x + r - k, y], [x + r, y]]], ['Z', []]]); };
  const emit = async n => {
    if (n.hidden) return; const s = n.style || {}; ops.push('q');
    if (n.rotate) { const b = DT.bbox(n), cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2, a = n.rotate * Math.PI / 180, c = Math.cos(a), si = Math.sin(a);
      ops.push(`1 0 0 1 ${n2(cx)} ${n2(cy)} cm ${n2(c)} ${n2(si)} ${n2(-si)} ${n2(c)} 0 0 cm 1 0 0 1 ${n2(-cx)} ${n2(-cy)} cm`); }
    if (n.opacity != null && n.opacity < 1) { const k = 'GS' + Math.round(n.opacity * 100); gstates[k] = n.opacity; ops.push(`/${k} gs`); }
    if (n.type === 'group') { for (const c of n.children || []) await emit(c); }
    else if (n.type === 'rect' || n.type === 'ellipse' || n.type === 'path') {
      const f = rgb(s.fill, null); if (f) ops.push(f + ' rg'); ops.push(...strokeOps(s));
      if (n.type === 'rect') ops.push(...(n.rx ? roundRect(n.x, n.y, n.w, n.h, n.rx) : [`${n2(n.x)} ${n2(n.y)} ${n2(n.w)} ${n2(n.h)} re`]));
      else if (n.type === 'ellipse') ops.push(...ellipse(n.x, n.y, n.w, n.h)); else ops.push(...pathOps(DT.parsePath(n.d)));
      ops.push(paintOp(s));
    } else if (n.type === 'image' && n.href) {
      try { const im = await jpegOf(n.href, n.w, n.h); const name = 'Im' + images.length; images.push(Object.assign(im, { name }));
        ops.push(`${n2(n.w)} 0 0 ${n2(-n.h)} ${n2(n.x)} ${n2(n.y + n.h)} cm /${name} Do`); } catch (e) { console.warn('image skipped', e); }
    } else if (n.type === 'text') {
      const fs = n.fontSize || 12, al = n.align || 'left', w = DT.textWidth(n); const col = rgb(s.fill, '0 0 0') || '0 0 0';
      String(n.text).split('\n').forEach((line, i) => { const lw = textW(line, fs, n.bold); const x = al === 'center' ? n.x + (w - lw) / 2 : al === 'right' ? n.x + w - lw : n.x; const y = n.y + fs * 0.85 + i * fs * 1.2;
        ops.push(`BT ${col} rg /${n.bold ? 'F2' : 'F1'} ${n2(fs)} Tf 1 0 0 -1 ${n2(x)} ${n2(y)} Tm ${pdfStr(line)} Tj ET`); });
    }
    ops.push('Q');
  };
  ops.push(`1 0 0 -1 0 ${n2(H)} cm`, '1 1 1 rg', `0 0 ${n2(W)} ${n2(H)} re f`, '1 J 1 j');
  for (const n of sc.nodes) await emit(n);
  for (const e of sc.edges) { const s = e.style || {}, P = e.points; if (P.length < 2) continue;
    ops.push('q', ...strokeOps(s), `${n2(P[0][0])} ${n2(P[0][1])} m`, ...P.slice(1).map(p => `${n2(p[0])} ${n2(p[1])} l`), 'S');
    const head = (tip, from) => { const L = Math.max(8, 3 * (s.strokeWidth || 1)), dx = tip[0] - from[0], dy = tip[1] - from[1], d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
      const b = [tip[0] - ux * L, tip[1] - uy * L]; ops.push('[] 0 d', (rgb(s.stroke, '0 0 0') || '0 0 0') + ' rg', `${n2(tip[0])} ${n2(tip[1])} m ${n2(b[0] - uy * L / 2)} ${n2(b[1] + ux * L / 2)} l ${n2(b[0] + uy * L / 2)} ${n2(b[1] - ux * L / 2)} l h f`); };
    if (e.arrowEnd) head(P[P.length - 1], P[P.length - 2]); if (e.arrowStart) head(P[0], P[1]); ops.push('Q'); }
  // ---- assemble the file ----
  const objs = []; const add = parts => { objs.push(parts); return objs.length; };
  const content = enc.encode(ops.join('\n'));
  const json = enc.encode(JSON.stringify(Object.assign({}, sc, { dtExport: { app: 'DiagramTool', version: 1 } })));
  const catalog = add(null), pages = add(null), page = add(null);
  const f1 = add(['<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>']), f2 = add(['<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>']);
  const cont = add([`<< /Length ${content.length} >>\nstream\n`, content, '\nendstream']);
  const imgIds = images.map(im => [im.name, add([`<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.bytes.length} >>\nstream\n`, im.bytes, '\nendstream'])]);
  const ef = add([`<< /Type /EmbeddedFile /Subtype /application#2Fjson /Length ${json.length} >>\nstream\n`, json, '\nendstream']);
  const fs = add([`<< /Type /Filespec /F (${SCENE_NAME}) /UF (${SCENE_NAME}) /Desc (Editable Diagram Tool scene) /EF << /F ${ef} 0 R >> >>`]);
  const gs = Object.entries(gstates).map(([k, v]) => `/${k} << /ca ${v} /CA ${v} >>`).join(' ');
  objs[catalog - 1] = [`<< /Type /Catalog /Pages ${pages} 0 R /Names << /EmbeddedFiles << /Names [(${SCENE_NAME}) ${fs} 0 R] >> >> >>`];
  objs[pages - 1] = [`<< /Type /Pages /Kids [${page} 0 R] /Count 1 >>`];
  objs[page - 1] = [`<< /Type /Page /Parent ${pages} 0 R /MediaBox [0 0 ${n2(W)} ${n2(H)}] /Contents ${cont} 0 R /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> /XObject << ${imgIds.map(([n, i]) => `/${n} ${i} 0 R`).join(' ')} >> /ExtGState << ${gs} >> >> >>`];
  const chunks = []; let off = 0; const offsets = []; const push = x => { const b = typeof x === 'string' ? enc.encode(x) : x; chunks.push(b); off += b.length; };
  push('%PDF-1.7\n%\xE2\xE3\xCF\xD3\n'.replace(/[\u0080-\u00ff]/g, 'X'));
  objs.forEach((parts, i) => { offsets.push(off); push(`${i + 1} 0 obj\n`); parts.forEach(push); push('\nendobj\n'); });
  const xref = off; push(`xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join(''));
  push(`trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info << /Producer (Diagram Tool) >> >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(chunks, { type: 'application/pdf' });
};
// SVG export with the scene embedded (lossless re-import)
DT.toSVGWithScene = function (sc) {
  const svg = DT.toSVG(sc); const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(sc))));
  return svg.replace('>', `><metadata id="diagram-tool-scene" data-format="diagram-tool/scene+json;base64">${b64}</metadata>`);
};
})(window);
