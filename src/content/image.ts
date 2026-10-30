import { callBg, friendlyError, IMAGE_PORT, type ImagePortIn, type ImagePortOut } from '../shared/messages'
import type { ImageMode, ImageTextItem } from '../shared/types'
import { collectImageContext } from './image-context'
import { renderMarkdown } from './markdown'
import { S } from './settings'
import { h, loadingDots, makeDraggable, ui } from './ui/root'

const CARD_WIDTH = 420

interface Card {
  img: HTMLImageElement | null
  el: HTMLElement
  close(): void
}

let card: Card | null = null
let btn: HTMLElement | null = null
let btnImg: HTMLImageElement | null = null
let hideTimer = 0

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}

async function payload(src: string): Promise<{ src?: string; dataUrl?: string }> {
  if (src.startsWith('data:')) return { dataUrl: src }
  if (src.startsWith('blob:')) return { dataUrl: await blobToDataUrl(await (await fetch(src)).blob()) }
  return { src }
}

/** 卡片放在图片旁边（优先右侧，其次左侧），不遮挡图片 */
function placeCard(el: HTMLElement, img: HTMLImageElement | null) {
  const r = img?.getBoundingClientRect()
  let left = innerWidth - CARD_WIDTH - 16
  if (r && r.right + 12 + CARD_WIDTH <= innerWidth) left = r.right + 12
  else if (r && r.left - 12 - CARD_WIDTH >= 0) left = r.left - 12 - CARD_WIDTH
  const top = Math.min(Math.max(12, r ? r.top : 80), Math.max(12, innerHeight - 320))
  el.style.left = `${Math.max(8, left)}px`
  el.style.top = `${top}px`
  el.style.maxHeight = `${innerHeight - top - 12}px`
}

/** 输入框在 Shadow DOM 中，按键事件冒泡到页面时会被当成非输入状态，阻止它们以免触发网站快捷键 */
function isolateKeys(el: HTMLElement) {
  for (const type of ['keydown', 'keyup', 'keypress']) el.addEventListener(type, (e) => e.stopPropagation())
}

// ---------------- 讲解（流式 + 追问） ----------------

function createExplainView(img: HTMLImageElement | null, src: string) {
  const log = h('div', { class: 'img-log' })
  const meta = h('div', { class: 'img-meta' })
  const input = h('input', { placeholder: '继续提问，例如：Q4 为什么增长这么快？' }) as HTMLInputElement
  const send = h('button', { class: 'btn' }, '发送') as HTMLButtonElement
  isolateKeys(input)
  const view = h('div', { class: 'img-view' }, [h('div', { class: 'img-scroll' }, [log, meta]), h('div', { class: 'img-ask' }, [input, send])])
  const scroller = view.firstElementChild as HTMLElement

  let port: chrome.runtime.Port | null = null
  let busy = false
  let answer: HTMLElement | null = null

  const setBusy = (v: boolean) => {
    busy = v
    input.disabled = send.disabled = v
    if (!v) input.focus({ preventScroll: true })
  }
  const stickBottom = () => {
    if (scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 80) scroller.scrollTop = scroller.scrollHeight
  }
  const newAnswer = () => {
    answer = h('div', { class: 'md' }, [loadingDots()])
    log.appendChild(answer)
    stickBottom()
  }

  const connect = () => {
    port = chrome.runtime.connect({ name: IMAGE_PORT })
    port.onMessage.addListener((m: ImagePortOut) => {
      if (!answer) return
      if (m.type === 'delta') {
        answer.innerHTML = renderMarkdown(m.text)
        stickBottom()
      } else if (m.type === 'done') {
        answer.innerHTML = renderMarkdown(m.text || '（模型没有返回内容）')
        meta.textContent = `由 ${m.model} 生成，仅供参考`
        setBusy(false)
        stickBottom()
      } else {
        answer.replaceChildren(h('div', { class: 'err' }, `出错了：${m.error}`))
        setBusy(false)
      }
    })
    port.onDisconnect.addListener(() => {
      port = null
      if (busy && answer) {
        answer.replaceChildren(h('div', { class: 'err' }, '连接已中断，请关闭卡片后重试'))
        setBusy(false)
      }
    })
  }

  const start = async () => {
    setBusy(true)
    newAnswer()
    try {
      const data = await payload(src)
      connect()
      const msg: ImagePortIn = { type: 'start', ...data, context: collectImageContext(img) }
      port!.postMessage(msg)
    } catch (e) {
      answer!.replaceChildren(h('div', { class: 'err' }, `出错了：${friendlyError(e)}`))
      setBusy(false)
    }
  }

  const ask = () => {
    const q = input.value.trim()
    if (!q || busy) return
    if (!port) return void start()
    input.value = ''
    log.appendChild(h('div', { class: 'turn-q' }, q))
    setBusy(true)
    newAnswer()
    const msg: ImagePortIn = { type: 'ask', question: q }
    port.postMessage(msg)
  }
  send.addEventListener('click', ask)
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) ask()
  })

  return {
    view,
    start,
    dispose: () => port?.disconnect(),
  }
}

