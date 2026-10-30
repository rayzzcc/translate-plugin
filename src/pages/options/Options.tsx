import { useEffect, useState } from 'react'
import { LANGUAGES } from '../../shared/languages'
import { callBg } from '../../shared/messages'
import { buildDynamicCss, THEMES } from '../../shared/style'
import type { DeepPartial, HoverKey, Settings, SettingsBundle } from '../../shared/types'
import { useBundle } from '../common/useBundle'
import { ColorInput, ListEditor, NumberInput, Row, Section, Select, Switch, TextArea } from './controls'

type Update = (patch: DeepPartial<Settings>) => Promise<void>
interface Props {
  bundle: SettingsBundle
  update: Update
  reload: () => Promise<void>
  setBundle: (b: SettingsBundle) => void
}

const LANG_OPTIONS = LANGUAGES.map((l) => ({ value: l.code, label: l.label }))

const NAV = [
  { id: 'basic', label: '基本设置', icon: '🏠' },
  { id: 'services', label: '翻译服务', icon: '🤖' },
  { id: 'style', label: '译文样式', icon: '🎨' },
  { id: 'rules', label: '网站规则', icon: '🌐' },
  { id: 'interact', label: '交互功能', icon: '🖱️' },
  { id: 'media', label: '图片 / 视频 / PDF', icon: '🎬' },
  { id: 'shortcuts', label: '快捷键', icon: '⌨️' },
  { id: 'advanced', label: '高级设置', icon: '🛠️' },
  { id: 'backup', label: '备份与恢复', icon: '💾' },
] as const

type NavId = (typeof NAV)[number]['id']

export function Options() {
  const { bundle, error, update, reload, setBundle } = useBundle()
  const [nav, setNav] = useState<NavId>(() => (NAV.find((n) => `#${n.id}` === location.hash)?.id ?? 'basic') as NavId)

  useEffect(() => {
    history.replaceState(null, '', `#${nav}`)
  }, [nav])

  if (error) return <div className="page"><div className="alert error">{error}</div></div>
  if (!bundle) return <div className="page muted">加载中…</div>

  const props: Props = { bundle, update, reload, setBundle }
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <div className="logo">译</div>
          <div>
            <div className="brand-name">双语翻译助手</div>
            <div className="muted brand-sub">个人版 · 大模型驱动</div>
          </div>
        </div>
        {NAV.map((n) => (
          <button key={n.id} className={`nav${nav === n.id ? ' on' : ''}`} onClick={() => setNav(n.id)}>
            <span className="nav-icon">{n.icon}</span>
            {n.label}
          </button>
        ))}
      </aside>
      <main className="page">
        {bundle.configError && <div className="alert error top-alert">{bundle.configError}</div>}
        {nav === 'basic' && <Basic {...props} />}
        {nav === 'services' && <Services {...props} />}
        {nav === 'style' && <StyleSection {...props} />}
        {nav === 'rules' && <Rules {...props} />}
        {nav === 'interact' && <Interact {...props} />}
        {nav === 'media' && <Media {...props} />}
        {nav === 'shortcuts' && <Shortcuts {...props} />}
        {nav === 'advanced' && <Advanced {...props} />}
        {nav === 'backup' && <Backup {...props} />}
      </main>
    </div>
  )
}

// ---------------- 基本设置 ----------------

function Basic({ bundle, update }: Props) {
  const s = bundle.settings
  return (
    <Section title="基本设置">
      <Row label="目标语言" desc="网页、划词、字幕、PDF 翻译的目标语言">
        <Select value={s.targetLang} options={LANG_OPTIONS} onChange={(v) => update({ targetLang: v })} />
      </Row>
      <Row label="翻译服务" desc="服务列表来自 config.jsonc">
        <Select
          value={s.providerId}
          options={bundle.providers.map((p) => ({ value: p.id, label: `${p.name}（${p.model}）${p.configured ? '' : ' - 未配置'}` }))}
          onChange={(v) => update({ providerId: v })}
        />
      </Row>
      <Row label="显示模式">
        <Select
          value={s.displayMode}
          options={[
            { value: 'bilingual', label: '双语对照' },
            { value: 'translation', label: '仅显示译文' },
          ]}
          onChange={(v) => update({ displayMode: v })}
        />
      </Row>
      <Row label="附带网页标题作为上下文" desc="帮助模型理解专业术语，会略微增加 token">
        <Switch checked={s.advanced.pageContext} onChange={(v) => update({ advanced: { pageContext: v } })} />
      </Row>
    </Section>
  )
}

