import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, UserPlus, X } from 'lucide-react'
import { useApp } from '../lib/app'
import { useMembers } from '../lib/data'
import { Avatar, cx } from './ui'

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/**
 * Type-to-search member chooser. Matches by name or envelope number, ignores accents,
 * works with arrow keys + Enter, and can offer to create a member that doesn't exist yet.
 */
export function MemberPicker({ id, value, onChange, onCreate, allowLoose = true, autoFocus }: {
  id?: string
  value: string | null
  onChange: (memberId: string | null) => void
  onCreate?: (name: string) => void
  allowLoose?: boolean
  autoFocus?: boolean
}) {
  const { tr } = useApp()
  const { data: members = [] } = useMembers()
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const box = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const selected = members.find((m) => m.id === value)

  const matches = useMemo(() => {
    const n = norm(text.trim())
    const list = n ? members.filter((m) => norm(m.full_name).includes(n) || m.envelope_number === text.trim()) : members
    return list.slice(0, 8)
  }, [members, text])
  const canCreate = !!onCreate && text.trim().length > 1 && !members.some((m) => norm(m.full_name) === norm(text.trim()))
  const count = matches.length + (canCreate ? 1 : 0)

  useEffect(() => setActive(0), [text])
  useEffect(() => {
    const out = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', out)
    return () => document.removeEventListener('mousedown', out)
  }, [])

  const choose = (i: number) => {
    if (i < matches.length) onChange(matches[i].id)
    else if (canCreate) onCreate!(text.trim())
    setText(''); setOpen(false)
  }

  if (selected) {
    return (
      <div className="ctl flex items-center gap-3 !pr-1.5">
        <Avatar name={selected.full_name} file={selected.avatar_file} size={30} />
        <span className="flex-1 truncate font-medium">{selected.full_name}</span>
        {selected.envelope_number && <span className="text-muted text-[0.85rem]">{tr('Sobre', 'Env.')} {selected.envelope_number}</span>}
        <button type="button" onClick={() => { onChange(null); setTimeout(() => input.current?.focus()) }} aria-label={tr('Quitar miembro', 'Clear member')} className="size-9 grid place-items-center rounded-lg text-muted hover:bg-raised hover:text-ink">
          <X size={18} />
        </button>
      </div>
    )
  }
  return (
    <div ref={box} className="relative">
      <Search size={19} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" aria-hidden />
      <input
        ref={input} id={id} className="ctl !pl-11" autoComplete="off" autoFocus={autoFocus} role="combobox" aria-expanded={open} aria-autocomplete="list"
        placeholder={allowLoose ? tr('Buscar por nombre o n.º de sobre — vacío = ofrenda suelta', 'Search by name or envelope no. — empty = loose offering') : tr('Buscar por nombre o n.º de sobre', 'Search by name or envelope no.')}
        value={text}
        onChange={(e) => { setText(e.target.value); setOpen(true) }}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, count - 1)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
          else if (e.key === 'Enter' && open && text.trim() && count > 0) { e.preventDefault(); choose(active) }
          else if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false) }
        }}
      />
      {open && count > 0 && (
        <ul role="listbox" className="absolute z-30 mt-1.5 w-full max-h-80 overflow-y-auto bg-surface border border-line-strong rounded-[12px] shadow-card p-1.5">
          {matches.map((m, i) => (
            <li key={m.id} role="option" aria-selected={i === active}>
              <button type="button" onMouseEnter={() => setActive(i)} onClick={() => choose(i)} className={cx('w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left', i === active && 'bg-raised')}>
                <Avatar name={m.full_name} file={m.avatar_file} size={34} />
                <span className="flex-1 truncate">{m.full_name}</span>
                {m.envelope_number && <span className="text-muted text-[0.85rem]">{tr('Sobre', 'Env.')} {m.envelope_number}</span>}
              </button>
            </li>
          ))}
          {canCreate && (
            <li role="option" aria-selected={active === matches.length}>
              <button type="button" onMouseEnter={() => setActive(matches.length)} onClick={() => choose(matches.length)} className={cx('w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-accent-ink font-semibold', active === matches.length && 'bg-accent-soft')}>
                <span className="size-[34px] grid place-items-center rounded-full bg-accent-soft"><UserPlus size={18} /></span>
                {tr(`Agregar a “${text.trim()}” como miembro nuevo`, `Add “${text.trim()}” as a new member`)}
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
