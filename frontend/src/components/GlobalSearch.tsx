import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ClipboardList, HandCoins, Landmark, Receipt, Search } from 'lucide-react'
import { api } from '../lib/api'
import { useApp } from '../lib/app'
import { useLabels } from '../lib/labels'
import { Avatar, cx } from './ui'

interface Results {
  members: { id: string; name: string; envelope_number: string | null; email: string | null; avatar_file: string | null; archived_at: string | null }[]
  offerings: { id: string; date: string; amount: number; method: string; check_number: string | null; batch_id: string | null; fund: string; member_name: string }[]
  batches: { id: string; date: string; name: string; status: string }[]
  expenses: { id: string; date: string; payee: string; amount: number }[]
  deposits: { id: string; date: string; reference: string | null; status: string }[]
}
interface Item { key: string; group: string; icon: ReactNode; title: string; sub: string; to: string }

/**
 * The search box in the header: members by name, envelope, e-mail or phone; checks by number;
 * offerings by exact amount; counts, expenses and deposits. Press "/" anywhere to jump to it.
 */
export function GlobalSearch() {
  const { tr, money, date } = useApp()
  const labels = useLabels()
  const navigate = useNavigate()
  const [text, setText] = useState('')
  const [term, setTerm] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const box = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => { const t = setTimeout(() => setTerm(text.trim()), 220); return () => clearTimeout(t) }, [text])
  const { data, isFetching } = useQuery({ queryKey: ['search', term], queryFn: () => api.get<Results>(`/search?q=${encodeURIComponent(term)}`), enabled: term.length >= 2, placeholderData: (p) => p })

  useEffect(() => {
    const out = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const slash = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) && !el.isContentEditable) { e.preventDefault(); input.current?.focus() }
    }
    document.addEventListener('mousedown', out)
    document.addEventListener('keydown', slash)
    return () => { document.removeEventListener('mousedown', out); document.removeEventListener('keydown', slash) }
  }, [])

  const items = useMemo<Item[]>(() => {
    if (!data || term.length < 2) return []
    const g = { m: tr('Miembros', 'Members'), o: tr('Ofrendas', 'Offerings'), b: tr('Conteos', 'Counts'), e: tr('Gastos', 'Expenses'), d: tr('Depósitos', 'Deposits') }
    return [
      ...data.members.map((m) => ({ key: `m${m.id}`, group: g.m, icon: <Avatar name={m.name} file={m.avatar_file} size={30} />, title: m.name, sub: [m.envelope_number && `${tr('Sobre', 'Envelope')} ${m.envelope_number}`, m.email, m.archived_at && tr('Archivado', 'Archived')].filter(Boolean).join(' · '), to: `/miembros/${m.id}` })),
      ...data.offerings.map((o) => ({ key: `o${o.id}`, group: g.o, icon: <HandCoins size={20} />, title: `${money(o.amount)} · ${o.member_name || labels.loose}`, sub: [date(o.date), o.fund, labels.method(o.method), o.check_number && `#${o.check_number}`].filter(Boolean).join(' · '), to: o.batch_id ? `/conteos/${o.batch_id}` : `/ofrendas?q=${encodeURIComponent(o.check_number || o.member_name || '')}` })),
      ...data.batches.map((b) => ({ key: `b${b.id}`, group: g.b, icon: <ClipboardList size={20} />, title: b.name, sub: `${date(b.date)} · ${b.status === 'closed' ? tr('Cerrado', 'Closed') : tr('Abierto', 'Open')}`, to: `/conteos/${b.id}` })),
      ...data.expenses.map((e) => ({ key: `e${e.id}`, group: g.e, icon: <Receipt size={20} />, title: `${e.payee} · ${money(e.amount)}`, sub: date(e.date), to: `/gastos?q=${encodeURIComponent(e.payee)}` })),
      ...data.deposits.map((d) => ({ key: `d${d.id}`, group: g.d, icon: <Landmark size={20} />, title: `${tr('Depósito', 'Deposit')} ${date(d.date)}`, sub: d.reference || '', to: `/depositos?d=${d.id}` })),
    ]
  }, [data, term, tr, money, date, labels])

  useEffect(() => setActive(0), [items])
  const go = (i: number) => { const it = items[i]; if (!it) return; navigate(it.to); setText(''); setOpen(false); input.current?.blur() }
  const show = open && term.length >= 2

  return (
    <div ref={box} className="relative w-full">
      <Search size={19} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" aria-hidden />
      <input
        ref={input} className="ctl !pl-11 !pr-10" value={text} placeholder={tr('Buscar miembro, cheque, conteo…', 'Find a member, check, count…')}
        role="combobox" aria-expanded={show} aria-controls="buscar-resultados" aria-autocomplete="list" aria-label={tr('Buscar en Sanctuary', 'Search Sanctuary')}
        aria-activedescendant={show && items[active] ? `res-${items[active].key}` : undefined}
        onChange={(e) => { setText(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
          else if (e.key === 'Enter') { e.preventDefault(); go(active) }
          else if (e.key === 'Escape') { setOpen(false); input.current?.blur() }
        }}
      />
      <kbd className="hidden lg:block absolute right-3 top-1/2 -translate-y-1/2 text-[0.75rem] text-muted border border-line rounded px-1.5" aria-hidden>/</kbd>
      {show && (
        <ul id="buscar-resultados" role="listbox" className="absolute z-30 mt-2 w-full max-h-[70vh] overflow-y-auto bg-surface border border-line rounded-[14px] shadow-card p-1.5">
          {items.length === 0 ? (
            <li className="px-3 py-3 text-muted">{isFetching ? tr('Buscando…', 'Searching…') : tr('No encontramos nada con eso.', 'Nothing found.')}</li>
          ) : items.map((it, i) => (
            <li key={it.key} id={`res-${it.key}`} role="option" aria-selected={i === active}>
              {(i === 0 || items[i - 1].group !== it.group) && <p className="px-3 pt-2 pb-1 text-[0.75rem] font-semibold uppercase tracking-wide text-muted">{it.group}</p>}
              <button type="button" tabIndex={-1} onMouseEnter={() => setActive(i)} onClick={() => go(i)}
                className={cx('w-full flex items-center gap-3 px-3 py-2 rounded-[10px] text-left', i === active && 'bg-raised')}>
                <span className="shrink-0 text-muted" aria-hidden>{it.icon}</span>
                <span className="min-w-0">
                  <span className="block truncate font-medium">{it.title}</span>
                  {it.sub && <span className="block truncate text-muted text-[0.85rem]">{it.sub}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
