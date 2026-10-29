# Diagram Tool

Turns a **flow / architecture diagram** you got as **PDF, SVG or PNG** (AWS exports, Mural PDFs,
screenshots, also draw.io and Visio .vsdx) into pieces you can edit: move boxes and icons (their
connectors follow), add boxes/lines/text, re-route or extend lines, switch lines between solid,
dashed and dotted, group/ungroup, rotate, then save as PDF / SVG / PNG / draw.io.

It is deliberately narrow: not a photo editor and not a Visio replacement.

## Use it: unzip and double-click
1. Unzip `diagram_tool_standalone.zip` anywhere (e.g. `C:\Users\you\DiagramTool`).
2. Double-click **`index.html`** (Chrome or Edge). Or in the full project: double-click `run_windows.bat`.
3. Click **Open file…** (or drag a file onto the page).

No install, no Python, no internet. Everything (PDF reader, Visio reader, OCR, shape finder) is
bundled in `vendor/` and runs inside the page. The page makes **no network requests**
(checked by an automated test) and has a Content-Security-Policy that blocks outside connections.

## Editing
| Do this | How |
|---|---|
| Select / multi-select | click; Shift+click; drag on empty space for a box selection (also picks up labels inside groups) |
| Move | drag (attached connectors follow, right-angle bends stay square); arrow keys nudge (Shift = 10 px) |
| Resize | drag the blue square at the bottom-right |
| Extend / re-route a line | select it, drag a blue dot; drop an end near a box to attach it; right-click a line to add a bend |
| New box / oval / line / text | Box (R), Oval (E), Line (L), Text (T) |
| Line style | the solid / dashed / dotted list, colour, width, arrow tick-box |
| Rotate | type degrees in "rotate" |
| Group / ungroup | Ctrl+G / Ctrl+Shift+G (or the buttons) |
| Grab a label | click anywhere on/around the words (a dashed blue outline shows on hover). Labels win over the box under them, even labels inside a group, and stay easy to hit when zoomed out |
| Select the box under a label | Alt+click (Alt+click again cycles through the stacked shapes) |
| Move a label | drag it (just that label moves, not its box) |
| Edit text | double-click it |
| Duplicate / delete / undo / redo | Ctrl+D / Delete / Ctrl+Z / Ctrl+Y |
| Snap | "snap" tick-box: 10 px grid for moves, line ends snap to box sides |

## Saving and passing it on
* **PDF**: a normal vector PDF anyone can view, **with the editable diagram embedded inside it**
  (an attachment called `diagram.scene.json`). Opening that PDF in this tool again gives back
  exactly what you had: every box, connector and style, nothing lost. Send the PDF to a colleague
  and they can keep editing. If some other program strips the attachment, the tool still reads the
  PDF's vector drawing (boxes, lines, arrows, text and pictures come back, slightly less tidy).
* **SVG**: same idea; the editable diagram is embedded as metadata.
* **PNG**: a picture. **draw.io**: opens in diagrams.net. **Project (.json)**: the raw editable file.

## What each input gives you (honest)
| Input | Quality |
|---|---|
| PDF/SVG saved by this tool | Perfect (lossless) |
| Vector PDF (AWS, Mural, LibreOffice, Visio "Save as PDF") | Good: boxes, lines, arrows, text and icons. Rounded boxes become outlines (move/resize fine). Text lines are merged into blocks. Line ends attach to the box/icon they touch (a guess, usually right). |
| SVG from other apps | Good. CSS classes, `<use>`, gradients ignored. |
| PNG/JPG (screenshot) | **Best effort.** Text is read by OCR (mostly right; check it, low-confidence words get a yellow mark). Coloured service icons become movable pictures. Plain and dashed boxes are usually found; heavy rounded boxes with tab headers and connectors touching them often come out as separate lines. Straight lines are found; curved lines and many arrowheads are missed. The original stays as a faint locked background so you can fix the rest by hand; untick "background" to hide it. Scanned PDFs are the same case. |
| Visio .vsdx | Kept as-is from v0.1 (secondary): shapes, icons, real connectors; fonts approximate. |
| draw.io | Basic shapes, text, images, connectors. |

## Optional Python helper (not needed)
`optional_python_cli.bat` / `python -m diagram_tool` is the older command-line importer (pdfminer).
It is only useful for batch conversion to JSON/SVG; you lose nothing in the browser tool without it.

## Tests (for developers)
`pip install pytest playwright` then `python -m pytest tests` (uses an installed Chrome/Edge).
`tests/test_standalone.py` opens `standalone/index.html` from file://, imports every sample,
edits, round-trips PDF/SVG/draw.io and asserts no network requests were made.

## Licences of bundled pieces (all free for commercial use)
pdf.js 3.11.174 (Apache-2.0), JSZip 3.10.1 (dual MIT/GPLv3, used under MIT), OpenCV.js 4.10 (Apache-2.0),
Tesseract OCR via tesseract.js-core 6.1.2 (Apache-2.0, includes Leptonica BSD-2), English OCR model
tessdata_best eng (Apache-2.0). Licence texts are in `vendor/licenses/`. Our own code: no third-party code.

## Library pane (two documents side by side)
1. Click **Library pane ◫** (top left) to show the second pane. Click it again to hide the pane.
2. Each pane has its own **Open file…**, zoom, page box and **Save** buttons. Any of PDF, SVG, PNG/JPG, Visio, or draw.io works in either pane.
3. Copy: select items in either pane (click, Shift-click, or drag a box around an icon and its caption), then press **Ctrl+C**. Click where you want them in the other pane (or the same pane) and press **Ctrl+V**. Pasted items land at the pointer and are selected, and keep their groups, colours, dashed or dotted lines, and the connectors between them. Ctrl+X cuts and Ctrl+A selects all.
4. Drag and drop: drag selected items from one pane and drop them on the other to make a **copy** there. The source pane is not changed.
5. Drag the dark bar between the panes to resize them. The pane with the green top edge is active. The toolbar and the keys act on that pane.
6. Each pane saves on its own. The library file is never changed unless you click Save in the library pane.
Sample: `samples/icon_library.pdf` (20 synthetic icons).
