import { minutesToReadable } from '../../utils/attendance'

const fmtDate = d => { if (!d) return '-'; const [y, m, dd] = d.split('-'); return `${dd}/${m}` }

function Row({ icon, label, value, accent = 'text-slate-800' }) {
  return (
    <li className="flex items-center gap-3 py-2.5">
      <span className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400 shrink-0">
        {icon}
      </span>
      <span className="text-sm text-slate-600 flex-1 min-w-0 truncate">{label}</span>
      <span className={`text-sm font-semibold tabular-nums ${accent}`}>{value}</span>
    </li>
  )
}

/**
 * Tarjeta "Detalle del mes" con métricas derivadas de la serie. Props: insights.
 */
export default function MonthInsights({ insights }) {
  const I = insights ?? {}
  const hasData = (I.avgHorasMin ?? 0) > 0 || I.puntualidadPct != null || (I.mejorRacha ?? 0) > 0

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5">
      <h3 className="text-sm font-semibold text-slate-800 mb-2">Detalle del mes</h3>
      {!hasData ? (
        <p className="text-sm text-slate-400 py-10 text-center">Sin datos en este mes.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          <Row
            label="Promedio de horas/día"
            value={minutesToReadable(I.avgHorasMin)}
            icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
          />
          <Row
            label="Día con más horas"
            value={I.topDay ? `${fmtDate(I.topDay.date)} · ${minutesToReadable(I.topDay.horasMin)}` : '-'}
            icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>}
          />
          <Row
            label="Tardanza promedio"
            value={I.avgTardanzaMin > 0 ? minutesToReadable(I.avgTardanzaMin) : 'A tiempo'}
            accent={I.avgTardanzaMin > 0 ? 'text-amber-600' : 'text-emerald-600'}
            icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
          />
          <Row
            label="Puntualidad"
            value={I.puntualidadPct != null ? `${I.puntualidadPct}%` : '-'}
            accent={I.puntualidadPct != null && I.puntualidadPct >= 80 ? 'text-emerald-600' : 'text-slate-800'}
            icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
          />
          <Row
            label="Mejor racha de asistencia"
            value={`${I.mejorRacha ?? 0} días`}
            icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>}
          />
        </ul>
      )}
    </div>
  )
}
