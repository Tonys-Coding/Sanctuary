import { useEffect, useRef, useState } from 'react'
import { useApp } from '../lib/app'
import { Button, Modal } from './ui'

const KEY = 'sanctuary.activity'
const read = () => { try { return Number(localStorage.getItem(KEY)) || 0 } catch { return 0 } }

/**
 * Signs out after the church's chosen minutes without activity (Settings → Church), so a computer
 * left open in the church office does not stay signed in. One minute before, it asks "Are you still there?".
 * Activity in any tab of the same browser counts.
 */
export function IdleGuard() {
  const { session, logout, tr } = useApp()
  const minutes = session?.org.idle_minutes ?? 15
  const [left, setLeft] = useState<number | null>(null)
  const warning = useRef(false)
  const last = useRef(0)

  useEffect(() => {
    if (!minutes) return
    let written = 0
    const mark = () => {
      if (warning.current) return
      last.current = Date.now()
      // Writing on every mouse move would be wasteful: once every few seconds is plenty.
      if (last.current - written > 5000) { written = last.current; try { localStorage.setItem(KEY, String(last.current)) } catch { /* private mode */ } }
    }
    mark()
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'mousemove'] as const
    events.forEach((e) => window.addEventListener(e, mark, { passive: true }))
    const tick = setInterval(() => {
      const idle = Date.now() - Math.max(last.current, read())
      const limit = minutes * 60_000
      if (idle >= limit) {
        try { sessionStorage.setItem('sanctuary.idle', '1') } catch { /* private mode */ }
        warning.current = false
        setLeft(null)
        logout()
      } else if (idle >= limit - 60_000) {
        warning.current = true
        setLeft(Math.ceil((limit - idle) / 1000))
      } else if (warning.current) {
        // Someone kept working in another tab.
        warning.current = false
        setLeft(null)
      }
    }, 1000)
    return () => { events.forEach((e) => window.removeEventListener(e, mark)); clearInterval(tick) }
  }, [minutes, logout])

  const stay = () => {
    warning.current = false
    last.current = Date.now()
    try { localStorage.setItem(KEY, String(last.current)) } catch { /* private mode */ }
    setLeft(null)
  }

  return (
    <Modal open={left !== null} onClose={stay} title={tr('¿Sigues ahí?', 'Are you still there?')}
      footer={<>
        <Button onClick={() => logout()}>{tr('Cerrar sesión', 'Sign out')}</Button>
        <Button variant="primary" onClick={stay} autoFocus>{tr('Seguir trabajando', 'Keep working')}</Button>
      </>}>
      <p className="text-ink-soft" aria-live="assertive">
        {tr(`Por seguridad, la sesión se cerrará en ${left ?? 0} segundos si no hay actividad.`, `For safety, you will be signed out in ${left ?? 0} seconds if there is no activity.`)}
      </p>
    </Modal>
  )
}
