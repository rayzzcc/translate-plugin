/** 去掉 JSONC 中的注释（感知字符串，不会误删 URL 中的 //） */
function stripComments(src: string): string {
  let out = ''
  let inStr = false
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (inStr) {
      out += c
      if (c === '\\') {
        out += src[i + 1] ?? ''
        i++
      } else if (c === '"') inStr = false
      continue
    }
    if (c === '"') {
      inStr = true
      out += c
    } else if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i++
      out += '\n'
    } else if (c === '/' && src[i + 1] === '*') {
      i += 2
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++
      i++
    } else out += c
  }
  return out
}

/** 去掉 } 或 ] 前的末尾逗号 */
function stripTrailingCommas(src: string): string {
  let out = ''
  let inStr = false
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (inStr) {
      out += c
      if (c === '\\') {
        out += src[i + 1] ?? ''
        i++
      } else if (c === '"') inStr = false
      continue
    }
    if (c === '"') {
      inStr = true
    } else if (c === ',') {
      let j = i + 1
      while (j < src.length && /\s/.test(src[j])) j++
      if (src[j] === '}' || src[j] === ']') continue
    }
    out += c
  }
  return out
}

export function parseJsonc<T = unknown>(src: string): T {
  const body = src.charCodeAt(0) === 0xfeff ? src.slice(1) : src
  const clean = stripTrailingCommas(stripComments(body))
  try {
    return JSON.parse(clean) as T
  } catch (e) {
    throw new Error(`config.jsonc 格式错误：${e instanceof Error ? e.message : e}`)
  }
}
