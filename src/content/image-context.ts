import type { ImageContext } from '../shared/types'

const SKIP = 'script,style,noscript,template,svg,nav,tp-trans,tp-root,[aria-hidden="true"]'
const MAX_NODES = 3000

/** 沿文档顺序向前或向后收集图片附近的可见文字 */
function textAround(img: Element, dir: 'before' | 'after', limit: number): string {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      const p = n.parentElement
      if (!p || !/\S/.test((n as Text).data) || p.closest(SKIP)) return NodeFilter.FILTER_REJECT
      if (p.checkVisibility && !p.checkVisibility()) return NodeFilter.FILTER_REJECT
      return NodeFilter.FILTER_ACCEPT
    },
  })
  walker.currentNode = img
  const parts: string[] = []
  let len = 0
  for (let i = 0; i < MAX_NODES && len < limit; i++) {
    const n = dir === 'before' ? walker.previousNode() : walker.nextNode()
    if (!n) break
    const t = (n as Text).data.replace(/\s+/g, ' ').trim()
    parts.push(t)
    len += t.length + 1
  }
  if (dir === 'before') parts.reverse()
  const text = parts.join(' ')
  return dir === 'before' ? text.slice(-limit) : text.slice(0, limit)
}

function nearestHeading(img: Element): string | undefined {
  let found: Element | undefined
  for (const h of document.querySelectorAll('h1,h2,h3,h4')) {
    if (h.compareDocumentPosition(img) & Node.DOCUMENT_POSITION_FOLLOWING) found = h
    else break
  }
  return found?.textContent?.replace(/\s+/g, ' ').trim() || undefined
}

export function collectImageContext(img: HTMLImageElement | null): ImageContext {
  const ctx: ImageContext = { pageTitle: document.title, url: location.href }
  if (!img || !document.body) return ctx
  ctx.alt = img.alt?.trim() || img.title?.trim() || img.getAttribute('aria-label')?.trim() || undefined
  ctx.caption = img.closest('figure')?.querySelector('figcaption')?.textContent?.replace(/\s+/g, ' ').trim() || undefined
  ctx.heading = nearestHeading(img)
  ctx.before = textAround(img, 'before', 1500) || undefined
  ctx.after = textAround(img, 'after', 800) || undefined
  return ctx
}