// ---------------- 翻译服务 ----------------

function Services({ bundle, update, setBundle }: Props) {
  const s = bundle.settings
  const [tests, setTests] = useState<Record<string, { loading?: boolean; ok?: boolean; text: string }>>({})
  const [reloading, setReloading] = useState(false)
  const [playText, setPlayText] = useState('Immersive bilingual translation keeps the original text and shows the translation right below it.')
  const [playOut, setPlayOut] = useState('')
  const [playBusy, setPlayBusy] = useState(false)

  const test = async (id: string) => {
    setTests((t) => ({ ...t, [id]: { loading: true, text: '测试中…' } }))
    try {
      const r = await callBg<{ text: string; ms: number; model: string }>({ type: 'testProvider', providerId: id })
      setTests((t) => ({ ...t, [id]: { ok: true, text: `✓ ${r.ms} ms：${r.text}` } }))
    } catch (e) {
      setTests((t) => ({ ...t, [id]: { ok: false, text: `✗ ${e instanceof Error ? e.message : e}` } }))
    }
  }

  const reloadConfig = async () => {
    setReloading(true)
    try {
      setBundle(await callBg<SettingsBundle>({ type: 'reloadConfig' }))
    } finally {
      setReloading(false)
    }
  }

  const play = async () => {
    setPlayBusy(true)
    setPlayOut('')
    const t0 = Date.now()
    try {
      const [out] = await callBg<string[]>({ type: 'translate', texts: [playText], scene: 'selection', noCache: true })
      setPlayOut(`${out}\n\n—— 耗时 ${Date.now() - t0} ms`)
    } catch (e) {
      setPlayOut(`翻译失败：${e instanceof Error ? e.message : e}`)
    } finally {
      setPlayBusy(false)
    }
  }

  return (
    <>
      <Section
        title="翻译服务"
        desc={
          <>
            服务在项目根目录的 <code>config.jsonc</code> 中配置（API 地址、Key、模型、并发、关闭思考等）。修改后执行{' '}
            <code>npm run build</code>（或保持 <code>npm run dev</code> 运行），再点击右侧按钮重新加载。
          </>
        }
      >
        <div className="toolbar">
          <button className="btn" onClick={reloadConfig} disabled={reloading}>
            {reloading ? '加载中…' : '🔄 重新加载配置文件'}
          </button>
        </div>
        {bundle.providers.length === 0 && <div className="alert">还没有可用的翻译服务，请编辑 config.jsonc。</div>}
        <div className="providers">
          {bundle.providers.map((p) => {
            const t = tests[p.id]
            const isDefault = s.providerId === p.id
            return (
              <div key={p.id} className={`provider${isDefault ? ' default' : ''}`}>
                <div className="provider-head">
                  <div className="provider-name">{p.name}</div>
                  <span className="tag gray">{p.type}</span>
                  {p.vision && <span className="tag">识图</span>}
                  {p.configured ? <span className="tag ok">已配置</span> : <span className="tag warn">未填写 Key</span>}
                  {isDefault && <span className="tag">默认</span>}
                </div>
                <div className="provider-meta muted">
                  <div>模型：{p.model}</div>
                  <div>地址：{p.baseUrl || '（默认）'}</div>
                  <div>Key：{p.keyHint}</div>
                  <div>ID：{p.id}</div>
                </div>
                <div className="provider-actions">
                  <button className="btn small" disabled={isDefault} onClick={() => update({ providerId: p.id })}>
                    设为默认
                  </button>
                  <button className="btn small" disabled={t?.loading} onClick={() => test(p.id)}>
                    测试
                  </button>
                </div>
                {t && <div className={`test-result ${t.loading ? '' : t.ok ? 'ok' : 'fail'}`}>{t.text}</div>}
              </div>
            )
          })}
        </div>
      </Section>

      <Section title="图片解读服务" desc="图片讲解和图片文字翻译使用的模型，需要支持识图（vision）">
        <Row label="图片解读使用">
          <Select
            value={s.image.providerId}
            options={bundle.providers.map((p) => ({ value: p.id, label: `${p.name}${p.vision ? '（识图）' : '（未标记识图）'}` }))}
            onChange={(v) => update({ image: { providerId: v } })}
          />
        </Row>
      </Section>

      <Section title="翻译试验台" desc="使用当前默认服务翻译，不走缓存，可用于比较速度和效果">
        <textarea className="textarea play" rows={4} value={playText} onChange={(e) => setPlayText(e.target.value)} />
        <div className="toolbar">
          <button className="btn primary" disabled={playBusy || !playText.trim()} onClick={play}>
            {playBusy ? '翻译中…' : '翻译'}
          </button>
        </div>
        {playOut && <pre className="play-out">{playOut}</pre>}
      </Section>
    </>
  )
}

