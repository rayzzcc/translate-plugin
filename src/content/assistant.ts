import { READING_PORT, type ReadingPortIn, type ReadingPortOut } from '../shared/messages'
import type { ReadingContext, ReadingTurn, SelectionAnchor } from '../shared/types'
import { renderMarkdown } from './markdown'
import { collectReadingContext } from './reading-context'
import { currentProvider, S } from './settings'
import { h, loadingDots, makeDraggable, ui } from './ui/root'
import { toast } from './ui/toast'

const QUICK = [
  { label: '通俗解释', question: '用通俗的中文解释这段内容在说什么，以及它在文章中的作用。' },
  { label: '举个例子', question: '用一个简单的例子帮助我理解这段内容，例子要贴近原意。' },
]

export class ReadingAssistant {
  private root: HTMLElement | null = null
  private panel: HTMLElement | null = null
  private fab: HTMLElement | null = null
  private log: HTMLElement | null = null
  private input: HTMLTextAreaElement | null = null
  private sendBtn: HTMLButtonElement | null = null
  private contextBtn: HTMLButtonElement | null = null
  private history: ReadingTurn[] = []
  private port: chrome.runtime.Port | null = null
  private activeAnswer: HTMLElement | null = null
  private busy = false
  private collapsed = false
  private destroyed = false
  private hasContext = false
  private lastContext: ReadingContext | null = null
  private requestId = 0
  private busyRequestId = -1
  private anchor: SelectionAnchor | null = null
  private avoidAnchor = false
  private isMaximized = false
  private normalRect: { x: number; y: number; width: number; height: number } | null = null

  sync() {
    if (!S().assistant.enabled) this.destroy()
  }

  toggle() {
    if (!S().assistant.enabled) return toast('阅读助手已在设置中关闭', 'info')
    if (!this.root) return this.open()
    this.setCollapsed(!this.collapsed)
  }

  openWithSelection(anchor?: SelectionAnchor) {
    if (!S().assistant.enabled) return toast('阅读助手已在设置中关闭', 'info')
    if (anchor) {
      this.anchor = anchor
      this.avoidAnchor = true
    }
    this.open()
    const context = collectReadingContext()
    if (context.selection) this.attachContext(context, true, false)
    else toast('选中不懂的句子后按 Alt+D，会自动带入原文', 'info', 3000)
  }

