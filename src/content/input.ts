import { callBg, friendlyError } from '../shared/messages'
import { langLabel } from '../shared/languages'
import { S } from './settings'
import { toast } from './ui/toast'

type Editable = HTMLInputElement | HTMLTextAreaElement | HTMLElement

const TEXT_INPUT_TYPES = new Set(['', 'text', 'search'])

function editableRoot(t: EventTarget | null): Editable | null {
  if (t instanceof HTMLTextAreaElement) return t.readOnly || t.disabled ? null : t
  if (t instanceof HTMLInputElement) return TEXT_INPUT_TYPES.has(t.type) && !t.readOnly && !t.disabled ? t : null
  if (t instanceof HTMLElement && t.isContentEditable) {
    let el: HTMLElement = t
    while (el.parentElement && el.parentElement.isContentEditable) el = el.parentElement
    return el
  }
  return null
}

const isField = (el: Editable): el is HTMLInputElement | HTMLTextAreaElement =>
  el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement

/** 用 execCommand 替换内容：保留撤销记录，且能被 React/Vue 等框架感知 */
function replaceContent(el: Editable, text: string) {
  el.focus()
  if (isField(el)) {
    el.select()
    if (!document.execCommand('insertText', false, text)) {
      el.value = text
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }
    return
  }
  const sel = getSelection()
  const range = document.createRange()
  range.selectNodeContents(el)
  sel?.removeAllRanges()
  sel?.addRange(range)
  if (!document.execCommand('insertText', false, text)) el.textContent = text
}

let busy = false

async function translateEditable(el: Editable) {
  if (busy) return
  const raw = isField(el) ? el.value : el.innerText
  const text = raw.replace(/[  ]+$/, '').trim()
  if (!text) return
  busy = true
  const to = S().input.targetLang
  const t = toast(`正在翻译为${langLabel(to)}…`, 'loading', 0)
  try {
    const [out] = await callBg<string[]>({ type: 'translate', texts: [text], scene: 'input', to })
    if (out) replaceContent(el, out)
    t.close()
  } catch (e) {
    t.update(`输入框翻译失败：${friendlyError(e)}`, 'error', 5000)
  } finally {
    busy = false
  }
}

/** 在输入框中快速连按空格（默认 3 次）将内容翻译成设置的语言 */
export function initInput() {
  let presses: number[] = []
  document.addEventListener(
    'keydown',
    (e) => {
      const cfg = S().input
      if (!cfg.enabled || e.isComposing) return
      if (e.key !== ' ' || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) {
        presses = []
        return
      }
      const el = editableRoot(e.target)
      if (!el) return
      const now = Date.now()
      if (presses.length && now - presses[presses.length - 1] > 500) presses = []
      presses.push(now)
      if (presses.length >= Math.max(2, cfg.triggerCount)) {
        presses = []
        e.preventDefault()
        e.stopPropagation()
        void translateEditable(el)
      }
    },
    true,
  )
}
