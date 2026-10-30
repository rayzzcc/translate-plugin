import type { ProviderConfig } from '../shared/types'
import { deepMerge, sleep } from '../shared/utils'

export interface ImageData {
  mime: string
  base64: string
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
  image?: ImageData
}

export interface ChatInput {
  system: string
  user: string
  image?: ImageData
}

interface Req {
  url: string
  headers: Record<string, string>
  body: Record<string, any>
}

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

function trimSlash(s: string) {
  return s.trim().replace(/\/+$/, '')
}

function extractError(text: string): string {
  try {
    const j = JSON.parse(text)
    const m = j?.error?.message || j?.error || j?.message || j?.msg
    if (m) return typeof m === 'string' ? m : JSON.stringify(m)
  } catch {
    /* 非 JSON */
  }
  return text.slice(0, 300)
}

// ---------------- 请求构造 ----------------

function buildOpenAI(p: ProviderConfig, system: string, messages: ChatMessage[], stream: boolean): Req {
  const base = trimSlash(p.baseUrl || 'https://api.openai.com/v1')
  const url = /\/chat\/completions$/.test(base) ? base : `${base}/chat/completions`
  const body: Record<string, any> = {
    model: p.model,
    messages: [
      { role: 'system', content: system },
      ...messages.map((m) => ({
        role: m.role,
        content: m.image
          ? [
              { type: 'text', text: m.text },
              { type: 'image_url', image_url: { url: `data:${m.image.mime};base64,${m.image.base64}` } },
            ]
          : m.text,
      })),
    ],
    stream,
  }
  if (p.temperature !== undefined) body.temperature = p.temperature
  if (p.maxTokens) body.max_tokens = p.maxTokens
  deepMerge(body, p.extraBody)
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(p.extraHeaders || {}) }
  if (p.apiKey) headers.Authorization = `Bearer ${p.apiKey}`
  return { url, headers, body }
}

function buildAnthropic(p: ProviderConfig, system: string, messages: ChatMessage[], stream: boolean): Req {
  const base = trimSlash(p.baseUrl || 'https://api.anthropic.com')
  const url = /\/messages$/.test(base) ? base : /\/v1$/.test(base) ? `${base}/messages` : `${base}/v1/messages`
  const body: Record<string, any> = {
    model: p.model,
    max_tokens: p.maxTokens || 4096,
    system,
    messages: messages.map((m) => ({
      role: m.role,
      content: m.image
        ? [
            { type: 'image', source: { type: 'base64', media_type: m.image.mime, data: m.image.base64 } },
            { type: 'text', text: m.text },
          ]
        : m.text,
    })),
  }
  if (stream) body.stream = true
  if (p.temperature !== undefined) body.temperature = p.temperature
  deepMerge(body, p.extraBody)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-api-key': p.apiKey || '',
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
    ...(p.extraHeaders || {}),
  }
  return { url, headers, body }
}

function buildGemini(p: ProviderConfig, system: string, messages: ChatMessage[], stream: boolean): Req {
  const base = trimSlash(p.baseUrl || 'https://generativelanguage.googleapis.com')
  const prefix = /\/v1(beta|alpha)?$/.test(base) ? base : `${base}/v1beta`
  const model = encodeURIComponent(p.model.replace(/^models\//, ''))
  const url = `${prefix}/models/${model}:${stream ? 'streamGenerateContent?alt=sse' : 'generateContent'}`
  const generationConfig: Record<string, any> = {}
  if (p.temperature !== undefined) generationConfig.temperature = p.temperature
  if (p.maxTokens) generationConfig.maxOutputTokens = p.maxTokens
  const body: Record<string, any> = {
    systemInstruction: { parts: [{ text: system }] },
    contents: messages.map((m) => {
      const parts: any[] = [{ text: m.text }]
      if (m.image) parts.unshift({ inlineData: { mimeType: m.image.mime, data: m.image.base64 } })
      return { role: m.role === 'assistant' ? 'model' : 'user', parts }
    }),
    generationConfig,
  }
  deepMerge(body, p.extraBody)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-goog-api-key': p.apiKey || '',
    ...(p.extraHeaders || {}),
  }
  return { url, headers, body }
}

function buildRequest(p: ProviderConfig, system: string, messages: ChatMessage[], stream: boolean): Req {
  if (p.type === 'anthropic') return buildAnthropic(p, system, messages, stream)
  if (p.type === 'gemini') return buildGemini(p, system, messages, stream)
  return buildOpenAI(p, system, messages, stream)
}

// ---------------- 响应解析 ----------------

function badFormat(data: unknown) {
  return new Error(`接口返回格式异常：${JSON.stringify(data).slice(0, 200)}`)
}

function parseResponse(p: ProviderConfig, data: any): string {
  if (p.type === 'anthropic') {
    if (!Array.isArray(data?.content)) throw badFormat(data)
    return data.content
      .filter((b: any) => b?.type === 'text')
      .map((b: any) => b.text)
      .join('')
  }
  if (p.type === 'gemini') {
    const cand = data?.candidates?.[0]
    if (!cand) {
      const reason = data?.promptFeedback?.blockReason
      throw reason ? new Error(`内容被拦截：${reason}`) : badFormat(data)
    }
    return (cand.content?.parts || [])
      .filter((x: any) => !x.thought)
      .map((x: any) => x.text || '')
      .join('')
  }
  const content = data?.choices?.[0]?.message?.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) return content.map((c: any) => c?.text || '').join('')
  throw badFormat(data)
}

