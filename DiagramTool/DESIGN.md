# Diagram Tool: design (v0.2, stand-alone browser build)

Scope: one problem. A flow/architecture diagram arrives as PDF, SVG or PNG; make it editable
(move, add, connectors follow, redraw, dashed/dotted) and hand it on in a form the next person can keep editing.

## How it works now
Everything runs in one web page (`standalone/index.html`) opened from disk. No server, no Python, no install, no network.
v0.1 had a browser editor but Python importers (run via a .bat); v0.2 moved the importers into the page.

```
 file ─► importer (app/import_*.js) ─► scene (JSON) ─► editor (app/editor.js) ─► exporters
         one per format                  the ONLY       plain SVG + JS          PDF (+scene inside), SVG (+scene inside),
         shared clean-up in core.js      contract                               PNG, draw.io, .json
```
Lego rule: each piece talks only through the scene JSON (`app/core.js` header). Swap an importer or the editor
without touching the others.

### Scene JSON
`{width,height,nodes:[rect|ellipse|path|text|image|group],edges:[{points,from,to,arrowEnd,arrowStart,style}]}`,
style = `{stroke,fill,strokeWidth,dash:solid|dashed|dotted}`, nodes may have `rotate`, `opacity`, `locked`,
text has `align`, `w`, `fontSize`, OCR text has `conf`. Units px, top-left origin.

### Importers
* **PDF** (`import_pdf.js`, pdf.js): first looks for an embedded `diagram.scene.json` attachment (our own exports) →
  lossless. Otherwise walks the page's drawing operators: rectangles→boxes, open straight strokes→connectors,
  other outlines→paths, images→cropped pictures (from a 2× render), text from pdf.js text content (colour sampled
  from the render).
* **SVG** (`import_svg.js`): embedded scene metadata → lossless; else DOM parse, transforms flattened.
* **PNG/JPG** (`import_raster.js`): OCR (Tesseract wasm, sparse-text mode) → text; OpenCV.js: ink mask, closed
  outlines → boxes (dashed decided from border coverage), oval check, compact dense blobs → icon pictures,
  horizontal/vertical strokes → connectors joined at corners, Hough for diagonals, arrowheads from line-end width.
  Original kept as faint locked background.
* Shared clean-up (`core.js`): PDF/SVG arrowhead triangles merged into their lines (they then follow moves),
  text lines grouped into blocks, connector ends attached to the box/icon they touch.
* draw.io (`drawio.js`) both ways; Visio (`import_vsdx.js`, JSZip) kept as-is.

### Exporters
* **PDF** (`pdf_export.js`): our own small PDF writer (vector boxes/paths/lines/arrows, Helvetica text, JPEG pictures)
  + the scene as an embedded file → lossless round-trip in this tool, normal PDF everywhere else.
* SVG with embedded scene, PNG (canvas), draw.io XML, JSON.

## Decisions taken (and why)
* Browser-only stand-alone build: unzip + double-click, nothing to install on locked-down work PCs.
* pdf.js legacy UMD build with the worker loaded as a plain script (pdf.js "fake worker") because browsers block
  module scripts and Workers from file://. OCR/OpenCV run on the main thread for the same reason (a few seconds).
* Data files (OCR model) are shipped as .js files because file:// pages may not fetch() local files.
* No poppler / Python needed any more: pdf.js renders the icon pictures itself (also avoids GPL poppler binaries).
* PyMuPDF rejected (AGPL). JSZip used under its MIT option.

## Known limits / next steps
* PNG recognition is the weak part (see README). Next: tab-header container boxes, curved connectors,
  arrowheads on thick lines, a "convert this region" tool so the user can lasso a part for re-recognition.
* PDF export uses standard Helvetica (Latin text only; other characters become "?").
* Single page at a time (PDF page picker shown for multi-page PDFs).
