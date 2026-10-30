// 生成扩展图标（纯 Node 实现的 PNG 编码，无需额外依赖）
import fs from 'node:fs'
import { resolve } from 'node:path'
import zlib from 'node:zlib'

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// 圆角渐变方块 + 白色 “A/文” 风格的双横线图形（以 4x 超采样抗锯齿）
function drawIcon(size) {
  const buf = Buffer.alloc(size * size * 4)
  const ss = 4
  const radius = 0.22
  const inRoundRect = (x, y) => {
    const r = radius
    const cx = Math.min(Math.max(x, r), 1 - r)
    const cy = Math.min(Math.max(y, r), 1 - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r
  }
  const inGlyph = (x, y) => {
    // 上方横线 + 竖线组成 “T”（代表原文），下方两条横线（代表译文）
    if (y >= 0.2 && y <= 0.3 && x >= 0.22 && x <= 0.62) return true
    if (x >= 0.37 && x <= 0.47 && y >= 0.2 && y <= 0.56) return true
    if (y >= 0.64 && y <= 0.72 && x >= 0.22 && x <= 0.78) return true
    if (y >= 0.78 && y <= 0.84 && x >= 0.22 && x <= 0.6) return true
    return false
  }
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let a = 0, rr = 0, gg = 0, bb = 0
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const x = (px + (sx + 0.5) / ss) / size
          const y = (py + (sy + 0.5) / ss) / size
          if (!inRoundRect(x, y)) continue
          a++
          if (inGlyph(x, y)) {
            rr += 255; gg += 255; bb += 255
          } else {
            const t = (x + y) / 2
            rr += 79 + (124 - 79) * t
            gg += 124 + (92 - 124) * t
            bb += 255
          }
        }
      }
      const i = (py * size + px) * 4
      if (a) {
        buf[i] = Math.round(rr / a)
        buf[i + 1] = Math.round(gg / a)
        buf[i + 2] = Math.round(bb / a)
        buf[i + 3] = Math.round((a / (ss * ss)) * 255)
      }
    }
  }
  return buf
}

export function writeIcons(dir) {
  fs.mkdirSync(dir, { recursive: true })
  for (const size of [16, 32, 48, 128]) {
    fs.writeFileSync(resolve(dir, `icon${size}.png`), encodePng(size, drawIcon(size)))
  }
}
