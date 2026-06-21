// Generates a Minecraft-style pixel-art icon (polar bear + snowflake) as SVG.
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
// block helper using grid units
const blk = (cx, cy, cw, ch, fill) => px(cx * U, cy * U, cw * U, ch * U, fill)

// ---- background (icy gradient + dark frame) ----
rects.push(`<rect x="0" y="0" width="${SIZE}" height="${SIZE}" fill="url(#ice)"/>`)

// ---- snowflake (top-centre), 9x9 unit bitmap ----
const flake = [
  '....s....',
  's..sss..s',
  '.s.sss.s.',
  '..sssss..',
  'sssssssss',
  '..sssss..',
  '.s.sss.s.',
  's..sss..s',
  '....s....'
]
const fx = 11 // start unit col  (9 wide, centred: (32-9)/2 ~ 11)
const fy = 1 // start unit row
for (let r = 0; r < flake.length; r++) {
  for (let c = 0; c < flake[r].length; c++) {
    if (flake[r][c] === 's') blk(fx + c, fy + r, 1, 1, C.snow)
  }
}

// ---- ears (top corners) ----
const ear = (col) => {
  blk(col, 10, 6, 5, C.border) // outline block
  blk(col + 1, 11, 4, 3, C.white)
  blk(col + 2, 12, 2, 2, C.inner)
}
ear(5)
ear(21)

// ---- head ----
blk(3, 14, 26, 16, C.border) // outline
blk(4, 15, 24, 14, C.white) // face
// cheek shading
blk(4, 26, 24, 3, C.shadow)

// ---- eyes ----
blk(9, 18, 3, 3, C.black)
blk(20, 18, 3, 3, C.black)
// eye glints
blk(10, 18, 1, 1, C.white)
blk(21, 18, 1, 1, C.white)

// ---- muzzle ----
blk(12, 22, 8, 6, C.snout)
// nose
blk(14, 22, 4, 3, C.black)
// mouth
blk(15, 25, 2, 2, C.black)
blk(13, 26, 2, 1, C.black)
blk(17, 26, 2, 1, C.black)

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
