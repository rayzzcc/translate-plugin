// 运行在 YouTube 页面主世界（MAIN world）：拦截播放器的字幕请求，把字幕原文转发给内容脚本
;(() => {
  const w = window as any
  if (w.__tpYtHooked) return
  w.__tpYtHooked = true

  const isTimedText = (url: string) => url.includes('/api/timedtext')
  const post = (url: string, text: string) => window.postMessage({ __tp: 'yt-timedtext', url, text }, '*')

  const origFetch = window.fetch
  window.fetch = async function (this: unknown, ...args: Parameters<typeof fetch>) {
    const res = await origFetch.apply(this, args)
    try {
      const input = args[0]
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input)
      if (isTimedText(url)) {
        res
          .clone()
          .text()
          .then((t) => post(url, t))
          .catch(() => {})
      }
    } catch {
      /* 忽略 */
    }
    return res
  } as typeof fetch

  const origOpen = XMLHttpRequest.prototype.open
  const origSend = XMLHttpRequest.prototype.send
  XMLHttpRequest.prototype.open = function (this: XMLHttpRequest & { __tpUrl?: string }, ...args: any[]) {
    this.__tpUrl = String(args[1])
    return (origOpen as any).apply(this, args)
  }
  XMLHttpRequest.prototype.send = function (this: XMLHttpRequest & { __tpUrl?: string }, ...args: any[]) {
    const url = this.__tpUrl
    if (url && isTimedText(url)) {
      this.addEventListener('load', () => {
        try {
          if (this.responseType === '' || this.responseType === 'text') post(url, this.responseText)
        } catch {
          /* 忽略 */
        }
      })
    }
    return (origSend as any).apply(this, args)
  }
})()
