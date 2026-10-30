import { h, ui } from './root'

type ToastType = 'info' | 'error' | 'success' | 'loading'

export interface ToastHandle {
  update(text: string, type?: ToastType, duration?: number): void
  close(): void
}

let box: HTMLElement | null = null

function container() {
  const root = ui()
  if (!box || !box.isConnected) {
    box = h('div', { class: 'toasts' })
    root.appendChild(box)
  }
  return box
}

/** 显示提示；duration 为 0 时不自动关闭 */
export function toast(text: string, type: ToastType = 'info', duration = 3000): ToastHandle {
  const el = h('div', { class: 'toast' })
  let timer = 0
  const handle: ToastHandle = {
    update(t, ty = 'info', d = 3000) {
      el.className = `toast ${ty}`
      el.replaceChildren(...(ty === 'loading' ? [h('span', { class: 't-spin' })] : []), h('span', {}, t))
      clearTimeout(timer)
      if (d > 0) timer = window.setTimeout(() => handle.close(), d)
    },
    close() {
      clearTimeout(timer)
      el.remove()
    },
  }
  container().appendChild(el)
  handle.update(text, type, duration)
  return handle
}

let lastErrorAt = 0
/** 翻译错误提示（节流，避免刷屏） */
export function toastError(msg: string) {
  if (Date.now() - lastErrorAt < 5000) return
  lastErrorAt = Date.now()
  toast(msg, 'error', 6000)
}
