import { callBg, friendlyError } from '../shared/messages'
import type { DisplayMode } from '../shared/types'
import * as dom from './dom'
import { isTargetLanguage } from './lang'
import { S } from './settings'
import { toastError } from './ui/toast'

type ItemState = 'pending' | 'done' | 'error' | 'skipped'

interface Item {
  el: Element
  text: string
  state: ItemState
  /** 悬停等手动触发的段落：跳过语言检测 */
  manual: boolean
  node?: HTMLElement
  /** 仅译文模式下被清空的原文文本节点 */
  hidden?: [Text, string][]
}

const MAX_ITEMS_PER_REQUEST = 16
const MAX_CHARS_PER_REQUEST = 4000

export class PageTranslator {
  active = false
  mode: DisplayMode = 'bilingual'
  pending = 0

  private items = new Map<Element, Item>()
  private observed = new WeakSet<Element>()
  private io: IntersectionObserver | null = null
  private mo: MutationObserver | null = null
  private queue: Item[] = []
  private flushTimer = 0
  private moTimer = 0
  private gen = 0
  private pendingRoots = new Set<Element>()
  private changedEls = new Set<Element>()
  private listeners = new Set<() => void>()

  constructor() {
    this.mode = S().displayMode
  }

  onChange(fn: () => void) {
    this.listeners.add(fn)
  }

  private emit() {
    this.listeners.forEach((fn) => fn())
  }

  // ---------------- 整页翻译 ----------------

