import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { t } from '../../i18n'

/**
 * Tendencia de horas trabajadas por día. Props: serie (de computeEmployeeStats).
 */
export default function AttendanceTrendChart({ serie = [] }) {
  const data = serie
    .filter(d => d.cat !== 'futuro')
    .map(d => ({
      label: d.date.slice(8, 10), // día del mes
      horas: Math.round((d.horasMin / 60) * 10) / 10,
    }))

  const hayDatos = data.some(d => d.horas > 0)

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <h3 className="text-sm font-semibold text-slate-800 mb-3">{t('Horas trabajadas por día')}</h3>
      {!hayDatos ? (
        <p className="text-sm text-slate-400 py-10 text-center">{t('Sin horas registradas en este mes.')}</p>
      ) : (
        <div style={{ width: '100%', height: 220 }}>
          <ResponsiveContainer>
            <AreaChart data={data} margin={{ top: 5, right: 12, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient id="grad-horas" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2E7DE9" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#2E7DE9" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={34} />
              <Tooltip
                formatter={v => [`${v} h`, t('Horas')]}
                labelFormatter={l => t('Día {0}', [l])}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
              />
              <Area type="monotone" dataKey="horas" stroke="#2E7DE9" strokeWidth={2} fill="url(#grad-horas)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
