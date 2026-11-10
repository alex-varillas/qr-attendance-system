import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { STAT_CATEGORIES } from '../../utils/employeeStats'
import { t } from '../../i18n'

/**
 * Dona de distribución de días por categoría. Props: distribucion (de computeEmployeeStats).
 * Muestra el total en el centro y leyenda con conteo + porcentaje.
 */
export default function StatusDonut({ distribucion = [] }) {
  const data = distribucion.map(d => ({
    name: STAT_CATEGORIES[d.cat]?.label ?? d.cat,
    value: d.value,
    color: STAT_CATEGORIES[d.cat]?.hex ?? '#cbd5e1',
  }))
  const total = data.reduce((s, d) => s + d.value, 0)

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5">
      <h3 className="text-sm font-semibold text-slate-800 mb-4">{t('Distribución de días')}</h3>
      {total === 0 ? (
        <p className="text-sm text-slate-400 py-10 text-center">{t('Sin datos en este mes.')}</p>
      ) : (
        <div className="flex flex-col sm:flex-row items-center sm:items-stretch gap-3 sm:gap-4">
          {/* Dona con total al centro */}
          <div className="relative shrink-0" style={{ width: 180, height: 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data} dataKey="value" nameKey="name" innerRadius={60} outerRadius={85} paddingAngle={2} stroke="none">
                  {data.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip
                  formatter={(v, n) => [t('{0} días', [v]), n]}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-2xl font-bold text-slate-900 leading-none">{total}</span>
              <span className="text-[11px] text-slate-400 mt-0.5">{t('días')}</span>
            </div>
          </div>

          {/* Leyenda con conteo + porcentaje + mini barra */}
          <ul className="w-full sm:flex-1 min-w-0 space-y-2 sm:pt-1">
            {data.map(d => {
              const pct = Math.round((d.value / total) * 100)
              return (
                <li key={d.name}>
                  <div className="flex items-center gap-2 text-xs mb-1">
                    <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: d.color }} />
                    <span className="text-slate-600 flex-1 truncate">{d.name}</span>
                    <span className="font-semibold text-slate-800 tabular-nums">{d.value}</span>
                    <span className="text-slate-400 tabular-nums w-9 text-right">{pct}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: d.color }} />
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
