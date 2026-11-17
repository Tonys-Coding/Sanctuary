import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ChevronRight, Search, UserPlus, Users } from 'lucide-react'
import { useApp } from '../lib/app'
import { useMembers } from '../lib/data'
import { useLabels } from '../lib/labels'
import { Avatar, Badge, Button, Card, Empty, PageHeader, Spinner, Tabs } from '../components/ui'
import { MemberForm } from '../components/MemberForm'

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
type Filter = 'todos' | 'active' | 'visitor' | 'inactive' | 'sin-ofrendar'

export default function Members() {
  const { tr, money, date, num } = useApp()
  const labels = useLabels()
  const { data: members, isPending } = useMembers()
  const [params, setParams] = useSearchParams()
  const filter = (params.get('filtro') as Filter) || 'todos'
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)

  const cutoff = useMemo(() => { const d = new Date(); d.setDate(d.getDate() - 60); return d.toISOString().slice(0, 10) }, [])
  const list = useMemo(() => {
    const n = norm(search.trim())
    return (members || []).filter((m) => {
      if (n && !norm(m.full_name).includes(n) && m.envelope_number !== search.trim() && !(m.email || '').includes(n)) return false
      if (filter === 'sin-ofrendar') return m.status === 'active' && m.offering_count > 0 && (m.last_date || '') < cutoff
      return filter === 'todos' || m.status === filter
    })
  }, [members, search, filter, cutoff])

  const tone = { active: 'good', visitor: 'accent', inactive: 'neutral' } as const
  return (
    <>
      <PageHeader title={tr('Miembros', 'Members')} subtitle={members ? tr(`${num(members.length)} personas en el directorio de la iglesia.`, `${num(members.length)} people in the church directory.`) : undefined}>
        <Button variant="primary" icon={<UserPlus size={20} />} onClick={() => setAdding(true)}>{tr('Nuevo miembro', 'New member')}</Button>
      </PageHeader>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search size={19} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" aria-hidden />
          <input className="ctl !pl-11" placeholder={tr('Buscar por nombre, correo o n.º de sobre', 'Search by name, e-mail or envelope no.')} aria-label={tr('Buscar', 'Search')} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Tabs value={filter} onChange={(v) => setParams(v === 'todos' ? {} : { filtro: v }, { replace: true })} options={[
          { value: 'todos', label: tr('Todos', 'All') }, { value: 'active', label: tr('Activos', 'Active') }, { value: 'visitor', label: tr('Visitantes', 'Visitors') },
          { value: 'inactive', label: tr('Inactivos', 'Inactive') }, { value: 'sin-ofrendar', label: tr('Sin ofrendar 60+ días', 'No gift in 60+ days') },
        ]} />
      </div>

      <Card pad={false}>
        {isPending ? <Spinner /> : list.length === 0 ? (
          <Empty icon={<Users size={28} />} title={members?.length ? tr('Nadie coincide con la búsqueda', 'Nobody matches the search') : tr('Aún no hay miembros', 'No members yet')}
            action={!members?.length && <Button variant="primary" onClick={() => setAdding(true)}>{tr('Agregar el primero', 'Add the first one')}</Button>}>
            {members?.length ? tr('Revisa la ortografía o cambia el filtro.', 'Check the spelling or change the filter.') : tr('Agrega a las personas de tu iglesia para registrar sus ofrendas con nombre. También puedes importarlas desde Excel en Configuración.', 'Add the people of your church to record their offerings by name. You can also import them from Excel in Settings.')}
          </Empty>
        ) : (
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
        )}
      </Card>
      <MemberForm open={adding} onClose={() => setAdding(false)} />
    </>
  )
}
