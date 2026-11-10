import { useRef, useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { t } from '../../i18n'

/**
 * Dropdown estilizado al mismo nivel visual que el DatePicker del Dashboard.
 * Props:
 *   value       - valor seleccionado ('' = todo / default)
 *   onChange    - (value: string) => void
 *   options     - [{ value: string, label: string }]
 *   placeholder - texto cuando value === ''   (default 'Seleccionar')
 *   icon        - ReactNode opcional en el trigger
 *   block       - boolean: ancho completo, colores neutros (para formularios)
 */
export default function FilterSelect({
  value,
  onChange,
  options,
  placeholder = t('Seleccionar'),
  icon,
  block = false,
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    function onOut(e) {
      if (!ref.current?.contains(e.target)) setOpen(false)
    }
    function onKeyDown(e) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onOut)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onOut)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const selected  = options.find(o => o.value === value)
  const isFiltered = !!value

  // En modo filtro: tinte azul cuando hay selección. En modo form: siempre neutro.
  const btnClasses = block
    ? `w-full justify-between bg-white border-slate-300 text-slate-700 hover:border-slate-400 hover:bg-slate-50`
    : isFiltered
      ? 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100'
      : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50'

  const chevronColor = block
    ? 'text-slate-400'
    : isFiltered ? 'text-blue-300' : 'text-slate-300'

  return (
    <div ref={ref} className={`relative ${block ? 'w-full' : ''}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex items-center gap-2 rounded-lg text-sm font-medium border transition-colors ${block ? 'px-3 py-2' : 'pl-2.5 pr-2 py-1.5'} ${btnClasses}`}
      >
        {icon && !block && (
          <span className={`shrink-0 ${isFiltered ? 'text-blue-400' : 'text-slate-400'}`}>
            {icon}
          </span>
        )}
        <span className={`whitespace-nowrap ${block ? 'flex-1 text-left' : ''} ${!selected && block ? 'text-slate-400' : ''}`}>
          {selected?.label ?? placeholder}
        </span>
        <svg
          className={`w-3.5 h-3.5 shrink-0 transition-transform duration-150 ${open ? 'rotate-180' : ''} ${chevronColor}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.16, ease: [0.4, 0, 0.2, 1] } }}
            exit={{ opacity: 0, y: -4, scale: 0.97, transition: { duration: 0.1 } }}
            role="listbox"
            className={`absolute left-0 top-full mt-1.5 z-50 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 ${block ? 'w-full' : 'min-w-[160px]'}`}
          >
            {options.map(opt => (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={opt.value === value}
                onClick={() => { onChange(opt.value); setOpen(false) }}
                className={`w-full text-left px-3 py-2 text-sm transition-colors rounded-none first:rounded-t-xl last:rounded-b-xl ${
                  opt.value === value
                    ? 'bg-blue-600 text-white font-medium'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
