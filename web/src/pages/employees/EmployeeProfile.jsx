import { useState, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../hooks/useAuth.jsx'
import { useEmployees } from '../../hooks/useEmployees'
import { useDepartments } from '../../hooks/useDepartments'
import { useSchedules } from '../../hooks/useSchedules'
import { useAttendanceReport } from '../../hooks/useAttendanceReport'
import { useEmployeeJustifications } from '../../hooks/useEmployeeJustifications'
import { computeEmployeeStats } from '../../utils/employeeStats'
import { todayISO, formatShortDate as fmtDate, firstDayOfMonth, getAppLocale } from '../../utils/dates'
import StatKpis from '../../components/stats/StatKpis'
import AttendanceTrendChart from '../../components/stats/AttendanceTrendChart'
import StatusDonut from '../../components/stats/StatusDonut'
import MonthHeatmap from '../../components/stats/MonthHeatmap'
import EmployeeModal from '../../components/ui/EmployeeModal'
import JustificationModal from '../../components/ui/JustificationModal'
import AvatarUpload from '../../components/ui/AvatarUpload'
import { ROLE_LABELS, ABSENCE_TYPE_LABELS as ABSENCE_LABELS } from '../../utils/labels'

const DOW = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const pad = n => String(n).padStart(2, '0')
const fmtTime = t => (t ? t.slice(0, 5) : '')
const formatDays = dows =>
  Array.isArray(dows) ? dows.slice().sort((a, b) => a - b).map(d => DOW[d]).join(', ') : ''

function Field({ label, value }) {
  return (
    <div>
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className="text-sm text-slate-700 font-medium">{value || '-'}</dd>
    </div>
  )
}

export default function EmployeeProfile() {
  const { id } = useParams()
  const { business, isOwner, isAdmin } = useAuth()
  const tolerance = business?.tolerance_minutes ?? 5
  const queryClient = useQueryClient()

  const { data: employees = [], isLoading } = useEmployees()
  const { data: departments = [] } = useDepartments()
  const { data: schedules = [] } = useSchedules()
  const { data: justifications = [] } = useEmployeeJustifications(id)

  const [editOpen, setEditOpen] = useState(false)
  const [justOpen, setJustOpen] = useState(false)
  const [monthDate, setMonthDate] = useState(() => firstDayOfMonth())

  const emp = employees.find(e => e.id === id)

  const y = monthDate.getFullYear()
  const mo = monthDate.getMonth()
  const from = `${y}-${pad(mo + 1)}-01`
  const to = `${y}-${pad(mo + 1)}-${pad(new Date(y, mo + 1, 0).getDate())}`

  const { data: report } = useAttendanceReport(from, to)
  const stats = useMemo(
    () => computeEmployeeStats(report, id, from, to, tolerance),
    [report, id, from, to, tolerance],
  )

  const now = new Date()
  const isCurrentMonth = now.getFullYear() === y && now.getMonth() === mo
  const monthLabel = monthDate.toLocaleDateString(getAppLocale(), { month: 'long', year: 'numeric' })

  // Horario aplicable: bloques propios o, si no, el por defecto de la empresa
  const ownBlocks = schedules.filter(s => s.employee_id === id && s.active)
  const scheduleBlocks = ownBlocks.length
    ? ownBlocks
    : schedules.filter(s => s.is_default && s.employee_id == null && s.active)

  function handleJustClose() {
    setJustOpen(false)
    queryClient.invalidateQueries({ queryKey: ['justifications'] })
  }

  if (isLoading) {
    return <div className="p-6 text-sm text-slate-500">Cargando ficha...</div>
  }
  if (!emp) {
    return (
      <div className="p-6">
        <Link to="/employees" className="text-sm text-blue-600 hover:underline">← Empleados</Link>
        <p className="mt-4 text-sm text-slate-500">Empleado no encontrado.</p>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <Link to="/employees" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        Empleados
      </Link>

      {/* Cabecera */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 flex items-center gap-4 mb-4">
        <AvatarUpload employee={emp} size="lg" editable />
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-semibold text-slate-900 truncate">{emp.name} {emp.last_name}</h1>
          <p className="text-sm text-slate-500">
            {emp.puesto || 'Sin puesto'} · {ROLE_LABELS[emp.role] ?? emp.role}
            {' · '}
            <span className={emp.active ? 'text-green-600' : 'text-slate-400'}>
              {emp.active ? 'Activo' : 'Inactivo'}
            </span>
          </p>
        </div>
        <button
          onClick={() => setEditOpen(true)}
          className="shrink-0 inline-flex items-center gap-2 border border-slate-200 hover:bg-slate-50 text-slate-600 font-medium py-2 px-4 rounded-lg text-sm transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
          Editar
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        {/* Datos */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold text-slate-800 mb-4">Datos</h2>
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Field label="Documento" value={`${emp.doc_type ?? 'DNI'} ${emp.dni ?? ''}`.trim()} />
            <Field label="Correo" value={emp.email} />
            <Field label="Teléfono" value={emp.phone} />
            <Field label="Nacimiento" value={fmtDate(emp.birth_date)} />
            <Field label="Sexo" value={emp.sex === 'M' ? 'Masculino' : emp.sex === 'F' ? 'Femenino' : '-'} />
            <Field label="Área" value={departments.find(d => d.id === emp.department_id)?.name} />
            <Field label="Registrado" value={fmtDate((emp.created_at ?? '').slice(0, 10))} />
          </dl>
        </div>

        {/* Horario */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-sm font-semibold text-slate-800 mb-4">
            Horario {ownBlocks.length ? <span className="text-xs font-normal text-blue-600">(propio)</span> : <span className="text-xs font-normal text-slate-400">(general)</span>}
          </h2>
          {scheduleBlocks.length === 0 ? (
            <p className="text-sm text-slate-400">Sin horario asignado.</p>
          ) : (
            <ul className="space-y-3">
              {scheduleBlocks.map(b => (
                <li key={b.id} className="text-sm">
                  <p className="text-slate-700 font-medium">{formatDays(b.days_of_week)}</p>
                  <p className="text-slate-500">
                    {fmtTime(b.start_time)}–{fmtTime(b.end_time)}
                    {b.break_start && b.break_end && (
                      <span className="text-slate-400"> · Refrig. {fmtTime(b.break_start)}–{fmtTime(b.break_end)}</span>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Estadísticas */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-800">Estadísticas</h2>
          {(
            <div className="flex items-center gap-1">
              <button onClick={() => setMonthDate(firstDayOfMonth(monthDate, -1))}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50" aria-label="Mes anterior">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              </button>
              <span className="text-xs font-medium text-slate-600 capitalize w-28 text-center select-none">{monthLabel}</span>
              <button onClick={() => !isCurrentMonth && setMonthDate(firstDayOfMonth(monthDate, 1))} disabled={isCurrentMonth}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed" aria-label="Mes siguiente">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </button>
            </div>
          )}
        </div>

        {(
          <div className="space-y-4">
            <StatKpis kpis={stats.kpis} />
            <AttendanceTrendChart serie={stats.serie} />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <StatusDonut distribucion={stats.distribucion} />
              <MonthHeatmap serie={stats.serie} monthDate={monthDate} />
            </div>
          </div>
        )}
      </div>

      {/* Ausencias */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-800">Ausencias</h2>
          <button onClick={() => setJustOpen(true)}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Registrar
          </button>
        </div>
        {justifications.length === 0 ? (
          <p className="text-sm text-slate-400">Sin ausencias registradas.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {justifications.map(j => (
              <li key={j.id} className="py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-slate-700 font-medium">{ABSENCE_LABELS[j.type] ?? j.type}</p>
                  {j.reason && <p className="text-xs text-slate-400 truncate">{j.reason}</p>}
                </div>
                <span className="text-xs text-slate-500 shrink-0">
                  {fmtDate(j.date)}{j.date_to && j.date_to !== j.date ? ` → ${fmtDate(j.date_to)}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Modales */}
      <AnimatePresence>
        {editOpen && <EmployeeModal key="edit" employee={emp} onClose={() => setEditOpen(false)} />}
      </AnimatePresence>
      <AnimatePresence>
        {justOpen && <JustificationModal key="just" employee={emp} date={todayISO()} justification={null} onClose={handleJustClose} />}
      </AnimatePresence>
    </div>
  )
}
