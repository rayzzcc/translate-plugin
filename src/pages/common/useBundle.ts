import { useCallback, useEffect, useState } from 'react'
import { callBg } from '../../shared/messages'
import type { DeepPartial, Settings, SettingsBundle } from '../../shared/types'

/** 读取并订阅设置；update 写入用户覆盖项 */
export function useBundle() {
  const [bundle, setBundle] = useState<SettingsBundle | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      setBundle(await callBg<SettingsBundle>({ type: 'getSettings' }))
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    void load()
    const onChange = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes.userSettings) void load()
    }
    chrome.storage.onChanged.addListener(onChange)
    return () => chrome.storage.onChanged.removeListener(onChange)
  }, [load])

  const update = useCallback(async (patch: DeepPartial<Settings>) => {
    // 先本地乐观更新，避免输入卡顿
    setBundle((b) => (b ? { ...b, settings: mergeShallowDeep(b.settings, patch) } : b))
    await callBg({ type: 'updateSettings', patch })
  }, [])

  return { bundle, error, reload: load, update, setBundle }
}

function mergeShallowDeep<T>(base: T, patch: unknown): T {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return patch as T
  const out: any = Array.isArray(base) ? [...(base as any)] : { ...(base as any) }
  for (const [k, v] of Object.entries(patch)) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) ? mergeShallowDeep(out[k] ?? {}, v) : v
  }
  return out
}
