import { useSyncExternalStore } from 'react'
import { useApp } from '../lib/app'

/** Text sizes, smallest to largest. 1 is the normal size; there are two steps below it and three above. */
const SCALES = [0.85, 0.925, 1, 1.125, 1.25, 1.375]
const KEY = 'sanctuary.textscale'
const OLD_KEY = 'sanctuary.textsize' // earlier versions saved a position in [1, 1.125, 1.25, 1.375]

function load(): number {
  try {
    const v = Number(localStorage.getItem(KEY))
    if (SCALES.includes(v)) return v
    const old = localStorage.getItem(OLD_KEY)
    if (old !== null) return [1, 1.125, 1.25, 1.375][Number(old)] ?? 1
  } catch { /* private mode */ }
  return 1
}

let current = load()
const listeners = new Set<() => void>()
export const applyTextSize = (scale = current) => document.documentElement.style.setProperty('--text-scale', String(scale))
function set(scale: number) {
  current = scale
  applyTextSize(scale)
  try { localStorage.setItem(KEY, String(scale)) } catch { /* private mode */ }
  listeners.forEach((l) => l())
}
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }

/** A− / A+ : makes everything bigger or smaller on this computer. Every copy of the control stays in step. */
export function TextSize() {
  const { tr } = useApp()
  const scale = useSyncExternalStore(subscribe, () => current)
  const i = SCALES.indexOf(scale)
  const btn = 'min-h-9 min-w-10 px-2 rounded-full font-bold text-ink-soft hover:text-ink hover:bg-surface disabled:opacity-40 disabled:hover:bg-transparent transition-colors'
  const pct = `${Math.round(scale * 100)}%`
  return (
    <div className="inline-flex items-center p-1 rounded-full bg-raised" role="group" aria-label={`${tr('Tamaño del texto', 'Text size')}: ${pct}`} title={`${tr('Tamaño del texto', 'Text size')}: ${pct}`}>
      <button type="button" className={btn} onClick={() => set(SCALES[Math.max(0, i - 1)])} disabled={i === 0} aria-label={tr('Letra más pequeña', 'Smaller text')} title={tr('Letra más pequeña', 'Smaller text')}>
        <span className="text-[0.8rem]">A−</span>
      </button>
      <button type="button" className={btn} onClick={() => set(SCALES[Math.min(SCALES.length - 1, i + 1)])} disabled={i === SCALES.length - 1} aria-label={tr('Letra más grande', 'Larger text')} title={tr('Letra más grande', 'Larger text')}>
        <span className="text-[1.05rem]">A+</span>
      </button>
    </div>
  )
}
