import { IMAGE_PORT, type BgRequest, type TabMessage } from '../shared/messages'
import type { DisplayMode, PageState } from '../shared/types'
import { errMsg } from '../shared/utils'
import { cacheClear, cacheCount } from './cache'
import { getBundle, getEffective, loadConfig, setUserSettings, updateUserSettings } from './config'
import { handleImagePort, translateImage } from './image'
import { testProvider, translateTexts } from './translator'

const pdfViewerUrl = (file?: string) =>
  chrome.runtime.getURL('pdf.html') + (file ? `?file=${encodeURIComponent(file)}` : '')

async function sendTab(tabId: number, msg: TabMessage, frameId?: number): Promise<any> {
  try {
    return await chrome.tabs.sendMessage(tabId, msg, frameId === undefined ? {} : { frameId })
  } catch {
    return undefined
  }
}

async function getTopState(tabId: number): Promise<PageState | undefined> {
  return sendTab(tabId, { type: 'get-state' }, 0)
}

async function toggleTranslate(tabId: number) {
  const state = await getTopState(tabId)
  if (!state) return
  await sendTab(tabId, { type: 'set-translate', on: !state.active })
}

async function toggleMode(tabId: number) {
  const state = await getTopState(tabId)
  if (!state) return
  const mode: DisplayMode = state.mode === 'bilingual' ? 'translation' : 'bilingual'
  await updateUserSettings({ displayMode: mode })
  await sendTab(tabId, { type: 'set-mode', mode })
  if (!state.active) await sendTab(tabId, { type: 'set-translate', on: true })
}

// ---------------- 右键菜单 ----------------
function setupMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'tp-page', title: '翻译此页面 / 显示原文', contexts: ['page'] })
    chrome.contextMenus.create({ id: 'tp-selection', title: '翻译“%s”', contexts: ['selection'] })
    chrome.contextMenus.create({ id: 'tp-image', title: '讲解 / 翻译此图片', contexts: ['image'] })
    chrome.contextMenus.create({
      id: 'tp-pdf-link',
      title: '用双语阅读器打开 PDF',
      contexts: ['link'],
      targetUrlPatterns: ['*://*/*.pdf', '*://*/*.pdf?*', '*://*/*.PDF', 'file:///*.pdf'],
    })
    chrome.contextMenus.create({ id: 'tp-pdf-viewer', title: '打开双语 PDF 阅读器', contexts: ['action'] })
  })
}

chrome.runtime.onInstalled.addListener((details) => {
  setupMenus()
  if (details.reason === 'install') chrome.runtime.openOptionsPage()
})
chrome.runtime.onStartup.addListener(setupMenus)

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const tabId = tab?.id
  switch (info.menuItemId) {
    case 'tp-page':
      if (tabId !== undefined) void toggleTranslate(tabId)
      break
    case 'tp-selection':
      if (tabId !== undefined)
        void sendTab(tabId, { type: 'translate-selection', text: info.selectionText }, info.frameId)
      break
    case 'tp-image':
      if (tabId !== undefined && info.srcUrl)
        void sendTab(tabId, { type: 'translate-image', srcUrl: info.srcUrl }, info.frameId)
      break
    case 'tp-pdf-link':
      if (info.linkUrl) void chrome.tabs.create({ url: pdfViewerUrl(info.linkUrl) })
      break
    case 'tp-pdf-viewer':
      void chrome.tabs.create({ url: pdfViewerUrl() })
      break
  }
})

// ---------------- 快捷键 ----------------
chrome.commands.onCommand.addListener(async (command, tab) => {
  const tabId = tab?.id ?? (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id
  if (tabId === undefined) return
  if (command === 'toggle-translate') await toggleTranslate(tabId)
  else if (command === 'toggle-mode') await toggleMode(tabId)
  else if (command === 'translate-selection') await sendTab(tabId, { type: 'translate-selection' })
})

// ---------------- 消息路由 ----------------
async function handle(msg: BgRequest, sender: chrome.runtime.MessageSender): Promise<unknown> {
  switch (msg.type) {
    case 'getSettings':
      return getBundle()
    case 'updateSettings':
      await updateUserSettings(msg.patch)
      return true
    case 'replaceUserSettings':
      await setUserSettings(msg.value || {})
      return true
    case 'resetSettings':
      await setUserSettings({})
      return true
    case 'reloadConfig':
      await loadConfig(true)
      return getBundle()
    case 'translate':
      return translateTexts(msg)
    case 'translateImage':
      return translateImage(msg)
    case 'testProvider':
      return testProvider(msg.providerId, msg.text, msg.to)
    case 'clearCache':
      await cacheClear()
      return true
    case 'cacheStats':
      return { count: await cacheCount() }
    case 'openOptions':
      await chrome.runtime.openOptionsPage()
      return true
    case 'openPdfViewer': {
      const url = pdfViewerUrl(msg.url)
      if (msg.tabId !== undefined) await chrome.tabs.update(msg.tabId, { url })
      else await chrome.tabs.create({ url })
      return true
    }
    case 'tabBroadcast':
      if (sender.tab?.id !== undefined) await sendTab(sender.tab.id, msg.msg)
      return true
    default:
      throw new Error(`未知消息：${(msg as { type: string }).type}`)
  }
}

chrome.runtime.onMessage.addListener((msg: BgRequest, sender, sendResponse) => {
  handle(msg, sender).then(
    (data) => sendResponse({ ok: true, data }),
    (e) => sendResponse({ ok: false, error: errMsg(e) }),
  )
  return true
})

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === IMAGE_PORT) handleImagePort(port)
})

// 预热配置，尽早暴露配置错误
void getEffective().catch(() => {})
