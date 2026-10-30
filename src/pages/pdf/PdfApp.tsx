import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { useCallback, useEffect, useRef, useState } from 'react'
import { LANGUAGES } from '../../shared/languages'
import { callBg } from '../../shared/messages'
import { useBundle } from '../common/useBundle'
import { extractParagraphs } from './extract'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

type PDFDoc = Awaited<ReturnType<typeof pdfjsLib.getDocument>['promise']>

const TRANSLATE_CHUNK = 12

export function PdfApp() {
  const { bundle } = useBundle()
  const [doc, setDoc] = useState<PDFDoc | null>(null)
  const [docId, setDocId] = useState(0)
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [scale, setScale] = useState(1.25)
  const [translateOn, setTranslateOn] = useState(true)
  const [showOriginal, setShowOriginal] = useState<boolean | null>(null)
  const [to, setTo] = useState('')
  const [firstSize, setFirstSize] = useState({ w: 600, h: 800 })
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!bundle) return
    setTo((v) => v || bundle.settings.targetLang)
    setShowOriginal((v) => (v === null ? bundle.settings.pdf.showOriginal : v))
  }, [bundle])

  const openData = useCallback(async (data: ArrayBuffer, fileName: string) => {
    setLoading(true)
    setError('')
    try {
      const d = await pdfjsLib.getDocument({ data: new Uint8Array(data), isEvalSupported: false }).promise
      const p1 = await d.getPage(1)
      const vp = p1.getViewport({ scale: 1 })
      setFirstSize({ w: vp.width, h: vp.height })
      setDoc((prev) => {
        void prev?.destroy()
        return d
      })
      setDocId((x) => x + 1)
      setName(fileName)
      document.title = `${fileName} · 双语 PDF`
    } catch (e) {
      setError(`PDF 解析失败：${e instanceof Error ? e.message : e}`)
    } finally {
      setLoading(false)
    }
  }, [])

  const openUrl = useCallback(
    async (url: string) => {
      setLoading(true)
      setError('')
      try {
        const res = await fetch(url, { credentials: 'include' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const buf = await res.arrayBuffer()
        const fileName = decodeURIComponent(url.split(/[?#]/)[0].split('/').pop() || 'document.pdf')
        await openData(buf, fileName)
      } catch (e) {
        setLoading(false)
        const local = url.startsWith('file:')
        setError(
          `无法加载 PDF（${e instanceof Error ? e.message : e}）。` +
            (local
              ? '本地文件需要在 chrome://extensions 的本扩展「详情」中开启「允许访问文件网址」，或点击上方「打开本地 PDF」。'
              : '可以先下载该文件，再点击上方「打开本地 PDF」。'),
        )
      }
    },
    [openData],
  )

  useEffect(() => {
    const file = new URLSearchParams(location.search).get('file')
    if (file) void openUrl(file)
  }, [openUrl])

  const onFile = async (f: File | undefined) => {
    if (!f) return
    await openData(await f.arrayBuffer(), f.name)
  }

  useEffect(() => {
    const over = (e: DragEvent) => {
      e.preventDefault()
      setDragging(true)
    }
    const leave = () => setDragging(false)
    const drop = (e: DragEvent) => {
      e.preventDefault()
      setDragging(false)
      void onFile(e.dataTransfer?.files?.[0])
    }
    addEventListener('dragover', over)
    addEventListener('dragleave', leave)
    addEventListener('drop', drop)
    return () => {
      removeEventListener('dragover', over)
      removeEventListener('dragleave', leave)
      removeEventListener('drop', drop)
    }
  })

  return (
    <div className="pdf-app">
      <header className="pdf-toolbar">
        <div className="logo">译</div>
        <div className="file-name" title={name}>
          {name || '双语 PDF 阅读器'}
        </div>
        <button className="btn small" onClick={() => fileRef.current?.click()}>
          打开本地 PDF
        </button>
        <input ref={fileRef} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => onFile(e.target.files?.[0])} />
        <div className="sep" />
        <label className="ctl">
          翻译成
          <select className="select" value={to} onChange={(e) => setTo(e.target.value)}>
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
        <label className="ctl">
          <input type="checkbox" checked={translateOn} onChange={(e) => setTranslateOn(e.target.checked)} />
          翻译
        </label>
        <label className="ctl">
          <input type="checkbox" checked={!!showOriginal} onChange={(e) => setShowOriginal(e.target.checked)} />
          显示原文
        </label>
        <div className="sep" />
        <button className="btn small" onClick={() => setScale((s) => Math.max(0.5, +(s - 0.15).toFixed(2)))}>
          −
        </button>
        <span className="zoom">{Math.round(scale * 100)}%</span>
        <button className="btn small" onClick={() => setScale((s) => Math.min(3, +(s + 0.15).toFixed(2)))}>
          +
        </button>
        {doc && <span className="muted pages">共 {doc.numPages} 页</span>}
      </header>

      {error && <div className="alert error pdf-alert">{error}</div>}
      {loading && <div className="pdf-empty muted">正在加载 PDF…</div>}
      {!doc && !loading && (
        <div className="pdf-empty" onClick={() => fileRef.current?.click()}>
          <div className="drop-icon">📄</div>
          <div>把 PDF 文件拖到这里，或点击选择文件</div>
          <div className="muted">左侧显示原文页面，右侧逐段显示译文</div>
        </div>
      )}
      {dragging && <div className="drop-mask">松开以打开 PDF</div>}

      {doc && to && (
        <div className="pdf-pages">
          {Array.from({ length: doc.numPages }, (_, i) => (
            <PageRow
              key={`${docId}-${i}`}
              doc={doc}
              num={i + 1}
              scale={scale}
              estimate={firstSize}
              translateOn={translateOn}
              showOriginal={!!showOriginal}
              to={to}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface TrState {
  to: string
  dst: (string | undefined)[]
  loading: boolean
  error?: string
}

function PageRow(props: {
  doc: PDFDoc
  num: number
  scale: number
  estimate: { w: number; h: number }
  translateOn: boolean
  showOriginal: boolean
  to: string
}) {
  const { doc, num, scale, estimate, translateOn, showOriginal, to } = props
  const rowRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [visible, setVisible] = useState(false)
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  const [srcs, setSrcs] = useState<string[] | null>(null)
  const [tr, setTr] = useState<TrState | null>(null)
  const [attempt, setAttempt] = useState(0)
  const trRef = useRef<TrState | null>(null)
  trRef.current = tr

  useEffect(() => {
    const el = rowRef.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true)
          io.disconnect()
        }
      },
      { rootMargin: '800px 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  // 渲染页面
  useEffect(() => {
    if (!visible) return
    let cancelled = false
    let task: { cancel(): void; promise: Promise<unknown> } | null = null
    void (async () => {
      const page = await doc.getPage(num)
      if (cancelled) return
      const vp = page.getViewport({ scale })
      setSize({ w: vp.width, h: vp.height })
      const canvas = canvasRef.current
      if (!canvas) return
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.floor(vp.width * dpr)
      canvas.height = Math.floor(vp.height * dpr)
      canvas.style.width = `${vp.width}px`
      canvas.style.height = `${vp.height}px`
      const ctx = canvas.getContext('2d')!
      task = page.render({ canvasContext: ctx, viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined })
      await task.promise.catch(() => {})
      if (!cancelled && !srcs) {
        const tc = await page.getTextContent()
        if (!cancelled) setSrcs(extractParagraphs(tc.items as any[]))
      }
    })()
    return () => {
      cancelled = true
      task?.cancel()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, scale, doc, num])

  // 翻译段落
  useEffect(() => {
    if (!visible || !translateOn || !srcs?.length) return
    const cur = trRef.current
    if (cur && cur.to === to && (cur.loading || !cur.error)) return
    let cancelled = false
    const state: TrState = { to, dst: new Array(srcs.length), loading: true }
    setTr(state)
    const chunks: number[] = []
    for (let i = 0; i < srcs.length; i += TRANSLATE_CHUNK) chunks.push(i)
    void Promise.allSettled(
      chunks.map(async (start) => {
        const part = srcs.slice(start, start + TRANSLATE_CHUNK)
        const out = await callBg<string[]>({ type: 'translate', texts: part, scene: 'pdf', to })
        if (cancelled) return
        setTr((prev) => {
          if (!prev || prev.to !== to) return prev
          const dst = prev.dst.slice()
          out.forEach((v, j) => (dst[start + j] = v))
          return { ...prev, dst }
        })
      }),
    ).then((results) => {
      if (cancelled) return
      const failed = results.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined
      setTr((prev) =>
        prev && prev.to === to
          ? { ...prev, loading: false, error: failed ? String(failed.reason?.message || failed.reason) : undefined }
          : prev,
      )
    })
    return () => {
      cancelled = true
      // 被中断的翻译不保留“加载中”状态，下次重新发起（命中缓存的段落会很快返回）
      setTr((prev) => (prev && prev.loading && prev.to === to ? null : prev))
    }
  }, [visible, translateOn, srcs, to, attempt])

  const w = size?.w ?? estimate.w * scale
  const h = size?.h ?? estimate.h * scale

  return (
    <div className="page-row" ref={rowRef}>
      <div className="page-canvas" style={{ width: w, height: h }}>
        <canvas ref={canvasRef} />
        <div className="page-num">{num}</div>
      </div>
      <div className="page-trans">
        {!srcs && <div className="muted">{visible ? '正在解析文字…' : ''}</div>}
        {srcs && srcs.length === 0 && <div className="muted">本页没有可提取的文字（可能是扫描件，可截图后使用图片翻译）</div>}
        {srcs?.map((src, i) => {
          const dst = tr?.to === to ? tr.dst[i] : undefined
          return (
            <div key={i} className="para">
              {(showOriginal || !translateOn) && <div className="para-src">{src}</div>}
              {translateOn &&
                (dst ? <div className="para-dst">{dst}</div> : tr?.loading ? <div className="para-wait">翻译中…</div> : null)}
            </div>
          )
        })}
        {tr?.error && (
          <div className="alert error">
            部分段落翻译失败：{tr.error}{' '}
            <button className="btn small" onClick={() => setAttempt((x) => x + 1)}>
              重试
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
