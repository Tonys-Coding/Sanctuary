import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Building2, CircleCheck, Eye, EyeOff, KeyRound } from 'lucide-react'
import { api } from '../lib/api'
import { useApp } from '../lib/app'
import type { Session } from '../lib/types'
import { Button, ErrorNote, Field, cx } from '../components/ui'
import { LangToggle, Logo, ThemeToggle } from '../components/Layout'

function Shell({ title, lead, children }: { title: string; lead?: string; children: ReactNode }) {
  const { tr } = useApp()
  return (
    <div className="min-h-dvh grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      {/* Brand panel: always dark, like the nave of a church with light coming through the glass. */}
      <aside data-theme="dark" className="hidden lg:flex flex-col justify-between p-12 bg-[oklch(0.19_0.012_60)] text-ink relative overflow-hidden">
        <div className="absolute -right-24 -bottom-24 opacity-[0.07] pointer-events-none" aria-hidden><Logo size={520} /></div>
        <div className="flex items-center gap-3">
          <Logo size={48} />
          <span className="font-display text-[1.6rem]">Sanctuary</span>
        </div>
        <div className="max-w-md relative">
          <p className="font-display text-[2.5rem] leading-[1.12]">{tr('Diezmos y ofrendas, en orden y a la vista.', 'Tithes and offerings, in order and in view.')}</p>
          <p className="text-ink-soft mt-5 text-[1.08rem]">
            {tr('Registra cada ofrenda en segundos, mira cómo va la iglesia mes a mes y entrega constancias sin abrir un cuaderno.',
              'Record every offering in seconds, see how the church is doing month by month, and hand out statements without opening a notebook.')}
          </p>
        </div>
        <p className="text-muted text-[0.9rem] italic max-w-md relative">
          {tr('«Cada uno dé como propuso en su corazón.» — 2 Corintios 9:7', '“Each of you should give what you have decided in your heart to give.” — 2 Corinthians 9:7')}
        </p>
      </aside>
      <main className="flex flex-col min-h-dvh">
        <div className="flex items-center justify-between gap-3 p-4 sm:p-6">
          <div className="flex items-center gap-2.5 lg:invisible"><Logo size={38} /><span className="font-display text-[1.3rem]">Sanctuary</span></div>
          <div className="flex items-center gap-1.5"><LangToggle /><ThemeToggle /></div>
        </div>
        <div className="flex-1 grid place-items-center px-5 pb-16">
          <div className="w-full max-w-[440px] rise">
            <h1 className="font-display text-[2rem] leading-tight">{title}</h1>
            {lead && <p className="text-muted mt-2">{lead}</p>}
            <div className="mt-8">{children}</div>
          </div>
        </div>
      </main>
    </div>
  )
}

function Password({ id, value, onChange, autoComplete }: { id: string; value: string; onChange: (v: string) => void; autoComplete: string }) {
  const [show, setShow] = useState(false)
  const { tr } = useApp()
  return (
    <div className="relative">
      <input id={id} className="ctl !pr-12" type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} required />
      <button type="button" onClick={() => setShow(!show)} aria-label={show ? tr('Ocultar contraseña', 'Hide password') : tr('Mostrar contraseña', 'Show password')}
        className="absolute right-1 top-1/2 -translate-y-1/2 size-10 grid place-items-center rounded-lg text-muted hover:text-ink">
        {show ? <EyeOff size={20} /> : <Eye size={20} />}
      </button>
    </div>
  )
}

