import type { ReadingContext } from '../shared/types'
import { findBlock, isExcluded } from './dom'

function clean(text: string | null | undefined): string {
  return (text || '').replace(/\s+/g, ' ').trim()
}

function paragraphOf(node: Node | null): HTMLElement | null {
  const el = node instanceof Element ? node : node?.parentElement
  if (!el) return null
  return (el.closest('p,li,blockquote,td,th,pre') as HTMLElement | null) || (findBlock(el) as HTMLElement | null)
}

function headingBefore(el: Element | null): string | undefined {
  if (!el) return undefined
  let found: Element | undefined
  for (const h of document.querySelectorAll('h1,h2,h3,h4')) {
    if (h.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) found = h
    else break
  }
  return clean(found?.textContent) || undefined
}

export function collectReadingContext(): ReadingContext {
  const sel = window.getSelection()
  const selection = sel && !sel.isCollapsed ? clean(sel.toString()).slice(0, 5000) : undefined
  const paragraph = selection && sel?.rangeCount ? paragraphOf(sel.getRangeAt(0).commonAncestorContainer) : null
  const anchor = paragraph || (document.querySelector('main,article') as HTMLElement | null) || document.body
  const context: ReadingContext = { pageTitle: document.title, url: location.href, selection }

  if (paragraph) {
    const rawParagraph = clean(paragraph.innerText)
    const index = selection ? rawParagraph.indexOf(selection) : -1
    // 选中内容不重复放入段落字段；前后文优先取同段，便于模型定位句子。
    if (selection && index >= 0) {
      context.paragraph = rawParagraph.slice(0, 3000) || undefined
      context.before = rawParagraph.slice(0, index).slice(-1800) || undefined
      context.after = rawParagraph.slice(index + selection.length).slice(0, 1000) || undefined
    } else context.paragraph = rawParagraph.slice(0, 3000) || undefined
  } else if (anchor && !isExcluded(anchor)) {
    context.paragraph = clean(anchor.innerText).slice(0, 3000) || undefined
  }
  context.heading = headingBefore(paragraph)
  return context
}
