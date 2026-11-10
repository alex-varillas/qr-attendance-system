import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../hooks/useAuth.jsx'
import { useEmployees } from '../../hooks/useEmployees'
import {
  useYearJustifications, useApproveAbsence,
} from '../../hooks/useVacations'
import { computeBalances } from '../../utils/vacations'
import LeaveCalendar from '../../components/leave/LeaveCalendar'
import JustificationModal from '../../components/ui/JustificationModal'
import EntitlementModal from '../../components/ui/EntitlementModal'
import { todayISO, formatShortDate as fmtDate, firstDayOfMonth, getAppLocale } from '../../utils/dates'
import { avatarGradient } from '../../utils/avatar'
import { ABSENCE_TYPE_LABELS as ABSENCE_LABELS } from '../../utils/labels'
import { t } from '../../i18n'

const STATUS_CONFIG = {
  approved: { get label() { return t('Confirmada') },    bg: 'bg-emerald-50', text: 'text-emerald-700' },
  pending:  { get label() { return t('Por confirmar') }, bg: 'bg-amber-50',   text: 'text-amber-700'   },
  rejected: { get label() { return t('Cancelada') },     bg: 'bg-slate-100',  text: 'text-slate-500'   },
}

function initials(name, last) {
  return [name, last].filter(Boolean).map(s => s[0].toUpperCase()).join('').slice(0, 2)
}

