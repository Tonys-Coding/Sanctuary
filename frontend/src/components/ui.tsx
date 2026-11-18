import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { ArrowDownRight, ArrowUpRight, Camera, Check, CircleAlert, Loader2, X } from 'lucide-react'
import { useApp } from '../lib/app'
import { fileUrl } from '../lib/api'
import { useErrorText } from '../lib/labels'

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ')

// ─── Buttons ─────────────────────────────────────────────────────────────────

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: 'md' | 'sm' | 'lg'
  icon?: ReactNode
  busy?: boolean
}
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-on-accent hover:bg-accent-hover font-semibold',
  secondary: 'bg-surface text-ink border-[1.5px] border-line-strong hover:bg-raised font-medium',
  ghost: 'text-ink-soft hover:bg-raised hover:text-ink font-medium',
  danger: 'bg-bad-soft text-bad hover:brightness-95 font-semibold',
}
const SIZES = { sm: 'min-h-10 px-3.5 text-[0.9rem] gap-1.5', md: 'min-h-12 px-5 gap-2', lg: 'min-h-14 px-7 text-[1.05rem] gap-2.5' }

export function Button({ variant = 'secondary', size = 'md', icon, busy, children, className, disabled, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || busy}
      className={cx(
        'inline-flex items-center justify-center rounded-[11px] whitespace-nowrap transition-[background-color,filter,transform] duration-150 ease-out active:scale-[0.98] disabled:opacity-55 disabled:active:scale-100',
        VARIANTS[variant], SIZES[size], className,
      )}
      {...rest}
    >
      {busy ? <Loader2 size={18} className="animate-[spin_0.8s_linear_infinite]" aria-hidden /> : icon}
      {children}
    </button>
  )
}

export function IconButton({ label, children, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx('inline-grid place-items-center size-11 rounded-[11px] text-ink-soft hover:bg-raised hover:text-ink transition-colors duration-150', className)}
      {...rest}
    >
      {children}
    </button>
  )
}

// ─── Form field ──────────────────────────────────────────────────────────────

export function Field({ label, hint, error, optional, children, className }: { label: string; hint?: string; error?: string; optional?: boolean; children: (id: string) => ReactNode; className?: string }) {
  const id = useId()
  const { tr } = useApp()
  return (
    <div className={className}>
      <label htmlFor={id} className="flex items-baseline gap-2 mb-1.5 font-semibold text-[0.95rem]">
        {label}
        {optional && <span className="font-normal text-muted text-[0.85rem]">{tr('opcional', 'optional')}</span>}
      </label>
      {children(id)}
      {error ? (
        <p className="mt-1.5 text-bad text-[0.9rem] flex items-center gap-1.5"><CircleAlert size={16} aria-hidden />{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-muted text-[0.88rem]">{hint}</p>
      ) : null}
    </div>
  )
}

/** A row of large choice buttons — easier to hit than a dropdown when there are only a few options. */
export function Choice<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; dot?: string }[]; label?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={o.value} type="button" role="radio" aria-checked={on} onClick={() => onChange(o.value)}
            className={cx(
              'min-h-11 px-4 rounded-full border-[1.5px] inline-flex items-center gap-2 transition-colors duration-150',
              on ? 'bg-accent-soft border-accent text-accent-ink font-semibold' : 'border-line-strong text-ink-soft hover:bg-raised',
            )}
          >
            {o.dot && <span className="size-2.5 rounded-full" style={{ background: o.dot }} aria-hidden />}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export function Tabs<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div role="tablist" className="inline-flex p-1 rounded-full bg-raised max-w-full overflow-x-auto">
      {options.map((o) => (
        <button
          key={o.value} role="tab" type="button" aria-selected={o.value === value} onClick={() => onChange(o.value)}
          className={cx('min-h-10 px-4 rounded-full text-[0.93rem] whitespace-nowrap transition-colors duration-150', o.value === value ? 'bg-surface text-ink font-semibold shadow-card' : 'text-muted hover:text-ink')}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ─── Layout pieces ───────────────────────────────────────────────────────────

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 mb-7">
      <div className="min-w-0">
        <h1 className="font-display text-[1.9rem] leading-tight">{title}</h1>
        {subtitle && <p className="text-muted mt-1 max-w-[65ch]">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2.5 no-print">{children}</div>}
    </header>
  )
}

export function Card({ title, hint, action, children, className, pad = true }: { title?: ReactNode; hint?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={cx('card', pad && 'p-5 sm:p-6', className)}>
      {(title || action) && (
        <div className={cx('flex flex-wrap items-start justify-between gap-3 mb-4', !pad && 'p-5 sm:p-6 !pb-0 mb-0')}>
          <div className="min-w-0 flex-1 basis-48">
            {title && <h2 className="font-semibold text-[1.05rem] leading-snug">{title}</h2>}
            {hint && <p className="text-muted text-[0.9rem] mt-0.5">{hint}</p>}
          </div>
          {action && <div className="max-w-full no-print">{action}</div>}
        </div>
      )}
      {children}
    </section>
  )
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'good' | 'bad' | 'warn' | 'accent'; children: ReactNode }) {
  const tones = { neutral: 'bg-raised text-ink-soft', good: 'bg-good-soft text-good', bad: 'bg-bad-soft text-bad', warn: 'bg-warn-soft text-warn', accent: 'bg-accent-soft text-accent-ink' }
  return <span className={cx('inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[0.82rem] font-semibold whitespace-nowrap', tones[tone])}>{children}</span>
}

/** Percentage change with an arrow, so direction never depends on colour alone. */
export function Delta({ value, suffix }: { value: number | null | undefined; suffix?: string }) {
  if (value == null) return null
  const up = value >= 0
  return (
    <Badge tone={up ? 'good' : 'bad'}>
      {up ? <ArrowUpRight size={15} aria-hidden /> : <ArrowDownRight size={15} aria-hidden />}
      {up ? '+' : '−'}{Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 1 })}%{suffix ? ` ${suffix}` : ''}
    </Badge>
  )
}

