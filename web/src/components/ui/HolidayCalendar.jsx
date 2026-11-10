import { useState } from 'react'
import { monthName, weekdayShortList } from '../../utils/dates'
import Modal from './Modal'
import { t } from '../../i18n'


/**
 * Mini calendario de feriados.
 * Props:
 *  - nationalHolidays: [{id, date:'YYYY-MM-DD', name}]
 *  - companyHolidays:  [{id, date:'YYYY-MM-DD', name}]
 *  - restDays: int[]  (days_of_week del horario default, 0=Dom…6=Sáb)
 *  - canManage: boolean - habilita agregar/eliminar feriados extra (default true)
 *  - onAdd(date, name): callback al confirmar nuevo feriado extra
 *  - onDelete(id): callback al eliminar feriado extra
 *  - loading: boolean
 */
export default function HolidayCalendar({
  nationalHolidays = [],
  companyHolidays  = [],
  restDays         = [],
  canManage        = true,
  onAdd,
  onDelete,
  loading,
}) {
  const today = new Date()
  const [year,  setYear]  = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth()) // 0-based
  const [addingDate, setAddingDate]   = useState(null)  // 'YYYY-MM-DD'
  const [addName,    setAddName]      = useState('')
  const [addError,   setAddError]     = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null) // {id, name}

  // ── Lookup maps ────────────────────────────────────────────────────────────
  const nationalMap = Object.fromEntries(nationalHolidays.map(h => [h.date, h.name]))
  const companyMap  = Object.fromEntries(companyHolidays.map(h => [h.date, h]))

  // ── Calendar math ──────────────────────────────────────────────────────────
  function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate() }
  function firstDayOfMonth(y, m) {
    const d = new Date(y, m, 1).getDay() // 0=Sun
    return d === 0 ? 6 : d - 1           // convert to Mon=0
  }
  function pad(n) { return String(n).padStart(2, '0') }
  function dateStr(d) { return `${year}-${pad(month + 1)}-${pad(d)}` }

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
    setAddingDate(null)
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
    setAddingDate(null)
  }

  // ── Day type ───────────────────────────────────────────────────────────────
  function getDayType(d) {
    const ds  = dateStr(d)
    const dow = new Date(ds + 'T12:00:00').getDay() // 0=Sun
    if (nationalMap[ds])  return 'national'
    if (companyMap[ds])   return 'company'
    if (restDays.includes(dow)) return 'rest'
    return 'normal'
  }

  // ── Add handler ────────────────────────────────────────────────────────────
  function handleDayClick(d) {
    const ds   = dateStr(d)
    const type = getDayType(d)
    if (type === 'national') return
    if (type === 'company') {
      if (canManage) setDeleteTarget(companyMap[ds])
      return
    }
    if (type === 'rest') return
    // Normal day → open add form (only if canManage)
    if (!canManage) return
    setAddingDate(ds)
    setAddName('')
    setAddError(null)
  }

  async function handleAddConfirm() {
    if (!addName.trim()) { setAddError(t('Ingresa un nombre para el feriado.')); return }
    setAddError(null)
    await onAdd(addingDate, addName.trim())
    setAddingDate(null)
  }

  // ── Cells ──────────────────────────────────────────────────────────────────
  const totalDays  = daysInMonth(year, month)
  const startBlank = firstDayOfMonth(year, month)
  const cells = [
    ...Array(startBlank).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ]

  // Feriados del mes para la lista inferior
  const monthStr   = `${year}-${pad(month + 1)}`
  const monthNat   = nationalHolidays.filter(h => h.date.startsWith(monthStr))
  const monthComp  = companyHolidays.filter(h => h.date.startsWith(monthStr))
  const allMonthHolidays = [
    ...monthNat.map(h => ({ ...h, type: 'national' })),
    ...monthComp.map(h => ({ ...h, type: 'company' })),
  ].sort((a, b) => a.date.localeCompare(b.date))

  const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`

  return (
    <div>
      {/* ── Navegación ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={prevMonth}
          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="text-sm font-semibold text-slate-800">
          {monthName(month)} {year}
        </span>
        <button
          type="button"
          onClick={nextMonth}
          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* ── Cabecera días ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-7 mb-1">
        {weekdayShortList().map(l => (
          <div key={l} className="text-center text-[10px] font-semibold text-slate-400 py-1">
            {l}
          </div>
        ))}
      </div>

      {/* ── Grilla ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((d, i) => {
          if (!d) return <div key={`blank-${i}`} />

          const ds   = dateStr(d)
          const type = getDayType(d)
          const isToday = ds === todayStr

          const base = 'relative flex items-center justify-center h-11 sm:h-9 w-full rounded-lg text-xs font-medium transition-colors select-none'

          const styles = {
            national: 'bg-orange-100 text-orange-700 cursor-pointer hover:bg-orange-200',
            company:  `bg-blue-100 text-blue-700 ${canManage ? 'cursor-pointer hover:bg-blue-200' : 'cursor-default'}`,
            rest:     'bg-slate-50 text-slate-300 cursor-default',
            normal:   canManage ? 'text-slate-700 hover:bg-slate-100 cursor-pointer' : 'text-slate-700 cursor-default',
          }

          return (
            <button
              key={ds}
              type="button"
              onClick={() => handleDayClick(d)}
              className={`${base} ${styles[type]} ${isToday ? 'ring-2 ring-blue-500 ring-offset-1' : ''}`}
              title={
                type === 'national' ? nationalMap[ds]
                : type === 'company' ? companyMap[ds]?.name
                : type === 'normal' ? t('Clic para agregar un feriado')
                : undefined
              }
            >
              {d}
              {type === 'national' && (
                <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-orange-500" />
              )}
              {type === 'company' && (
                <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-blue-500" />
              )}
            </button>
          )
        })}
      </div>

      {/* ── Leyenda ────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-slate-100">
        <span className="flex items-center gap-1.5 text-xs text-slate-500">
          <span className="w-3 h-3 rounded-full bg-blue-400 shrink-0" />
          {t('Feriado')}
        </span>
        <span className="flex items-center gap-1.5 text-xs text-slate-500">
          <span className="w-3 h-3 rounded-full bg-slate-300 shrink-0" />
          {t('Descanso semanal')}
        </span>
      </div>

      {/* ── Lista del mes ──────────────────────────────────────────────── */}
      {allMonthHolidays.length > 0 && (
        <div className="mt-3 space-y-1">
          {allMonthHolidays.map(h => {
            const [, , dd] = h.date.split('-')
            return (
              <div
                key={h.date}
                className="flex items-center justify-between text-xs py-1 px-2 rounded-lg bg-slate-50"
              >
                <span className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${h.type === 'national' ? 'bg-orange-400' : 'bg-blue-400'}`} />
                  <span className="text-slate-500 tabular-nums">{dd}/{pad(month + 1)}</span>
                  <span className="text-slate-700 font-medium">{h.name}</span>
                </span>
                {h.type === 'company' && canManage && (
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(h)}
                    className="text-slate-300 hover:text-rose-500 transition-colors ml-2"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {allMonthHolidays.length === 0 && (
        <p className="text-xs text-slate-400 mt-3 text-center">{t('Sin feriados este mes')}</p>
      )}

      {/* ── Modal: agregar feriado extra ───────────────────────────────── */}
      {addingDate && (
        <Modal onClose={() => setAddingDate(null)} ariaLabel={t('Agregar feriado')} className="bg-white rounded-xl shadow-lg w-full max-w-xs p-5">
            <h3 className="text-sm font-semibold text-slate-800 mb-1">{t('Agregar feriado')}</h3>
            <p className="text-xs text-slate-500 mb-3">
              {addingDate.split('-').reverse().join('/')}
            </p>
            <input
              type="text"
              value={addName}
              onChange={e => setAddName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddConfirm()}
              placeholder={t('Ej: Aniversario, Día del patrono...')}
              autoFocus
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
            />
            {addError && <p className="text-xs text-rose-600 mb-2">{addError}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setAddingDate(null)}
                className="flex-1 border border-slate-300 text-slate-600 text-sm font-medium py-2 rounded-lg hover:bg-slate-50 transition-colors"
              >
                {t('Cancelar')}
              </button>
              <button
                type="button"
                onClick={handleAddConfirm}
                disabled={loading}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium py-2 rounded-lg transition-colors"
              >
                {t('Guardar')}
              </button>
            </div>
        </Modal>
      )}

      {/* ── Modal: confirmar eliminación ────────────────────────────────── */}
      {deleteTarget && (
        <Modal onClose={() => setDeleteTarget(null)} ariaLabel={t('¿Eliminar feriado?')} className="bg-white rounded-xl shadow-lg w-full max-w-xs p-5">
            <h3 className="text-sm font-semibold text-slate-800 mb-1">{t('¿Eliminar feriado?')}</h3>
            <p className="text-xs text-slate-500 mb-4">
              {t('Se eliminará')}{' '}<span className="font-semibold text-slate-700">"{deleteTarget.name}"</span>{' '}
              ({deleteTarget.date.split('-').reverse().join('/')}{t(') de los feriados de tu empresa.')}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="flex-1 border border-slate-300 text-slate-600 text-sm font-medium py-2 rounded-lg hover:bg-slate-50 transition-colors"
              >
                {t('Cancelar')}
              </button>
              <button
                type="button"
                onClick={() => { onDelete(deleteTarget.id); setDeleteTarget(null) }}
                disabled={loading}
                className="flex-1 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-sm font-medium py-2 rounded-lg transition-colors"
              >
                {t('Eliminar')}
              </button>
            </div>
        </Modal>
      )}
    </div>
  )
}