export default function Leave() {
  const { isOwner } = useAuth()
  const queryClient = useQueryClient()

  const [monthDate, setMonthDate] = useState(() => firstDayOfMonth())
  const [justTarget,    setJustTarget]    = useState(null)  // { employee, justification? }
  const [entitleTarget, setEntitleTarget] = useState(null)  // employee
  const [search,        setSearch]        = useState('')

  const year = monthDate.getFullYear()
  const { data: employees = [] }     = useEmployees()
  const { data: justifications = [] } = useYearJustifications(year)
  const approve = useApproveAbsence()

  const activos = useMemo(
    () => employees.filter(e => e.active && e.role !== 'owner'),
    [employees],
  )
  const daysLabel = t('días')

  const balances = useMemo(
    () => computeBalances({ employees: activos, justifications, year }),
    [activos, justifications, year],
  )
  const empMap = useMemo(() => {
    const m = {}
    employees.forEach(e => { m[e.id] = e })
    return m
  }, [employees])

  // Pendientes de aprobar primero (lo más urgente), el resto conserva el
  // orden por fecha que ya trae la consulta.
  const sortedJustifications = useMemo(() => {
    const pending = justifications.filter(j => j.status === 'pending')
    const rest    = justifications.filter(j => j.status !== 'pending')
    return [...pending, ...rest]
  }, [justifications])
  const pendingCount = sortedJustifications.length - sortedJustifications.filter(j => j.status !== 'pending').length

  const filteredBalances = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return balances
    return balances.filter(b => `${b.employee.name} ${b.employee.last_name}`.toLowerCase().includes(q))
  }, [balances, search])

  const now = new Date()
  const isCurrentMonth = now.getFullYear() === year && now.getMonth() === monthDate.getMonth()
  const monthLabel = monthDate.toLocaleDateString(getAppLocale(), { month: 'long', year: 'numeric' })

  function closeJust() {
    setJustTarget(null)
    queryClient.invalidateQueries({ queryKey: ['justifications'] })
  }

  return (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">{t('Vacaciones')}</h1>
          <p className="text-sm text-slate-500 mt-0.5">{t('Saldo, registro y calendario ·')}{' '}{year}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setMonthDate(firstDayOfMonth(monthDate, -1))}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
            aria-label={t('Mes anterior')}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="text-xs font-medium text-slate-600 capitalize w-28 text-center select-none">{monthLabel}</span>
          <button
            onClick={() => !isCurrentMonth && setMonthDate(firstDayOfMonth(monthDate, 1))}
            disabled={isCurrentMonth}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label={t('Mes siguiente')}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Grid: Ausencias registradas (2/3, pendientes primero) + Calendario (1/3).
          Sube arriba de todo: es lo más urgente (aprobar/rechazar) y lo más
          visual (calendario), no debe quedar escondido bajo el saldo. */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-4 mb-4">
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2 shrink-0">
            <h2 className="text-sm font-semibold text-slate-800">{t('Ausencias registradas')}{' '}{year}</h2>
            {justifications.length > 0 && (
              <span className="text-xs text-slate-400">({justifications.length})</span>
            )}
            {pendingCount > 0 && (
              <span className="text-xs font-medium bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full ml-auto">
                {pendingCount}{' '}{t('por confirmar')}
              </span>
            )}
          </div>
          {justifications.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-400">{t('Aún no hay ausencias registradas este año.')}</p>
          ) : (
            // En escritorio la tarjeta se estira hasta la altura del calendario: la lista
            // (basis-0) no aporta altura propia y hace scroll llenando todo el espacio.
            // En móvil (una columna) conserva un tope fijo.
            <ul className="divide-y divide-slate-100 overflow-y-auto max-h-[440px] lg:max-h-none lg:basis-0 lg:grow lg:min-h-0">
              {sortedJustifications.map(j => {
                const emp = empMap[j.employee_id]
                const sc = STATUS_CONFIG[j.status] ?? STATUS_CONFIG.pending
                const ini = emp ? initials(emp.name, emp.last_name) : '?'
                const dateStr = j.date_to && j.date_to !== j.date
                  ? `${fmtDate(j.date)} → ${fmtDate(j.date_to)}`
                  : fmtDate(j.date)
                return (
                  <li key={j.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                    {/* Info del empleado */}
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
                        style={{ background: emp ? avatarGradient(emp.id) : '#94a3b8' }}
                      >
                        {ini}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium text-slate-800 truncate">
                            {emp ? `${emp.name} ${emp.last_name}` : '-'}
                          </p>
                          <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full shrink-0">
                            {ABSENCE_LABELS[j.type] ?? j.type}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <p className="text-xs text-slate-400">{dateStr}</p>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${sc.bg} ${sc.text}`}>
                            {sc.label}
                          </span>
                        </div>
                      </div>
                    </div>
                    {/* Botones, indentados bajo el texto en móvil, a la derecha en sm+ */}
                    {(j.status === 'pending' || emp) && (
                      <div className="flex items-center gap-1.5 shrink-0 pl-12 sm:pl-0">
                        {j.status === 'pending' && (
                          <>
                            <button
                              onClick={() => approve.mutate({ id: j.id, status: 'approved' })}
                              disabled={approve.isPending}
                              className="text-xs font-medium px-2.5 py-2.5 sm:py-1.5 rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white transition-colors"
                            >
                              {t('Confirmar')}
                            </button>
                            <button
                              onClick={() => approve.mutate({ id: j.id, status: 'rejected' })}
                              disabled={approve.isPending}
                              className="text-xs font-medium px-2.5 py-2.5 sm:py-1.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
                            >
                              {t('Cancelar')}
                            </button>
                          </>
                        )}
                        {emp && (
                          <button
                            onClick={() => setJustTarget({ employee: emp, justification: j })}
                            className="text-xs font-medium px-2.5 py-2.5 sm:py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
                          >
                            {t('Editar')}
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* Calendario */}
        <LeaveCalendar justifications={justifications} employees={employees} monthDate={monthDate} />
      </div>

      {/* Saldo de vacaciones, altura fija con scroll interno + buscador para
          no empujar el resto de la página con empresas de muchos empleados. */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-sm font-semibold text-slate-800">{t('Saldo de vacaciones')}{' '}{year}</h2>
          {balances.length > 0 && (
            <div className="relative">
              <svg className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={t('Buscar empleado...')}
                className="pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-full sm:w-56"
              />
            </div>
          )}
        </div>
        {balances.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-400">{t('No hay empleados activos.')}</p>
        ) : filteredBalances.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-400">{t('Ningún empleado coincide con "')}{search}".</p>
        ) : (
          <ul className="divide-y divide-slate-100 overflow-y-auto" style={{ maxHeight: 640 }}>
            {filteredBalances.map(b => {
              const emp = b.employee
              const ini = initials(emp.name, emp.last_name)
              return (
                <li key={emp.id} className="px-4 py-3 flex items-center gap-3 sm:gap-4">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
                    style={{ background: avatarGradient(emp.id) }}
                  >
                    {ini || '?'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-800 truncate">
                      <Link to={`/employees/${emp.id}`} className="hover:text-blue-600 transition-colors">
                        {emp.name} {emp.last_name}
                      </Link>
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {b.entitlement} {daysLabel}{' '}{t('al año ·')}{' '}{b.taken}{' '}{t('tomados')}
                    </p>
                  </div>
                  {/* Columna derecha: disponibles + botones, apilados en móvil, fila en sm+ */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3 shrink-0 items-end">
                    <div className="text-right">
                      <span className={`text-xl sm:text-2xl font-bold leading-none ${b.available < 0 ? 'text-rose-600' : 'text-slate-800'}`}>
                        {b.available}
                      </span>
                      <p className="text-xs text-slate-400 mt-0.5">{t('disponibles')}</p>
                    </div>
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      {isOwner && (
                        <button
                          onClick={() => setEntitleTarget(emp)}
                          className="text-xs font-medium px-2.5 py-2.5 sm:py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                        >
                          {t('Ajustar')}
                        </button>
                      )}
                      <button
                        onClick={() => setJustTarget({ employee: emp, justification: null })}
                        className="text-xs font-medium px-2.5 py-2.5 sm:py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                      >
                        {t('Registrar')}
                      </button>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Modales */}
      <AnimatePresence>
        {justTarget && (
          <JustificationModal
            key="just"
            employee={justTarget.employee}
            date={justTarget.justification?.date ?? todayISO()}
            justification={justTarget.justification}
            defaultType="vacaciones"
            onClose={closeJust}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {entitleTarget && (
          <EntitlementModal
            key="entitle"
            employee={entitleTarget}
            onClose={() => setEntitleTarget(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