export function Empty({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="text-center py-12 px-6 max-w-md mx-auto">
      {icon && <div className="inline-grid place-items-center size-14 rounded-full bg-accent-soft text-accent-ink mb-4">{icon}</div>}
      <h3 className="font-semibold text-[1.1rem]">{title}</h3>
      {children && <p className="text-muted mt-1.5">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function Spinner({ label }: { label?: string }) {
  const { tr } = useApp()
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-muted" role="status">
      <Loader2 className="animate-[spin_0.8s_linear_infinite]" aria-hidden />
      {label || tr('Cargando…', 'Loading…')}
    </div>
  )
}

export function ErrorNote({ error, className }: { error: unknown; className?: string }) {
  const text = useErrorText()
  if (!error) return null
  return (
    <p role="alert" className={cx('flex items-start gap-2 rounded-[11px] bg-bad-soft text-bad px-4 py-3', className)}>
      <CircleAlert size={20} className="shrink-0 mt-0.5" aria-hidden />
      <span>{typeof error === 'string' ? error : text(error)}</span>
    </p>
  )
}

// ─── Avatar ──────────────────────────────────────────────────────────────────

const HUES = [28, 55, 85, 150, 200, 250, 300, 345]
export function Avatar({ name, file, size = 44, className }: { name?: string | null; file?: string | null; size?: number; className?: string }) {
  const initials = (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()
  const hue = HUES[[...(name || '')].reduce((a, c) => a + c.charCodeAt(0), 0) % HUES.length]
  const style = { width: size, height: size, fontSize: size * 0.38 }
  if (file) return <img src={fileUrl(file)} alt="" style={style} className={cx('rounded-full object-cover shrink-0 bg-raised', className)} />
  return (
    <span aria-hidden style={{ ...style, background: `oklch(0.9 0.05 ${hue})`, color: `oklch(0.36 0.09 ${hue})` }} className={cx('rounded-full inline-grid place-items-center font-bold shrink-0 select-none', className)}>
      {initials}
    </span>
  )
}

/** Avatar with a camera button for choosing a new photo. */
export function AvatarPicker({ name, file, onPick, busy, size = 104 }: { name?: string; file?: string | null; onPick: (f: File) => void; busy?: boolean; size?: number }) {
  const { tr } = useApp()
  const input = useRef<HTMLInputElement>(null)
  return (
    <div className="relative inline-block">
      <Avatar name={name} file={file} size={size} />
      <button
        type="button" onClick={() => input.current?.click()} disabled={busy}
        aria-label={tr('Cambiar foto', 'Change photo')} title={tr('Cambiar foto', 'Change photo')}
        className="absolute -bottom-1 -right-1 size-11 rounded-full bg-accent text-on-accent grid place-items-center border-[3px] border-surface hover:bg-accent-hover transition-colors"
      >
        {busy ? <Loader2 size={18} className="animate-[spin_0.8s_linear_infinite]" /> : <Camera size={19} />}
      </button>
      <input
        ref={input} type="file" accept="image/*" hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = '' }}
      />
    </div>
  )
}

// ─── Modal ───────────────────────────────────────────────────────────────────

export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean | 'xl' }) {
  const ref = useRef<HTMLDialogElement>(null)
  const { tr } = useApp()
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  if (!open) return null
  return (
    <dialog
      ref={ref}
      onCancel={(e) => { e.preventDefault(); onClose() }}
      onMouseDown={(e) => { if (e.target === ref.current) onClose() }}
      className={cx('rise m-auto p-0 w-[calc(100%-24px)] bg-surface border border-line rounded-[18px] shadow-card max-h-[calc(100dvh-24px)] overflow-hidden', wide === 'xl' ? 'max-w-6xl' : wide ? 'max-w-3xl' : 'max-w-xl')}
    >
      <div className="flex flex-col max-h-[calc(100dvh-24px)]">
        <div className="flex items-center justify-between gap-4 pl-6 pr-3 py-3 border-b border-line">
          <h2 className="font-display text-[1.3rem]">{title}</h2>
          <IconButton label={tr('Cerrar', 'Close')} onClick={onClose}><X size={22} /></IconButton>
        </div>
        <div className="p-6 overflow-y-auto">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2.5 px-6 py-4 border-t border-line bg-bg">{footer}</div>}
      </div>
    </dialog>
  )
}

