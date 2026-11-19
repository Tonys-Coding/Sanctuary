import { useEffect, useState } from 'react'
import { useApp } from '../lib/app'

const SCALES = [1, 1.125, 1.25, 1.375]
const KEY = 'sanctuary.textsize'
export const savedTextSize = () => { try { const n = Number(localStorage.getItem(KEY)); return n >= 0 && n < SCALES.length ? n : 0 } catch { return 0 } }
export const applyTextSize = (i: number) => document.documentElement.style.setProperty('--text-scale', String(SCALES[i]))

/** A− / A+ : makes everything bigger or smaller on this computer. */
export function TextSize() {
  const { tr } = useApp()
  const [i, setI] = useState(savedTextSize)
  useEffect(() => { applyTextSize(i); try { localStorage.setItem(KEY, String(i)) } catch { /* private mode */ } }, [i])
  const btn = 'min-h-9 min-w-10 px-2 rounded-full font-bold text-ink-soft hover:text-ink hover:bg-surface disabled:opacity-40 disabled:hover:bg-transparent transition-colors'
  return (
    <div className="inline-flex items-center p-1 rounded-full bg-raised" role="group" aria-label={tr('Tamaño del texto', 'Text size')}>
      <button type="button" className={btn} onClick={() => setI((n) => Math.max(0, n - 1))} disabled={i === 0} aria-label={tr('Letra más pequeña', 'Smaller text')} title={tr('Letra más pequeña', 'Smaller text')}>
        <span className="text-[0.8rem]">A−</span>
      </button>
      <button type="button" className={btn} onClick={() => setI((n) => Math.min(SCALES.length - 1, n + 1))} disabled={i === SCALES.length - 1} aria-label={tr('Letra más grande', 'Larger text')} title={tr('Letra más grande', 'Larger text')}>
        <span className="text-[1.05rem]">A+</span>
      </button>
    </div>
  )
}