// ---------------- 译文样式 ----------------

function StyleSection({ bundle, update }: Props) {
  const st = bundle.settings.style
  return (
    <>
      <style>{buildDynamicCss(st)}</style>
      <Section title="译文样式" desc="点击选择译文的显示风格">
        <div className="themes">
          {THEMES.map((t) => (
            <button key={t.value} className={`theme${st.theme === t.value ? ' on' : ''}`} onClick={() => update({ style: { theme: t.value } })}>
              <div className="theme-src">Hello world</div>
              <tp-trans class={`tp-trans tp-block tp-theme-${t.value}`}>
                <tp-inner>你好，世界</tp-inner>
              </tp-trans>
              <div className="theme-name muted">{t.label}</div>
            </button>
          ))}
        </div>
      </Section>
      <Section title="颜色与字号">
        <Row label="译文颜色" desc="留空则跟随原文颜色">
          <ColorInput value={st.color} placeholder="跟随原文" onCommit={(v) => update({ style: { color: v } })} />
        </Row>
        <Row label="强调色" desc="下划线、引用块边框等">
          <ColorInput value={st.accentColor} onCommit={(v) => update({ style: { accentColor: v } })} />
        </Row>
        <Row label="背景色" desc="背景高亮、马克笔、卡片样式使用，支持 rgba()">
          <ColorInput value={st.bgColor} onCommit={(v) => update({ style: { bgColor: v } })} />
        </Row>
        <Row label={`译文字号：${Math.round(st.fontScale * 100)}%`}>
          <input
            type="range"
            min={0.7}
            max={1.4}
            step={0.05}
            value={st.fontScale}
            onChange={(e) => update({ style: { fontScale: Number(e.target.value) } })}
          />
        </Row>
        <Row label="自定义 CSS" desc="会注入到每个网页，译文元素为 tp-trans > tp-inner" vertical>
          <TextArea value={st.customCss} placeholder="tp-trans tp-inner { font-family: serif; }" onCommit={(v) => update({ style: { customCss: v } })} />
        </Row>
      </Section>
      <Section title="预览">
        <div className="preview">
          <p>
            Large language models can translate web pages while keeping the original layout, so you can compare the
            source and the translation side by side.
            <tp-trans class={`tp-trans tp-block tp-theme-${st.theme}`}>
              <tp-inner>大语言模型可以在保留原有排版的情况下翻译网页，让你能够并排对照原文和译文。</tp-inner>
            </tp-trans>
          </p>
        </div>
      </Section>
    </>
  )
}

// ---------------- 网站规则 ----------------

function LangChecks({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="lang-checks">
      {LANGUAGES.map((l) => (
        <label key={l.code}>
          <input
            type="checkbox"
            checked={value.includes(l.code)}
            onChange={(e) => onChange(e.target.checked ? [...value, l.code] : value.filter((x) => x !== l.code))}
          />
          {l.label}
        </label>
      ))}
    </div>
  )
}