// ─── Toasts & confirmation ───────────────────────────────────────────────────

interface ToastAction { label: string; run: () => void }
interface Toast { id: number; text: string; tone: 'good' | 'bad'; action?: ToastAction }
interface ConfirmOptions { title: string; body?: string; confirm: string; danger?: boolean }
interface Feedback {
  toast: (text: string, tone?: 'good' | 'bad', action?: ToastAction) => void
  fail: (e: unknown) => void
  confirm: (o: ConfirmOptions) => Promise<boolean>
}
const FeedbackCtx = createContext<Feedback>(null as unknown as Feedback)
export const useFeedback = () => useContext(FeedbackCtx)

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const { tr } = useApp()
  const errorText = useErrorText()
  const [toasts, setToasts] = useState<Toast[]>([])
  const [ask, setAsk] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null)

  const toast = useCallback((text: string, tone: 'good' | 'bad' = 'good', action?: ToastAction) => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t.slice(-2), { id, text, tone, action }])
    // Messages with an "undo" stay longer, so there is time to read and react.
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), action ? 8000 : tone === 'bad' ? 7000 : 4000)
  }, [])
  const fail = useCallback((e: unknown) => toast(errorText(e), 'bad'), [toast, errorText])
  const confirm = useCallback((o: ConfirmOptions) => new Promise<boolean>((resolve) => setAsk({ ...o, resolve })), [])
  const answer = (v: boolean) => { ask?.resolve(v); setAsk(null) }

  return (
    <FeedbackCtx.Provider value={{ toast, fail, confirm }}>
      {children}
      <Modal
        open={!!ask} onClose={() => answer(false)} title={ask?.title || ''}
        footer={<>
          <Button onClick={() => answer(false)}>{tr('Cancelar', 'Cancel')}</Button>
          <Button variant={ask?.danger ? 'danger' : 'primary'} onClick={() => answer(true)}>{ask?.confirm}</Button>
        </>}
      >
        <p className="text-ink-soft">{ask?.body}</p>
      </Modal>
      <div className="fixed z-[100] bottom-5 inset-x-0 flex flex-col items-center gap-2 px-4 pointer-events-none no-print" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={cx('rise pointer-events-auto flex items-center gap-2.5 px-5 py-3.5 rounded-[14px] shadow-card font-medium max-w-lg', t.tone === 'good' ? 'bg-ink text-bg' : 'bg-bad text-surface')}>
            {t.tone === 'good' ? <Check size={20} aria-hidden /> : <CircleAlert size={20} aria-hidden />}
            <span>{t.text}</span>
            {t.action && (
              <button type="button" className="ml-2 -my-1 px-3 py-1.5 rounded-lg font-bold underline underline-offset-4 hover:bg-white/10"
                onClick={() => { t.action!.run(); setToasts((all) => all.filter((x) => x.id !== t.id)) }}>
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </FeedbackCtx.Provider>
  )
}

// ─── Table ───────────────────────────────────────────────────────────────────

export function Th({ children, right, className }: { children?: ReactNode; right?: boolean; className?: string }) {
  return <th className={cx('px-4 py-3 text-[0.82rem] font-semibold text-muted uppercase tracking-wide whitespace-nowrap', right ? 'text-right' : 'text-left', className)}>{children}</th>
}
export function Td({ children, right, className }: { children?: ReactNode; right?: boolean; className?: string }) {
  return <td className={cx('px-4 py-3 align-middle', right && 'text-right', className)}>{children}</td>
}
