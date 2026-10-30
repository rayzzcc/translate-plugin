import { findBlock, isExcluded, isInsideOurs } from './dom'
import type { PageTranslator } from './page-translator'
import { S } from './settings'

/**
 * 悬停翻译：
 *  - 单独轻按修饰键（默认 Ctrl）：翻译/还原鼠标所在段落
 *  - 按住修饰键并移动鼠标：依次翻译经过的段落
 * 若期间按下了其他键或鼠标（如 Ctrl+C、Ctrl+点击），则不触发
 */
export function initHover(pt: PageTranslator) {
  let x = -1
  let y = -1
  let keyDown = false
  let otherInput = false
  let translatedWhileHeld = false
  let lastEl: Element | null = null

  const target = (): Element | null => {
    if (x < 0) return null
    const el = document.elementFromPoint(x, y)
    if (!el || el.localName === 'tp-root') return null
    // 鼠标在译文上时，定位到它所属的段落
    const start = isInsideOurs(el) ? el.closest('tp-trans')?.parentElement ?? null : el
    if (!start) return null
    const block = findBlock(start)
    if (!block || block === document.body || isExcluded(block)) return null
    return block
  }

  document.addEventListener(
    'mousemove',
    (e) => {
      x = e.clientX
      y = e.clientY
      if (!keyDown || otherInput || !S().hover.enabled) return
      const el = target()
      if (el && el !== lastEl) {
        lastEl = el
        translatedWhileHeld = true
        pt.translateOne(el)
      }
    },
    { passive: true },
  )

  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key === S().hover.key) {
        if (!e.repeat) {
          keyDown = true
          otherInput = false
          translatedWhileHeld = false
          lastEl = target()
        }
      } else if (keyDown) otherInput = true
    },
    true,
  )

  document.addEventListener(
    'keyup',
    (e) => {
      if (e.key !== S().hover.key) return
      const wasDown = keyDown
      keyDown = false
      if (!wasDown || otherInput || translatedWhileHeld || !S().hover.enabled) return
      const el = target()
      if (el) pt.toggleOne(el)
    },
    true,
  )

  document.addEventListener('mousedown', () => keyDown && (otherInput = true), true)
  document.addEventListener('wheel', () => keyDown && (otherInput = true), { capture: true, passive: true })
  addEventListener('blur', () => (keyDown = false))
}
