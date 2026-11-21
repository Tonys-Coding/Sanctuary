import { useMemo, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ChevronRight, HeartHandshake, LayoutGrid, List, Mail, Phone, Plus, Search, TriangleAlert, UserPlus, Users, X } from 'lucide-react'
import { useApp } from '../lib/app'
import { DuplicatesBanner } from '../components/MemberExtras'
import { useMembers } from '../lib/data'
import { useLabels } from '../lib/labels'
import type { Member } from '../lib/types'
import { Avatar, Badge, Button, Card, Empty, PageHeader, Spinner, cx } from '../components/ui'
import { MemberForm } from '../components/MemberForm'
import { useOfferingForm } from '../components/OfferingForm'

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
type Filter = 'todos' | 'active' | 'visitor' | 'inactive' | 'sin-ofrendar' | 'faltan-datos'
type Sort = 'name' | 'year' | 'recent' | 'oldest'
const tone = { active: 'good', visitor: 'accent', inactive: 'neutral' } as const
const store = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* private mode */ } }
const stored = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }

/** What a member is missing for statements and e-mails. */
function missing(m: Member) {
  const out: ('email' | 'address')[] = []
  if (!m.email) out.push('email')
  if (!m.address || !m.city) out.push('address')
  return out
}

function MemberCard({ m }: { m: Member }) {
  const { tr, money, date } = useApp()
  const labels = useLabels()
  const record = useOfferingForm()
  const gaps = m.status === 'visitor' ? [] : missing(m)
  return (
    <article className="card p-5 flex flex-col gap-4 hover:border-line-strong transition-colors">
      <header className="flex items-center gap-3.5">
        <Avatar name={m.full_name} file={m.avatar_file} size={56} />
        <div className="min-w-0 flex-1">
          <Link to={`/miembros/${m.id}`} className="block font-semibold text-[1.12rem] leading-snug hover:underline underline-offset-4 truncate">{m.full_name}</Link>
          <p className="text-ink-soft text-[0.92rem] truncate">
            {labels.role(m.church_role)}{m.envelope_number ? ` · ${tr('Sobre', 'Envelope')} ${m.envelope_number}` : ''}
          </p>
          {m.status !== 'active' && <div className="mt-1"><Badge tone={tone[m.status]}>{labels.status(m.status)}</Badge></div>}
        </div>
      </header>

      <div className="rounded-[12px] bg-bg px-4 py-3">
        <p className="text-ink-soft text-[0.9rem]">{tr('Este año', 'This year')}</p>
        <p className="font-bold text-[1.5rem] leading-tight tabular-nums">{money(m.total_year, { whole: true })}</p>
        <p className="text-ink-soft text-[0.9rem] mt-1">
          {m.offering_count === 0
            ? tr('Todavía no tiene ofrendas', 'No offerings yet')
            : <>{tr('Última ofrenda', 'Last gift')}: <span className="font-semibold text-ink">{m.last_date ? date(m.last_date) : '—'}</span> · {tr(`dio en ${m.months_given} de 12 meses`, `gave in ${m.months_given} of 12 months`)}</>}
        </p>
      </div>

      {(m.phone || m.email) && (
        <ul className="grid gap-1 text-[0.95rem] text-ink-soft -mt-1">
          {m.phone && <li className="flex items-center gap-2 min-w-0"><Phone size={16} className="text-muted shrink-0" aria-hidden /><a href={`tel:${m.phone}`} className="truncate hover:underline">{m.phone}</a></li>}
          {m.email && <li className="flex items-center gap-2 min-w-0"><Mail size={16} className="text-muted shrink-0" aria-hidden /><a href={`mailto:${m.email}`} className="truncate hover:underline">{m.email}</a></li>}
        </ul>
      )}

      {gaps.length > 0 && (
        <p className="flex items-start gap-2 text-warn text-[0.9rem] -mt-1">
          <TriangleAlert size={16} className="shrink-0 mt-0.5" aria-hidden />
          {tr('Falta', 'Missing')} {gaps.map((g) => (g === 'email' ? tr('correo', 'e-mail') : tr('dirección', 'address'))).join(tr(' y ', ' and '))} {tr('para su constancia', 'for their statement')}
        </p>
      )}

      <footer className="flex gap-2 mt-auto">
        <Button size="sm" variant="primary" className="flex-1" icon={<Plus size={17} />} onClick={() => record({ memberId: m.id })}>{tr('Ofrenda', 'Offering')}</Button>
        <Link to={`/miembros/${m.id}`} className="flex-1"><Button size="sm" className="w-full">{tr('Ver perfil', 'Open profile')}</Button></Link>
      </footer>
    </article>
  )
}

