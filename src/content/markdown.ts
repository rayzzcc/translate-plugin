import { escapeHtml } from '../shared/utils'

function inline(s: string): string {
  return s
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^*\w])\*(?!\s)([^*]+?)\*(?!\*)/g, '$1<i>$2</i>')
}

/** 极简 Markdown 渲染（标题、列表、段落、粗体、斜体、行内代码）。先整体转义，因此可安全赋值给 innerHTML */
export function renderMarkdown(src: string): string {
  const out: string[] = []
  let list: 'ul' | 'ol' | null = null
  let para: string[] = []
  const flushPara = () => {
    if (para.length) out.push(`<p>${para.join('<br>')}</p>`)
    para = []
  }
  const closeList = () => {
    if (list) out.push(`</${list}>`)
    list = null
  }
  for (const raw of escapeHtml(src).split('\n')) {
    const line = raw.trimEnd()
    if (!line.trim()) {
      flushPara()
      closeList()
      continue
    }
    let m = line.match(/^\s*#{1,6}\s+(.*)$/)
    if (m) {
      flushPara()
      closeList()
      out.push(`<h4>${inline(m[1])}</h4>`)
      continue
    }
    const ul = line.match(/^\s*[-*+•]\s+(.*)$/)
    const ol = ul ? null : line.match(/^\s*\d+[.)、]\s*(.*)$/)
    m = ul ?? ol
    if (m) {
      flushPara()
      const type = ul ? 'ul' : 'ol'
      if (list !== type) {
        closeList()
        out.push(`<${type}>`)
        list = type
      }
      out.push(`<li>${inline(m[1])}</li>`)
      continue
    }
    closeList()
    para.push(inline(line.trim()))
  }
  flushPara()
  closeList()
  return out.join('')
}