function Rules({ bundle, update }: Props) {
  const r = bundle.settings.rules
  return (
    <>
      <Section title="网站规则" desc="每行一个域名，example.com 同时匹配其子域名">
        <Row label="总是翻译的网站" desc="打开时自动翻译" vertical>
          <ListEditor value={r.alwaysSites} placeholder={'例如：\nnews.ycombinator.com\nmedium.com'} onCommit={(v) => update({ rules: { alwaysSites: v } })} />
        </Row>
        <Row label="永不翻译的网站" desc="不会自动翻译（仍可手动翻译）" vertical>
          <ListEditor value={r.neverSites} placeholder="例如：github.com" onCommit={(v) => update({ rules: { neverSites: v } })} />
        </Row>
      </Section>
      <Section title="语言规则" desc="根据网页的主要语言决定是否自动翻译">
        <Row label="总是翻译这些语言的网页" vertical>
          <LangChecks value={r.alwaysLangs} onChange={(v) => update({ rules: { alwaysLangs: v } })} />
        </Row>
        <Row label="永不翻译这些语言的网页" vertical>
          <LangChecks value={r.neverLangs} onChange={(v) => update({ rules: { neverLangs: v } })} />
        </Row>
      </Section>
    </>
  )
}

// ---------------- 交互功能 ----------------

const HOVER_KEYS: { value: HoverKey; label: string }[] = [
  { value: 'Control', label: 'Ctrl' },
  { value: 'Alt', label: 'Alt / Option' },
  { value: 'Shift', label: 'Shift' },
  { value: 'Meta', label: 'Win / Command' },
]

function Interact({ bundle, update }: Props) {
  const s = bundle.settings
  return (
    <>
      <Section title="悬浮球">
        <Row label="显示悬浮球" desc="点击翻译/还原，悬停显示菜单，可上下拖动">
          <Switch checked={s.floatBall.enabled} onChange={(v) => update({ floatBall: { enabled: v } })} />
        </Row>
        <Row label="位置">
          <Select
            value={s.floatBall.side}
            options={[
              { value: 'right', label: '右侧' },
              { value: 'left', label: '左侧' },
            ]}
            onChange={(v) => update({ floatBall: { side: v } })}
          />
        </Row>
        <Row label="不显示悬浮球的网站" vertical>
          <ListEditor value={s.floatBall.disabledSites} onCommit={(v) => update({ floatBall: { disabledSites: v } })} />
        </Row>
      </Section>
      <Section title="悬停翻译">
        <Row label="启用悬停翻译" desc="鼠标放在段落上，轻按一下修饰键翻译该段，再按一次还原；按住修饰键移动鼠标可连续翻译">
          <Switch checked={s.hover.enabled} onChange={(v) => update({ hover: { enabled: v } })} />
        </Row>
        <Row label="修饰键">
          <Select value={s.hover.key} options={HOVER_KEYS} onChange={(v) => update({ hover: { key: v } })} />
        </Row>
      </Section>
      <Section title="划词翻译">
        <Row label="启用划词翻译">
          <Switch checked={s.selection.enabled} onChange={(v) => update({ selection: { enabled: v } })} />
        </Row>
        <Row label="触发方式">
          <Select
            value={s.selection.trigger}
            options={[
              { value: 'icon', label: '选中后显示图标，点击翻译' },
              { value: 'auto', label: '选中后直接翻译' },
            ]}
            onChange={(v) => update({ selection: { trigger: v } })}
          />
        </Row>
      </Section>
      <Section title="输入框翻译" desc="在输入框中快速连按空格，把已输入内容翻译成指定语言（支持撤销 Ctrl+Z）">
        <Row label="启用输入框翻译">
          <Switch checked={s.input.enabled} onChange={(v) => update({ input: { enabled: v } })} />
        </Row>
        <Row label="翻译成">
          <Select value={s.input.targetLang} options={LANG_OPTIONS} onChange={(v) => update({ input: { targetLang: v } })} />
        </Row>
        <Row label="连按空格次数">
          <NumberInput value={s.input.triggerCount} min={2} max={5} onCommit={(v) => update({ input: { triggerCount: v } })} />
        </Row>
      </Section>
    </>
  )
}

