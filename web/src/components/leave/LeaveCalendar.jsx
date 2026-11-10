import { dateRange } from '../../utils/attendanceCore'
import { weekdayInitials } from '../../utils/dates'
import { t } from '../../i18n'

const pad = n => String(n).padStart(2, '0')

/**
 * Calendario mensual de ausencias del equipo (justificaciones aprobadas).
 * Props: justifications (del año), employees, monthDate.
 */
export default function LeaveCalendar({ justifications = [], employees = [], monthDate }) {
  const empName = id => {
    const e = employees.find(x => x.id === id)
    return e ? `${e.name} ${e.last_name}` : '-'
  }

  const byDate = {}
  for (const j of justifications) {
    if (j.status !== 'approved') continue
    for (const d of dateRange(j.date, j.date_to || j.date)) {
      (byDate[d] ??= []).push(j.employee_id)
    }
  }

  const year = monthDate.getFullYear()
  const month = monthDate.getMonth()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const lead = (new Date(year, month, 1).getDay() + 6) % 7

  const cells = []
  for (let i = 0; i < lead; i++) cells.push(null)
  for (let day = 1; day <= daysInMonth; day++) {
    const ds = `${year}-${pad(month + 1)}-${pad(day)}`
    cells.push({ day, ids: byDate[ds] ?? [] })
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <h3 className="text-sm font-semibold text-slate-800 mb-3">{t('Ausencias del mes')}</h3>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {weekdayInitials().map((w, i) => (
          <div key={i} className="text-center text-[10px] font-semibold text-slate-400">{w}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((c, i) => (
          c ? (
            <div
              key={i}
              title={c.ids.length ? c.ids.map(empName).join(', ') : String(c.day)}
              className={`aspect-square rounded-md flex flex-col items-center justify-center text-[11px] ${
                c.ids.length ? 'bg-sky-100 text-sky-700 font-semibold' : 'bg-slate-50 text-slate-400'
              }`}
            >
              <span>{c.day}</span>
              {c.ids.length > 0 && <span className="text-[9px] leading-none">{c.ids.length}</span>}
            </div>
          ) : <div key={i} />
        ))}
      </div>
      <p className="text-[10px] text-slate-400 mt-3">{t('El número indica cuántas personas están de ausencia ese día.')}</p>
    </div>
  )
}
