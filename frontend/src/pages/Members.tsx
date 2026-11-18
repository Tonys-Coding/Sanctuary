import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ChevronRight, LayoutGrid, List, Mail, Phone, Plus, Search, TriangleAlert, UserPlus, Users } from 'lucide-react'
import { useApp } from '../lib/app'
import { useMembers } from '../lib/data'
import { useLabels } from '../lib/labels'
import type { Member } from '../lib/types'
import { Avatar, Badge, Button, Card, Empty, PageHeader, Spinner, Tabs, cx } from '../components/ui'
import { MemberForm } from '../components/MemberForm'
import { Sparkline } from '../components/charts'
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
      <header className="flex items-start gap-3.5">
        <Avatar name={m.full_name} file={m.avatar_file} size={60} />
        <div className="min-w-0 flex-1">
          <Link to={`/miembros/${m.id}`} className="block font-semibold text-[1.1rem] leading-snug hover:underline underline-offset-4 truncate">{m.full_name}</Link>
          <p className="text-muted text-[0.9rem] truncate">
            {labels.role(m.church_role)}{m.envelope_number ? ` · ${tr('Sobre', 'Envelope')} ${m.envelope_number}` : ''}
          </p>
          <div className="mt-1.5"><Badge tone={tone[m.status]}>{labels.status(m.status)}</Badge></div>
        </div>
      </header>

      <ul className="grid gap-1 text-[0.92rem] text-ink-soft">
        <li className="flex items-center gap-2 min-w-0"><Phone size={16} className="text-muted shrink-0" aria-hidden />
          {m.phone ? <a href={`tel:${m.phone}`} className="truncate hover:underline">{m.phone}</a> : <span className="text-muted">{tr('Sin teléfono', 'No phone')}</span>}
        </li>
        <li className="flex items-center gap-2 min-w-0"><Mail size={16} className="text-muted shrink-0" aria-hidden />
          {m.email ? <a href={`mailto:${m.email}`} className="truncate hover:underline">{m.email}</a> : <span className="text-muted">{tr('Sin correo', 'No e-mail')}</span>}
        </li>
      </ul>

      <dl className="grid grid-cols-2 gap-3 rounded-[12px] bg-bg p-3.5">
        <div>
          <dt className="text-muted text-[0.82rem]">{tr('Este año', 'This year')}</dt>
          <dd className="font-bold text-[1.2rem] leading-tight">{money(m.total_year)}</dd>
        </div>
        <div>
          <dt className="text-muted text-[0.82rem]">{tr('Última ofrenda', 'Last gift')}</dt>
          <dd className="font-semibold leading-tight mt-0.5">{m.last_date ? date(m.last_date) : '—'}</dd>
        </div>
        <div className="col-span-2">
          <Sparkline values={m.spark} height={30} label={tr('Ofrendas de los últimos 12 meses', 'Giving over the last 12 months')} />
          <p className="text-muted text-[0.82rem] mt-1">
            {m.offering_count === 0 ? tr('Todavía no tiene ofrendas registradas', 'No offerings recorded yet') : tr(`Ofrendó en ${m.months_given} de los últimos 12 meses`, `Gave in ${m.months_given} of the last 12 months`)}
          </p>
        </div>
      </dl>

      {gaps.length > 0 && (
        <p className="flex items-start gap-2 text-warn text-[0.88rem] -mt-1">
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
      <PageHeader title={tr('Miembros', 'Members')} subtitle={members ? tr(`${num(members.length)} personas en el directorio de la iglesia.`, `${num(members.length)} people in the church directory.`) : undefined}>
        <Button variant="primary" icon={<UserPlus size={20} />} onClick={() => setAdding(true)}>{tr('Nuevo miembro', 'New member')}</Button>
      </PageHeader>

      <div className="grid gap-3 mb-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[240px] max-w-xl">
            <Search size={19} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" aria-hidden />
            <input className="ctl !pl-11" placeholder={tr('Buscar por nombre, teléfono, correo o n.º de sobre', 'Search by name, phone, e-mail or envelope no.')} aria-label={tr('Buscar', 'Search')} value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <label className="flex items-center gap-2">
            <span className="text-muted whitespace-nowrap">{tr('Ordenar por', 'Sort by')}</span>
            <select className="ctl !w-auto" value={sort} onChange={(e) => { setSort(e.target.value as Sort); store('sanctuary.members.sort', e.target.value) }}>
              <option value="name">{tr('Nombre', 'Name')}</option>
              <option value="year">{tr('Más ofrendado este año', 'Most given this year')}</option>
              <option value="recent">{tr('Ofrenda más reciente', 'Most recent gift')}</option>
              <option value="oldest">{tr('Más tiempo sin ofrendar', 'Longest since last gift')}</option>
            </select>
          </label>
          <div className="inline-flex p-1 rounded-full bg-raised" role="group" aria-label={tr('Vista', 'View')}>
            {([['cards', <LayoutGrid size={18} key="g" />, tr('Tarjetas', 'Cards')], ['list', <List size={18} key="l" />, tr('Lista', 'List')]] as const).map(([v, icon, label]) => (
              <button key={v} type="button" aria-pressed={view === v} onClick={() => { setView(v); store('sanctuary.members.view', v) }}
                className={cx('min-h-10 px-3.5 rounded-full inline-flex items-center gap-2 text-[0.92rem] transition-colors', view === v ? 'bg-surface shadow-card font-semibold' : 'text-muted hover:text-ink')}>
                {icon}<span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
        </div>
        <Tabs value={filter} onChange={(v) => setParams(v === 'todos' ? {} : { filtro: v }, { replace: true })} options={[
          { value: 'todos', label: `${tr('Todos', 'All')} (${count('todos')})` },
          { value: 'active', label: `${tr('Activos', 'Active')} (${count('active')})` },
          { value: 'visitor', label: `${tr('Visitantes', 'Visitors')} (${count('visitor')})` },
          { value: 'inactive', label: `${tr('Inactivos', 'Inactive')} (${count('inactive')})` },
          { value: 'sin-ofrendar', label: `${tr('Sin ofrendar 60+ días', 'No gift in 60+ days')} (${count('sin-ofrendar')})` },
          { value: 'faltan-datos', label: `${tr('Faltan datos', 'Missing details')} (${count('faltan-datos')})` },
        ]} />
      </div>

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
                  <div className="hidden md:block"><Badge tone={tone[m.status]}>{labels.status(m.status)}</Badge></div>
                  <div className="w-36 hidden xl:block"><Sparkline values={m.spark} height={28} /></div>
                  <div className="text-right w-32 hidden sm:block">
                    <p className="font-semibold">{money(m.total_year)}</p>
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
