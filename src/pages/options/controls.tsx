import { useEffect, useState, type ReactNode } from 'react'

export function Section({ title, desc, children }: { title: string; desc?: ReactNode; children: ReactNode }) {
  return (
    <section className="section">
      <h2>{title}</h2>
      {desc && <p className="section-desc muted">{desc}</p>}
      <div className="card">{children}</div>
    </section>
  )
}

export function Row({ label, desc, children, vertical }: { label: ReactNode; desc?: ReactNode; children: ReactNode; vertical?: boolean }) {
  return (
    <div className={`field${vertical ? ' vertical' : ''}`}>
      <div className="field-label">
        <div>{label}</div>
        {desc && <div className="field-desc muted">{desc}</div>}
      </div>
      <div className="field-control">{children}</div>
    </div>
  )
}

export function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return <button type="button" className={`switch${checked ? ' on' : ''}`} onClick={() => onChange(!checked)} aria-pressed={checked} />
}

export function Select<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <select className="select" value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

/** 失焦或回车时才提交，避免每次按键都写存储 */
export function TextInput({ value, onCommit, placeholder, width }: { value: string; onCommit: (v: string) => void; placeholder?: string; width?: number }) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  return (
    <input
      className="input"
      style={{ width: width ?? 220 }}
      value={v}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== value && onCommit(v)}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  )
}

export function NumberInput({ value, onCommit, min, max, step }: { value: number; onCommit: (v: number) => void; min?: number; max?: number; step?: number }) {
  const [v, setV] = useState(String(value))
  useEffect(() => setV(String(value)), [value])
  const commit = () => {
    let n = Number(v)
    if (!Number.isFinite(n)) return setV(String(value))
    if (min !== undefined) n = Math.max(min, n)
    if (max !== undefined) n = Math.min(max, n)
    setV(String(n))
    if (n !== value) onCommit(n)
  }
  return (
    <input
      className="input"
      type="number"
      style={{ width: 110 }}
      value={v}
      min={min}
      max={max}
      step={step}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  )
}

export function TextArea({ value, onCommit, placeholder, rows = 4 }: { value: string; onCommit: (v: string) => void; placeholder?: string; rows?: number }) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  return <textarea className="textarea" rows={rows} value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && onCommit(v)} />
}

/** 每行一个条目的列表编辑器 */
export function ListEditor({ value, onCommit, placeholder }: { value: string[]; onCommit: (v: string[]) => void; placeholder?: string }) {
  return (
    <TextArea
      value={value.join('\n')}
      placeholder={placeholder}
      onCommit={(s) =>
        onCommit(
          s
            .split('\n')
            .map((x) => x.trim())
            .filter(Boolean),
        )
      }
    />
  )
}

export function ColorInput({ value, onCommit, placeholder }: { value: string; onCommit: (v: string) => void; placeholder?: string }) {
  const hex = /^#[0-9a-f]{6}$/i.test(value) ? value : '#6b8afd'
  return (
    <div className="color-input">
      <input type="color" value={hex} onChange={(e) => onCommit(e.target.value)} />
      <TextInput value={value} onCommit={onCommit} placeholder={placeholder} width={180} />
    </div>
  )
}