// ---------------- 图片 / 视频 / PDF ----------------

function Media({ bundle, update }: Props) {
  const s = bundle.settings
  return (
    <>
      <Section title="图片解读" desc="悬停图片点击「✨ 解读」，或在图片上右键「讲解 / 翻译此图片」。讲解会结合网页标题、图片说明和前后文，并支持继续追问">
        <Row label="启用图片解读">
          <Switch checked={s.image.enabled} onChange={(v) => update({ image: { enabled: v } })} />
        </Row>
        <Row label="默认模式" desc="打开卡片后也可以随时切换">
          <Select
            value={s.image.mode}
            options={[
              { value: 'explain', label: '讲解：结合上下文解读、总结图片' },
              { value: 'translate', label: '文字翻译：逐条翻译图中文字' },
            ]}
            onChange={(v) => update({ image: { mode: v } })}
          />
        </Row>
        <Row label="悬停图片时显示「解读」按钮">
          <Switch checked={s.image.hoverButton} onChange={(v) => update({ image: { hoverButton: v } })} />
        </Row>
        <Row label="显示按钮的最小图片尺寸（px）">
          <NumberInput value={s.image.minSize} min={40} max={2000} onCommit={(v) => update({ image: { minSize: v } })} />
        </Row>
      </Section>
      <Section title="YouTube 双语字幕" desc="打开视频并开启字幕（CC）后，自动显示双语字幕">
        <Row label="启用双语字幕">
          <Switch checked={s.video.enabled} onChange={(v) => update({ video: { enabled: v } })} />
        </Row>
        <Row label="同时显示原文字幕">
          <Switch checked={s.video.showOriginal} onChange={(v) => update({ video: { showOriginal: v } })} />
        </Row>
        <Row label={`字幕字号：${Math.round(s.video.fontScale * 100)}%`}>
          <input type="range" min={0.6} max={1.8} step={0.05} value={s.video.fontScale} onChange={(e) => update({ video: { fontScale: Number(e.target.value) } })} />
        </Row>
      </Section>
      <Section title="PDF 翻译" desc="内置 PDF 阅读器：左侧原文页面，右侧逐段译文">
        <Row label="打开 PDF 时自动使用双语阅读器" desc="关闭时会在 PDF 页面右上角显示打开按钮">
          <Switch checked={s.pdf.autoOpen} onChange={(v) => update({ pdf: { autoOpen: v } })} />
        </Row>
        <Row label="译文栏同时显示原文">
          <Switch checked={s.pdf.showOriginal} onChange={(v) => update({ pdf: { showOriginal: v } })} />
        </Row>
        <Row label="打开阅读器" desc="可打开本地 PDF 文件或拖入文件">
          <button className="btn" onClick={() => callBg({ type: 'openPdfViewer' })}>
            📄 打开 PDF 阅读器
          </button>
        </Row>
        <p className="muted note">
          提示：要直接翻译本地 file:// 的 PDF，需要在 chrome://extensions 中本扩展的「详情」里开启「允许访问文件网址」。
        </p>
      </Section>
    </>
  )
}

// ---------------- 快捷键 ----------------

