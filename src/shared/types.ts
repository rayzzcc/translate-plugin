export type ProviderType = 'openai' | 'anthropic' | 'gemini'

export interface ProviderConfig {
  id: string
  name?: string
  type: ProviderType
  baseUrl?: string
  apiKey?: string
  model: string
  temperature?: number
  maxTokens?: number
  maxConcurrent?: number
  rpm?: number
  timeoutMs?: number
  vision?: boolean
  batchSize?: number
  batchChars?: number
  extraBody?: Record<string, unknown>
  extraHeaders?: Record<string, string>
}

/** 不含 API Key 的服务信息，可安全发给页面和内容脚本 */
export interface PublicProvider {
  id: string
  name: string
  type: ProviderType
  model: string
  baseUrl: string
  vision: boolean
  configured: boolean
  keyHint: string
}

export type DisplayMode = 'bilingual' | 'translation'

export type TransTheme =
  | 'none'
  | 'dashed'
  | 'dotted'
  | 'wavy'
  | 'highlight'
  | 'marker'
  | 'italic'
  | 'bold'
  | 'weak'
  | 'blur'
  | 'quote'
  | 'card'

export type HoverKey = 'Control' | 'Alt' | 'Shift' | 'Meta'

export type ImageMode = 'explain' | 'translate'

export interface Settings {
  targetLang: string
  /** 空字符串表示使用配置文件中的 defaultProvider */
  providerId: string
  displayMode: DisplayMode
  style: {
    theme: TransTheme
    color: string
    accentColor: string
    bgColor: string
    fontScale: number
    customCss: string
  }
  rules: {
    alwaysSites: string[]
    neverSites: string[]
    alwaysLangs: string[]
    neverLangs: string[]
  }
  floatBall: {
    enabled: boolean
    disabledSites: string[]
    side: 'left' | 'right'
    /** 距顶部的百分比 */
    top: number
  }
  hover: { enabled: boolean; key: HoverKey }
  selection: { enabled: boolean; trigger: 'icon' | 'auto' }
  input: { enabled: boolean; targetLang: string; triggerCount: number }
  image: {
    enabled: boolean
    providerId: string
    hoverButton: boolean
    minSize: number
    /** 打开图片卡片时默认显示的模式：讲解（结合上下文解读）/ 文字翻译 */
    mode: ImageMode
  }
  video: { enabled: boolean; showOriginal: boolean; fontScale: number }
  pdf: { autoOpen: boolean; showOriginal: boolean }
  advanced: {
    cache: boolean
    batchSize: number
    batchChars: number
    minTextLength: number
    rootMargin: number
    excludeSelectors: string
    pageContext: boolean
  }
}

export interface Prompts {
  system: string
  single: string
  batch: string
  subtitle: string
  image: string
  imageExplainSystem: string
  imageExplain: string
}

export interface AppConfig {
  providers: ProviderConfig[]
  defaultProvider?: string
  imageProvider?: string
  settings?: DeepPartial<Settings>
  prompts?: Partial<Prompts>
}

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends (infer U)[] ? U[] : T[K] extends object ? DeepPartial<T[K]> : T[K]
}

export interface SettingsBundle {
  settings: Settings
  providers: PublicProvider[]
  configError?: string
  userSettings: DeepPartial<Settings>
}

export type Scene = 'page' | 'selection' | 'hover' | 'input' | 'subtitle' | 'pdf' | 'test'

export interface ImageTextItem {
  src: string
  dst: string
}

/** 图片周围的网页上下文，用于图片讲解 */
export interface ImageContext {
  pageTitle: string
  url?: string
  heading?: string
  alt?: string
  caption?: string
  before?: string
  after?: string
}

export interface PageState {
  active: boolean
  mode: DisplayMode
  isPdf: boolean
  url: string
  pending: number
}
