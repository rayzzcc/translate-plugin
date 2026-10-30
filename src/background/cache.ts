// 翻译结果缓存：内存 + IndexedDB（service worker 重启后仍可命中）
const DB_NAME = 'tp-cache'
const STORE = 'translations'
const MEM_LIMIT = 5000

const mem = new Map<string, string>()
let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(STORE)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => {
        dbPromise = null
        reject(req.error)
      }
    })
  }
  return dbPromise
}

function memSet(key: string, value: string) {
  if (mem.size >= MEM_LIMIT) mem.delete(mem.keys().next().value as string)
  mem.set(key, value)
}

export async function cacheGetMany(keys: string[]): Promise<(string | undefined)[]> {
  const out: (string | undefined)[] = keys.map((k) => mem.get(k))
  const missing = out.map((v, i) => (v === undefined ? i : -1)).filter((i) => i >= 0)
  if (!missing.length) return out
  try {
    const db = await openDb()
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readonly')
      const store = tx.objectStore(STORE)
      for (const i of missing) {
        const req = store.get(keys[i])
        req.onsuccess = () => {
          const v = req.result?.v
          if (typeof v === 'string') {
            out[i] = v
            memSet(keys[i], v)
          }
        }
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
      tx.onabort = () => resolve()
    })
  } catch {
    /* 缓存不可用时直接忽略 */
  }
  return out
}

export async function cacheSetMany(entries: [string, string][]) {
  if (!entries.length) return
  for (const [k, v] of entries) memSet(k, v)
  try {
    const db = await openDb()
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    const t = Date.now()
    for (const [k, v] of entries) store.put({ v, t }, k)
  } catch {
    /* 忽略 */
  }
}

export async function cacheClear() {
  mem.clear()
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function cacheCount(): Promise<number> {
  try {
    const db = await openDb()
    return await new Promise((resolve) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).count()
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(0)
    })
  } catch {
    return 0
  }
}
