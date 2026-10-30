import type { ProviderConfig } from '../shared/types'
import { sleep } from '../shared/utils'

/** 每个翻译服务一个限流器：并发数 + 每分钟请求数 */
class Limiter {
  private active = 0
  private queue: (() => void)[] = []
  private stamps: number[] = []

  constructor(
    public max: number,
    public rpm: number,
  ) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire()
    try {
      await this.waitRpm()
      return await fn()
    } finally {
      this.release()
    }
  }

  private acquire(): Promise<void> {
    if (this.active < this.max) {
      this.active++
      return Promise.resolve()
    }
    return new Promise((resolve) =>
      this.queue.push(() => {
        this.active++
        resolve()
      }),
    )
  }

  private release() {
    this.active--
    this.queue.shift()?.()
  }

  private async waitRpm() {
    if (!this.rpm) return
    for (;;) {
      const now = Date.now()
      this.stamps = this.stamps.filter((t) => now - t < 60_000)
      if (this.stamps.length < this.rpm) {
        this.stamps.push(now)
        return
      }
      await sleep(60_000 - (now - this.stamps[0]) + 20)
    }
  }
}

const limiters = new Map<string, Limiter>()

export function getLimiter(p: ProviderConfig): Limiter {
  const max = Math.max(1, p.maxConcurrent || 4)
  const rpm = Math.max(0, p.rpm || 0)
  let l = limiters.get(p.id)
  if (!l) {
    l = new Limiter(max, rpm)
    limiters.set(p.id, l)
  } else {
    l.max = max
    l.rpm = rpm
  }
  return l
}
