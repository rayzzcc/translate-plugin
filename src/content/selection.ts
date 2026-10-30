import { LANGUAGES, langBase } from '../shared/languages'
import { callBg, friendlyError } from '../shared/messages'
import { currentProvider, S } from './settings'
import { fromUi, h, loadingDots, makeDraggable, ui } from './ui/root'
import { toast } from './ui/toast'

let icon: HTMLElement | null = null
let card: HTMLElement | null = null
let reqId = 0

function closeIcon() {
  icon?.remove()
  icon = null
}

export function closeCard() {
  card?.remove()
  card = null
}

function selectionInfo(): { text: string; rect: DOMRect } | null {
  const sel = getSelection()
  let text = sel?.toString().trim() ?? ''
  let rect: DOMRect | null = null
  if (text && sel && sel.rangeCount) {
    rect = sel.getRangeAt(0).getBoundingClientRect()
  }
  // 输入框中的选中文字
  const active = document.activeElement
  if (!text && (active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement)) {
    const { selectionStart: s, selectionEnd: e } = active
    if (s !== null && e !== null && e > s) {
      text = active.value.slice(s, e).trim()
      rect = active.getBoundingClientRect()
    }
  }
  if (!text || !rect || (!rect.width && !rect.height)) return text ? { text, rect: new DOMRect(innerWidth / 2 - 190, 120, 0, 0) } : null
  return { text, rect }
}

function place(el: HTMLElement, rect: DOMRect, w: number, hgt: number) {
  let left = Math.min(Math.max(8, rect.left), innerWidth - w - 8)
  let top = rect.bottom + 8
  if (top + hgt > innerHeight - 8) top = Math.max(8, rect.top - hgt - 8)
  el.style.left = `${left}px`
  el.style.top = `${top}px`
}

/** 显示划词翻译卡片 */
export function showSelectionCard(text: string, rect?: DOMRect) {
  closeIcon()
  closeCard()
  const anchor = rect ?? new DOMRect(innerWidth / 2 - 190, 120, 0, 0)

  // 选中的已是目标语言时，默认翻译成英文（中文用户最常见的反向需求）
  const target = S().targetLang
  const looksTarget = langBase(target) === 'zh' ? /\p{Script=Han}/u.test(text) && !/[a-zA-Z]{4,}/.test(text) : false
  let to = looksTarget ? 'en' : target

  const select = h('select', { title: '目标语言' }) as HTMLSelectElement
  for (const l of LANGUAGES) select.append(h('option', { value: l.code }, l.label))
  select.value = to

  const body = h('div', { class: 'card-body' })
  const copyBtn = h('button', { class: 'btn' }, '复制')
  const retryBtn = h('button', { class: 'btn' }, '重译')
  const closeBtn = h('button', { class: 'icon-btn', title: '关闭' }, '✕')
  const provider = currentProvider()
  const head = h('div', { class: 'card-head' }, [
    h('span', { class: 'title' }, provider ? `${provider.name} · ${provider.model}` : '翻译'),
    select,
    closeBtn,
  ])
  card = h('div', { class: 'card' }, [
    head,
    h('div', { class: 'card-src' }, text.length > 300 ? text.slice(0, 300) + '…' : text),
    body,
    h('div', { class: 'card-foot' }, [retryBtn, copyBtn]),
  ])
  ui().appendChild(card)
  place(card, anchor, 380, 220)
  makeDraggable(card, head)

  let result = ''
  const run = async (noCache = false) => {
    const id = ++reqId
    result = ''
    body.replaceChildren(loadingDots())
    try {
      const [out] = await callBg<string[]>({ type: 'translate', texts: [text], scene: 'selection', to, noCache })
      if (id !== reqId) return
      result = out
      body.textContent = out
    } catch (e) {
      if (id !== reqId) return
      body.replaceChildren(h('div', { class: 'err' }, `翻译失败：${friendlyError(e)}`))
    }
  }

  select.addEventListener('change', () => {
    to = select.value
    void run()
  })
  closeBtn.addEventListener('click', closeCard)
  retryBtn.addEventListener('click', () => void run(true))
  copyBtn.addEventListener('click', async () => {
    if (!result) return
    await navigator.clipboard.writeText(result).catch(() => {})
    toast('已复制译文', 'success', 1500)
  })
  void run()
}

/** 快捷键 / 右键菜单触发 */
export function translateSelection(text?: string) {
  const info = selectionInfo()
  const t = text?.trim() || info?.text
  if (!t) {
    toast('请先选中要翻译的文字', 'info', 2000)
    return
  }
  showSelectionCard(t, info?.rect)
}

export function initSelection() {
  document.addEventListener(
    'mouseup',
    (e) => {
      if (fromUi(e) || e.button !== 0) return
      if (!S().selection.enabled) return
      setTimeout(() => {
        const info = selectionInfo()
        if (!info || info.text.length > 5000) return closeIcon()
        if (!/\p{L}/u.test(info.text)) return closeIcon()
        if (S().selection.trigger === 'auto') {
          showSelectionCard(info.text, info.rect)
          return
        }
        closeIcon()
        icon = h('div', { class: 'sel-icon', title: '翻译选中文字（Alt+S）' }, '译')
        icon.style.left = `${Math.min(e.clientX + 8, innerWidth - 36)}px`
        icon.style.top = `${Math.min(e.clientY + 10, innerHeight - 36)}px`
        icon.addEventListener('mousedown', (ev) => ev.preventDefault())
        icon.addEventListener('click', () => showSelectionCard(info.text, info.rect))
        ui().appendChild(icon)
      }, 10)
    },
    true,
  )

  document.addEventListener(
    'mousedown',
    (e) => {
      if (fromUi(e)) return
      closeIcon()
      closeCard()
    },
    true,
  )
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeIcon()
      closeCard()
    }
  })
  addEventListener('scroll', closeIcon, { passive: true, capture: true })
}
