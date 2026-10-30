import { callBg, type TabMessage } from '../shared/messages'
import { hostMatches } from '../shared/utils'
import type { PageTranslator } from './page-translator'
import { S, updateSettings } from './settings'
import { h, ui } from './ui/root'
import { toast } from './ui/toast'

/** 通过后台转发给当前标签页的所有 frame，让 iframe 中的内容同步翻译 */
function broadcast(msg: TabMessage) {
  callBg({ type: 'tabBroadcast', msg }).catch((e) => toast(String(e.message || e), 'error'))
}

/** 页面右侧（或左侧）的悬浮球：点击翻译/还原，悬停显示快捷菜单，可上下拖动 */
export class FloatBall {
  private wrap: HTMLElement | null = null
  private ball: HTMLElement | null = null
  private modeBtn: HTMLButtonElement | null = null

  constructor(private pt: PageTranslator) {
    pt.onChange(() => this.update())
  }

  sync() {
    const s = S().floatBall
    const show = s.enabled && !hostMatches(location.hostname, s.disabledSites)
    if (show && !this.wrap) this.mount()
    else if (!show && this.wrap) this.unmount()
    if (this.wrap) {
      this.wrap.className = `ball-wrap ${s.side}`
      this.wrap.style.top = `${Math.min(92, Math.max(8, s.top))}%`
    }
    this.update()
  }

  private mount() {
    const ball = h('div', { class: 'ball', title: '翻译此页面 / 显示原文（Alt+A）' }, [h('span', {}, '译'), h('span', { class: 'spin' })])
    this.modeBtn = h('button', { title: '切换 双语对照 / 仅译文（Alt+W）' }, '双')
    this.modeBtn.addEventListener('click', () => {
      const mode = this.pt.mode === 'bilingual' ? 'translation' : 'bilingual'
      void updateSettings({ displayMode: mode })
      broadcast({ type: 'set-mode', mode })
      if (!this.pt.active) broadcast({ type: 'set-translate', on: true })
    })
    const hideBtn = h('button', { title: '在此网站隐藏悬浮球' }, '✕')
    hideBtn.addEventListener('click', () => {
      const list = [...S().floatBall.disabledSites, location.hostname]
      void updateSettings({ floatBall: { disabledSites: list } })
      toast('已在此网站隐藏悬浮球，可在设置中恢复', 'info', 4000)
    })
    const optBtn = h('button', { title: '打开设置' }, '⚙')
    optBtn.addEventListener('click', () => void callBg({ type: 'openOptions' }).catch(() => {}))
    const menu = h('div', { class: 'menu' }, [this.modeBtn, optBtn, hideBtn])

    this.wrap = h('div', { class: 'ball-wrap right' }, [ball, menu])
    this.ball = ball
    ui().appendChild(this.wrap)
    this.bindDrag(ball)
  }

  private bindDrag(ball: HTMLElement) {
    ball.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return
      const startY = e.clientY
      let moved = false
      ball.setPointerCapture(e.pointerId)
      const move = (ev: PointerEvent) => {
        if (Math.abs(ev.clientY - startY) > 4) moved = true
        if (moved && this.wrap) {
          this.wrap.style.top = `${Math.min(92, Math.max(8, (ev.clientY / innerHeight) * 100))}%`
        }
      }
      const up = (ev: PointerEvent) => {
        ball.removeEventListener('pointermove', move)
        ball.removeEventListener('pointerup', up)
        if (moved) {
          void updateSettings({ floatBall: { top: Math.round((ev.clientY / innerHeight) * 100) } })
        } else {
          broadcast({ type: 'set-translate', on: !this.pt.active })
        }
      }
      ball.addEventListener('pointermove', move)
      ball.addEventListener('pointerup', up)
    })
  }

  private unmount() {
    this.wrap?.remove()
    this.wrap = this.ball = this.modeBtn = null
  }

  private update() {
    if (!this.ball) return
    this.ball.classList.toggle('active', this.pt.active)
    this.ball.classList.toggle('loading', this.pt.pending > 0)
    if (this.modeBtn) this.modeBtn.textContent = this.pt.mode === 'bilingual' ? '双' : '译'
  }
}
