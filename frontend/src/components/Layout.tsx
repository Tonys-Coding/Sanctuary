import { Suspense, useEffect, useState, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { ChartColumn, ClipboardList, HandCoins, History, Landmark, LifeBuoy, MessageSquareText, LayoutDashboard, LogOut, Menu, Moon, PanelLeftClose, PanelLeftOpen, PiggyBank, Plus, Receipt, Search, Settings, ShieldCheck, Sparkles, Sun, Target, Users, X } from 'lucide-react'
import { useApp } from '../lib/app'
import { fileUrl } from '../lib/api'
import { Avatar, Button, IconButton, Spinner, cx } from './ui'
import { useOfferingForm } from './OfferingForm'
import { GlobalSearch } from './GlobalSearch'
import { useFunds, useMembers } from '../lib/data'
import { IdleGuard } from './IdleGuard'
import { TextSize } from './TextSize'
import { OfflineBanner } from './Offline'

export function Logo({ size = 40, className }: { size?: number; className?: string }) {
  return <img src="/brand/logo.svg" alt="" width={size} height={size} className={className} />
}

export function LangToggle() {
  const { lang, setLang } = useApp()
  return (
    <div className="inline-flex p-1 rounded-full bg-raised" role="group" aria-label="Idioma / Language">
      {(['es', 'en'] as const).map((l) => (
        <button key={l} type="button" onClick={() => setLang(l)} aria-pressed={lang === l} title={l === 'es' ? 'Español' : 'English'}
          className={cx('min-h-9 min-w-11 px-2.5 rounded-full text-[0.85rem] font-semibold uppercase transition-colors', lang === l ? 'bg-surface text-ink shadow-card' : 'text-muted hover:text-ink')}>
          {l}
        </button>
      ))}
    </div>
  )
}

export function ThemeToggle() {
  const { dark, setTheme, tr } = useApp()
  return (
    <IconButton label={dark ? tr('Cambiar a modo claro', 'Switch to light mode') : tr('Cambiar a modo oscuro', 'Switch to dark mode')} onClick={() => setTheme(dark ? 'light' : 'dark')}>
      {dark ? <Sun size={21} /> : <Moon size={21} />}
    </IconButton>
  )
}

function Item({ to, icon, children, badge, end, compact }: { to: string; icon: ReactNode; children: string; badge?: ReactNode; end?: boolean; compact?: boolean }) {
  return (
    <NavLink
      to={to} end={end} title={compact ? children : undefined}
      className={({ isActive }) => cx(
        'flex items-center gap-3 min-h-12 [@media(max-height:860px)]:min-h-11 rounded-[11px] transition-colors duration-150',
        compact ? 'justify-center px-0' : 'px-3.5',
        isActive ? 'bg-raised text-ink font-semibold' : 'text-ink-soft hover:bg-raised/60 hover:text-ink',
      )}
    >
      {({ isActive }) => (<>
        <span className={cx('shrink-0', isActive && 'text-accent-ink')} aria-hidden>{icon}</span>
        <span className={compact ? 'sr-only' : 'flex-1 truncate'}>{children}</span>
        {!compact && badge}
      </>)}
    </NavLink>
  )
}

function Group({ label, children, compact }: { label: string; children: ReactNode; compact?: boolean }) {
  return (
    <div>
      {compact
        ? <p className="sr-only">{label}</p>
        : <p className="px-3.5 mb-1.5 text-[0.76rem] font-semibold tracking-[0.08em] uppercase text-muted">{label}</p>}
      <div className={cx('grid gap-0.5', compact && 'pt-2 border-t border-line first:border-t-0')}>{children}</div>
    </div>
  )
}

const FOLD_KEY = 'sanctuary.sidebar'
const loadFolded = () => { try { return localStorage.getItem(FOLD_KEY) === 'collapsed' } catch { return false } }

export default function Layout() {
  const { session, tr, logout } = useApp()
  const openOffering = useOfferingForm()
  const [menu, setMenu] = useState(false)
  const [searching, setSearching] = useState(false)
  // The side menu can be folded down to icons; remembered on this computer.
  const [folded, setFolded] = useState(loadFolded)
  const fold = (v: boolean) => { setFolded(v); try { localStorage.setItem(FOLD_KEY, v ? 'collapsed' : 'open') } catch { /* private mode */ } }
  // Loaded once per visit so name pickers answer instantly and keep working if the internet drops.
  useMembers()
  useFunds()
  const loc = useLocation()
  useEffect(() => { setMenu(false); setSearching(false) }, [loc.pathname])
  if (!session) return null
  const { user, org, features } = session
  const first = user.full_name.split(' ')[0]

  const nav = (compact: boolean, canFold: boolean) => (
    <nav className={cx('flex flex-col min-h-full', compact ? 'gap-4' : 'gap-6 [@media(max-height:860px)]:gap-4')} aria-label={tr('Menú principal', 'Main menu')}>
      {compact ? (
        <div className="grid justify-items-center gap-2 pt-1">
          {org.logo_file ? <img src={fileUrl(org.logo_file)} alt="" className="size-10 object-contain" /> : <Logo size={40} />}
          <IconButton label={tr('Mostrar el menú completo', 'Show the full menu')} onClick={() => fold(false)}><PanelLeftOpen size={21} /></IconButton>
        </div>
      ) : (
        <div className="flex items-center gap-3 px-2 pt-1">
          {org.logo_file ? <img src={fileUrl(org.logo_file)} alt="" className="size-11 object-contain" /> : <Logo size={44} />}
          <div className="min-w-0 flex-1">
            <p className="font-display text-[1.25rem] leading-none">Sanctuary</p>
            <p className="text-muted text-[0.82rem] truncate mt-1" title={org.name}>{org.name}</p>
          </div>
          {canFold && <IconButton label={tr('Achicar el menú', 'Make the menu smaller')} className="-mr-2 shrink-0" onClick={() => fold(true)}><PanelLeftClose size={21} /></IconButton>}
        </div>
      )}
      <div className={cx('flex-1 grid content-start', compact ? 'gap-2' : 'gap-6 [@media(max-height:860px)]:gap-3.5 -mx-1 px-1')}>
        <Group compact={compact} label={tr('Principal', 'Main')}>
          <Item compact={compact} to="/" end icon={<LayoutDashboard size={21} />}>{tr('Inicio', 'Home')}</Item>
          <Item compact={compact} to="/ofrendas" icon={<HandCoins size={21} />}>{tr('Ofrendas', 'Offerings')}</Item>
          <Item compact={compact} to="/conteos" icon={<ClipboardList size={21} />}>{tr('Conteos', 'Counts')}</Item>
          <Item compact={compact} to="/miembros" icon={<Users size={21} />}>{tr('Miembros', 'Members')}</Item>
          <Item compact={compact} to="/mensajes" icon={<MessageSquareText size={21} />}>{tr('Mensajes', 'Messages')}</Item>
        </Group>
        <Group compact={compact} label={tr('Finanzas', 'Finances')}>
          <Item compact={compact} to="/depositos" icon={<PiggyBank size={21} />}>{tr('Depósitos', 'Deposits')}</Item>
          <Item compact={compact} to="/gastos" icon={<Receipt size={21} />}>{tr('Gastos y presupuesto', 'Expenses & budget')}</Item>
        </Group>
        <Group compact={compact} label={tr('Análisis', 'Insights')}>
          <Item compact={compact} to="/informes" icon={<ChartColumn size={21} />}>{tr('Informes', 'Reports')}</Item>
          <Item compact={compact} to="/impuestos" icon={<Landmark size={21} />}>{tr('Impuestos', 'Taxes')}</Item>
          <Item compact={compact} to="/metas" icon={<Target size={21} />}>{tr('Metas', 'Goals')}</Item>
          <Item compact={compact} to="/asistente" icon={<Sparkles size={21} />} badge={features.ai ? <span className="text-[0.72rem] font-bold px-2 py-0.5 rounded-full bg-accent-soft text-accent-ink">IA</span> : undefined}>
            {tr('Asistente', 'Assistant')}
          </Item>
        </Group>
        <Group compact={compact} label="General">
          <Item compact={compact} to="/actividad" icon={<History size={21} />}>{tr('Actividad', 'Activity')}</Item>
          <Item compact={compact} to="/configuracion" icon={<Settings size={21} />}>{tr('Configuración', 'Settings')}</Item>
          <Item compact={compact} to="/ayuda" icon={<LifeBuoy size={21} />}>{tr('Ayuda', 'Help')}</Item>
          <Item compact={compact} to="/privacidad" icon={<ShieldCheck size={21} />}>{tr('Privacidad', 'Privacy')}</Item>
        </Group>
      </div>
      {!compact && <div className={cx('px-2', canFold && 'xl:hidden')}><TextSize /></div>}
      <div className={cx('border-t border-line pt-3', !compact && '-mx-1 px-1')}>
        <NavLink to="/configuracion?tab=perfil" title={compact ? user.full_name : undefined}
          className={cx('flex items-center gap-3 rounded-[11px] hover:bg-raised transition-colors', compact ? 'justify-center p-1.5' : 'p-2')}>
          <Avatar name={user.full_name} file={user.avatar_file} size={40} />
          <span className={compact ? 'sr-only' : 'min-w-0 flex-1'}>
            <span className="block truncate font-semibold text-[0.95rem] leading-tight">{user.full_name}</span>
            <span className="block truncate text-muted text-[0.8rem]">{user.email}</span>
          </span>
        </NavLink>
        {compact
          ? <IconButton label={tr('Cerrar sesión', 'Sign out')} className="mt-1 w-full" onClick={logout}><LogOut size={20} /></IconButton>
          : <button type="button" onClick={logout} className="mt-1 w-full flex items-center gap-3 min-h-11 px-3.5 rounded-[11px] text-ink-soft hover:bg-raised hover:text-ink transition-colors">
              <LogOut size={20} aria-hidden />{tr('Cerrar sesión', 'Sign out')}
            </button>}
      </div>
    </nav>
  )

  return (
    <div className={cx('min-h-dvh transition-[padding] duration-200', folded ? 'lg:pl-[5rem]' : 'lg:pl-[17rem]')}>
      <a href="#contenido" className="sr-only focus:not-sr-only focus:fixed focus:z-50 focus:top-3 focus:left-3 focus:bg-accent focus:text-on-accent focus:px-4 focus:py-2 focus:rounded-lg">
        {tr('Saltar al contenido', 'Skip to content')}
      </a>
      <aside className={cx('hidden lg:block fixed inset-y-0 left-0 border-r border-line bg-surface overflow-y-auto overscroll-contain no-print transition-[width] duration-200', folded ? 'w-[5rem] px-2.5 py-4' : 'w-[17rem] p-4')}>{nav(folded, true)}</aside>

      {menu && (
        <div className="lg:hidden fixed inset-0 z-40 no-print">
          <div className="absolute inset-0 bg-[oklch(0.15_0.01_60/0.55)]" onClick={() => setMenu(false)} />
          <aside className="rise absolute inset-y-0 left-0 w-[min(300px,88vw)] bg-surface border-r border-line p-4 overflow-y-auto overscroll-contain">
            <IconButton label={tr('Cerrar menú', 'Close menu')} onClick={() => setMenu(false)} className="absolute right-2 top-3"><X size={22} /></IconButton>
            {nav(false, false)}
          </aside>
        </div>
      )}

      <header className="sticky top-0 z-20 bg-bg/95 backdrop-blur-sm border-b border-line no-print">
        <div className="flex items-center gap-2 sm:gap-3 h-[4.2rem] px-4 sm:px-6 2xl:px-10">
          <IconButton label={tr('Abrir menú', 'Open menu')} onClick={() => setMenu(true)} className="lg:hidden -ml-2"><Menu size={24} /></IconButton>
          <p className="hidden xl:block text-[1.05rem] truncate shrink-0">
            {tr('Hola', 'Hello')}, <span className="font-semibold">{first}</span>
          </p>
          <div className="flex-1 min-w-0 hidden md:flex justify-center px-2 xl:px-4">
            <div className="w-full max-w-md"><GlobalSearch /></div>
          </div>
          <div className="flex-1 md:hidden" />
          <IconButton label={tr('Buscar', 'Search')} className="md:hidden" onClick={() => setSearching(true)}><Search size={22} /></IconButton>
          <span className={cx('hidden', folded ? 'lg:inline-flex' : 'xl:inline-flex')}><TextSize /></span>
          <LangToggle />
          <ThemeToggle />
          <Button variant="primary" icon={<Plus size={20} aria-hidden />} onClick={() => openOffering()}>
            <span className="hidden xl:inline">{tr('Registrar ofrenda', 'Record offering')}</span>
            <span className="xl:hidden">{tr('Ofrenda', 'Offering')}</span>
          </Button>
        </div>
      </header>
      {searching && <div className="md:hidden px-4 py-3 border-b border-line bg-surface no-print"><GlobalSearch /></div>}

      <IdleGuard />
      <OfflineBanner />
      <main id="contenido" className="px-4 sm:px-6 2xl:px-10 py-6 sm:py-8">
        <div className="max-w-[1560px] mx-auto"><Suspense fallback={<Spinner />}><Outlet /></Suspense></div>
      </main>
    </div>
  )
}