// ---------------- 文字翻译 ----------------

function createTranslateView(src: string) {
  const body = h('div', { class: 'img-scroll' })
  const view = h('div', { class: 'img-view' }, [body])
  let started = false

  const renderItems = (items: ImageTextItem[]) => {
    if (!items.length) return body.replaceChildren(h('div', { class: 'muted' }, '图片中没有识别到文字'))
    body.replaceChildren(
      ...items.map((it) =>
        h('div', { class: 'img-line' }, [it.src ? h('div', { class: 'src' }, it.src) : null, h('div', {}, it.dst || it.src)]),
      ),
    )
  }

  const start = async () => {
    if (started) return
    started = true
    body.replaceChildren(loadingDots(), ' 正在识别并翻译图片中的文字…')
    try {
      renderItems(await callBg<ImageTextItem[]>({ type: 'translateImage', ...(await payload(src)) }))
    } catch (e) {
      started = false
      body.replaceChildren(h('div', { class: 'err' }, `图片翻译失败：${friendlyError(e)}`))
    }
  }
  return { view, start }
}

// ---------------- 卡片 ----------------

export function openImageCard(img: HTMLImageElement | null, src: string, mode: ImageMode = S().image.mode) {
  if (card && img && card.img === img) {
    card.close()
    return
  }
  card?.close()

  const explain = createExplainView(img, src)
  const translate = createTranslateView(src)
  const tabExplain = h('button', {}, '讲解')
  const tabTranslate = h('button', {}, '文字翻译')
  const closeBtn = h('button', { class: 'icon-btn', title: '关闭（Esc）' }, '✕')
  const head = h('div', { class: 'card-head' }, [
    h('span', { class: 'title' }, '🖼 图片解读'),
    h('div', { class: 'img-tabs' }, [tabExplain, tabTranslate]),
    closeBtn,
  ])
  const el = h('div', { class: 'card img-card' }, [head, explain.view, translate.view])
  el.style.width = `${CARD_WIDTH}px`

  let explainStarted = false
  const show = (m: ImageMode) => {
    tabExplain.className = m === 'explain' ? 'on' : ''
    tabTranslate.className = m === 'translate' ? 'on' : ''
    explain.view.style.display = m === 'explain' ? '' : 'none'
    translate.view.style.display = m === 'translate' ? '' : 'none'
    if (m === 'explain' && !explainStarted) {
      explainStarted = true
      void explain.start()
    }
    if (m === 'translate') void translate.start()
  }
  tabExplain.addEventListener('click', () => show('explain'))
  tabTranslate.addEventListener('click', () => show('translate'))

  const onKey = (e: KeyboardEvent) => e.key === 'Escape' && current.close()
  const current: Card = {
    img,
    el,
    close() {
      explain.dispose()
      el.remove()
      document.removeEventListener('keydown', onKey)
      if (card === current) card = null
    },
  }
  closeBtn.addEventListener('click', () => current.close())
  document.addEventListener('keydown', onKey)

  card = current
  ui().appendChild(el)
  placeCard(el, img)
  makeDraggable(el, head)
  show(mode)
}

/** 右键菜单「讲解 / 翻译此图片」 */
export function translateImageBySrc(srcUrl: string) {
  const img = [...document.images].find((i) => i.currentSrc === srcUrl || i.src === srcUrl) ?? null
  openImageCard(img, srcUrl)
}

// ---------------- 悬停按钮 ----------------

function hideBtn() {
  btn?.remove()
  btn = null
  btnImg = null
}

function showBtn(img: HTMLImageElement) {
  clearTimeout(hideTimer)
  btnImg = img
  if (!btn) {
    btn = h('div', { class: 'img-btn', title: '结合网页上下文讲解这张图片' }, '✨ 解读')
    btn.addEventListener('mouseenter', () => clearTimeout(hideTimer))
    btn.addEventListener('mouseleave', scheduleHide)
    btn.addEventListener('click', () => {
      const target = btnImg
      hideBtn()
      if (target) openImageCard(target, target.currentSrc || target.src)
    })
    ui().appendChild(btn)
  }
  const r = img.getBoundingClientRect()
  btn.style.left = `${Math.max(4, Math.min(r.right, innerWidth) - 66)}px`
  btn.style.top = `${Math.max(4, r.top + 8)}px`
}

function scheduleHide() {
  clearTimeout(hideTimer)
  hideTimer = window.setTimeout(hideBtn, 300)
}

export function initImage() {
  document.addEventListener(
    'mouseover',
    (e) => {
      const cfg = S().image
      if (!cfg.enabled || !cfg.hoverButton) return
      const t = e.target
      if (!(t instanceof HTMLImageElement)) return
      const r = t.getBoundingClientRect()
      if (r.width < cfg.minSize || r.height < cfg.minSize * 0.5 || !(t.currentSrc || t.src)) return
      showBtn(t)
    },
    true,
  )
  document.addEventListener(
    'mouseout',
    (e) => {
      if (e.target === btnImg) scheduleHide()
    },
    true,
  )
  addEventListener('scroll', () => btn && hideBtn(), { passive: true, capture: true })
}