export default function Members() {
  const { tr, money, date, num } = useApp()
  const labels = useLabels()
  const { data: members, isPending } = useMembers()
  const [params, setParams] = useSearchParams()
  const filter = (params.get('filtro') as Filter) || 'todos'
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<Sort>(() => (stored('sanctuary.members.sort') as Sort) || 'name')
  const [view, setView] = useState<'cards' | 'list'>(() => (stored('sanctuary.members.view') === 'list' ? 'list' : 'cards'))
  const [adding, setAdding] = useState(false)
  const setFilter = (f: Filter) => setParams(f === 'todos' ? {} : { filtro: f }, { replace: true })

  const cutoff = useMemo(() => { const d = new Date(); d.setDate(d.getDate() - 60); return d.toISOString().slice(0, 10) }, [])
  const list = useMemo(() => {
    const n = norm(search.trim())
    const out = (members || []).filter((m) => {
      if (n && !norm(m.full_name).includes(n) && m.envelope_number !== search.trim() && !(m.email || '').includes(n) && !(m.phone || '').includes(search.trim())) return false
      if (filter === 'sin-ofrendar') return m.status === 'active' && m.offering_count > 0 && (m.last_date || '') < cutoff
      if (filter === 'faltan-datos') return m.status !== 'visitor' && m.total_year > 0 && missing(m).length > 0
      return filter === 'todos' || m.status === filter
    })
    const by: Record<Sort, (a: Member, b: Member) => number> = {
      name: (a, b) => a.full_name.localeCompare(b.full_name),
      year: (a, b) => b.total_year - a.total_year,
      recent: (a, b) => (b.last_date || '').localeCompare(a.last_date || ''),
      oldest: (a, b) => (a.last_date || '9999').localeCompare(b.last_date || '9999'),
    }
    return out.sort(by[sort])
  }, [members, search, filter, cutoff, sort])

  const count = (f: Filter) => (members || []).filter((m) =>
    f === 'sin-ofrendar' ? m.status === 'active' && m.offering_count > 0 && (m.last_date || '') < cutoff
      : f === 'faltan-datos' ? m.status !== 'visitor' && m.total_year > 0 && missing(m).length > 0
        : f === 'todos' || m.status === f).length

  return (
    <>
      <PageHeader title={tr('Miembros', 'Members')}
        subtitle={members ? tr(`${num(members.length)} personas: ${count('active')} activas, ${count('visitor')} visitantes y ${count('inactive')} inactivas.`, `${num(members.length)} people: ${count('active')} active, ${count('visitor')} visitors and ${count('inactive')} inactive.`) : undefined}>
        <Button variant="primary" icon={<UserPlus size={20} />} onClick={() => setAdding(true)}>{tr('Nuevo miembro', 'New member')}</Button>
      </PageHeader>

      <DuplicatesBanner />

      {members && (count('sin-ofrendar') > 0 || count('faltan-datos') > 0) && (
        <section aria-label={tr('Requieren atención', 'Need attention')} className="flex flex-wrap gap-2.5 mb-5">
          {([
            ['sin-ofrendar', <HeartHandshake size={19} key="h" />, count('sin-ofrendar') === 1 ? tr('1 persona no ofrenda desde hace 2 meses', '1 person has not given in 2 months') : tr(`${count('sin-ofrendar')} personas no ofrendan desde hace 2 meses`, `${count('sin-ofrendar')} people have not given in 2 months`)],
            ['faltan-datos', <TriangleAlert size={19} key="t" />, count('faltan-datos') === 1 ? tr('1 persona sin correo o dirección para su constancia', '1 person missing e-mail or address for their statement') : tr(`${count('faltan-datos')} personas sin correo o dirección para su constancia`, `${count('faltan-datos')} people missing e-mail or address for their statement`)],
          ] as [Filter, ReactNode, string][]).filter(([f]) => count(f) > 0).map(([f, icon, text]) => {
            const on = filter === f
            return (
              <button key={f} type="button" aria-pressed={on} onClick={() => setFilter(on ? 'todos' : f)}
                className={cx('inline-flex items-center gap-2.5 min-h-12 px-4 rounded-full font-semibold transition-colors text-left',
                  on ? 'bg-warn-soft border-[1.5px] border-warn text-ink' : 'bg-surface border border-line hover:border-accent')}>
                <span className="text-warn" aria-hidden>{icon}</span>{text}
                {on && <X size={17} className="text-muted" aria-label={tr('Quitar filtro', 'Clear filter')} />}
              </button>
            )
          })}
        </section>
      )}

      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div className="relative flex-[2_1_18rem] max-w-xl">
          <Search size={19} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" aria-hidden />
          <input className="ctl !pl-11" placeholder={tr('Buscar por nombre, teléfono, correo o n.º de sobre', 'Search by name, phone, e-mail or envelope no.')} aria-label={tr('Buscar', 'Search')} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <label className="flex-[1_1_12rem] max-w-xs grid gap-1">
          <span className="text-ink-soft text-[0.9rem]">{tr('Mostrar', 'Show')}</span>
          <select className="ctl" value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
            <option value="todos">{tr(`Todos (${count('todos')})`, `Everyone (${count('todos')})`)}</option>
            <option value="active">{tr(`Activos (${count('active')})`, `Active (${count('active')})`)}</option>
            <option value="visitor">{tr(`Visitantes (${count('visitor')})`, `Visitors (${count('visitor')})`)}</option>
            <option value="inactive">{tr(`Inactivos (${count('inactive')})`, `Inactive (${count('inactive')})`)}</option>
            <option value="sin-ofrendar">{tr(`Sin ofrendar en 2 meses (${count('sin-ofrendar')})`, `No gift in 2 months (${count('sin-ofrendar')})`)}</option>
            <option value="faltan-datos">{tr(`Les faltan datos (${count('faltan-datos')})`, `Missing details (${count('faltan-datos')})`)}</option>
          </select>
        </label>
        <label className="flex-[1_1_12rem] max-w-xs grid gap-1">
          <span className="text-ink-soft text-[0.9rem]">{tr('Ordenar por', 'Sort by')}</span>
          <select className="ctl" value={sort} onChange={(e) => { setSort(e.target.value as Sort); store('sanctuary.members.sort', e.target.value) }}>
            <option value="name">{tr('Nombre', 'Name')}</option>
            <option value="year">{tr('Más ofrendado este año', 'Most given this year')}</option>
            <option value="recent">{tr('Ofrenda más reciente', 'Most recent gift')}</option>
            <option value="oldest">{tr('Más tiempo sin ofrendar', 'Longest since last gift')}</option>
          </select>
        </label>
        <div className="inline-flex p-1 rounded-full bg-raised ml-auto" role="group" aria-label={tr('Vista', 'View')}>
          {([['cards', <LayoutGrid size={18} key="g" />, tr('Tarjetas', 'Cards')], ['list', <List size={18} key="l" />, tr('Lista', 'List')]] as const).map(([v, icon, label]) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => { setView(v); store('sanctuary.members.view', v) }}
              className={cx('min-h-10 px-3.5 rounded-full inline-flex items-center gap-2 text-[0.95rem] transition-colors', view === v ? 'bg-surface shadow-card font-semibold' : 'text-ink-soft hover:text-ink')}>
              {icon}<span>{label}</span>
            </button>
          ))}
        </div>
      </div>
      {members && (filter !== 'todos' || search.trim()) && (
        <p className="text-ink-soft mb-4" role="status">
          {list.length === 1 ? tr('1 persona coincide.', '1 person matches.') : tr(`${num(list.length)} personas coinciden.`, `${num(list.length)} people match.`)}{' '}
          <button type="button" className="text-accent-ink font-semibold underline underline-offset-4" onClick={() => { setFilter('todos'); setSearch('') }}>{tr('Ver a todos', 'Show everyone')}</button>
        </p>
      )}

      {isPending ? <Spinner /> : list.length === 0 ? (
        <Card>
          <Empty icon={<Users size={28} />} title={members?.length ? tr('Nadie coincide con la búsqueda', 'Nobody matches the search') : tr('Aún no hay miembros', 'No members yet')}
            action={!members?.length && <Button variant="primary" onClick={() => setAdding(true)}>{tr('Agregar el primero', 'Add the first one')}</Button>}>
            {members?.length ? tr('Revisa la ortografía o cambia el filtro.', 'Check the spelling or change the filter.') : tr('Agrega a las personas de tu iglesia para registrar sus ofrendas con nombre. También puedes importarlas desde Excel en Configuración.', 'Add the people of your church to record their offerings by name. You can also import them from Excel in Settings.')}
          </Empty>
        </Card>
      ) : view === 'cards' ? (
        <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(min(100%,19rem),1fr))]">
          {list.map((m) => <MemberCard key={m.id} m={m} />)}
        </div>
      ) : (
        <Card pad={false}>
          <ul className="divide-y divide-line">
            {list.map((m) => (
              <li key={m.id}>
                <Link to={`/miembros/${m.id}`} className="flex items-center gap-4 px-5 sm:px-6 py-3.5 hover:bg-raised/60 transition-colors">
                  <Avatar name={m.full_name} file={m.avatar_file} size={48} />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{m.full_name}</p>
                    <p className="text-muted text-[0.88rem] truncate">
                      {labels.role(m.church_role)}{m.envelope_number ? ` · ${tr('Sobre', 'Envelope')} ${m.envelope_number}` : ''}{m.phone ? ` · ${m.phone}` : ''}
                    </p>
                  </div>
                  {m.status !== 'active' && <div className="hidden md:block"><Badge tone={tone[m.status]}>{labels.status(m.status)}</Badge></div>}
                  <div className="text-right w-32 hidden sm:block">
                    <p className="font-semibold">{money(m.total_year, { whole: true })}</p>
                    <p className="text-muted text-[0.85rem]">{tr('este año', 'this year')}</p>
                  </div>
                  <div className="text-right w-36 hidden lg:block">
                    <p>{m.last_date ? date(m.last_date) : '—'}</p>
                    <p className="text-muted text-[0.85rem]">{tr('última ofrenda', 'last gift')}</p>
                  </div>
                  <ChevronRight size={20} className="text-muted shrink-0" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <MemberForm open={adding} onClose={() => setAdding(false)} />
    </>
  )
}
