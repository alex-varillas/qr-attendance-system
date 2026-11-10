import { minutesToReadable } from '../../utils/attendance'
import { t } from '../../i18n'

/**
 * Tarjetas resumen del período. Props: kpis (de computeEmployeeStats).
 */
export default function StatKpis({ kpis }) {
  if (!kpis) return null

  const cards = [
    {
      label: t('Asistencia'),
      value: kpis.asistenciaPct != null ? `${kpis.asistenciaPct}%` : '-',
      sub: t('{0} días laborables', [kpis.diasLaborables]),
    },
    {
      label: t('Tardanzas'),
      value: kpis.tardanzasCount,
      sub: t('{0} acumulado', [minutesToReadable(kpis.tardanzasMin)]),
    },
    {
      label: t('Horas trabajadas'),
      value: minutesToReadable(kpis.horasMin),
      sub: t('en el mes'),
    },
    {
      label: t('Faltas'),
      value: kpis.faltas,
      sub: t('sin justificar'),
    },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
      {cards.map(c => (
        <div key={c.label} className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-2xl font-bold text-slate-900 leading-tight">{c.value}</p>
          <p className="text-xs font-medium text-slate-600 mt-1">{c.label}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">{c.sub}</p>
        </div>
      ))}
    </div>
  )
}
