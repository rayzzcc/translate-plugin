import { S } from './settings'
import { h, ui } from './ui/root'

export function isPdfDocument() {
  return document.contentType === 'application/pdf'
}

export function openInPdfViewer() {
  location.href = chrome.runtime.getURL('pdf.html') + '?file=' + encodeURIComponent(location.href)
}

/** 在浏览器自带的 PDF 页面上：自动跳转或显示“用双语阅读器打开”提示条 */
export function initPdfPage() {
  if (window.top !== window) return
  if (S().pdf.autoOpen) {
    openInPdfViewer()
    return
  }
  const open = h('button', { class: 'primary' }, '用双语阅读器打开')
  const close = h('button', { class: 'icon-btn', title: '关闭' }, '✕')
  const bar = h('div', { class: 'pdf-bar' }, [h('span', {}, '📄 检测到 PDF 文件'), open, close])
  open.addEventListener('click', openInPdfViewer)
  close.addEventListener('click', () => bar.remove())
  ui().appendChild(bar)
}
