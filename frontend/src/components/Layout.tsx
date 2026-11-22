import { Suspense, useEffect, useState, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { ChartColumn, ClipboardList, HandCoins, History, Landmark, LifeBuoy, MessageSquareText, LayoutDashboard, LogOut, Menu, Moon, PiggyBank, Plus, Receipt, Search, Settings, ShieldCheck, Sparkles, Sun, Target, Users, X } from 'lucide-react'
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

function Item({ to, icon, children, badge, end }: { to: string; icon: ReactNode; children: ReactNode; badge?: ReactNode; end?: boolean }) {
  return (
    <NavLink
      to={to} end={end}
      className={({ isActive }) => cx(
        'flex items-center gap-3 min-h-12 [@media(max-height:860px)]:min-h-11 px-3.5 rounded-[11px] transition-colors duration-150',
        isActive ? 'bg-raised text-ink font-semibold' : 'text-ink-soft hover:bg-raised/60 hover:text-ink',
      )}
    >
      {({ isActive }) => (<>
        <span className={cx('shrink-0', isActive && 'text-accent-ink')} aria-hidden>{icon}</span>
        <span className="flex-1 truncate">{children}</span>
        {badge}
      </>)}
    </NavLink>
  )
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="px-3.5 mb-1.5 text-[0.76rem] font-semibold tracking-[0.08em] uppercase text-muted">{label}</p>
      <div className="grid gap-0.5">{children}</div>
    </div>
  )
}

export default function Layout() {
  const { session, tr, logout } = useApp()
  const openOffering = useOfferingForm()
  const [menu, setMenu] = useState(false)
  const [searching, setSearching] = useState(false)
  // Loaded once per visit so name pickers answer instantly and keep working if the internet drops.
  useMembers()
  useFunds()
  const loc = useLocation()
  useEffect(() => { setMenu(false); setSearching(false) }, [loc.pathname])
  if (!session) return null
  const { user, org, features } = session
  const first = user.full_name.split(' ')[0]

  const nav = (
    <nav className="flex flex-col gap-6 [@media(max-height:860px)]:gap-4 min-h-full" aria-label={tr('Menú principal', 'Main menu')}>
      <div className="flex items-center gap-3 px-2 pt-1">
        {org.logo_file ? <img src={fileUrl(org.logo_file)} alt="" className="size-11 object-contain" /> : <Logo size={44} />}
        <div className="min-w-0">
          <p className="font-display text-[1.25rem] leading-none">Sanctuary</p>
          <p className="text-muted text-[0.82rem] truncate mt-1" title={org.name}>{org.name}</p>
        </div>
      </div>
      <div className="flex-1 grid content-start gap-6 [@media(max-height:860px)]:gap-3.5 -mx-1 px-1">
        <Group label={tr('Principal', 'Main')}>
          <Item to="/" end icon={<LayoutDashboard size={21} />}>{tr('Inicio', 'Home')}</Item>
          <Item to="/ofrendas" icon={<HandCoins size={21} />}>{tr('Ofrendas', 'Offerings')}</Item>
          <Item to="/conteos" icon={<ClipboardList size={21} />}>{tr('Conteos', 'Counts')}</Item>
          <Item to="/miembros" icon={<Users size={21} />}>{tr('Miembros', 'Members')}</Item>
          <Item to="/mensajes" icon={<MessageSquareText size={21} />}>{tr('Mensajes', 'Messages')}</Item>
        </Group>
        <Group label={tr('Finanzas', 'Finances')}>
          <Item to="/depositos" icon={<PiggyBank size={21} />}>{tr('Depósitos', 'Deposits')}</Item>
          <Item to="/gastos" icon={<Receipt size={21} />}>{tr('Gastos y presupuesto', 'Expenses & budget')}</Item>
        </Group>
        <Group label={tr('Análisis', 'Insights')}>
          <Item to="/informes" icon={<ChartColumn size={21} />}>{tr('Informes', 'Reports')}</Item>
          <Item to="/impuestos" icon={<Landmark size={21} />}>{tr('Impuestos', 'Taxes')}</Item>
          <Item to="/metas" icon={<Target size={21} />}>{tr('Metas', 'Goals')}</Item>
          <Item to="/asistente" icon={<Sparkles size={21} />} badge={features.ai ? <span className="text-[0.72rem] font-bold px-2 py-0.5 rounded-full bg-accent-soft text-accent-ink">IA</span> : undefined}>
            {tr('Asistente', 'Assistant')}
          </Item>
        </Group>
        <Group label="General">
          <Item to="/actividad" icon={<History size={21} />}>{tr('Actividad', 'Activity')}</Item>
          <Item to="/configuracion" icon={<Settings size={21} />}>{tr('Configuración', 'Settings')}</Item>
          <Item to="/ayuda" icon={<LifeBuoy size={21} />}>{tr('Ayuda', 'Help')}</Item>
          <Item to="/privacidad" icon={<ShieldCheck size={21} />}>{tr('Privacidad', 'Privacy')}</Item>
        </Group>
      </div>
      <div className="xl:hidden px-2"><TextSize /></div>
      <div className="border-t border-line pt-3 -mx-1 px-1">
        <NavLink to="/configuracion?tab=perfil" className="flex items-center gap-3 p-2 rounded-[11px] hover:bg-raised transition-colors">
          <Avatar name={user.full_name} file={user.avatar_file} size={40} />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold text-[0.95rem] leading-tight">{user.full_name}</span>
            <span className="block truncate text-muted text-[0.8rem]">{user.email}</span>
          </span>
        </NavLink>
        <button type="button" onClick={logout} className="mt-1 w-full flex items-center gap-3 min-h-11 px-3.5 rounded-[11px] text-ink-soft hover:bg-raised hover:text-ink transition-colors">
          <LogOut size={20} aria-hidden />{tr('Cerrar sesión', 'Sign out')}
        </button>
      </div>
    </nav>
  )

  return (
    <div className="min-h-dvh lg:pl-[17rem]">
      <a href="#contenido" className="sr-only focus:not-sr-only focus:fixed focus:z-50 focus:top-3 focus:left-3 focus:bg-accent focus:text-on-accent focus:px-4 focus:py-2 focus:rounded-lg">
        {tr('Saltar al contenido', 'Skip to content')}
      </a>
      <aside className="hidden lg:block fixed inset-y-0 left-0 w-[17rem] border-r border-line bg-surface p-4 overflow-y-auto overscroll-contain no-print">{nav}</aside>

      {menu && (
        <div className="lg:hidden fixed inset-0 z-40 no-print">
          <div className="absolute inset-0 bg-[oklch(0.15_0.01_60/0.55)]" onClick={() => setMenu(false)} />
          <aside className="rise absolute inset-y-0 left-0 w-[min(300px,88vw)] bg-surface border-r border-line p-4 overflow-y-auto overscroll-contain">
            <IconButton label={tr('Cerrar menú', 'Close menu')} onClick={() => setMenu(false)} className="absolute right-2 top-3"><X size={22} /></IconButton>
            {nav}
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
          <span className="hidden xl:inline-flex"><TextSize /></span>
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
