import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api, ApiError, setSessionLostHandler } from './api'
import type { Lang, Session, Theme } from './types'

interface AppState {
  session: Session | null
  loading: boolean
  lang: Lang
  theme: Theme
  dark: boolean
  /** Picks the Spanish or English text. Spanish is the primary language of the app. */
  tr: (es: string, en: string) => string
  money: (n: number | null | undefined, opts?: { compact?: boolean; whole?: boolean }) => string
  date: (iso: string | null | undefined, style?: 'short' | 'long' | 'month') => string
  num: (n: number) => string
  setLang: (l: Lang) => void
  setTheme: (t: Theme) => void
  setSession: (s: Session | null) => void
  refresh: () => Promise<void>
  logout: () => Promise<void>
}

const Ctx = createContext<AppState>(null as unknown as AppState)
export const useApp = () => useContext(Ctx)

const stored = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const store = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* private mode */ } }

export function AppProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const [session, setSessionState] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [lang, setLangState] = useState<Lang>(stored('sanctuary.lang') === 'en' ? 'en' : 'es')
  const [theme, setThemeState] = useState<Theme>((stored('sanctuary.theme') as Theme) || 'system')
  const [systemDark, setSystemDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches)

  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const on = () => setSystemDark(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])

  const dark = theme === 'dark' || (theme === 'system' && systemDark)
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#1c1814' : '#f7f3ec')
  }, [dark])
  useEffect(() => {
    document.documentElement.lang = lang
    document.title = lang === 'es' ? 'Sanctuary · Tesorería de la iglesia' : 'Sanctuary · Church treasury'
  }, [lang])

  const setSession = useCallback((s: Session | null) => {
    setSessionState(s)
    if (s) {
      // The account remembers language and theme, so they follow the person to any computer.
      setLangState(s.user.language); store('sanctuary.lang', s.user.language)
      setThemeState(s.user.theme); store('sanctuary.theme', s.user.theme)
    }
  }, [])

  const refresh = useCallback(async () => {
    try {
      setSession(await api.get<Session>('/auth/me'))
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setSessionState(null)
    }
  }, [setSession])

  useEffect(() => { refresh().finally(() => setLoading(false)) }, [refresh])

  // If the session stops being valid while the app is open, go back to the sign-in page
  // instead of showing screens whose data can no longer load.
  useEffect(() => {
    setSessionLostHandler(() => { qc.clear(); setSessionState(null) })
    return () => setSessionLostHandler(null)
  }, [qc])

  const setLang = useCallback((l: Lang) => {
    setLangState(l); store('sanctuary.lang', l)
    if (session) api.patch<Session>('/auth/me', { language: l }).then(setSessionState).then(() => qc.invalidateQueries()).catch(() => {})
  }, [session, qc])
  const setTheme = useCallback((t: Theme) => {
    setThemeState(t); store('sanctuary.theme', t)
    if (session) api.patch<Session>('/auth/me', { theme: t }).then(setSessionState).catch(() => {})
  }, [session])

  const logout = useCallback(async () => {
    await api.post('/auth/logout').catch(() => {})
    qc.clear()
    setSessionState(null)
  }, [qc])

  const currency = session?.org.currency || 'USD'
  const value = useMemo<AppState>(() => {
    const locale = lang === 'es' ? 'es-US' : 'en-US'
    const full = new Intl.NumberFormat(locale, { style: 'currency', currency })
    const whole = new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 })
    const compact = new Intl.NumberFormat(locale, { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 })
    const number = new Intl.NumberFormat(locale)
    const styles = {
      short: { day: 'numeric', month: 'short', year: 'numeric' },
      long: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
      month: { month: 'long', year: 'numeric' },
    } as const
    return {
      session, loading, lang, theme, dark,
      tr: (es, en) => (lang === 'es' ? es : en),
      money: (n, o) => (o?.compact ? compact : o?.whole ? whole : full).format(n ?? 0),
      num: (n) => number.format(n),
      date: (iso, style = 'short') => {
        if (!iso) return '—'
        const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
        return new Date(y, m - 1, d).toLocaleDateString(locale, styles[style])
      },
      setLang, setTheme, setSession, refresh, logout,
    }
  }, [session, loading, lang, theme, dark, currency, setLang, setTheme, setSession, refresh, logout])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
