import { langBase } from '../shared/languages'
import { callBg, friendlyError } from '../shared/messages'
import { escapeHtml } from '../shared/utils'
import { onSettingsChange, S } from './settings'
import { toastError } from './ui/toast'

interface Cue {
  start: number
  end: number
  text: string
}

const CHUNK = 20

let cues: Cue[] = []
let trans: (string | undefined)[] = []
let requested = new Set<number>()
let trackKey = ''
let overlay: HTMLElement | null = null
let raf = 0
let lastRender = ''

// ---------------- 字幕解析 ----------------

function parseTimedText(raw: string): Cue[] {
  const text = raw.trim()
  const list: Cue[] = []
  if (text.startsWith('{')) {
    const j = JSON.parse(text)
    for (const ev of j.events || []) {
      if (!ev.segs) continue
      const t = ev.segs
        .map((s: any) => s.utf8 || '')
        .join('')
        .replace(/\s+/g, ' ')
        .trim()
      if (!t) continue
      const start = (ev.tStartMs || 0) / 1000
      list.push({ start, end: start + (ev.dDurationMs || 2000) / 1000, text: t })
    }
  } else if (text.startsWith('<')) {
    const doc = new DOMParser().parseFromString(text, 'text/xml')
    doc.querySelectorAll('p').forEach((p) => {
      const t = (p.textContent || '').replace(/\s+/g, ' ').trim()
      if (!t) return
      const start = Number(p.getAttribute('t') || 0) / 1000
      list.push({ start, end: start + Number(p.getAttribute('d') || 2000) / 1000, text: t })
    })
    doc.querySelectorAll('text').forEach((n) => {
      const t = (n.textContent || '').replace(/\s+/g, ' ').trim()
      if (!t) return
      const start = Number(n.getAttribute('start') || 0)
      list.push({ start, end: start + Number(n.getAttribute('dur') || 2), text: t })
    })
  }
  list.sort((a, b) => a.start - b.start)
  // 合并相邻重复行
  return list.filter((c, i) => i === 0 || c.text !== list[i - 1].text || c.start > list[i - 1].end + 0.5)
}

// ---------------- 播放同步 ----------------

