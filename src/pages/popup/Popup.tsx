import { useEffect, useState } from 'react'
import { LANGUAGES } from '../../shared/languages'
import { callBg, type TabMessage } from '../../shared/messages'
import type { DisplayMode, PageState } from '../../shared/types'
import { hostMatches } from '../../shared/utils'
import { useBundle } from '../common/useBundle'

function hostOf(url?: string) {
  try {
    const u = new URL(url || '')
    return /^https?:|^file:/.test(u.protocol) ? u.hostname : ''
  } catch {
    return ''
  }
}

export function Popup() {
  const { bundle, error, update } = useBundle()
  const [tab, setTab] = useState<chrome.tabs.Tab | null>(null)
  const [state, setState] = useState<PageState | null>(null)
  const [unreachable, setUnreachable] = useState(false)

  const refresh = async (t: chrome.tabs.Tab) => {
    if (t.id === undefined) return
    try {
      const s: PageState | undefined = await chrome.tabs.sendMessage(t.id, { type: 'get-state' } as TabMessage, { frameId: 0 })
      setState(s ?? null)
      setUnreachable(!s)
    } catch {
      setUnreachable(true)
    }
  }

  useEffect(() => {
    void chrome.tabs.query({ active: true, currentWindow: true }).then(([t]) => {
      if (!t) return
      setTab(t)
      void refresh(t)
    })
  }, [])

  if (error) return <div className="popup"><div className="alert error">{error}</div></div>
  if (!bundle) return <div className="popup muted">加载中…</div>

  const { settings, providers, configError } = bundle
  const host = hostOf(tab?.url)
  const isPdfUrl = state?.isPdf || /\.pdf($|[?#])/i.test(tab?.url || '')
  const send = (msg: TabMessage) => tab?.id !== undefined && chrome.tabs.sendMessage(tab.id, msg).catch(() => {})

  const toggleTranslate = async () => {
    if (!state) return
    await send({ type: 'set-translate', on: !state.active })
    setTimeout(() => tab && refresh(tab), 150)
  }

  const setMode = async (mode: DisplayMode) => {
    await update({ displayMode: mode })
    await send({ type: 'set-mode', mode })
    if (state && !state.active) await send({ type: 'set-translate', on: true })
    setTimeout(() => tab && refresh(tab), 150)
  }

  const inList = (list: string[]) => !!host && hostMatches(host, list)
  const toggleSite = (key: 'alwaysSites' | 'neverSites') => {
    const other = key === 'alwaysSites' ? 'neverSites' : 'alwaysSites'
    const list = settings.rules[key]
    const next = inList(list) ? list.filter((p) => !hostMatches(host, [p])) : [...list, host]
    const otherList = settings.rules[other].filter((p) => !hostMatches(host, [p]))
    void update({ rules: { [key]: next, [other]: otherList } })
  }
  const ballHidden = inList(settings.floatBall.disabledSites)
  const toggleBall = () => {
    const list = settings.floatBall.disabledSites
    void update({
      floatBall: { disabledSites: ballHidden ? list.filter((p) => !hostMatches(host, [p])) : [...list, host] },
    })
  }

  const openPdf = () => {
    void callBg({ type: 'openPdfViewer', url: isPdfUrl ? tab?.url : undefined, tabId: isPdfUrl ? tab?.id : undefined })
    window.close()
  }

  const provider = providers.find((p) => p.id === settings.providerId)

  return (
    <div className="popup">
      <header className="head">
        <div className="logo">译</div>
        <div className="title">双语翻译助手</div>
        <button className="icon" title="设置" onClick={() => chrome.runtime.openOptionsPage()}>
          ⚙
        </button>
      </header>

      {configError && <div className="alert error">{configError}</div>}
      {provider && !provider.configured && (
        <div className="alert">
          「{provider.name}」尚未填写 API Key，请编辑 <code>config.jsonc</code>
        </div>
      )}

      <div className="row">
        <label>目标语言</label>
        <select className="select" value={settings.targetLang} onChange={(e) => update({ targetLang: e.target.value })}>
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>
      </div>
      <div className="row">
        <label>翻译服务</label>
        <select className="select" value={settings.providerId} onChange={(e) => update({ providerId: e.target.value })}>
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.configured ? '' : '（未配置）'}
            </option>
          ))}
        </select>
      </div>

      {isPdfUrl ? (
        <button className="btn primary big" onClick={openPdf}>
          用双语阅读器打开此 PDF
        </button>
      ) : (
        <button className="btn primary big" disabled={unreachable || !state} onClick={toggleTranslate}>
          {unreachable ? '此页面无法翻译' : state?.active ? '显示原文' : '翻译此页面'}
          {!unreachable && <span className="kbd">Alt+A</span>}
        </button>
      )}
      {unreachable && !isPdfUrl && (
        <div className="hint muted">浏览器内置页面不支持；普通网页请刷新后重试。</div>
      )}

      <div className="seg">
        <button className={settings.displayMode === 'bilingual' ? 'on' : ''} onClick={() => setMode('bilingual')}>
          双语对照
        </button>
        <button className={settings.displayMode === 'translation' ? 'on' : ''} onClick={() => setMode('translation')}>
          仅译文
        </button>
      </div>

      {host && (
        <div className="checks">
          <label>
            <input type="checkbox" checked={inList(settings.rules.alwaysSites)} onChange={() => toggleSite('alwaysSites')} />
            总是翻译 <b>{host}</b>
          </label>
          <label>
            <input type="checkbox" checked={inList(settings.rules.neverSites)} onChange={() => toggleSite('neverSites')} />
            永不自动翻译此网站
          </label>
          <label>
            <input type="checkbox" checked={!ballHidden} onChange={toggleBall} />
            在此网站显示悬浮球
          </label>
        </div>
      )}

      <div className="links">
        <button className="link" onClick={openPdf}>
          📄 PDF 阅读器
        </button>
        <button className="link" onClick={() => chrome.runtime.openOptionsPage()}>
          ⚙ 更多设置
        </button>
      </div>

      <footer className="foot muted">
        悬停：轻按 {settings.hover.key === 'Control' ? 'Ctrl' : settings.hover.key} · 划词：Alt+S · 输入框：连按 {settings.input.triggerCount} 次空格
      </footer>
    </div>
  )
}
