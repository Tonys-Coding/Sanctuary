import type { ReactNode } from 'react'
import { useApp } from '../lib/app'
import { cx } from './ui'

/**
 * Large tabs that split a busy page into a few calm views. Arrow keys move between them,
 * and each tab's panel is `panel-<value>`, labelled by `tab-<value>`.
 */
export function ViewTabs<T extends string>({ value, onChange, options, label }: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string; icon?: ReactNode }[]
  label?: string
}) {
  const { tr } = useApp()
  const move = (dir: number) => {
    const i = options.findIndex((o) => o.value === value)
    const next = options[(i + dir + options.length) % options.length].value
    onChange(next)
    setTimeout(() => document.getElementById(`tab-${next}`)?.focus())
  }
  const cols = options.length === 2 ? 'grid-cols-2' : options.length === 3 ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-2 md:grid-cols-4'
  return (
    <div role="tablist" aria-label={label ?? tr('Secciones', 'Sections')} className={cx('grid gap-1.5 p-1.5 rounded-[16px] bg-raised no-print', cols)}>
      {options.map((o) => {
        const on = o.value === value
        return (
          <button key={o.value} id={`tab-${o.value}`} type="button" role="tab" aria-selected={on} aria-controls={`panel-${o.value}`} tabIndex={on ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => { if (e.key === 'ArrowRight') { e.preventDefault(); move(1) } else if (e.key === 'ArrowLeft') { e.preventDefault(); move(-1) } }}
            className={cx('min-h-14 px-3 rounded-[12px] flex items-center justify-center gap-2.5 text-[1.05rem] text-center transition-colors',
              on ? 'bg-surface text-ink font-bold shadow-card' : 'text-ink-soft font-semibold hover:text-ink hover:bg-surface/50')}>
            {o.icon && <span className={on ? 'text-accent-ink' : ''} aria-hidden>{o.icon}</span>}{o.label}
          </button>
        )
      })}
    </div>
  )
}