  start() {
    if (this.active || !document.body) return
    this.active = true
    this.mode = S().displayMode
    dom.setUserExclude(S().advanced.excludeSelectors)
    const margin = Math.max(0, S().advanced.rootMargin)
    this.io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue
          this.io?.unobserve(e.target)
          this.enqueue(e.target, false)
        }
      },
      { rootMargin: `${margin}px 0px ${margin}px 0px` },
    )
    this.scan(document.body)
    this.mo = new MutationObserver((recs) => this.onMutations(recs))
    this.mo.observe(document.body, { childList: true, subtree: true, characterData: true })
    this.emit()
  }

  stop() {
    this.gen++
    this.active = false
    clearTimeout(this.flushTimer)
    clearTimeout(this.moTimer)
    this.flushTimer = this.moTimer = 0
    this.queue = []
    this.io?.disconnect()
    this.mo?.disconnect()
    this.io = this.mo = null
    for (const it of this.items.values()) {
      this.restoreOriginal(it)
      it.node?.remove()
    }
    this.items.clear()
    this.observed = new WeakSet()
    this.pendingRoots.clear()
    this.changedEls.clear()
    this.pending = 0
    this.emit()
  }

  toggle() {
    if (this.active) this.stop()
    else this.start()
  }

  setMode(mode: DisplayMode) {
    this.mode = mode
    for (const it of this.items.values()) {
      if (it.state !== 'done' || !it.node) continue
      it.node.className = this.nodeClass(it)
      if (mode === 'translation') this.hideOriginal(it)
      else this.restoreOriginal(it)
    }
    this.emit()
  }

  /** 设置变化后刷新译文样式 */
  refreshStyle() {
    for (const it of this.items.values()) {
      if (it.state === 'done' && it.node) it.node.className = this.nodeClass(it)
    }
  }

  // ---------------- 单段翻译（悬停） ----------------

  translateOne(el: Element) {
    if (!this.items.has(el)) this.enqueue(el, true)
  }

  toggleOne(el: Element) {
    const it = this.items.get(el)
    if (it) this.removeItem(it, true)
    else this.enqueue(el, true)
  }

  // ---------------- 内部实现 ----------------

  private scan(root: Element) {
    if (!this.io) return
    dom.resetCache()
    for (const el of dom.collectParagraphs(root)) {
      if (this.items.has(el) || this.observed.has(el)) continue
      this.observed.add(el)
      this.io.observe(el)
    }
  }

  private enqueue(el: Element, manual: boolean) {
    if (!el.isConnected || this.items.has(el)) return
    const text = dom.getParagraphText(el)
    if (!dom.worthTranslating(text, S().advanced.minTextLength)) return
    const item: Item = { el, text, state: 'pending', manual }
    this.items.set(el, item)
    this.queue.push(item)
    if (!this.flushTimer) this.flushTimer = window.setTimeout(() => this.flush(), 60)
  }

  private async flush() {
    this.flushTimer = 0
    const gen = this.gen
    const batch = this.queue.splice(0)
    if (!batch.length) return
    const target = S().targetLang
    const same = await Promise.all(batch.map((it) => (it.manual ? false : isTargetLanguage(it.text, target))))
    if (gen !== this.gen) return

    const todo: Item[] = []
    batch.forEach((it, i) => {
      if (this.items.get(it.el) !== it) return
      if (same[i]) it.state = 'skipped'
      else todo.push(it)
    })
    for (const it of todo) this.renderLoading(it)

    let group: Item[] = []
    let chars = 0
    for (const it of todo) {
      if (group.length && (group.length >= MAX_ITEMS_PER_REQUEST || chars + it.text.length > MAX_CHARS_PER_REQUEST)) {
        void this.request(group, gen)
        group = []
        chars = 0
      }
      group.push(it)
      chars += it.text.length
    }
    if (group.length) void this.request(group, gen)
  }

  private async request(group: Item[], gen: number) {
    this.pending += group.length
    this.emit()
    try {
      const results = await callBg<string[]>({
        type: 'translate',
        texts: group.map((it) => it.text),
        scene: 'page',
        context: S().advanced.pageContext ? document.title : undefined,
      })
      if (gen !== this.gen) return
      group.forEach((it, i) => this.items.get(it.el) === it && this.renderResult(it, results[i] ?? ''))
    } catch (e) {
      if (gen !== this.gen) return
      const msg = friendlyError(e)
      group.forEach((it) => this.items.get(it.el) === it && this.renderError(it, msg))
      toastError(`翻译失败：${msg}`)
    } finally {
      if (gen === this.gen) {
        this.pending = Math.max(0, this.pending - group.length)
        this.emit()
      }
    }
  }

  private isBlock(it: Item) {
    return it.text.length > 24 || it.text.includes('\n') || /^h[1-6]$/.test(it.el.localName)
  }

  private nodeClass(it: Item) {
    const layout = this.isBlock(it) ? 'tp-block' : 'tp-inline'
    if (this.mode === 'translation') return `tp-trans ${layout} tp-only`
    return `tp-trans ${layout} tp-theme-${S().style.theme}`
  }

  private createNode() {
    const node = document.createElement('tp-trans')
    node.setAttribute('translate', 'no')
    return node
  }

  private insertNode(it: Item) {
    if (!it.node) return
    const ref = dom.lastInlineNode(it.el)
    if (ref) ref.after(it.node)
    else it.el.appendChild(it.node)
  }

  private renderLoading(it: Item) {
    it.node ??= this.createNode()
    it.node.className = 'tp-trans tp-loading'
    it.node.replaceChildren(document.createElement('tp-spin'))
    if (!it.node.isConnected) this.insertNode(it)
  }

  private renderResult(it: Item, text: string) {
    const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
    if (!text.trim() || norm(text) === norm(it.text)) {
      it.state = 'skipped'
      it.node?.remove()
      return
    }
    it.state = 'done'
    it.node ??= this.createNode()
    it.node.className = this.nodeClass(it)
    const inner = document.createElement('tp-inner')
    inner.textContent = text
    it.node.replaceChildren(inner)
    if (!it.node.isConnected) this.insertNode(it)
    if (this.mode === 'translation') this.hideOriginal(it)
  }

  private renderError(it: Item, msg: string) {
    it.state = 'error'
    it.node ??= this.createNode()
    it.node.className = 'tp-trans tp-loading'
    const err = document.createElement('tp-err')
    err.textContent = '⚠ 翻译失败，点击重试'
    err.title = msg
    err.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      const { el, manual } = it
      this.removeItem(it, true)
      this.enqueue(el, manual)
    })
    it.node.replaceChildren(err)
    if (!it.node.isConnected) this.insertNode(it)
  }

  private removeItem(it: Item, restore: boolean) {
    if (restore) this.restoreOriginal(it)
    it.node?.remove()
    this.items.delete(it.el)
  }

  /** 修改 DOM 后丢弃由我们自己引起的 characterData 记录 */
  private flushOwnMutations(touched: Set<Node>) {
    if (!this.mo) return
    const recs = this.mo.takeRecords().filter((r) => !(r.type === 'characterData' && touched.has(r.target)))
    if (recs.length) this.onMutations(recs)
  }

  private hideOriginal(it: Item) {
    if (it.hidden) return
    const texts = dom.getOwnTextNodes(it.el)
    it.hidden = texts.map((t) => [t, t.data])
    for (const t of texts) t.data = ''
    this.flushOwnMutations(new Set(texts))
  }

  private restoreOriginal(it: Item) {
    if (!it.hidden) return
    const touched = new Set<Node>()
    for (const [t, data] of it.hidden) {
      if (t.data === '') {
        t.data = data
        touched.add(t)
      }
    }
    it.hidden = undefined
    this.flushOwnMutations(touched)
  }

  private onMutations(recs: MutationRecord[]) {
    for (const r of recs) {
      if (dom.isInsideOurs(r.target)) continue
      if (r.type === 'characterData') {
        this.markChanged(r.target)
        continue
      }
      let foreign = false
      r.addedNodes.forEach((n) => {
        if (dom.isOurNode(n)) return
        foreign = true
        if (n.nodeType === 1) this.pendingRoots.add(n as Element)
        else if (n.nodeType === 3 && n.parentElement) this.pendingRoots.add(n.parentElement)
      })
      if (r.removedNodes.length) foreign = true
      if (foreign) this.markChanged(r.target)
    }
    if ((this.pendingRoots.size || this.changedEls.size) && !this.moTimer) {
      this.moTimer = window.setTimeout(() => this.processMutations(), 250)
    }
  }

  private markChanged(node: Node) {
    const start = node.nodeType === 1 ? (node as Element) : node.parentElement
    let el: Element | null = start
    // 变化可能发生在段落内部的行内元素里，向上找到段落
    while (el && !this.items.has(el) && dom.isInline(el)) el = el.parentElement
    if (el && this.items.has(el)) this.changedEls.add(el)
  }

  private processMutations() {
    this.moTimer = 0
    dom.resetCache()
    for (const el of this.changedEls) {
      const it = this.items.get(el)
      if (!it) continue
      if (!el.isConnected) {
        this.items.delete(el)
        continue
      }
      const cur = dom.getParagraphText(el)
      const unchanged = it.hidden ? cur === '' : cur === it.text
      if (!unchanged) {
        // 网站更新了段落内容：丢弃旧译文，重新翻译
        it.hidden = undefined
        this.removeItem(it, false)
        if (this.active && this.io) {
          this.observed.add(el)
          this.io.observe(el)
        } else if (it.manual) this.enqueue(el, true)
      } else if (it.node && !it.node.isConnected && it.state !== 'skipped') {
        // 框架重新渲染时把译文节点删掉了，补回去
        this.insertNode(it)
      }
    }
    this.changedEls.clear()
    if (this.active) {
      for (const root of this.pendingRoots) if (root.isConnected) this.scan(root)
    }
    this.pendingRoots.clear()
  }
}