/** 流式响应中一个事件携带的文本增量 */
function streamDelta(p: ProviderConfig, data: any): string {
  if (p.type === 'anthropic') {
    return data?.type === 'content_block_delta' && data.delta?.type === 'text_delta' ? data.delta.text || '' : ''
  }
  if (p.type === 'gemini') {
    return (data?.candidates?.[0]?.content?.parts || [])
      .filter((x: any) => !x.thought)
      .map((x: any) => x.text || '')
      .join('')
  }
  const c = data?.choices?.[0]?.delta?.content
  return typeof c === 'string' ? c : ''
}

// ---------------- 发送 ----------------

/** 空闲超时：一段时间内没有任何进展就中止请求 */
function watchdog(ms: number, ctrl: AbortController) {
  let timedOut = false
  const fire = () => {
    timedOut = true
    ctrl.abort()
  }
  let timer = setTimeout(fire, ms)
  return {
    kick() {
      clearTimeout(timer)
      timer = setTimeout(fire, ms)
    },
    stop: () => clearTimeout(timer),
    get timedOut() {
      return timedOut
    },
  }
}

/** 发出请求并在 429 / 5xx / 网络错误时重试，返回状态码正常的响应 */
async function send(req: Req, ctrl: AbortController): Promise<Response> {
  let lastErr: Error = new Error('请求失败')
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await sleep(1000 * 2 ** (attempt - 1))
    if (ctrl.signal.aborted) break
    try {
      const res = await fetch(req.url, {
        method: 'POST',
        headers: req.headers,
        body: JSON.stringify(req.body),
        signal: ctrl.signal,
      })
      if (res.ok) return res
      const err = new HttpError(res.status, `HTTP ${res.status}：${extractError(await res.text())}`)
      if (res.status === 429 || res.status >= 500) {
        lastErr = err
        continue
      }
      throw err
    } catch (e) {
      if (e instanceof HttpError) throw e
      if (ctrl.signal.aborted) break
      lastErr = new Error(`网络错误：${e instanceof Error ? e.message : e}`)
    }
  }
  throw lastErr
}

function timeoutError(p: ProviderConfig) {
  return new Error(`请求超时（${Math.round((p.timeoutMs || 60000) / 1000)} 秒）`)
}

async function complete(p: ProviderConfig, system: string, messages: ChatMessage[]): Promise<string> {
  const ctrl = new AbortController()
  const wd = watchdog(p.timeoutMs || 60000, ctrl)
  try {
    const res = await send(buildRequest(p, system, messages, false), ctrl)
    const text = await res.text()
    let data: unknown
    try {
      data = JSON.parse(text)
    } catch {
      throw new Error(`接口返回的不是 JSON：${text.slice(0, 200)}`)
    }
    return parseResponse(p, data)
  } catch (e) {
    throw wd.timedOut ? timeoutError(p) : e
  } finally {
    wd.stop()
  }
}

/** 去掉推理模型的思考内容、整体包裹的代码块 */
export function cleanOutput(text: string): string {
  let t = text.replace(/<think>[\s\S]*?<\/think>/gi, '')
  t = t.replace(/^[\s\S]*?<\/think>/i, '') // 只有结束标签的情况
  t = t.trim()
  const fence = t.match(/^```[\w-]*\n([\s\S]*?)\n?```$/)
  if (fence) t = fence[1].trim()
  return t
}

/** 流式过程中的清理：隐藏尚未结束的 <think> 段 */
function cleanPartial(text: string): string {
  let t = text.replace(/<think>[\s\S]*?<\/think>/gi, '')
  const open = t.search(/<think>/i)
  if (open >= 0) t = t.slice(0, open)
  return t.replace(/^\s+/, '')
}

export async function chat(p: ProviderConfig, input: ChatInput): Promise<string> {
  const out = await complete(p, input.system, [{ role: 'user', text: input.user, image: input.image }])
  return cleanOutput(out)
}

/**
 * 流式对话：每收到一段文本就用“当前完整文本”回调 onText。
 * 网关不支持流式（返回普通 JSON）时自动按普通响应处理。
 */
export async function chatStream(
  p: ProviderConfig,
  system: string,
  messages: ChatMessage[],
  onText: (full: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const ctrl = new AbortController()
  const wd = watchdog(p.timeoutMs || 60000, ctrl)
  const onAbort = () => ctrl.abort()
  signal?.addEventListener('abort', onAbort)
  let raw = ''
  try {
    const res = await send(buildRequest(p, system, messages, true), ctrl)
    wd.kick()
    if (!(res.headers.get('content-type') || '').includes('text/event-stream') || !res.body) {
      const text = await res.text()
      let data: unknown
      try {
        data = JSON.parse(text)
      } catch {
        throw new Error(`接口返回的不是 JSON：${text.slice(0, 200)}`)
      }
      const out = cleanOutput(parseResponse(p, data))
      onText(out)
      return out
    }
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
    let buf = ''
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      wd.kick()
      buf += value
      let idx: number
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim()
        buf = buf.slice(idx + 1)
        if (!line.startsWith('data:')) continue
        const payload = line.slice(5).trim()
        if (!payload || payload === '[DONE]') continue
        let data: any
        try {
          data = JSON.parse(payload)
        } catch {
          continue
        }
        if (data?.error) throw new Error(extractError(JSON.stringify(data)))
        const delta = streamDelta(p, data)
        if (delta) {
          raw += delta
          onText(cleanPartial(raw))
        }
      }
    }
    return cleanOutput(raw)
  } catch (e) {
    if (wd.timedOut) throw timeoutError(p)
    if (signal?.aborted) throw new Error('已取消')
    throw e
  } finally {
    wd.stop()
    signal?.removeEventListener('abort', onAbort)
  }
}
