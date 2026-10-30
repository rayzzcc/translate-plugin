import { langEnglish } from '../shared/languages'
import type { ImagePortIn, ImagePortOut } from '../shared/messages'
import type { ImageContext, ImageTextItem } from '../shared/types'
import { errMsg } from '../shared/utils'
import { getEffective, pickProvider } from './config'
import { getLimiter } from './limiter'
import { chat, chatStream, type ChatMessage, type ImageData } from './providers'

const MAX_SIDE = 1600
const DIRECT_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  const step = 0x8000
  for (let i = 0; i < bytes.length; i += step) {
    bin += String.fromCharCode(...bytes.subarray(i, i + step))
  }
  return btoa(bin)
}

async function blobToBase64(blob: Blob) {
  return bytesToBase64(new Uint8Array(await blob.arrayBuffer()))
}

function dataUrlToBlob(dataUrl: string): Blob {
  const m = dataUrl.match(/^data:([^;,]*)(;base64)?,(.*)$/s)
  if (!m) throw new Error('无效的图片数据')
  const mime = m[1] || 'image/png'
  if (m[2]) {
    const bin = atob(m[3])
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return new Blob([bytes], { type: mime })
  }
  return new Blob([decodeURIComponent(m[3])], { type: mime })
}

/** 缩放过大的图片，并把模型不支持的格式转成 JPEG */
async function normalizeImage(blob: Blob): Promise<ImageData> {
  try {
    const bmp = await createImageBitmap(blob)
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height))
    if (scale < 1 || !DIRECT_TYPES.includes(blob.type)) {
      const w = Math.max(1, Math.round(bmp.width * scale))
      const h = Math.max(1, Math.round(bmp.height * scale))
      const canvas = new OffscreenCanvas(w, h)
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, w, h)
      ctx.drawImage(bmp, 0, 0, w, h)
      const out = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.88 })
      return { mime: 'image/jpeg', base64: await blobToBase64(out) }
    }
  } catch {
    /* 解码失败（如 SVG），按原样发送 */
  }
  return { mime: blob.type || 'image/png', base64: await blobToBase64(blob) }
}

async function loadImage(req: { src?: string; dataUrl?: string }): Promise<ImageData> {
  let blob: Blob
  if (req.dataUrl) blob = dataUrlToBlob(req.dataUrl)
  else if (req.src) {
    const res = await fetch(req.src, { credentials: 'include' }).catch(() => fetch(req.src!))
    if (!res.ok) throw new Error(`图片下载失败：HTTP ${res.status}`)
    blob = await res.blob()
  } else throw new Error('缺少图片地址')
  return normalizeImage(blob)
}

function render(tpl: string, vars: Record<string, string>) {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? '')
}

// ---------------- 文字翻译模式 ----------------

function parseItems(out: string): ImageTextItem[] {
  const start = out.indexOf('[')
  const end = out.lastIndexOf(']')
  if (start >= 0 && end > start) {
    try {
      const arr = JSON.parse(out.slice(start, end + 1))
      if (Array.isArray(arr)) {
        return arr
          .map((x: any) => ({ src: String(x?.src ?? x?.original ?? ''), dst: String(x?.dst ?? x?.translation ?? '') }))
          .filter((x) => x.src || x.dst)
      }
    } catch {
      /* 落到下面的兜底 */
    }
  }
  const text = out.trim()
  return text && text !== '[]' ? [{ src: '', dst: text }] : []
}

export async function translateImage(req: { src?: string; dataUrl?: string; to?: string }): Promise<ImageTextItem[]> {
  const { config, settings, prompts } = await getEffective()
  const p = pickProvider(config, settings.image.providerId)
  const vars = { to: langEnglish(req.to || settings.targetLang), context: '' }
  const image = await loadImage(req)
  const out = await getLimiter(p).run(() =>
    chat(p, { system: render(prompts.system, vars), user: render(prompts.image, vars), image }),
  )
  return parseItems(out)
}

// ---------------- 讲解模式（流式 + 追问） ----------------

function clip(s: string | undefined, max: number, fromEnd = false) {
  const t = (s || '').replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  return fromEnd ? '…' + t.slice(t.length - max) : t.slice(0, max) + '…'
}

function formatContext(c: ImageContext): string {
  const lines: string[] = []
  if (c.pageTitle) lines.push(`Page title: ${clip(c.pageTitle, 200)}`)
  if (c.url) lines.push(`Page URL: ${clip(c.url, 200)}`)
  if (c.heading) lines.push(`Section heading: ${clip(c.heading, 200)}`)
  if (c.alt) lines.push(`Image alt text: ${clip(c.alt, 300)}`)
  if (c.caption) lines.push(`Image caption: ${clip(c.caption, 500)}`)
  if (c.before) lines.push(`Text before the image:\n"""\n${clip(c.before, 1500, true)}\n"""`)
  if (c.after) lines.push(`Text after the image:\n"""\n${clip(c.after, 800)}\n"""`)
  return lines.length ? lines.join('\n') : '(no surrounding text available)'
}

/** 一个连接对应一个图片卡片：首条消息 start 发起讲解，之后可多次 ask 追问 */
export function handleImagePort(port: chrome.runtime.Port) {
  const history: ChatMessage[] = []
  let to = ''
  let ctrl: AbortController | null = null
  let closed = false

  port.onDisconnect.addListener(() => {
    closed = true
    ctrl?.abort()
  })
  const post = (m: ImagePortOut) => {
    if (!closed) port.postMessage(m)
  }

  port.onMessage.addListener(async (msg: ImagePortIn) => {
    if (ctrl) return // 上一次回答还没结束
    ctrl = new AbortController()
    const signal = ctrl.signal
    let pushedQuestion = false
    try {
      const { config, settings, prompts } = await getEffective()
      const p = pickProvider(config, settings.image.providerId)
      if (msg.type === 'start') {
        to = langEnglish(msg.to || settings.targetLang)
        const image = await loadImage(msg)
        history.length = 0
        history.push({ role: 'user', text: render(prompts.imageExplain, { to, context: formatContext(msg.context) }), image })
      } else {
        if (!history.length) throw new Error('请先等待图片讲解完成')
        history.push({ role: 'user', text: msg.question })
        pushedQuestion = true
      }
      const system = render(prompts.imageExplainSystem, { to })
      const full = await getLimiter(p).run(() =>
        chatStream(p, system, history, (text) => post({ type: 'delta', text }), signal),
      )
      history.push({ role: 'assistant', text: full })
      post({ type: 'done', text: full, model: p.model })
    } catch (e) {
      if (pushedQuestion) history.pop()
      post({ type: 'error', error: errMsg(e) })
    } finally {
      ctrl = null
    }
  })
}
