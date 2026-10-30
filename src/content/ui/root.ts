import { UI_CSS } from './styles'

let host: HTMLElement | null = null
let container: HTMLElement | null = null

/** 获取插件 UI 的容器（位于 Shadow DOM 中） */
export function ui(): HTMLElement {
  if (container && host?.isConnected) return container
  host = document.createElement('tp-root')
  host.setAttribute('translate', 'no')
  host.style.cssText = 'all:initial;position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;'
  const shadow = host.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  style.textContent = UI_CSS
  container = document.createElement('div')
  container.className = 'tp-ui'
  shadow.append(style, container)
  document.documentElement.appendChild(host)
  return container
}

/** 事件是否来自插件 UI */
export function fromUi(e: Event): boolean {
  return e.composedPath().some((n) => n instanceof Element && n.localName === 'tp-root')
}

type Child = Node | string | null | undefined | false

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, unknown> = {},
  children: Child[] | string = [],
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue
    if (k === 'class') el.className = String(v)
    else if (k === 'style') el.style.cssText = String(v)
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener)
    else el.setAttribute(k, String(v))
  }
  const list = typeof children === 'string' ? [children] : children
  for (const c of list) if (c !== null && c !== undefined && c !== false) el.append(c)
  return el
}

export function loadingDots() {
  return h('span', { class: 'loading-dots' }, [h('i'), h('i'), h('i')])
}

/** 让元素可以通过 handle 拖动 */
export function makeDraggable(el: HTMLElement, handle: HTMLElement) {
  handle.addEventListener('pointerdown', (e) => {
    if ((e.target as Element).closest('button,select,input')) return
    const rect = el.getBoundingClientRect()
    const dx = e.clientX - rect.left
    const dy = e.clientY - rect.top
    handle.setPointerCapture(e.pointerId)
    const move = (ev: PointerEvent) => {
      el.style.left = `${Math.max(0, Math.min(innerWidth - 60, ev.clientX - dx))}px`
      el.style.top = `${Math.max(0, Math.min(innerHeight - 30, ev.clientY - dy))}px`
    }
    const up = () => {
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', up)
    }
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', up)
  })
}
