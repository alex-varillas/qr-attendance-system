import { minutesToReadable } from '../../utils/attendance'

/**
 * Tarjetas resumen del período. Props: kpis (de computeEmployeeStats).
 */
export default function StatKpis({ kpis }) {
  if (!kpis) return null

  const cards = [
    {
      label: 'Asistencia',
      value: kpis.asistenciaPct != null ? `${kpis.asistenciaPct}%` : '-',
      sub: `${kpis.diasLaborables} días laborables`,
    },
    {
      label: 'Tardanzas',
      value: kpis.tardanzasCount,
      sub: `${minutesToReadable(kpis.tardanzasMin)} acumulado`,
    },
    {
      label: 'Horas trabajadas',
      value: minutesToReadable(kpis.horasMin),
      sub: 'en el mes',
    },
    {
      label: 'Faltas',
      value: kpis.faltas,
      sub: 'sin justificar',
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
