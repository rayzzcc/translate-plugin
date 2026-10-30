// 从 pdf.js 的 textContent 中还原段落

interface Line {
  text: string
  x: number
  y: number
  h: number
  endX: number
}

const CJK = /[　-鿿＀-￯]/

function joinLine(a: string, b: string) {
  if (/[A-Za-z]-$/.test(a) && /^[a-z]/.test(b)) return a.slice(0, -1) + b
  if (CJK.test(a.slice(-1)) || CJK.test(b[0] ?? '')) return a + b
  return `${a} ${b}`
}

export function extractParagraphs(items: any[]): string[] {
  const lines: Line[] = []
  let cur: Line | null = null
  for (const it of items) {
    if (typeof it?.str !== 'string') continue
    const str: string = it.str
    const x: number = it.transform[4]
    const y: number = it.transform[5]
    const h = Math.abs(it.height) || Math.abs(it.transform[3]) || 10
    if (!str.trim()) {
      if (cur && str) cur.text += ' '
    } else if (cur && Math.abs(y - cur.y) <= Math.max(h, cur.h) * 0.5) {
      if (x - cur.endX > h * 0.2 && !/\s$/.test(cur.text)) cur.text += ' '
      cur.text += str
      cur.endX = x + (it.width || 0)
      cur.h = Math.max(cur.h, h)
    } else {
      if (cur) lines.push(cur)
      cur = { text: str, x, y, h, endX: x + (it.width || 0) }
    }
    if (it.hasEOL && cur) {
      lines.push(cur)
      cur = null
    }
  }
  if (cur) lines.push(cur)

  const valid = lines.filter((l) => l.text.trim())
  const widths = valid.map((l) => l.endX - l.x).sort((a, b) => a - b)
  const typical = widths[Math.floor(widths.length * 0.75)] || 0

  const paras: string[] = []
  let buf = ''
  let prev: Line | null = null
  for (const ln of valid) {
    const t = ln.text.replace(/\s+/g, ' ').trim()
    let breakPara = !prev
    if (prev) {
      const dy = prev.y - ln.y
      const lh = Math.max(prev.h, ln.h)
      const prevShort = typical > 0 && prev.endX - prev.x < typical * 0.8
      if (
        dy < -lh * 0.5 || // 回到上方：换栏
        dy > lh * 1.9 || // 行距明显变大
        Math.abs(ln.h - prev.h) > prev.h * 0.25 || // 字号变化：标题
        (prevShort && /[.!?。！？:：]$/.test(buf)) || // 上一行短且以句末标点结束
        buf.length > 1800
      )
        breakPara = true
    }
    if (breakPara) {
      if (buf) paras.push(buf)
      buf = t
    } else buf = joinLine(buf, t)
    prev = ln
  }
  if (buf) paras.push(buf)
  return paras.filter((p) => p.length >= 2 && /\p{L}/u.test(p))
}
