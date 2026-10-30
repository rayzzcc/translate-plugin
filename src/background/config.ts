import { DEFAULT_PROMPTS, DEFAULT_SETTINGS } from '../shared/defaults'
import { parseJsonc } from '../shared/jsonc'
import type { AppConfig, DeepPartial, Prompts, ProviderConfig, PublicProvider, Settings, SettingsBundle } from '../shared/types'
import { deepClone, deepMerge, errMsg, isPlainObject } from '../shared/utils'

const USER_KEY = 'userSettings'
const CONFIG_FILE = 'config.jsonc'

interface LoadedConfig {
  config: AppConfig
  error?: string
  at: number
}

let cached: LoadedConfig | null = null

function normalizeConfig(raw: unknown): AppConfig {
  if (!isPlainObject(raw)) throw new Error('config.jsonc 顶层必须是对象')
  const list = Array.isArray(raw.providers) ? raw.providers : []
  const providers: ProviderConfig[] = list
    .filter((p: unknown) => isPlainObject(p) && typeof p.model === 'string' && p.model)
    .map((p: any, i: number) => ({
      ...p,
      id: String(p.id || `provider-${i + 1}`),
      type: ['openai', 'anthropic', 'gemini'].includes(p.type) ? p.type : 'openai',
    }))
  return {
    providers,
    defaultProvider: typeof raw.defaultProvider === 'string' ? raw.defaultProvider : undefined,
    imageProvider: typeof raw.imageProvider === 'string' ? raw.imageProvider : undefined,
    settings: isPlainObject(raw.settings) ? raw.settings : {},
    prompts: isPlainObject(raw.prompts) ? raw.prompts : {},
  }
}

/** 读取扩展目录中的 config.jsonc（短时间缓存，修改后最多 2 秒生效） */
export async function loadConfig(force = false): Promise<LoadedConfig> {
  if (!force && cached && Date.now() - cached.at < 2000) return cached
  let config: AppConfig = { providers: [] }
  let error: string | undefined
  try {
    const res = await fetch(chrome.runtime.getURL(CONFIG_FILE) + '?t=' + Date.now(), { cache: 'no-store' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    config = normalizeConfig(parseJsonc(await res.text()))
    if (!config.providers.length) error = 'config.jsonc 中没有可用的翻译服务（providers 为空或缺少 model）'
  } catch (e) {
    error = `读取 ${CONFIG_FILE} 失败：${errMsg(e)}`
    // 解析失败时沿用上一次成功的配置，避免一处笔误导致整个插件不可用
    if (cached && !cached.error) config = cached.config
  }
  cached = { config, error, at: Date.now() }
  return cached
}

export async function getUserSettings(): Promise<DeepPartial<Settings>> {
  const r = await chrome.storage.local.get(USER_KEY)
  return (r[USER_KEY] as DeepPartial<Settings>) || {}
}

export async function setUserSettings(value: DeepPartial<Settings>) {
  await chrome.storage.local.set({ [USER_KEY]: value })
}

export async function updateUserSettings(patch: DeepPartial<Settings>) {
  const cur = await getUserSettings()
  await setUserSettings(deepMerge(cur, patch))
}

export interface Effective {
  config: AppConfig
  error?: string
  settings: Settings
  user: DeepPartial<Settings>
  prompts: Prompts
}

export async function getEffective(): Promise<Effective> {
  const { config, error } = await loadConfig()
  const user = await getUserSettings()
  const settings = deepMerge(deepClone(DEFAULT_SETTINGS), config.settings, user)
  const ids = config.providers.map((p) => p.id)
  const fallback =
    config.defaultProvider && ids.includes(config.defaultProvider) ? config.defaultProvider : (ids[0] ?? '')
  if (!ids.includes(settings.providerId)) settings.providerId = fallback
  if (!ids.includes(settings.image.providerId)) {
    settings.image.providerId =
      config.imageProvider && ids.includes(config.imageProvider) ? config.imageProvider : settings.providerId
  }
  const prompts = { ...DEFAULT_PROMPTS }
  for (const [k, v] of Object.entries(config.prompts || {})) {
    if (typeof v === 'string' && v.trim()) prompts[k as keyof Prompts] = v
  }
  return { config, error, settings, user, prompts }
}

export function isPlaceholderKey(key?: string) {
  return !!key && /^YOUR_/i.test(key.trim())
}

function toPublic(p: ProviderConfig): PublicProvider {
  const key = p.apiKey || ''
  const configured = !isPlaceholderKey(key) && (p.type === 'openai' || !!key)
  return {
    id: p.id,
    name: p.name || p.id,
    type: p.type,
    model: p.model,
    baseUrl: p.baseUrl || '',
    vision: !!p.vision,
    configured,
    keyHint: key ? (key.length > 10 ? `${key.slice(0, 4)}…${key.slice(-4)}` : '已填写') : '（未填写）',
  }
}

export async function getBundle(): Promise<SettingsBundle> {
  const { config, error, settings, user } = await getEffective()
  return { settings, providers: config.providers.map(toPublic), configError: error, userSettings: user }
}

export function pickProvider(config: AppConfig, id: string): ProviderConfig {
  const p = config.providers.find((x) => x.id === id) ?? config.providers[0]
  if (!p) throw new Error('未配置任何翻译服务，请编辑 config.jsonc')
  if (isPlaceholderKey(p.apiKey) || (p.type !== 'openai' && !p.apiKey)) {
    throw new Error(`翻译服务「${p.name || p.id}」尚未填写 API Key，请编辑 config.jsonc`)
  }
  return p
}
