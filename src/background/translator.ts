import { langEnglish } from '../shared/languages'
import type { Prompts, ProviderConfig, Scene } from '../shared/types'
import { hash } from '../shared/utils'
import { cacheGetMany, cacheSetMany } from './cache'
import { getEffective, pickProvider } from './config'
import { getLimiter } from './limiter'
import { chat } from './providers'

export interface TranslateRequest {
  texts: string[]
  scene: Scene
  to?: string
  providerId?: string
  context?: string
  noCache?: boolean
}

function render(tpl: string, vars: Record<string, string>) {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? '')
}

function contextLine(scene: Scene, context?: string) {
  if (!context) return ''
  const c = context.replace(/\s+/g, ' ').trim().slice(0, 200)
  if (!c) return ''
  return scene === 'subtitle'
    ? `Context: these are subtitles of the video "${c}".\n\n`
    : `Context: the text comes from a web page titled "${c}".\n\n`
}

const SEG_RE = /<seg\s+id\s*=\s*["']?(\d+)["']?\s*>([\s\S]*?)<\/seg>/gi

function parseSegs(out: string, count: number): (string | undefined)[] {
  const res: (string | undefined)[] = new Array(count).fill(undefined)
  for (const m of out.matchAll(SEG_RE)) {
    const idx = Number(m[1]) - 1
    if (idx >= 0 && idx < count && res[idx] === undefined) res[idx] = m[2].trim()
  }
  return res
}

function stripSegTags(s: string) {
  return s.replace(/<\/?seg[^>]*>/gi, '').trim()
}

function escapeSeg(s: string) {
  return s.replace(/<\/?seg/gi, (m) => m.replace('<', '‹'))
}

function chunkTexts(texts: string[], maxCount: number, maxChars: number): string[][] {
  const chunks: string[][] = []
  let cur: string[] = []
  let chars = 0
  for (const t of texts) {
    if (cur.length && (cur.length >= maxCount || chars + t.length > maxChars)) {
      chunks.push(cur)
      cur = []
      chars = 0
    }
    cur.push(t)
    chars += t.length
  }
  if (cur.length) chunks.push(cur)
  return chunks
}

async function translateSingle(p: ProviderConfig, prompts: Prompts, text: string, vars: Record<string, string>) {
  const out = await chat(p, { system: render(prompts.system, vars), user: render(prompts.single, { ...vars, text }) })
  return stripSegTags(out)
}

/** 翻译一组文本（一次模型请求，批量时用 <seg> 标签对齐） */
export async function translateChunk(
  p: ProviderConfig,
  prompts: Prompts,
  texts: string[],
  to: string,
  scene: Scene,
  context?: string,
): Promise<string[]> {
  const vars = { to: langEnglish(to), context: contextLine(scene, context) }
  if (texts.length === 1 && scene !== 'subtitle') return [await translateSingle(p, prompts, texts[0], vars)]

  const segText = texts.map((t, i) => `<seg id="${i + 1}">${escapeSeg(t)}</seg>`).join('\n')
  const tpl = scene === 'subtitle' ? prompts.subtitle : prompts.batch
  const out = await chat(p, { system: render(prompts.system, vars), user: render(tpl, { ...vars, text: segText }) })
  const parsed = parseSegs(out, texts.length)

  // 单段但模型没按标签返回：直接用整段输出
  if (texts.length === 1 && parsed[0] === undefined && out.trim()) parsed[0] = stripSegTags(out)

  const missing = parsed.map((v, i) => (v === undefined ? i : -1)).filter((i) => i >= 0)
  if (missing.length) {
    // 模型漏掉或合并了部分段落：逐段补译
    const fixed = await Promise.all(missing.map((i) => translateSingle(p, prompts, texts[i], vars)))
    missing.forEach((i, j) => (parsed[i] = fixed[j]))
  }
  return parsed as string[]
}

function cacheKey(p: ProviderConfig, to: string, scene: Scene, text: string) {
  const sceneKey = scene === 'subtitle' ? 'sub' : 'txt'
  return `${p.type}|${p.model}|${to}|${sceneKey}|${hash(text)}:${text.length}`
}

export async function translateTexts(req: TranslateRequest): Promise<string[]> {
  const { config, settings, prompts } = await getEffective()
  const provider = pickProvider(config, req.providerId || settings.providerId)
  const to = req.to || settings.targetLang
  const useCache = settings.advanced.cache && !req.noCache

  const results: string[] = new Array(req.texts.length)
  const todo = new Map<string, number[]>()
  req.texts.forEach((raw, i) => {
    const text = (raw ?? '').trim()
    if (!text) {
      results[i] = raw ?? ''
      return
    }
    const list = todo.get(text)
    if (list) list.push(i)
    else todo.set(text, [i])
  })

  let uniq = [...todo.keys()]
  if (useCache && uniq.length) {
    const hits = await cacheGetMany(uniq.map((t) => cacheKey(provider, to, req.scene, t)))
    uniq = uniq.filter((t, i) => {
      const hit = hits[i]
      if (hit === undefined) return true
      for (const idx of todo.get(t)!) results[idx] = hit
      return false
    })
  }
  if (!uniq.length) return results

  const maxCount = req.scene === 'subtitle' ? 30 : provider.batchSize || settings.advanced.batchSize
  const maxChars = provider.batchChars || settings.advanced.batchChars
  const chunks = req.scene === 'subtitle' ? [uniq] : chunkTexts(uniq, maxCount, maxChars)
  const limiter = getLimiter(provider)

  await Promise.all(
    chunks.map(async (chunk) => {
      const out = await limiter.run(() => translateChunk(provider, prompts, chunk, to, req.scene, req.context))
      const entries: [string, string][] = []
      chunk.forEach((t, j) => {
        const v = out[j] ?? ''
        for (const idx of todo.get(t)!) results[idx] = v
        if (v) entries.push([cacheKey(provider, to, req.scene, t), v])
      })
      if (useCache) void cacheSetMany(entries)
    }),
  )
  return results
}

export async function testProvider(providerId: string, text?: string, to?: string) {
  const { config, settings, prompts } = await getEffective()
  const p = pickProvider(config, providerId)
  const t0 = Date.now()
  const sample = text?.trim() || 'Hello! This is a quick test of the translation service. Does it work well?'
  const [out] = await translateChunk(p, prompts, [sample], to || settings.targetLang, 'test')
  return { text: out, ms: Date.now() - t0, model: p.model }
}
