import type { DeepPartial, DisplayMode, ImageContext, Scene, Settings } from './types'

/** 发给 background 的消息 */
export type BgRequest =
  | { type: 'getSettings' }
  | { type: 'updateSettings'; patch: DeepPartial<Settings> }
  | { type: 'replaceUserSettings'; value: DeepPartial<Settings> }
  | { type: 'resetSettings' }
  | { type: 'reloadConfig' }
  | {
      type: 'translate'
      texts: string[]
      scene: Scene
      to?: string
      providerId?: string
      context?: string
      noCache?: boolean
    }
  | { type: 'translateImage'; src?: string; dataUrl?: string; to?: string }
  | { type: 'testProvider'; providerId: string; text?: string; to?: string }
  | { type: 'clearCache' }
  | { type: 'cacheStats' }
  | { type: 'openOptions' }
  | { type: 'openPdfViewer'; url?: string; tabId?: number }
  | { type: 'tabBroadcast'; msg: TabMessage }

/** 发给内容脚本的消息 */
export type TabMessage =
  | { type: 'get-state' }
  | { type: 'set-translate'; on: boolean }
  | { type: 'toggle-translate' }
  | { type: 'set-mode'; mode: DisplayMode }
  | { type: 'translate-selection'; text?: string }
  | { type: 'translate-image'; srcUrl: string }

/** 图片讲解使用长连接（chrome.runtime.connect），以便流式返回和追问 */
export const IMAGE_PORT = 'image-explain'

export type ImagePortIn =
  | { type: 'start'; src?: string; dataUrl?: string; to?: string; context: ImageContext }
  | { type: 'ask'; question: string }

export type ImagePortOut =
  | { type: 'delta'; text: string }
  | { type: 'done'; text: string; model: string }
  | { type: 'error'; error: string }

type BgResponse<T> = { ok: true; data: T } | { ok: false; error: string }

export function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  if (/Extension context invalidated/i.test(msg)) return '扩展已重新加载，请刷新页面后重试'
  return msg
}

/** 调用 background，失败时抛出带友好信息的 Error */
export function callBg<T = unknown>(msg: BgRequest): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(msg, (res: BgResponse<T> | undefined) => {
        const err = chrome.runtime.lastError
        if (err) return reject(new Error(friendlyError(new Error(err.message))))
        if (!res) return reject(new Error('后台无响应'))
        if (res.ok) resolve(res.data)
        else reject(new Error(res.error))
      })
    } catch (e) {
      reject(new Error(friendlyError(e)))
    }
  })
}
