// Visio .vsdx -> scene. A .vsdx is a zip of XML; unzipped in the browser with JSZip (MIT).
(function (G) {
'use strict';
const DT = G.DT, PX = 96;
const PAT = { 0: 'none', 1: 'solid', 2: 'dashed', 3: 'dotted', 4: 'dashed', 5: 'dashed', 9: 'dashed', 10: 'dotted', 16: 'dotted', 23: 'dashed' };
const kids = (el, name) => [...el.children].filter(c => c.localName === name);
const cells = el => Object.fromEntries(kids(el, 'Cell').map(c => [c.getAttribute('N'), c.getAttribute('V')]));
const f = (c, k, d = 0) => { const v = parseFloat(c[k]); return isNaN(v) ? d : v; };
const section = (el, n) => kids(el, 'Section').filter(s => s.getAttribute('N') === n);
const col = (v, d) => v && v[0] === '#' ? v : d;
const relsOf = async (zip, part) => {
  const p = part.replace(/[^/]+$/, m => '_rels/' + m + '.rels'); const file = zip.file(p); if (!file) return {};
  const doc = new DOMParser().parseFromString(await file.async('string'), 'text/xml'); const dir = part.replace(/[^/]+$/, '');
  const norm = s => { const out = []; for (const seg of s.split('/')) { if (seg === '..') out.pop(); else if (seg && seg !== '.') out.push(seg); } return out.join('/'); };
  return Object.fromEntries([...doc.getElementsByTagName('Relationship')].map(r => [r.getAttribute('Id'), norm(dir + r.getAttribute('Target'))]));
};
const RID = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
DT.importVSDX = async function (buf, page = 1) {
  if (!G.JSZip) throw new Error('JSZip not loaded');
  const zip = await G.JSZip.loadAsync(buf);
  const pagesXml = new DOMParser().parseFromString(await zip.file('visio/pages/pages.xml').async('string'), 'text/xml');
  const prels = await relsOf(zip, 'visio/pages/pages.xml');
  const pg = [...pagesXml.documentElement.children].filter(c => c.localName === 'Page')[page - 1];
  if (!pg) throw new Error('page ' + page + ' not found');
  const ps = kids(pg, 'PageSheet')[0] ? cells(kids(pg, 'PageSheet')[0]) : {};
  const Wi = f(ps, 'PageWidth', 8.5), Hi = f(ps, 'PageHeight', 11);
  const part = prels[kids(pg, 'Rel')[0].getAttributeNS(RID, 'id')];
  const root = new DOMParser().parseFromString(await zip.file(part).async('string'), 'text/xml').documentElement;
  const rels = await relsOf(zip, part);
  const sc = DT.scene(DT.r(Wi * PX), DT.r(Hi * PX), 'vsdx');
  const { mul, ap } = DT.geom; const toP = (x, y) => [DT.r(x * PX), DT.r((Hi - y) * PX)];
  const local = c => { const a = f(c, 'Angle'), ca = Math.cos(a), sa = Math.sin(a), fx = c.FlipX === '1' ? -1 : 1, fy = c.FlipY === '1' ? -1 : 1;
    return mul([ca, sa, -sa, ca, f(c, 'PinX'), f(c, 'PinY')], [fx, 0, 0, fy, -f(c, 'LocPinX') * fx, -f(c, 'LocPinY') * fy]); };
  const charOf = sh => { const r = section(sh, 'Character')[0]; const rc = r && kids(r, 'Row')[0] ? cells(kids(r, 'Row')[0]) : {};
    const st = parseInt(rc.Style || '0'); return { fs: rc.Size ? DT.r(f(rc, 'Size') * PX) : 14.67, color: col(rc.Color, '#000000'), bold: !!(st & 1) }; };
  const alignOf = sh => { const r = section(sh, 'Paragraph')[0]; const rc = r && kids(r, 'Row')[0] ? cells(kids(r, 'Row')[0]) : {}; return ['left', 'center', 'right', 'left'][parseInt(rc.HorzAlign || '1')] || 'center'; };
  const textOf = sh => { const t = kids(sh, 'Text')[0]; return t ? t.textContent.replace(/[ \t]+/g, ' ').replace(/\u2028/g, '\n').replace(/\r/g, '\n').trim() : ''; };
  const imgMime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', bmp: 'image/bmp', emf: 'image/emf', wmf: 'image/wmf' };
  const oneD = {};
  const textNode = (sh, c, mm) => {
    const t = textOf(sh); if (!t) return null;
    const ch = charOf(sh), al = alignOf(sh), va = parseInt(c.VerticalAlign || '1');
    const tw = c.TxtWidth != null ? f(c, 'TxtWidth') : f(c, 'Width'), th = c.TxtHeight != null ? f(c, 'TxtHeight') : f(c, 'Height');
    const tx = (c.TxtPinX != null ? f(c, 'TxtPinX') : f(c, 'Width') / 2) - (c.TxtLocPinX != null ? f(c, 'TxtLocPinX') : tw / 2);
    const ty = (c.TxtPinY != null ? f(c, 'TxtPinY') : f(c, 'Height') / 2) - (c.TxtLocPinY != null ? f(c, 'TxtLocPinY') : th / 2);
    const a = toP(...ap(mm, tx, ty + th)), b = toP(...ap(mm, tx + tw, ty));
    const x0 = Math.min(a[0], b[0]), y0 = Math.min(a[1], b[1]), w = Math.abs(b[0] - a[0]), h = Math.abs(b[1] - a[1]);
    const lines = t.split('\n').length, blockH = lines * ch.fs * 1.2;
    const y = va === 0 ? y0 : va === 2 ? y0 + h - blockH : y0 + (h - blockH) / 2;
    return { id: DT.newId('t'), type: 'text', x: DT.r(x0), y: DT.r(y), w: DT.r(w), align: al, text: t, fontSize: ch.fs, bold: ch.bold || undefined, style: DT.style('none', ch.color) };
  };
  const shapes = async (parent, m) => {
    const out = []; const holder = kids(parent, 'Shapes')[0]; if (!holder) return out;
    for (const sh of kids(holder, 'Shape')) {
      const c = cells(sh), sid = 'v' + sh.getAttribute('ID');
      const sstyle = DT.style(c.LinePattern === '0' ? 'none' : col(c.LineColor, '#000000'), c.FillPattern === '0' ? 'none' : col(c.FillForegnd, '#ffffff'), Math.max(f(c, 'LineWeight', 0.01) * PX, 0.5), PAT[c.LinePattern || '1'] || 'dashed');
      if ('BeginX' in c && 'EndX' in c) { // 1-D connector
        let P = [ap(m, f(c, 'BeginX'), f(c, 'BeginY')), ap(m, f(c, 'EndX'), f(c, 'EndY'))];
        const geo = section(sh, 'Geometry')[0];
        if (geo) { const mm = mul(m, local(c)); const rows = kids(geo, 'Row').filter(r => ['MoveTo', 'LineTo'].includes(r.getAttribute('T'))).map(r => { const rc = cells(r); return ap(mm, f(rc, 'X'), f(rc, 'Y')); }); if (rows.length >= 2) P = rows; }
        const e = { id: sid, points: P.map(p => toP(...p)), from: null, to: null, arrowEnd: !!c.EndArrow && c.EndArrow !== '0', arrowStart: !!c.BeginArrow && c.BeginArrow !== '0', style: Object.assign(sstyle, { fill: 'none' }) };
        oneD[sh.getAttribute('ID')] = e; sc.edges.push(e);
        const tn = textNode(sh, c, mul(m, local(c))); if (tn) { const mid = e.points[Math.floor(e.points.length / 2)]; tn.x = DT.r(mid[0] - (tn.w || 40) / 2); tn.y = DT.r(mid[1] - tn.fontSize); out.push(tn); }
        continue;
      }
      const mm = mul(m, local(c)), w = f(c, 'Width'), h = f(c, 'Height'); let node = null, parts = [];
      const fd = kids(sh, 'ForeignData')[0];
      if (fd) { const rel = kids(fd, 'Rel')[0]; let href = '';
        if (rel && rels[rel.getAttributeNS(RID, 'id')]) { const mp = rels[rel.getAttributeNS(RID, 'id')]; const ext = mp.split('.').pop().toLowerCase(); href = `data:${imgMime[ext] || 'application/octet-stream'};base64,` + await zip.file(mp).async('base64'); }
        const a = toP(...ap(mm, 0, h)), b = toP(...ap(mm, w, 0));
        node = { id: sid, type: 'image', x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: DT.r(Math.abs(b[0] - a[0])), h: DT.r(Math.abs(b[1] - a[1])), href, style: DT.style() }; }
      else for (const geo of section(sh, 'Geometry')) {
        const gc = cells(geo); const cmds = [];
        for (const r of kids(geo, 'Row')) { const rc = cells(r), T = r.getAttribute('T');
          if (T === 'Ellipse') { const cx = f(rc, 'X'), cy = f(rc, 'Y'), rx = Math.abs(f(rc, 'A') - cx), ry = Math.abs(f(rc, 'D') - cy); const a = toP(...ap(mm, cx - rx, cy + ry)), b = toP(...ap(mm, cx + rx, cy - ry));
            parts.push({ id: DT.newId(), type: 'ellipse', x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: DT.r(Math.abs(b[0] - a[0])), h: DT.r(Math.abs(b[1] - a[1])), style: Object.assign({}, sstyle) }); continue; }
          if (!('X' in rc)) continue; const p = toP(...ap(mm, f(rc, 'X'), f(rc, 'Y')));
          cmds.push([(T === 'MoveTo' || T === 'RelMoveTo' || !cmds.length) ? 'M' : 'L', [p]]); }
        if (cmds.length >= 2) { const st = Object.assign({}, sstyle); if (gc.NoFill === '1') st.fill = 'none'; if (gc.NoLine === '1') st.stroke = 'none';
          const first = cmds[0][1][0], last = cmds[cmds.length - 1][1][0], closed = first[0] === last[0] && first[1] === last[1];
          const xs = [...new Set(cmds.map(q => q[1][0][0]))], ys = [...new Set(cmds.map(q => q[1][0][1]))];
          if (closed && cmds.length === 5 && xs.length === 2 && ys.length === 2) parts.push({ id: DT.newId(), type: 'rect', x: Math.min(...xs), y: Math.min(...ys), w: DT.r(Math.abs(xs[1] - xs[0])), h: DT.r(Math.abs(ys[1] - ys[0])), rx: 0, style: st });
          else parts.push({ id: DT.newId(), type: 'path', d: DT.fmtPath(closed ? [...cmds, ['Z', []]] : cmds), style: st }); }
      }
      const sub = await shapes(sh, mm); parts = parts.concat(sub);
      if (!node) { if (parts.length === 1 && !sub.length) { node = parts[0]; node.id = sid; } else if (parts.length) node = { id: sid, type: 'group', children: parts }; }
      const tn = textNode(sh, c, mm);
      if (tn) { if (!node) node = tn; else if (node.type === 'group') node.children.push(tn); else node = { id: 'grp' + sid, type: 'group', children: [node, tn] }; }
      if (node) { node.name = sh.getAttribute('NameU') || sh.getAttribute('Name') || ''; out.push(node); }
    }
    return out;
  };
  sc.nodes = await shapes(root, DT.geom.I);
  const con = kids(root, 'Connects')[0];
  const idmap = {}; for (const n of sc.nodes) { idmap[n.id] = n.id; if (n.id.startsWith('grpv')) idmap[n.id.slice(3)] = n.id; }
  if (con) for (const cn of kids(con, 'Connect')) { const e = oneD[cn.getAttribute('FromSheet')]; if (!e) continue; const target = 'v' + cn.getAttribute('ToSheet'); e[(cn.getAttribute('FromCell') || '').startsWith('Begin') ? 'from' : 'to'] = idmap[target] || target; }
  sc.stats = { connectors_from_visio: sc.edges.filter(e => e.from && e.to).length };
  return sc;
};
})(window);