export function LoginPage() {
  const { tr, setSession } = useApp()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [params] = useSearchParams()
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null)
    try { setSession(await api.post<Session>('/auth/login', { email, password })) } catch (err) { setError(err) } finally { setBusy(false) }
  }
  return (
    <Shell title={tr('Bienvenido de nuevo', 'Welcome back')} lead={tr('Entra para continuar con la tesorería de tu iglesia.', 'Sign in to continue with your church treasury.')}>
      <form onSubmit={submit} className="grid gap-5">
        {params.get('listo') && <p className="flex items-center gap-2 rounded-[11px] bg-good-soft text-good px-4 py-3"><CircleCheck size={20} />{tr('Contraseña actualizada. Ya puedes entrar.', 'Password updated. You can sign in now.')}</p>}
        <Field label={tr('Correo electrónico', 'E-mail')}>
          {(id) => <input id={id} className="ctl" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoFocus required />}
        </Field>
        <Field label={tr('Contraseña', 'Password')}>{(id) => <Password id={id} value={password} onChange={setPassword} autoComplete="current-password" />}</Field>
        <ErrorNote error={error} />
        <Button type="submit" variant="primary" size="lg" busy={busy}>{tr('Entrar', 'Sign in')}</Button>
        <div className="flex flex-wrap justify-between gap-3 text-[0.95rem]">
          <Link to="/recuperar" className="text-accent-ink font-semibold hover:underline underline-offset-4">{tr('Olvidé mi contraseña', 'I forgot my password')}</Link>
          <Link to="/registro" className="text-accent-ink font-semibold hover:underline underline-offset-4">{tr('Crear una cuenta', 'Create an account')}</Link>
        </div>
      </form>
    </Shell>
  )
}

export function RegisterPage() {
  const { tr, lang, setSession } = useApp()
  const [params] = useSearchParams()
  const [mode, setMode] = useState<'join' | 'create'>(params.get('nueva') ? 'create' : 'join')
  const [form, setForm] = useState({ inviteCode: params.get('codigo') || '', churchName: '', fullName: '', email: '', password: '' })
  const [church, setChurch] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }))

  // Show which church a code belongs to as soon as it looks complete, so people know they typed it right.
  const code = form.inviteCode.replace(/[^a-zA-Z0-9]/g, '')
  useEffect(() => {
    setChurch(null)
    if (mode !== 'join' || code.length < 8) return
    let live = true
    api.get(`/auth/invite/${code}`).then((r) => live && setChurch(r.churchName)).catch(() => {})
    return () => { live = false }
  }, [code, mode])

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null)
    try { setSession(await api.post<Session>('/auth/register', { ...form, mode, language: lang })) } catch (err) { setError(err) } finally { setBusy(false) }
  }
  const option = (m: 'join' | 'create', icon: ReactNode, title: string, text: string) => (
    <button type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)}
      className={cx('text-left p-4 rounded-[14px] border-[1.5px] transition-colors', mode === m ? 'border-accent bg-accent-soft' : 'border-line-strong hover:bg-raised')}>
      <span className={cx('block mb-2', mode === m ? 'text-accent-ink' : 'text-muted')}>{icon}</span>
      <span className="block font-semibold leading-snug">{title}</span>
      <span className="block text-muted text-[0.88rem] mt-0.5">{text}</span>
    </button>
  )
  return (
    <Shell title={tr('Crea tu cuenta', 'Create your account')}>
      <form onSubmit={submit} className="grid gap-5">
        <div role="radiogroup" className="grid grid-cols-2 gap-3">
          {option('join', <KeyRound size={24} />, tr('Tengo un código', 'I have a code'), tr('Mi iglesia ya usa Sanctuary', 'My church already uses Sanctuary'))}
          {option('create', <Building2 size={24} />, tr('Iglesia nueva', 'New church'), tr('Seré el primero en registrarla', 'I will be the first to register it'))}
        </div>
        {mode === 'join' ? (
          <Field label={tr('Código de invitación', 'Invitation code')} hint={church ? undefined : tr('Te lo da alguien del equipo de tesorería. Son 8 letras y números.', 'Someone on the treasury team gives it to you. It is 8 letters and numbers.')}>
            {(id) => (<>
              <input id={id} className="ctl uppercase tracking-[0.18em] font-semibold text-[1.15rem]" value={form.inviteCode} onChange={(e) => set('inviteCode')(e.target.value.toUpperCase())} placeholder="ABCD2345" autoCapitalize="characters" autoComplete="off" required />
              {church && <p className="mt-2 flex items-center gap-2 text-good font-medium"><CircleCheck size={19} />{tr('Te unirás a', 'You will join')} {church}</p>}
            </>)}
          </Field>
        ) : (
          <Field label={tr('Nombre de la iglesia', 'Church name')}>
            {(id) => <input id={id} className="ctl" value={form.churchName} onChange={(e) => set('churchName')(e.target.value)} required />}
          </Field>
        )}
        <Field label={tr('Tu nombre completo', 'Your full name')}>
          {(id) => <input id={id} className="ctl" value={form.fullName} onChange={(e) => set('fullName')(e.target.value)} autoComplete="name" required minLength={2} />}
        </Field>
        <Field label={tr('Correo electrónico', 'E-mail')}>
          {(id) => <input id={id} className="ctl" type="email" value={form.email} onChange={(e) => set('email')(e.target.value)} autoComplete="email" required />}
        </Field>
        <Field label={tr('Contraseña', 'Password')} hint={tr('Al menos 8 caracteres.', 'At least 8 characters.')}>
          {(id) => <Password id={id} value={form.password} onChange={set('password')} autoComplete="new-password" />}
        </Field>
        <ErrorNote error={error} />
        <Button type="submit" variant="primary" size="lg" busy={busy} disabled={form.password.length < 8}>{tr('Crear cuenta', 'Create account')}</Button>
        <p className="text-center text-[0.95rem] text-muted">
          {tr('¿Ya tienes cuenta?', 'Already have an account?')}{' '}
          <Link to="/entrar" className="text-accent-ink font-semibold hover:underline underline-offset-4">{tr('Entrar', 'Sign in')}</Link>
        </p>
      </form>
    </Shell>
  )
}