  open() {
    if (!S().assistant.enabled) return
    if (this.root) {
      this.setCollapsed(false)
      if (this.avoidAnchor) this.position()
      this.input?.focus({ preventScroll: true })
      return
    }
    const scroll = h('div', { class: 'ra-scroll' })
    const welcome = h('div', { class: 'ra-welcome' }, [
      h('div', { class: 'ra-welcome-icon' }, 'Aa'),
      h('div', { class: 'ra-welcome-title' }, '读到不懂的地方？'),
      h('p', {}, '选中英文后打开助手，或直接问我。我会结合文章内容来解释。'),
    ])
    const actions = h('div', { class: 'ra-actions' }, QUICK.map((q) => h('button', { class: 'ra-chip', onclick: () => { this.ask(q.question) } }, q.label)))
    const input = h('textarea', { class: 'ra-input', rows: '2', placeholder: '问这段文字，或问这篇文章…', 'aria-label': '阅读助手输入框' }) as HTMLTextAreaElement
    const send = h('button', { class: 'ra-send', title: '发送（Enter）' }, '↑') as HTMLButtonElement
    const contextBtn = h('button', { class: 'ra-context', title: '引用当前选中的文字或所在段落' }, '⊕ 引用选文') as HTMLButtonElement
    const composer = h('div', { class: 'ra-composer' }, [input, h('div', { class: 'ra-composer-foot' }, [contextBtn, send])])
    const clear = h('button', { class: 'ra-icon', title: '开始新对话' }, '↺')
    const collapse = h('button', { class: 'ra-icon', title: '收起，保留对话' }, '−')
    const close = h('button', { class: 'ra-icon', title: '关闭并清除对话' }, '×')
    const header = h('div', { class: 'ra-header' }, [
      h('div', { class: 'ra-title' }, [h('span', { class: 'ra-spark' }, '✦'), h('span', {}, '阅读助手')]),
      h('div', { class: 'ra-tools' }, [clear, collapse, close]),
    ])
    const maximize = h('button', { class: 'ra-icon ra-maximize', title: '放大窗口' }, '□')
    const panel = h('section', { class: 'ra-panel', role: 'dialog', 'aria-label': '阅读助手' }, [header, h('div', { class: 'ra-body' }, [scroll, welcome, actions]), composer, h('div', { class: 'ra-footnote' }, 'AI 回答仅供参考'), h('div', { class: 'ra-resize', title: '拖动调整窗口大小' })])
    const fab = h('button', { class: 'ra-fab', title: '展开阅读助手（Alt+D）' }, [h('span', { class: 'ra-spark' }, '✦'), h('span', {}, '继续对话')])

    this.root = h('div', { class: 'ra-root' }, [panel, fab])
    this.panel = panel
    this.fab = fab
    this.log = scroll
    this.input = input
    this.sendBtn = send
    this.contextBtn = contextBtn
    ui().appendChild(this.root)
    this.position()
    this.makePanelDraggable(header)
    this.makeResizable(panel.querySelector('.ra-resize') as HTMLElement)
    maximize.addEventListener('click', () => this.maximize())
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.root) this.setCollapsed(true)
    })
    // 避免输入时触发网站快捷键、连按空格翻译等逻辑
    for (const type of ['keydown', 'keyup', 'keypress']) composer.addEventListener(type, (e) => e.stopPropagation())
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault()
        this.ask(input.value)
      }
    })
    send.addEventListener('click', () => this.busy ? this.stop() : this.ask(input.value))
    clear.addEventListener('click', () => this.clear())
    collapse.addEventListener('click', () => this.setCollapsed(true))
    close.addEventListener('click', () => this.destroy())
    fab.addEventListener('click', () => this.setCollapsed(false))
    contextBtn.addEventListener('click', () => this.attachContext(collectReadingContext(), true, true))
    this.restore()
  }

  private position() {
    if (!this.panel) return
    const panel = this.panel
    panel.style.maxHeight = `${Math.max(280, innerHeight - 16)}px`
    panel.style.maxWidth = `${Math.max(280, innerWidth - 16)}px`
    if (!this.anchor || !this.avoidAnchor) {
      panel.style.left = `${Math.max(8, innerWidth - 402)}px`
      panel.style.top = `${Math.max(8, innerHeight - 542)}px`
      panel.style.width = '380px'
      panel.style.height = '520px'
      return
    }
    const w = Math.min(380, innerWidth - 16)
    const h = Math.min(480, innerHeight - 16)
    const gap = 14
    const a = this.anchor
    // 优先放选区右侧，其次左侧、下方、上方；四侧空间都不足才缩小窗口。
    const candidates = [
      { x: a.x + a.width + gap, y: a.y, space: innerWidth - a.x - a.width - gap - 8 },
      { x: a.x - w - gap, y: a.y, space: a.x - gap - 8 },
      { x: a.x + a.width / 2 - w / 2, y: a.y + a.height + gap, space: innerHeight - a.y - a.height - gap - 8 },
      { x: a.x + a.width / 2 - w / 2, y: a.y - h - gap, space: a.y - gap - 8 },
    ]
    const choice = candidates.find((c, i) => i < 2 ? c.space >= w : c.space >= h)
    const side = choice ? candidates.indexOf(choice) : 0
    const finalW = side < 2 ? Math.min(w, Math.max(280, candidates[side].space)) : w
    const finalH = side >= 2 ? Math.min(h, Math.max(260, candidates[side].space)) : h
    let x = side === 1 ? a.x - finalW - gap : side === 0 ? a.x + a.width + gap : a.x + a.width / 2 - finalW / 2
    let y = side === 3 ? a.y - finalH - gap : side === 2 ? a.y + a.height + gap : a.y
    x = Math.max(8, Math.min(innerWidth - finalW - 8, x))
    y = Math.max(8, Math.min(innerHeight - finalH - 8, y))
    panel.style.left = `${x}px`
    panel.style.top = `${y}px`
    panel.style.width = `${finalW}px`
    panel.style.height = `${finalH}px`
  }

  private makePanelDraggable(handle: HTMLElement) {
    handle.addEventListener('pointerdown', (e) => {
      if ((e.target as Element).closest('button')) return
      const rect = this.panel!.getBoundingClientRect()
      const dx = e.clientX - rect.left
      const dy = e.clientY - rect.top
      handle.setPointerCapture(e.pointerId)
      const move = (ev: PointerEvent) => {
        this.avoidAnchor = false
        this.panel!.style.left = `${Math.max(0, Math.min(innerWidth - 80, ev.clientX - dx))}px`
        this.panel!.style.top = `${Math.max(0, Math.min(innerHeight - 44, ev.clientY - dy))}px`
      }
      const up = () => {
        handle.removeEventListener('pointermove', move)
        handle.removeEventListener('pointerup', up)
      }
      handle.addEventListener('pointermove', move)
      handle.addEventListener('pointerup', up)
    })
  }

  private makeResizable(handle: HTMLElement) {
    handle.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      const rect = this.panel!.getBoundingClientRect()
      const x = e.clientX
      const y = e.clientY
      handle.setPointerCapture(e.pointerId)
      const move = (ev: PointerEvent) => {
        const w = Math.max(280, Math.min(innerWidth - rect.left - 8, rect.width + ev.clientX - x))
        const h = Math.max(260, Math.min(innerHeight - rect.top - 8, rect.height + ev.clientY - y))
        this.panel!.style.width = `${w}px`
        this.panel!.style.height = `${h}px`
      }
      const up = () => {
        handle.removeEventListener('pointermove', move)
        handle.removeEventListener('pointerup', up)
      }
      handle.addEventListener('pointermove', move)
      handle.addEventListener('pointerup', up)
    })
  }

  private maximize() {
    if (!this.panel) return
    this.avoidAnchor = false
    if (!this.isMaximized) {
      const r = this.panel.getBoundingClientRect()
      this.normalRect = { x: r.x, y: r.y, width: r.width, height: r.height }
      Object.assign(this.panel.style, { left: '16px', top: '16px', width: `${innerWidth - 32}px`, height: `${innerHeight - 32}px` })
    } else if (this.normalRect) {
      const r = this.normalRect
      Object.assign(this.panel.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.width}px`, height: `${r.height}px` })
    }
    this.isMaximized = !this.isMaximized
  }

  private setCollapsed(value: boolean) {
    this.collapsed = value
    if (!this.panel || !this.fab) return
    this.panel.hidden = value
    this.fab.hidden = !value
    this.root!.classList.toggle('collapsed', value)
    if (value) this.stop()
    else this.input?.focus({ preventScroll: true })
  }

  private setBusy(value: boolean) {
    this.busy = value
    if (!this.sendBtn || !this.input) return
    this.sendBtn.textContent = value ? '■' : '↑'
    this.sendBtn.title = value ? '停止生成' : '发送（Enter）'
    this.input.disabled = false
    this.contextBtn!.disabled = value
  }

  private append(role: 'user' | 'assistant', content: string): HTMLElement {
    this.root?.querySelector('.ra-welcome')?.remove()
    this.root?.querySelector('.ra-actions')?.remove()
    const msg = h('div', { class: `ra-message ${role}` }, [
      role === 'assistant' ? h('div', { class: 'ra-avatar' }, '✦') : null,
      h('div', { class: 'ra-bubble' }, role === 'assistant' ? [h('div', { class: 'md' })] : content),
    ])
    this.log!.appendChild(msg)
    this.scrollBottom()
    return msg.querySelector('.md') as HTMLElement || msg
  }

  private ask(question: string) {
    const q = question.trim()
    if (!q || this.busy) return
    this.open()
    if (!this.hasContext) this.attachContext(collectReadingContext())
    if (this.input) this.input.value = ''
    this.append('user', q)
    this.history.push({ role: 'user', content: q })
    this.activeAnswer = this.append('assistant', '')
    this.activeAnswer.replaceChildren(loadingDots())
    this.requestId++
    this.busyRequestId = this.requestId
    this.setBusy(true)
    this.connect()
  }

  private connect() {
    try {
      this.port = chrome.runtime.connect({ name: READING_PORT })
      this.port.onMessage.addListener((m: ReadingPortOut) => {
        if (this.destroyed || this.busyRequestId !== this.requestId) return
        if (m.type === 'delta' && this.activeAnswer) {
          this.activeAnswer.innerHTML = renderMarkdown(m.text)
          this.scrollBottom()
        } else if (m.type === 'done') {
          this.finish(m.text)
          this.disconnect()
        } else if (m.type === 'error') {
          this.fail(m.error)
          this.disconnect()
        }
      })
      this.port.onDisconnect.addListener(() => {
        this.port = null
        if (this.busy && !this.destroyed) this.fail('连接已中断，请重试')
      })
      const msg: ReadingPortIn = {
        type: 'ask',
        question: this.history[this.history.length - 1]?.content || '',
        context: this.lastContext || collectReadingContext(),
        history: this.history.slice(0, -1).slice(-16),
      }
      this.port.postMessage(msg)
    } catch (e) {
      this.fail(e instanceof Error ? e.message : String(e))
    }
  }

  private finish(text: string) {
    if (this.activeAnswer) this.activeAnswer.innerHTML = renderMarkdown(text || '（没有返回内容）')
    this.history.push({ role: 'assistant', content: text })
    this.setBusy(false)
    this.activeAnswer = null
    this.busyRequestId = -1
    this.persist()
  }

  private fail(error: string) {
    if (this.activeAnswer) {
      this.activeAnswer.replaceChildren(h('div', { class: 'ra-error' }, error), h('button', { class: 'ra-retry', onclick: () => this.retry() }, '重试'))
    }
    this.setBusy(false)
    this.activeAnswer = null
    this.busyRequestId = -1
  }

  private retry() {
    if (this.busy) return
    const last = this.history[this.history.length - 1]
    if (last?.role === 'user') {
      const answer = this.log?.lastElementChild
      answer?.remove()
      this.history.pop()
      this.ask(last.content)
    }
  }

  private stop() {
    if (!this.busy) return
    this.port?.postMessage({ type: 'stop' } as ReadingPortIn)
    const text = this.activeAnswer?.textContent || ''
    this.busyRequestId = -1
    if (this.activeAnswer) this.activeAnswer.innerHTML = renderMarkdown(text ? text + '\n\n*已停止*' : '*已停止*')
    this.disconnect()
    this.setBusy(false)
    this.activeAnswer = null
  }

  private disconnect() {
    const p = this.port
    this.port = null
    p?.disconnect()
  }

  private setContextLabel() {
    if (!this.contextBtn) return
    this.contextBtn.textContent = this.hasContext ? '✓ 已引用选文' : '⊕ 引用选文'
  }

  private attachContext(context: ReadingContext, replace = false, fillInput = true) {
    const text = context.selection || context.paragraph
    if (!text) {
      if (replace) toast('请先在文章里选中一段文字', 'info', 2000)
      return
    }
    if (this.hasContext && !replace) return
    this.lastContext = context
    this.hasContext = true
    this.setContextLabel()
    if (replace && fillInput && this.input) {
      const quoted = text.length > 1000 ? `${text.slice(0, 1000)}…` : text
      this.input.value = `请解释这段：\n“${quoted}”\n`
      this.input.focus({ preventScroll: true })
    }
  }

  private insertContext(context: ReadingContext) {
    this.attachContext(context, true, true)
  }

  private clear() {
    this.stop()
    this.history = []
    this.log?.replaceChildren()
    this.activeAnswer = null
    this.hasContext = false
    this.lastContext = null
    this.setContextLabel()
    if (!this.root) return
    const welcome = h('div', { class: 'ra-welcome' }, [
      h('div', { class: 'ra-welcome-icon' }, 'Aa'),
      h('div', { class: 'ra-welcome-title' }, '新的阅读对话'),
      h('p', {}, '选中英文后打开助手，我会结合文章内容来解释。'),
    ])
    const actions = h('div', { class: 'ra-actions' }, QUICK.map((q) => h('button', { class: 'ra-chip', onclick: () => { this.ask(q.question) } }, q.label)))
    this.root.querySelector('.ra-body')!.append(welcome, actions)
    this.persist()
    this.input?.focus({ preventScroll: true })
  }

  private async persist() {
    if (!S().assistant.remember || this.destroyed) return
    try {
      await chrome.storage.session.set({ readingHistory: { url: location.href, history: this.history.slice(-20), context: this.lastContext } })
    } catch { /* 会话存储不可用时不影响对话 */ }
  }

  private async restore() {
    if (!S().assistant.remember) return
    try {
      const r = await chrome.storage.session.get('readingHistory')
      const saved = r.readingHistory as {
        url?: string
        history?: ReadingTurn[]
        context?: ReadingContext | null
      } | undefined
      if (saved?.url === location.href && Array.isArray(saved.history)) {
        this.history = saved.history.filter((m: ReadingTurn) => m.role && typeof m.content === 'string').slice(-20)
        this.hasContext = !!saved.context?.selection || !!saved.context?.paragraph
        this.lastContext = saved.context || null
        this.setContextLabel()
        for (const m of this.history) {
          if (m.role === 'assistant') this.append(m.role, m.content).innerHTML = renderMarkdown(m.content)
          else this.append('user', m.content)
        }
      }
    } catch { /* 忽略 */ }
  }

  private scrollBottom() {
    if (this.log) this.log.scrollTop = this.log.scrollHeight
  }

  destroy() {
    if (this.destroyed) return
    this.destroyed = true
    this.disconnect()
    this.root?.remove()
    this.root = null
    this.hasContext = false
    this.lastContext = null
    void chrome.storage.session.remove('readingHistory').catch(() => {})
  }
}

export function initAssistant(): ReadingAssistant {
  const assistant = new ReadingAssistant()
  // 首次使用不自动弹出，Alt+D、悬浮球或“问 AI”才打开。
  return assistant
}
