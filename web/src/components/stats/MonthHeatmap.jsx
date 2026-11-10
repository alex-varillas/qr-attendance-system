import { STAT_CATEGORIES } from '../../utils/employeeStats'
import { weekdayInitials } from '../../utils/dates'
import { t } from '../../i18n'

const LEYENDA = ['asistio', 'tardanza', 'falta', 'permiso', 'descanso', 'feriado']

function pad(n) { return String(n).padStart(2, '0') }

/**
 * Calendario mensual coloreado por estado. Props: serie (del mes), monthDate (Date al día 1).
 */
export default function MonthHeatmap({ serie = [], monthDate }) {
  const byDate = {}
  for (const d of serie) byDate[d.date] = d

  const year = monthDate.getFullYear()
  const month = monthDate.getMonth()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const lead = (new Date(year, month, 1).getDay() + 6) % 7 // huecos hasta el primer lunes

  const cells = []
  for (let i = 0; i < lead; i++) cells.push(null)
  for (let day = 1; day <= daysInMonth; day++) {
    const ds = `${year}-${pad(month + 1)}-${pad(day)}`
    cells.push({ day, info: byDate[ds] })
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <h3 className="text-sm font-semibold text-slate-800 mb-3">{t('Calendario del mes')}</h3>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {weekdayInitials().map((w, i) => (
          <div key={i} className="text-center text-[10px] font-semibold text-slate-400">{w}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((c, i) => {
          if (!c) return <div key={i} />
          const cat = c.info?.cat && c.info.cat !== 'futuro' ? c.info.cat : null
          const meta = cat ? STAT_CATEGORIES[cat] : null
          const title = meta ? `${c.day}, ${meta.label}` : String(c.day)
          return (
            <div
              key={i}
              title={title}
              className={`aspect-square rounded-md flex items-center justify-center text-[11px] font-medium ${
                meta ? `${meta.bg} ${meta.text}` : 'bg-slate-50 text-slate-300'
              }`}
            >
              {c.day}
            </div>
          )
        })}
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3">
        {LEYENDA.map(cat => (
          <span key={cat} className="flex items-center gap-1 text-[10px] text-slate-500">
            <span className={`w-2.5 h-2.5 rounded-sm ${STAT_CATEGORIES[cat].bg}`} />
            {STAT_CATEGORIES[cat].label}
          </span>
        ))}
      </div>
    </div>
  )
}