export function ForgotPage() {
  const { tr } = useApp()
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<{ emailConfigured: boolean } | null>(null)
  const [error, setError] = useState<unknown>(null)
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null)
    try { setDone(await api.post('/auth/forgot', { email })) } catch (err) { setError(err) } finally { setBusy(false) }
  }
  const back = <Link to="/entrar" className="inline-flex items-center gap-2 text-accent-ink font-semibold hover:underline underline-offset-4"><ArrowLeft size={18} />{tr('Volver a entrar', 'Back to sign in')}</Link>
  if (done) {
    return (
      <Shell title={tr('Revisa tu correo', 'Check your e-mail')}>
        <p className="text-ink-soft">
          {tr(`Si existe una cuenta para ${email}, enviamos un enlace para crear una contraseña nueva. Vence en 1 hora.`,
            `If there is an account for ${email}, we sent a link to choose a new password. It expires in 1 hour.`)}
        </p>
        {!done.emailConfigured && (
          <p className="mt-4 rounded-[11px] bg-warn-soft text-warn px-4 py-3">
            {tr('El correo todavía no está configurado en este servidor: pide a quien lo administra que busque el enlace en la consola del servidor.',
              'E-mail is not configured on this server yet: ask whoever runs it to look for the link in the server console.')}
          </p>
        )}
        <div className="mt-8">{back}</div>
      </Shell>
    )
  }
  return (
    <Shell title={tr('Recuperar contraseña', 'Reset your password')} lead={tr('Escribe tu correo y te enviaremos un enlace para crear una contraseña nueva.', 'Enter your e-mail and we will send you a link to choose a new password.')}>
      <form onSubmit={submit} className="grid gap-5">
        <Field label={tr('Correo electrónico', 'E-mail')}>
          {(id) => <input id={id} className="ctl" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoFocus required />}
        </Field>
        <ErrorNote error={error} />
        <Button type="submit" variant="primary" size="lg" busy={busy}>{tr('Enviar enlace', 'Send link')}</Button>
        {back}
      </form>
    </Shell>
  )
}

export function ResetPage() {
  const { tr, logout, session } = useApp()
  const [params] = useSearchParams()
  const nav = useNavigate()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null)
    try {
      await api.post('/auth/reset', { token: params.get('token') || '', password })
      if (session) await logout()
      nav('/entrar?listo=1', { replace: true })
    } catch (err) { setError(err) } finally { setBusy(false) }
  }
  return (
    <Shell title={tr('Crea una contraseña nueva', 'Choose a new password')}>
      <form onSubmit={submit} className="grid gap-5">
        <Field label={tr('Contraseña nueva', 'New password')} hint={tr('Al menos 8 caracteres.', 'At least 8 characters.')}>
          {(id) => <Password id={id} value={password} onChange={setPassword} autoComplete="new-password" />}
        </Field>
        <ErrorNote error={error} />
        <Button type="submit" variant="primary" size="lg" busy={busy} disabled={password.length < 8}>{tr('Guardar contraseña', 'Save password')}</Button>
      </form>
    </Shell>
  )
}
