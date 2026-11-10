import { useState, useMemo } from 'react'
import { AnimatePresence } from 'framer-motion'
import { useAuth } from '../../hooks/useAuth.jsx'
import { useEmployees } from '../../hooks/useEmployees'
import { useDepartments } from '../../hooks/useDepartments'
import { useAttendanceReport } from '../../hooks/useAttendanceReport'
import { computeEmployeeStats } from '../../utils/employeeStats'
import EmployeeSelect from '../../components/ui/EmployeeSelect'
import StatKpis from '../../components/stats/StatKpis'
import AttendanceTrendChart from '../../components/stats/AttendanceTrendChart'
import StatusDonut from '../../components/stats/StatusDonut'
import MonthInsights from '../../components/stats/MonthInsights'
import MonthHeatmap from '../../components/stats/MonthHeatmap'
import EmployeeProfileCard from '../../components/stats/EmployeeProfileCard'
import FilterSelect from '../../components/ui/FilterSelect'
import { firstDayOfMonth, getAppLocale } from '../../utils/dates'
import { t } from '../../i18n'

const pad = n => String(n).padStart(2, '0')

export default function EmployeeStats() {
  const { business } = useAuth()
  const tolerance = business?.tolerance_minutes ?? 5

  const { data: employees = [] } = useEmployees()
  const { data: departments = [] } = useDepartments()

  const [selectedId, setSelectedId] = useState(null)
  const [deptFilter, setDeptFilter] = useState('')
  const [monthDate, setMonthDate] = useState(() => firstDayOfMonth())

  const activos = employees
    .filter(e => e.active && e.role !== 'owner')
    .filter(e => !deptFilter || e.department_id === deptFilter)

  const y = monthDate.getFullYear()
  const m = monthDate.getMonth()
  const from = `${y}-${pad(m + 1)}-01`
  const to   = `${y}-${pad(m + 1)}-${pad(new Date(y, m + 1, 0).getDate())}`

  const { data: report, isLoading } = useAttendanceReport(from, to)

  const stats = useMemo(
    () => computeEmployeeStats(report, selectedId, from, to, tolerance),
    [report, selectedId, from, to, tolerance],
  )

  const now = new Date()
  const isCurrentMonth = now.getFullYear() === y && now.getMonth() === m
  const monthLabel = monthDate.toLocaleDateString(getAppLocale(), { month: 'long', year: 'numeric' })

  return (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">{t('Estadísticas')}</h1>
          <p className="text-sm text-slate-500 mt-0.5">{t('Rendimiento de asistencia por empleado')}</p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          {departments.length > 0 && (
            <FilterSelect
              value={deptFilter}
              onChange={setDeptFilter}
              placeholder={t('Todas las áreas')}
              options={[
                { value: '', label: t('Todas las áreas') },
                ...departments.map(d => ({ value: d.id, label: d.name })),
              ]}
            />
          )}
          <EmployeeSelect employees={activos} value={selectedId} onChange={setSelectedId} />
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setMonthDate(firstDayOfMonth(monthDate, -1))}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
              aria-label={t('Mes anterior')}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <span className="text-xs font-medium text-slate-600 capitalize w-28 text-center select-none">{monthLabel}</span>
            <button
              onClick={() => !isCurrentMonth && setMonthDate(firstDayOfMonth(monthDate, 1))}
              disabled={isCurrentMonth}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label={t('Mes siguiente')}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>
        </div>
      </div>

      {/* Sin empleado seleccionado */}
      {!selectedId && (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <p className="text-sm text-slate-500">{t('Selecciona un empleado para ver sus estadísticas.')}</p>
        </div>
      )}

      {/* Estadísticas */}
      {selectedId && (
        isLoading ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-sm text-slate-500">
            {t('Cargando estadísticas...')}
          </div>
        ) : (
          <div className="space-y-4">
            <StatKpis kpis={stats.kpis} />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
              {/* Ficha del empleado - sticky lateral izquierda */}
              <div className="lg:sticky lg:top-6 self-start">
                <EmployeeProfileCard
                  employee={activos.find(e => e.id === selectedId)}
                  departments={departments}
                  schedules={report?.schedules ?? []}
                  kpis={stats.kpis}
                  insights={stats.insights}
                  monthLabel={monthLabel}
                />
              </div>
              {/* Gráficos - columna derecha */}
              <div className="lg:col-span-2 space-y-4">
                <AttendanceTrendChart serie={stats.serie} />
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <StatusDonut distribucion={stats.distribucion} />
                  <MonthInsights insights={stats.insights} />
                </div>
                <MonthHeatmap serie={stats.serie} monthDate={monthDate} />
              </div>
            </div>
          </div>
        )
      )}
    </div>
  )
}
