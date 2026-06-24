// Packs rendered PNGs into a multi-resolution, PNG-embedded .ico (Vista+).
const fs = require('fs')
const path = require('path')

const sizes = [16, 32, 48, 64, 128, 256]
const here = __dirname
const imgs = sizes.map((s) => {
  const data = fs.readFileSync(path.join(here, `_ico_${s}.png`))
  return { size: s, data }
})

const ICONDIR = 6
const ICONDIRENTRY = 16
const header = Buffer.alloc(ICONDIR)
header.writeUInt16LE(0, 0) // reserved
header.writeUInt16LE(1, 2) // type: icon
header.writeUInt16LE(imgs.length, 4) // count

let offset = ICONDIR + ICONDIRENTRY * imgs.length
const entries = []
const blobs = []
for (const { size, data } of imgs) {
  const e = Buffer.alloc(ICONDIRENTRY)
  e.writeUInt8(size >= 256 ? 0 : size, 0) // width  (0 == 256)
  e.writeUInt8(size >= 256 ? 0 : size, 1) // height
  e.writeUInt8(0, 2) // colour count
  e.writeUInt8(0, 3) // reserved
  e.writeUInt16LE(1, 4) // colour planes
  e.writeUInt16LE(32, 6) // bits per pixel
  e.writeUInt32LE(data.length, 8) // size of image data
  e.writeUInt32LE(offset, 12) // offset
  entries.push(e)
  blobs.push(data)
  offset += data.length
}

fs.writeFileSync(path.join(here, 'icon.ico'), Buffer.concat([header, ...entries, ...blobs]))
// 512px master for electron-builder (mac auto-icns / general fallback)
fs.copyFileSync(path.join(here, '_ico_512.png'), path.join(here, 'icon.png'))
console.log('wrote icon.ico (' + imgs.length + ' sizes) and icon.png (512)')
