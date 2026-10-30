import { callBg } from '../shared/messages'
import type { DeepPartial, PublicProvider, Settings, SettingsBundle } from '../shared/types'

let bundle: SettingsBundle | null = null
const listeners = new Set<(s: Settings) => void>()

export async function initSettings() {
  bundle = await callBg<SettingsBundle>({ type: 'getSettings' })
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.userSettings) void refresh()
  })
}

async function refresh() {
  try {
    bundle = await callBg<SettingsBundle>({ type: 'getSettings' })
    listeners.forEach((fn) => fn(bundle!.settings))
  } catch {
    /* 扩展被重载等情况，忽略 */
  }
}

export function S(): Settings {
  return bundle!.settings
}

export function providers(): PublicProvider[] {
  return bundle?.providers ?? []
}

export function currentProvider(): PublicProvider | undefined {
  return providers().find((p) => p.id === S().providerId)
}

export function onSettingsChange(fn: (s: Settings) => void) {
  listeners.add(fn)
}

export function updateSettings(patch: DeepPartial<Settings>) {
  return callBg({ type: 'updateSettings', patch })
}
