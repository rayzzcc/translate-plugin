import { langBase } from '../shared/languages'
import type { TabMessage } from '../shared/messages'
import { buildDynamicCss } from '../shared/style'
import type { PageState } from '../shared/types'
import { hostMatches } from '../shared/utils'
import { setUserExclude } from './dom'
import { FloatBall } from './float-ball'
import { initHover } from './hover'
import { initImage, translateImageBySrc } from './image'
import { initInput } from './input'
import { detectPageLanguage } from './lang'
import { PageTranslator } from './page-translator'
import { initPdfPage, isPdfDocument, openInPdfViewer } from './pdf-detect'
import { initSelection, translateSelection } from './selection'
import { initSettings, onSettingsChange, S } from './settings'
import { initYoutube } from './youtube'

const isTop = window.top === window

function applyDynamicStyle() {
  let el = document.getElementById('tp-dynamic-style') as HTMLStyleElement | null
  if (!el) {
    el = document.createElement('style')
    el.id = 'tp-dynamic-style'
    ;(document.head || document.documentElement).appendChild(el)
  }
  el.textContent = buildDynamicCss(S().style)
}

async function maybeAutoTranslate(pt: PageTranslator) {
  const { rules, targetLang } = S()
  const host = location.hostname
  if (hostMatches(host, rules.neverSites)) return
  if (hostMatches(host, rules.alwaysSites)) return pt.start()
  if (!rules.alwaysLangs.length) return
  const lang = await detectPageLanguage()
  if (!lang || lang === langBase(targetLang)) return
  if (rules.neverLangs.some((l) => langBase(l) === lang)) return
  if (rules.alwaysLangs.some((l) => langBase(l) === lang)) pt.start()
}

async function main() {
  const w = window as any
  if (w.__tpContentLoaded) return
  w.__tpContentLoaded = true

  await initSettings()
  const isPdf = isPdfDocument()
  const pt = new PageTranslator()

  chrome.runtime.onMessage.addListener((msg: TabMessage, _sender, sendResponse) => {
    switch (msg.type) {
      case 'get-state': {
        if (!isTop) return
        const state: PageState = { active: pt.active, mode: pt.mode, isPdf, url: location.href, pending: pt.pending }
        sendResponse(state)
        return
      }
      case 'set-translate':
        if (isPdf) {
          if (msg.on && isTop) openInPdfViewer()
        } else if (msg.on) pt.start()
        else pt.stop()
        return
      case 'toggle-translate':
        if (isPdf) isTop && openInPdfViewer()
        else pt.toggle()
        return
      case 'set-mode':
        pt.setMode(msg.mode)
        return
      case 'translate-selection': {
        // 快捷键会广播到所有 frame，只在有选中文字（或右键指定了文字）的 frame 中响应
        const has = !!getSelection()?.toString().trim() || !!msg.text
        if (has || (isTop && document.hasFocus())) translateSelection(msg.text)
        return
      }
      case 'translate-image':
        translateImageBySrc(msg.srcUrl)
        return
    }
  })

  if (isPdf) {
    initPdfPage()
    return
  }

  applyDynamicStyle()
  const ball = isTop ? new FloatBall(pt) : null
  ball?.sync()
  initSelection()
  initHover(pt)
  initInput()
  initImage()
  if (isTop && /(^|\.)youtube\.com$/.test(location.hostname)) initYoutube()

  onSettingsChange(() => {
    applyDynamicStyle()
    setUserExclude(S().advanced.excludeSelectors)
    pt.refreshStyle()
    ball?.sync()
  })

  void maybeAutoTranslate(pt)
}

void main().catch((e) => console.warn('[双语翻译助手] 初始化失败：', e))
