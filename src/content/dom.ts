// 段落识别：找出页面中“直接包含文字”的块级元素作为翻译单元

const INLINE_TAGS = new Set([
  'a', 'abbr', 'acronym', 'b', 'bdi', 'bdo', 'big', 'br', 'cite', 'code', 'data', 'del', 'dfn', 'em', 'font',
  'i', 'img', 'ins', 'kbd', 'label', 'mark', 'nobr', 'q', 'rp', 'rt', 'ruby', 's', 'samp', 'small', 'span',
  'strike', 'strong', 'sub', 'sup', 'time', 'tt', 'u', 'var', 'wbr',
])

/** 取文字时完全跳过的标签 */
const TEXT_SKIP_TAGS = new Set(['script', 'style', 'noscript', 'template', 'textarea', 'title', 'tp-trans', 'tp-root'])

const BASE_EXCLUDE = [
  'script', 'style', 'noscript', 'template', 'textarea', 'input', 'select', 'option', 'button', 'svg', 'math',
  'canvas', 'video', 'audio', 'iframe', 'object', 'embed', 'pre', 'code', 'kbd', 'samp',
  '[contenteditable]:not([contenteditable="false"])', '[translate="no"]', '.notranslate', 'tp-trans', 'tp-root',
].join(',')

let excludeSelector = BASE_EXCLUDE

export function setUserExclude(raw: string) {
  const extra = (raw || '')
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter((s) => {
      if (!s) return false
      try {
        document.createDocumentFragment().querySelector(s)
        return true
      } catch {
        return false
      }
    })
  excludeSelector = [BASE_EXCLUDE, ...extra].join(',')
}

export function isExcluded(el: Element): boolean {
  return !!el.closest(excludeSelector)
}

/** 节点是否是我们插入的元素本身 */
export function isOurNode(n: Node): boolean {
  return n.nodeType === 1 && ((n as Element).localName === 'tp-trans' || (n as Element).localName === 'tp-root')
}

/** 节点是否位于我们插入的元素内部（含自身） */
export function isInsideOurs(n: Node | null): boolean {
  const el = n && (n.nodeType === 1 ? (n as Element) : n.parentElement)
  return !!el?.closest('tp-trans,tp-root')
}

let inlineCache = new WeakMap<Element, boolean>()

export function resetCache() {
  inlineCache = new WeakMap()
}

export function isInline(el: Element): boolean {
  const cached = inlineCache.get(el)
  if (cached !== undefined) return cached
  const tag = el.localName
  let result = false
  if (INLINE_TAGS.has(tag) || tag.includes('-')) {
    const d = getComputedStyle(el).display
    result = d.startsWith('inline') || d === 'contents'
  }
  inlineCache.set(el, result)
  return result
}

/** 从元素向上找到最近的块级祖先（段落单元） */
export function findBlock(el: Element | null): Element | null {
  while (el && el !== document.documentElement && isInline(el)) el = el.parentElement
  return el && el !== document.documentElement ? el : null
}

export function collectParagraphs(root: Element): Element[] {
  const out = new Set<Element>()
  if (root.nodeType !== 1 || isExcluded(root)) return []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (/\S/.test((n as Text).data) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
  })
  let lastParent: Element | null = null
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const parent = n.parentElement
    if (!parent || parent === lastParent) continue
    lastParent = parent
    if (parent.closest(excludeSelector)) continue
    const block = findBlock(parent)
    if (block && !isExcluded(block)) out.add(block)
  }
  return [...out]
}

function walkOwn(el: Element, onText: (t: Text) => void, onBr?: () => void) {
  for (let c = el.firstChild; c; c = c.nextSibling) {
    if (c.nodeType === 3) onText(c as Text)
    else if (c.nodeType === 1) {
      const e = c as Element
      const tag = e.localName
      if (tag === 'br') onBr?.()
      else if (!TEXT_SKIP_TAGS.has(tag) && isInline(e)) walkOwn(e, onText, onBr)
    }
  }
}

/** 段落自身的文字（不含嵌套块级子元素） */
export function getParagraphText(el: Element): string {
  let s = ''
  walkOwn(
    el,
    (t) => (s += t.data.replace(/\s+/g, ' ')),
    () => (s += '\n'),
  )
  return s.replace(/ *\n */g, '\n').replace(/\n{2,}/g, '\n').trim()
}

export function getOwnTextNodes(el: Element): Text[] {
  const list: Text[] = []
  walkOwn(el, (t) => {
    if (t.data) list.push(t)
  })
  return list
}

/** 段落中最后一个行内内容节点，译文插在它后面 */
export function lastInlineNode(el: Element): ChildNode | null {
  let last: ChildNode | null = null
  for (let c = el.firstChild; c; c = c.nextSibling) {
    if (c.nodeType === 3) {
      if (/\S/.test((c as Text).data)) last = c
    } else if (c.nodeType === 1) {
      const e = c as Element
      if (isOurNode(e) || TEXT_SKIP_TAGS.has(e.localName)) continue
      if (isInline(e)) last = c
    }
  }
  return last
}

export function worthTranslating(text: string, minLength: number): boolean {
  if (text.length < Math.max(1, minLength)) return false
  if (!/\p{L}/u.test(text)) return false
  if (/^(https?:\/\/|www\.)\S+$/i.test(text)) return false
  if (/^[\w.+-]+@[\w-]+\.[\w.]+$/.test(text)) return false
  return true
}
