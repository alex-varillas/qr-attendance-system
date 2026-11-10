import { useState, useRef, useEffect } from 'react'
import { t } from '../../i18n'

/**
 * Dropdown buscable de empleados. Props: employees, value (id), onChange(id).
 */
export default function EmployeeSelect({ employees = [], value, onChange, placeholder = t('Selecciona un empleado') }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    function onDocClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    function onKeyDown(e) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  const selected = employees.find(e => e.id === value)
  const filtered = employees.filter(e =>
    `${e.name} ${e.last_name} ${e.dni ?? ''} ${e.puesto ?? ''}`
      .toLowerCase()
      .includes(search.toLowerCase())
  )

  return (
    <div ref={ref} className="relative w-full sm:w-72">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm hover:border-slate-300 transition-colors"
      >
        <span className={selected ? 'text-slate-800 font-medium truncate' : 'text-slate-400'}>
          {selected ? `${selected.name} ${selected.last_name}` : placeholder}
        </span>
        <svg className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
             fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
          <div className="p-2 border-b border-slate-100">
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t('Buscar...')}
              className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <ul role="listbox" className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-sm text-slate-400">{t('Sin resultados')}</li>
            )}
            {filtered.map(e => (
              <li key={e.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={e.id === value}
                  onClick={() => { onChange(e.id); setOpen(false); setSearch('') }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 transition-colors ${
                    e.id === value ? 'bg-blue-50 text-blue-700' : 'text-slate-700'
                  }`}
                >
                  <span className="font-medium">{e.name} {e.last_name}</span>
                  {e.puesto && <span className="block text-xs text-slate-400">{e.puesto}</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
