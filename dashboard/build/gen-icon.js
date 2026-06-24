// Generates a Minecraft-style pixel-art icon as SVG.
// Composition: polar bear (left half) + snowflake (right half), balanced so
// the two motifs occupy roughly equal space.
// Everything is axis-aligned rects on an 8px grid -> crisp blocky look.
const fs = require('fs')
const path = require('path')

const U = 8 // pixel size; 32 units = 256px canvas
const SIZE = 256
const C = {
  border: '#14110c',
  ice0: '#dff1ff',
  ice1: '#7cc4ff',
  white: '#f6fbff',
  shadow: '#d2e6f5',
  inner: '#a7d4ff',
  black: '#14110c',
  snout: '#e7f3fd',
  snow: '#ffffff',
  snowEdge: '#bfe6ff'
}

const rects = []
const px = (x, y, w, h, fill) =>
  rects.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`)
const blk = (cx, cy, cw, ch, fill) => px(cx * U, cy * U, cw * U, ch * U, fill) // grid units

// ---- background (icy gradient) ----
rects.push(`<rect x="0" y="0" width="${SIZE}" height="${SIZE}" fill="url(#ice)"/>`)

// ============================================================
// BEAR — left half, centred ~ col 8, vertically centred
// ============================================================
// ears
const ear = (col) => {
  blk(col, 8, 4, 4, C.border)
  blk(col + 1, 9, 2, 2, C.white)
}
ear(2)
ear(10)
// head
blk(2, 11, 12, 11, C.border) // outline
blk(3, 12, 10, 9, C.white) // face
blk(3, 19, 10, 2, C.shadow) // cheek shading
// eyes (+ glints)
blk(4, 14, 2, 2, C.black)
blk(10, 14, 2, 2, C.black)
blk(4, 14, 1, 1, C.white)
blk(10, 14, 1, 1, C.white)
// muzzle + nose + mouth
blk(5, 17, 6, 4, C.snout)
blk(7, 17, 2, 2, C.black)
blk(7, 19, 2, 1, C.black)
blk(6, 20, 1, 1, C.black)
blk(9, 20, 1, 1, C.black)

// ============================================================
// SNOWFLAKE — right half, detailed 15x15 dendrite, centred ~ col 23
// Built with 8-fold symmetry: specify cells once, reflect/rotate to all
// 8 directions so arms + twigs stay perfectly symmetric.
// ============================================================
const fCenterCol = 23 // canvas-unit centre
const fCenterRow = 15
const cells = new Set()
const sym = (dx, dy) => {
  for (const [a, b] of [
    [dx, dy],
    [-dx, dy],
    [dx, -dy],
    [-dx, -dy],
    [dy, dx],
    [-dy, dx],
    [dy, -dx],
    [-dy, -dx]
  ]) {
    cells.add(`${fCenterCol + a},${fCenterRow + b}`)
  }
}

// centre pixel
sym(0, 0)
// four long axial arms (shaft length 7) with twigs + arrowhead barbs
for (let d = 1; d <= 7; d++) sym(0, d)
sym(1, 3) // mid twig nub (both sides via symmetry)
sym(1, 6) // barb near the tip
sym(2, 5) // ...forming a small arrowhead
// four shorter diagonal arms (shaft length 4) — distinct length keeps gaps
for (let d = 1; d <= 4; d++) sym(d, d)
sym(3, 2) // tiny twig on each diagonal arm

for (const key of cells) {
  const [cx, cy] = key.split(',').map(Number)
  blk(cx, cy, 1, 1, C.snow)
}

const svg = `<svg width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">
  <defs>
    <linearGradient id="ice" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${C.ice0}"/>
      <stop offset="1" stop-color="${C.ice1}"/>
    </linearGradient>
  </defs>
  ${rects.join('\n  ')}
</svg>
`

fs.writeFileSync(path.join(__dirname, 'icon.svg'), svg)
console.log('wrote icon.svg (' + rects.length + ' rects)')