function Shortcuts({ bundle }: Props) {
  const [cmds, setCmds] = useState<chrome.commands.Command[]>([])
  useEffect(() => {
    void chrome.commands.getAll().then(setCmds)
  }, [])
  const hoverKey = HOVER_KEYS.find((k) => k.value === bundle.settings.hover.key)?.label
  return (
    <Section title="快捷键" desc="浏览器快捷键可在 Chrome 的扩展快捷键页面修改">
      {cmds
        .filter((c) => c.name !== '_execute_action')
        .map((c) => (
          <Row key={c.name} label={c.description || c.name}>
            <span className="kbd-big">{c.shortcut || '未设置'}</span>
          </Row>
        ))}
      <Row label="悬停翻译段落">
        <span className="kbd-big">轻按 {hoverKey}</span>
      </Row>
      <Row label="输入框翻译">
        <span className="kbd-big">连按 {bundle.settings.input.triggerCount} 次空格</span>
      </Row>
      <Row label="关闭划词卡片">
        <span className="kbd-big">Esc</span>
      </Row>
      <div className="toolbar">
        <button className="btn" onClick={() => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' })}>
          修改浏览器快捷键
        </button>
      </div>
    </Section>
  )
}

// ---------------- 高级设置 ----------------

function Advanced({ bundle, update }: Props) {
  const a = bundle.settings.advanced
  const [count, setCount] = useState<number | null>(null)
  const loadCount = () => callBg<{ count: number }>({ type: 'cacheStats' }).then((r) => setCount(r.count))
  useEffect(() => {
    void loadCount()
  }, [])
  return (
    <>
      <Section title="缓存">
        <Row label="缓存翻译结果" desc="相同文本不再重复请求，节省 token">
          <Switch checked={a.cache} onChange={(v) => update({ advanced: { cache: v } })} />
        </Row>
        <Row label={`已缓存 ${count ?? '…'} 条`}>
          <button
            className="btn danger"
            onClick={async () => {
              await callBg({ type: 'clearCache' })
              void loadCount()
            }}
          >
            清空缓存
          </button>
        </Row>
      </Section>
      <Section title="请求与段落">
        <Row label="每次请求最多合并段落数" desc="越大越省请求次数，但单次响应更慢">
          <NumberInput value={a.batchSize} min={1} max={50} onCommit={(v) => update({ advanced: { batchSize: v } })} />
        </Row>
        <Row label="每次请求最多字符数">
          <NumberInput value={a.batchChars} min={200} max={20000} step={100} onCommit={(v) => update({ advanced: { batchChars: v } })} />
        </Row>
        <Row label="最短翻译文本长度">
          <NumberInput value={a.minTextLength} min={1} max={50} onCommit={(v) => update({ advanced: { minTextLength: v } })} />
        </Row>
        <Row label="提前翻译距离（px）" desc="距离可视区域多远时开始翻译">
          <NumberInput value={a.rootMargin} min={0} max={5000} step={100} onCommit={(v) => update({ advanced: { rootMargin: v } })} />
        </Row>
        <Row label="不翻译的元素（CSS 选择器）" desc="每行一个，例如 .comment、#footer" vertical>
          <TextArea value={a.excludeSelectors} placeholder={'.comment-list\n#footer'} onCommit={(v) => update({ advanced: { excludeSelectors: v } })} />
        </Row>
      </Section>
      <p className="muted note">并发数、每分钟请求数、超时、提示词等与模型相关的参数在 config.jsonc 中配置。</p>
    </>
  )
}

// ---------------- 备份与恢复 ----------------

function Backup({ bundle, reload }: Props) {
  const [msg, setMsg] = useState('')
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(bundle.userSettings, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `translator-settings-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }
  const importJson = async (file: File) => {
    try {
      const value = JSON.parse(await file.text())
      await callBg({ type: 'replaceUserSettings', value })
      await reload()
      setMsg('✓ 导入成功')
    } catch (e) {
      setMsg(`✗ 导入失败：${e instanceof Error ? e.message : e}`)
    }
  }
  const reset = async () => {
    if (!confirm('确定清除在设置页中做的所有修改，恢复为 config.jsonc 中的默认值吗？')) return
    await callBg({ type: 'resetSettings' })
    await reload()
    setMsg('✓ 已恢复为配置文件默认值')
  }
  return (
    <Section title="备份与恢复" desc="导出的是在设置页中修改过的项（不含 config.jsonc 里的 API Key）">
      <Row label="导出设置">
        <button className="btn" onClick={exportJson}>
          导出 JSON
        </button>
      </Row>
      <Row label="导入设置" desc="会覆盖当前在设置页中的修改">
        <label className="btn">
          选择文件
          <input type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
        </label>
      </Row>
      <Row label="恢复为配置文件默认值">
        <button className="btn danger" onClick={reset}>
          恢复默认
        </button>
      </Row>
      {msg && <div className="note">{msg}</div>}
      <Row label="当前界面修改项" vertical>
        <pre className="play-out">{JSON.stringify(bundle.userSettings, null, 2)}</pre>
      </Row>
    </Section>
  )
}