function findCue(t: number): number {
  let lo = 0
  let hi = cues.length - 1
  let idx = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (cues[mid].start <= t) {
      idx = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  for (let i = idx; i >= 0 && i > idx - 6; i--) if (cues[i].end > t) return i
  return -1
}

function player(): HTMLElement | null {
  return document.querySelector('#movie_player')
}

function ensureOverlay(p: HTMLElement, fallback = false) {
  if (!overlay || !p.contains(overlay)) {
    overlay?.remove()
    overlay = document.createElement('div')
    overlay.setAttribute('translate', 'no')
    p.appendChild(overlay)
    lastRender = ''
  }
  overlay.className = `tp-yt-overlay${fallback ? ' tp-yt-fallback' : ''}`
  const size = Math.max(12, Math.min(40, p.clientHeight * 0.042 * (S().video.fontScale || 1)))
  overlay.style.fontSize = `${size}px`
  return overlay
}

function videoTitle() {
  return document.querySelector('h1.ytd-watch-metadata')?.textContent?.trim() || document.title
}

function requestChunk(k: number) {
  if (requested.has(k) || k * CHUNK >= cues.length) return
  requested.add(k)
  const key = trackKey
  const slice = cues.slice(k * CHUNK, (k + 1) * CHUNK)
  callBg<string[]>({ type: 'translate', texts: slice.map((c) => c.text), scene: 'subtitle', context: videoTitle() })
    .then((res) => {
      if (key !== trackKey) return
      res.forEach((r, j) => (trans[k * CHUNK + j] = r))
      lastRender = ''
    })
    .catch((e) => {
      toastError(`字幕翻译失败：${friendlyError(e)}`)
      setTimeout(() => key === trackKey && requested.delete(k), 8000)
    })
}

function tick() {
  raf = requestAnimationFrame(tick)
  const p = player()
  const video = p?.querySelector('video') as HTMLVideoElement | null
  if (!p || !video || !cues.length) return
  const ccBtn = p.querySelector('.ytp-subtitles-button')
  const ccOn = !ccBtn || ccBtn.getAttribute('aria-pressed') !== 'false'
  const ov = ensureOverlay(p)
  document.documentElement.classList.toggle('tp-yt-active', ccOn)
  if (!ccOn) {
    ov.style.display = 'none'
    return
  }
  ov.style.display = ''

  const t = video.currentTime
  const idx = findCue(t)
  const near = idx >= 0 ? idx : Math.max(0, cues.findIndex((c) => c.start > t))
  const k = Math.floor(near / CHUNK)
  requestChunk(k)
  requestChunk(k + 1)

  const tr = idx >= 0 ? trans[idx] : undefined
  const key = `${idx}|${tr ?? ''}|${S().video.showOriginal}`
  if (key === lastRender) return
  lastRender = key
  if (idx < 0) {
    ov.innerHTML = ''
    return
  }
  const orig = escapeHtml(cues[idx].text)
  const trHtml = tr ? escapeHtml(tr) : '<span class="tp-yt-wait">…</span>'
  const showOrig = S().video.showOriginal || !tr
  ov.innerHTML = `<div class="tp-yt-box">${showOrig ? `<div class="tp-yt-orig">${orig}</div>` : ''}<div class="tp-yt-tr">${trHtml}</div></div>`
}

function reset() {
  cancelAnimationFrame(raf)
  raf = 0
  cues = []
  trans = []
  requested = new Set()
  trackKey = ''
  overlay?.remove()
  overlay = null
  lastRender = ''
  document.documentElement.classList.remove('tp-yt-active')
}

function onTimedText(url: string, raw: string) {
  if (!S().video.enabled) return
  let u: URL
  try {
    u = new URL(url, location.href)
  } catch {
    return
  }
  const lang = u.searchParams.get('tlang') || u.searchParams.get('lang') || ''
  const key = ['v', 'lang', 'tlang', 'kind', 'name'].map((k) => u.searchParams.get(k) || '').join('|')
  if (key === trackKey && cues.length) return
  let parsed: Cue[]
  try {
    parsed = parseTimedText(raw)
  } catch {
    return
  }
  if (!parsed.length) return
  reset()
  // 字幕本身就是目标语言：不处理，使用原生字幕
  if (lang && langBase(lang) === langBase(S().targetLang)) return
  trackKey = key
  cues = parsed
  trans = new Array(cues.length)
  raf = requestAnimationFrame(tick)
}

// ---------------- 兜底：直接读取页面上显示的字幕 ----------------

function initDomFallback() {
  let last = ''
  const cache = new Map<string, string>()
  const render = (text: string, tr?: string) => {
    const p = player()
    if (!p) return
    const ov = ensureOverlay(p, true)
    ov.innerHTML = text && tr ? `<div class="tp-yt-box"><div class="tp-yt-tr">${escapeHtml(tr)}</div></div>` : ''
  }
  setInterval(() => {
    if (!S().video.enabled || cues.length) return
    const segs = document.querySelectorAll('#movie_player .ytp-caption-segment')
    const text = [...segs]
      .map((s) => s.textContent || '')
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (text === last) return
    last = text
    if (!text) return render('')
    const hit = cache.get(text)
    if (hit) return render(text, hit)
    callBg<string[]>({ type: 'translate', texts: [text], scene: 'subtitle', context: videoTitle() })
      .then(([tr]) => {
        cache.set(text, tr)
        if (last === text && !cues.length) render(text, tr)
      })
      .catch(() => {})
  }, 400)
}

export function initYoutube() {
  window.addEventListener('message', (e) => {
    if (e.source !== window || e.data?.__tp !== 'yt-timedtext') return
    onTimedText(String(e.data.url), String(e.data.text))
  })
  document.addEventListener('yt-navigate-start', reset)
  window.addEventListener('yt-navigate-start', reset)
  onSettingsChange((s) => {
    if (!s.video.enabled) reset()
    lastRender = ''
  })
  initDomFallback()
}
