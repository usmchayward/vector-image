// scene <-> draw.io (.drawio, uncompressed mxGraph XML). draw.io/diagrams.net is Apache-2.0; this is our own code.
(function (G) {
'use strict';
const DT = G.DT;
const b64 = s => btoa(unescape(encodeURIComponent(s)));
const dashStyle = s => s.dash === 'dashed' ? 'dashed=1;dashPattern=6 4;' : s.dash === 'dotted' ? 'dashed=1;dashPattern=1 2;' : '';
const strokeStyle = s => `strokeColor=${s.stroke && s.stroke !== 'none' ? s.stroke : 'none'};fillColor=${s.fill && s.fill !== 'none' ? s.fill : 'none'};strokeWidth=${s.strokeWidth || 1};` + dashStyle(s);
DT.toDrawio = function (sc) {
  const cells = ['<mxCell id="0"/>', '<mxCell id="1" parent="0"/>'];
  const geo = (x, y, w, h) => `<mxGeometry x="${DT.r(x)}" y="${DT.r(y)}" width="${DT.r(Math.max(w, 1))}" height="${DT.r(Math.max(h, 1))}" as="geometry"/>`;
  const cell = (n, parent, ox, oy) => {
    const s = n.style || {}, rot = n.rotate ? `rotation=${n.rotate};` : '', op = n.opacity != null && n.opacity < 1 ? `opacity=${Math.round(n.opacity * 100)};` : '';
    const id = DT.esc(n.id); const b = DT.bbox(n);
    if (n.type === 'group') {
      cells.push(`<mxCell id="${id}" value="" style="group;${rot}" vertex="1" connectable="0" parent="${parent}">${geo(b[0] - ox, b[1] - oy, b[2] - b[0], b[3] - b[1])}</mxCell>`);
      n.children.forEach(c => cell(c, id, b[0], b[1])); return;
    }
    let style = '', value = '';
    if (n.type === 'rect') style = (n.rx ? `rounded=1;absoluteArcSize=1;arcSize=${DT.r(n.rx * 2)};` : 'rounded=0;') + 'whiteSpace=wrap;' + strokeStyle(s);
    else if (n.type === 'ellipse') style = 'ellipse;' + strokeStyle(s);
    else if (n.type === 'image') style = `shape=image;imageAspect=0;aspect=fixed;image=${(n.href || '').replace(';base64', '')};`;
    else if (n.type === 'path') { // arbitrary outline -> embedded SVG picture (draw.io has no free-form path shape)
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${b[2] - b[0] + 2}" height="${b[3] - b[1] + 2}" viewBox="${b[0] - 1} ${b[1] - 1} ${b[2] - b[0] + 2} ${b[3] - b[1] + 2}">${DT.nodeSVG(Object.assign({}, n, { rotate: 0 }))}</svg>`;
      style = `shape=image;imageAspect=0;image=data:image/svg+xml,${b64(svg)};dtPath=1;`;
    } else if (n.type === 'text') {
      value = DT.esc(n.text).replace(/\n/g, '&#xa;');
      style = `text;html=0;whiteSpace=nowrap;align=${n.align || 'left'};verticalAlign=top;spacing=0;fontSize=${n.fontSize || 12};fontColor=${s.fill && s.fill !== 'none' ? s.fill : '#000000'};${n.bold ? 'fontStyle=1;' : ''}`;
    }
    cells.push(`<mxCell id="${id}" value="${value}" style="${style}${rot}${op}" vertex="1" parent="${parent}">${geo(b[0] - ox, b[1] - oy, b[2] - b[0], b[3] - b[1])}</mxCell>`);
  };
  sc.nodes.forEach(n => cell(n, '1', 0, 0));
  const ids = new Set(sc.nodes.map(n => n.id));
  for (const e of sc.edges) {
    const s = e.style || {}, P = e.points;
    const style = `edgeStyle=none;rounded=0;html=1;endArrow=${e.arrowEnd ? 'block;endFill=1' : 'none'};startArrow=${e.arrowStart ? 'block;startFill=1' : 'none'};strokeColor=${s.stroke || '#000000'};strokeWidth=${s.strokeWidth || 1};${dashStyle(s)}`;
    const src = e.from && ids.has(e.from) ? ` source="${DT.esc(e.from)}"` : '', tgt = e.to && ids.has(e.to) ? ` target="${DT.esc(e.to)}"` : '';
    const way = P.slice(1, -1).map(p => `<mxPoint x="${p[0]}" y="${p[1]}"/>`).join('');
    cells.push(`<mxCell id="${DT.esc(e.id)}" style="${style}" edge="1" parent="1"${src}${tgt}><mxGeometry relative="1" as="geometry"><mxPoint x="${P[0][0]}" y="${P[0][1]}" as="sourcePoint"/><mxPoint x="${P[P.length - 1][0]}" y="${P[P.length - 1][1]}" as="targetPoint"/>${way ? `<Array as="points">${way}</Array>` : ''}</mxGeometry></mxCell>`);
  }
  return `<mxfile host="DiagramTool"><diagram id="p1" name="Page-1"><mxGraphModel dx="0" dy="0" grid="1" gridSize="10" page="1" pageWidth="${Math.ceil(sc.width)}" pageHeight="${Math.ceil(sc.height)}"><root>${cells.join('')}</root></mxGraphModel></diagram></mxfile>`;
};

// draw.io -> scene (uncompressed files; compressed ones are inflated with the browser's DecompressionStream)
DT.fromDrawio = async function (text) {
  let doc = new DOMParser().parseFromString(text, 'text/xml');
  let model = doc.querySelector('mxGraphModel');
  if (!model) {
    const d = doc.querySelector('diagram'); if (!d) throw new Error('not a draw.io file');
    const raw = Uint8Array.from(atob(d.textContent.trim()), c => c.charCodeAt(0));
    const xml = await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
    doc = new DOMParser().parseFromString(decodeURIComponent(xml), 'text/xml'); model = doc.querySelector('mxGraphModel');
  }
  const sc = DT.scene(+model.getAttribute('pageWidth') || 1000, +model.getAttribute('pageHeight') || 800, 'drawio');
  const st = s => Object.fromEntries((s || '').split(';').filter(Boolean).map(kv => { const i = kv.indexOf('='); return i < 0 ? [kv, true] : [kv.slice(0, i), kv.slice(i + 1)]; }));
  const dash = o => o.dashed == '1' ? (/^1 /.test(o.dashPattern || '') ? 'dotted' : 'dashed') : 'solid';
  const byId = {}, kids = {};
  for (const c of model.querySelectorAll('mxCell')) { byId[c.getAttribute('id')] = c; (kids[c.getAttribute('parent')] = kids[c.getAttribute('parent')] || []).push(c); }
  const gnum = (g, k) => +(g && g.getAttribute(k)) || 0;
  const build = (c, ox, oy) => {
    const o = st(c.getAttribute('style')), g = c.querySelector(':scope > mxGeometry'), id = c.getAttribute('id');
    const x = gnum(g, 'x') + ox, y = gnum(g, 'y') + oy, w = gnum(g, 'width'), h = gnum(g, 'height');
    const style = DT.style(o.strokeColor || '#000000', o.fillColor || 'none', +o.strokeWidth || 1, dash(o));
    let n;
    if (o.group || (kids[id] && kids[id].length)) n = { id, type: 'group', children: (kids[id] || []).filter(k => k.getAttribute('vertex') === '1').map(k => build(k, x, y)) };
    else if (o.text) n = { id, type: 'text', x, y, w, text: (c.getAttribute('value') || '').replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, ''), fontSize: +o.fontSize || 12, align: o.align || 'left', style: DT.style('none', o.fontColor || '#000000') };
    else if (o.shape === 'image') { let im = o.image || ''; if (/^data:[^,;]+,/.test(im) && !/;base64,/.test(im)) im = im.replace(/^data:([^,]+),/, 'data:$1;base64,'); n = { id, type: 'image', x, y, w, h, href: im, style: DT.style() }; }
    else if (o.ellipse) n = { id, type: 'ellipse', x, y, w, h, style };
    else { n = { id, type: 'rect', x, y, w, h, rx: o.rounded == '1' ? (o.absoluteArcSize == '1' ? (+o.arcSize || 10) / 2 : Math.min(w, h) * (+o.arcSize || 15) / 100) : 0, style };
      const v = c.getAttribute('value'); if (v) return { id: id + '_g', type: 'group', children: [n, { id: id + '_t', type: 'text', x, y: y + h / 2 - 8, w, align: 'center', text: v.replace(/<[^>]+>/g, ''), fontSize: +o.fontSize || 12, style: DT.style('none', o.fontColor || '#000000') }] }; }
    if (o.rotation) n.rotate = +o.rotation;
    return n;
  };
  for (const c of kids['1'] || []) {
    if (c.getAttribute('vertex') === '1') sc.nodes.push(build(c, 0, 0));
    else if (c.getAttribute('edge') === '1') {
      const o = st(c.getAttribute('style')), g = c.querySelector('mxGeometry');
      const sp = g.querySelector('[as=sourcePoint]'), tp = g.querySelector('[as=targetPoint]'), way = [...g.querySelectorAll('Array > mxPoint')].map(p => [+p.getAttribute('x'), +p.getAttribute('y')]);
      const pt = (p, ref) => { if (p) return [+p.getAttribute('x'), +p.getAttribute('y')]; const r = ref && byId[ref] && byId[ref].querySelector('mxGeometry'); return r ? [gnum(r, 'x') + gnum(r, 'width') / 2, gnum(r, 'y') + gnum(r, 'height') / 2] : [0, 0]; };
      sc.edges.push({ id: c.getAttribute('id'), points: [pt(sp, c.getAttribute('source')), ...way, pt(tp, c.getAttribute('target'))], from: c.getAttribute('source'), to: c.getAttribute('target'),
        arrowEnd: (o.endArrow || 'classic') !== 'none', arrowStart: !!o.startArrow && o.startArrow !== 'none', style: DT.style(o.strokeColor || '#000000', 'none', +o.strokeWidth || 1, dash(o)) });
    }
  }
  return sc;
};
})(window);
