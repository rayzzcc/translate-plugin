export function isPlainObject(v: unknown): v is Record<string, any> {
  return Object.prototype.toString.call(v) === '[object Object]'
}

function clone<T>(v: T): T {
  if (Array.isArray(v)) return v.map(clone) as T
  if (isPlainObject(v)) {
    const out: Record<string, any> = {}
    for (const k of Object.keys(v)) out[k] = clone((v as any)[k])
    return out as T
  }
  return v
}

/** 深度合并：对象递归合并，数组整体替换，undefined 忽略。会修改并返回 base。 */
export function deepMerge<T>(base: T, ...sources: unknown[]): T {
  for (const src of sources) mergeInto(base as any, src)
  return base
}

function mergeInto(target: Record<string, any>, src: unknown) {
  if (!isPlainObject(src)) return
  for (const k of Object.keys(src)) {
    const sv = src[k]
    if (sv === undefined) continue
    if (isPlainObject(sv) && isPlainObject(target[k])) mergeInto(target[k], sv)
    else target[k] = clone(sv)
  }
}

export function deepClone<T>(v: T): T {
  return clone(v)
}

/** 判断域名是否命中规则：example.com 同时匹配其子域名，支持 *.example.com 和完整 URL */
export function hostMatches(host: string, patterns: string[]): boolean {
  const h = (host || '').toLowerCase()
  if (!h) return false
  return patterns.some((raw) => {
    const p = raw
      .trim()
      .toLowerCase()
      .replace(/^[a-z-]+:\/\//, '')
      .replace(/[/?#].*$/, '')
      .replace(/^\*\./, '')
    return !!p && (h === p || h.endsWith('.' + p))
  })
}

export function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms))
}

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/** 53 位字符串哈希（cyrb53） */
export function hash(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed
  let h2 = 0x41c6ce57 ^ seed
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}
