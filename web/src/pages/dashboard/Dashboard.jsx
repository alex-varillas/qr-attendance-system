import { useState, useEffect, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { staggerContainer, staggerItem } from '../../utils/animations'
import { useAuth } from '../../hooks/useAuth.jsx'
import { useEmployees } from '../../hooks/useEmployees'
import { useSchedules } from '../../hooks/useSchedules'
import { useScheduleExceptions } from '../../hooks/useScheduleExceptions'
import { useAttendance } from '../../hooks/useAttendance'
import { useNow } from '../../hooks/useNow'
import { calMonthData, toISODate } from '../../components/ui/Calendar'
import ExportModal from '../../components/ui/ExportModal'
import JustificationModal from '../../components/ui/JustificationModal'
import { useJustifications } from '../../hooks/useJustifications'
import { useHolidays } from '../../hooks/useHolidays'
import { useLocations } from '../../hooks/useLocations'
import { useDepartments } from '../../hooks/useDepartments'
import FilterSelect from '../../components/ui/FilterSelect'
import DashboardHero from '../../components/ui/DashboardHero'
import {
  getApplicableSchedule,
  getScheduleForDate,
  calcularTardanza,
  calcularExcesoRefrigerio,
  calcularTotalHoras,
  calcDiferenciaHorario,
  determinarEstado,
  resolveEstadoHoySinCheckin,
  ESTADO_COLORS,
  ESTADO_LABELS,
  minutesToReadable,
  formatMinutes,
  timeToMinutes,
} from '../../utils/attendance'
import { todayISO, formatTime, extractTime, getAppTimezone, monthName, weekdayShort, weekdayInitials } from '../../utils/dates'
import { t } from '../../i18n'

// ─── Sub-componente: fila de la tabla ───────────────────────────────────────
function AttendanceRow({ emp, empRecords, schedule, tieneHorario, now, isToday, toleranceMinutes, justification, isAdmin, onJustify, isHoliday, showSedeCol, sedeLabel, rowIndex }) {
  const checkinRec  = empRecords.find(r => r.type === 'checkin')
  const bStartRec   = empRecords.find(r => r.type === 'break_start')
  const bEndRec     = empRecords.find(r => r.type === 'break_end')
  const checkoutRec = empRecords.find(r => r.type === 'checkout')

  const checkinTime  = extractTime(checkinRec?.timestamp)
  const bStartTime   = extractTime(bStartRec?.timestamp)
  const bEndTime     = extractTime(bEndRec?.timestamp)
  const checkoutTime = extractTime(checkoutRec?.timestamp)

  // Hora actual en la timezone de la empresa (no depender del timezone del
  // navegador), usada tanto para "hoy sin checkin" como para el chequeo de
  // horas extra más abajo.
  const nowMinutes = (() => {
    const localTime = new Date(now).toLocaleTimeString('en-US', { timeZone: getAppTimezone(), hour: '2-digit', minute: '2-digit', hour12: false })
    const [ph, pm] = localTime.split(':').map(Number)
    return ph * 60 + pm
  })()

  // Día de descanso: no tiene jornada ese día y no marcó entrada
  // Para hoy sin checkin: no_iniciado (aún no arranca el turno), ausente
  // (turno en curso) o falta (pasó fin de jornada + 1h de tolerancia)
  // Para días pasados: lógica estándar de determinarEstado
  let estado
  if (isHoliday && checkinRec) {
    estado = 'feriado_trabajado'
  } else if (isHoliday && !checkinRec) {
    estado = 'feriado'
  } else if (!tieneHorario && !checkinRec) {
    estado = 'descanso'
  } else if (isToday && !checkinRec) {
    estado = resolveEstadoHoySinCheckin(schedule, nowMinutes)
  } else {
    estado = determinarEstado(empRecords, tieneHorario, false)
    // Overtime: checkin sin checkout y ya superó la hora de salida programada
    if (estado === 'pendiente' && isToday && schedule?.end_time && nowMinutes > timeToMinutes(schedule.end_time)) {
      estado = 'overtime'
    }
  }

  // Si hay justificación y el estado es falta → mostrar como justificado
  const estadoFinal = (estado === 'falta' && justification) ? 'justificado' : estado
  const esFalta     = estado === 'falta'

  const tardanza  = calcularTardanza(checkinTime, schedule?.start_time, toleranceMinutes)
  const excesoRef = calcularExcesoRefrigerio(bStartTime, bEndTime, schedule?.break_start, schedule?.break_end)

  // Total horas: real si tiene checkout; en curso si está trabajando ahora
  let totalHoras = null
  if (checkoutRec) {
    totalHoras = calcularTotalHoras(checkinTime, checkoutTime, bStartTime, bEndTime)
  } else if (isToday && checkinRec) {
    const elapsedMs  = now - new Date(checkinRec.timestamp)
    const elapsedMin = Math.floor(elapsedMs / 60000)
    const refMin     = (bStartRec && bEndRec)
      ? Math.floor((new Date(bEndRec.timestamp) - new Date(bStartRec.timestamp)) / 60000)
      : 0
    totalHoras = Math.max(0, elapsedMin - refMin)
  }

  const difHorario = checkoutRec
    ? calcDiferenciaHorario(totalHoras, schedule?.start_time, schedule?.end_time, schedule?.break_start, schedule?.break_end)
    : null

  const rowBg = estadoFinal === 'justificado'
    ? 'bg-sky-50'
    : estadoFinal === 'overtime'
      ? 'bg-emerald-50'
      : (ESTADO_COLORS[estadoFinal] ?? 'bg-white')

  return (
    <tr
      className={`${rowBg} border-b border-slate-100 text-sm row-enter`}
      style={{ animationDelay: `${Math.min(rowIndex * 30, 300)}ms` }}
    >
      {/* Empleado, fija al hacer scroll horizontal en móvil */}
      <td className={`px-3 py-2.5 font-medium text-slate-800 whitespace-nowrap sticky left-0 z-10 ${rowBg}`}>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center shrink-0 overflow-hidden">
            {emp.photo_url ? (
              <img src={emp.photo_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-xs font-semibold text-blue-700">
                {emp.name[0]?.toUpperCase()}
              </span>
            )}
          </div>
          <span>{emp.name} {emp.last_name}</span>
        </div>
      </td>

      {/* Estado badge + botón justificar */}
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <EstadoBadge estado={estadoFinal} />
          {isAdmin && (esFalta || estadoFinal === 'justificado') && (
            <button
              onClick={() => onJustify(emp, justification ?? null)}
              className="text-xs text-slate-400 hover:text-blue-600 transition-colors"
              title={estadoFinal === 'justificado' ? t('Editar justificación') : t('Justificar ausencia')}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
          )}
        </div>
      </td>

      {/* Sede (solo cuando filtro activo) */}
      {showSedeCol && (
        <td className="px-3 py-2.5 text-xs text-slate-500 whitespace-nowrap">{sedeLabel}</td>
      )}

      {/* Entrada */}
      <td className="px-3 py-2.5 text-slate-600 tabular-nums">
        {checkinRec
          ? <span className="inline-flex items-center gap-1">
              {formatTime(checkinRec.timestamp)}
              {checkinRec.location_valid === false && <FueraDeRangoIcon />}
            </span>
          : <Dash />}
      </td>

      {/* Ini. Refrig. */}
      <td className="px-3 py-2.5 text-slate-600 tabular-nums">
        {bStartRec ? formatTime(bStartRec.timestamp) : <Dash />}
      </td>

      {/* Fin Refrig. */}
      <td className="px-3 py-2.5 text-slate-600 tabular-nums">
        {bEndRec ? formatTime(bEndRec.timestamp) : <Dash />}
      </td>

      {/* Salida */}
      <td className="px-3 py-2.5 text-slate-600 tabular-nums">
        {checkoutRec
          ? <span className="inline-flex items-center gap-1">
              {formatTime(checkoutRec.timestamp)}
              {checkoutRec.location_valid === false && <FueraDeRangoIcon />}
            </span>
          : <Dash />}
      </td>

      {/* Tardanza */}
      <td className="px-3 py-2.5 tabular-nums">
        {tardanza === null
          ? <Dash />
          : tardanza === 0
            ? <span className="text-green-600 text-xs font-medium">{t('A tiempo')}</span>
            : <span className="text-red-600 text-xs font-medium">+{minutesToReadable(tardanza)}</span>
        }
      </td>

      {/* Exc. Refrig. */}
      <td className="px-3 py-2.5 tabular-nums">
        {excesoRef === null || excesoRef === 0
          ? <Dash />
          : <span className="text-amber-600 text-xs font-medium">+{minutesToReadable(excesoRef)}</span>
        }
      </td>

      {/* Total hrs */}
      <td className="px-3 py-2.5 text-slate-600 tabular-nums">
        {totalHoras === null
          ? <Dash />
          : <span className={isToday && !checkoutRec ? 'text-blue-600' : ''}>
              {minutesToReadable(totalHoras)}
              {isToday && !checkoutRec && <span className="ml-1 text-xs text-blue-400">●</span>}
            </span>
        }
      </td>

      {/* Dif. horario */}
      <td className="px-3 py-2.5 tabular-nums">
        {difHorario === null
          ? <Dash />
          : difHorario === 0
            ? <span className="text-green-600 text-xs">{t('A tiempo')}</span>
            : <span className={`text-xs font-medium ${difHorario > 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatMinutes(difHorario)}
              </span>
        }
      </td>
    </tr>
  )
}

function EstadoBadge({ estado }) {
  const styles = {
    asistio:           'bg-green-100 text-green-700',
    falta:             'bg-rose-100 text-rose-700',
    ausente:           'bg-red-100 text-red-700',
    no_iniciado:       'bg-slate-100 text-slate-500',
    pendiente:         'bg-amber-100 text-amber-700',
    permiso:           'bg-sky-100 text-sky-700',
    descanso:          'bg-slate-100 text-slate-500',
    justificado:       'bg-sky-100 text-sky-700',
    feriado:           'bg-orange-100 text-orange-600',
    feriado_trabajado: 'bg-violet-100 text-violet-700',
    overtime:          'bg-emerald-100 text-emerald-700',
  }
  const labels = {
    ...ESTADO_LABELS,
    justificado:       t('Justificado'),
    feriado:           t('Feriado'),
    feriado_trabajado: t('Feriado trabajado'),
    overtime:          t('Horas extra'),
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${styles[estado] ?? ''}`}>
      {labels[estado] ?? estado}
    </span>
  )
}

function Dash() {
  return <span className="text-slate-300">-</span>
}

// Marcación fuera del radio permitido (location_valid = false en el backend).
// Tooltip propio (no el `title` nativo del navegador, que es inconsistente y
// suele tardar en aparecer). Antes solo aparecía al pasar el cursor -
// invisible para teclado/táctil; ahora es un <button> enfocable con
// aria-label (lo anuncia un lector de pantalla de inmediato, sin depender de
// hover) y el tooltip visual también aparece con group-focus, no solo hover.
function FueraDeRangoIcon() {
  const label = t('Este empleado marcó (o pudo haber marcado) fuera del radio permitido')
  return (
    <button
      type="button"
      className="relative inline-flex group focus:outline-none"
      aria-label={label}
    >
      <svg
        className="w-3.5 h-3.5 text-amber-500 shrink-0 cursor-help"
        fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      </svg>
      <span className="pointer-events-none absolute z-30 bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-max max-w-[200px] whitespace-normal rounded-md bg-slate-800 px-2 py-1.5 text-[11px] leading-snug text-white text-center opacity-0 scale-95 transition-all duration-100 group-hover:opacity-100 group-hover:scale-100 group-focus:opacity-100 group-focus:scale-100">
        {label}
      </span>
    </button>
  )
}

// ─── Date picker con calendario custom ───────────────────────────────────────

function formatDateLabel(dateStr) {
  if (!dateStr) return ''
  const date     = new Date(dateStr + 'T12:00:00')
  const today    = todayISO()
  const thisYear = new Date().getFullYear()
  const day      = date.getDate()
  const month    = monthName(date.getMonth(), true)
  const year     = date.getFullYear()
  const dow      = weekdayShort(date.getDay())
  if (dateStr === today) return t('Hoy, {0} {1}', [day, month])
  if (year === thisYear) return `${dow} ${day} ${month}`
  return `${day} ${month} ${year}`
}

function DatePicker({ value, onChange }) {
  const today        = todayISO()
  const isToday      = value === today
  const [open, setOpen]   = useState(false)
  const initD             = value ? new Date(value + 'T12:00:00') : new Date()
  const [vy, setVy]       = useState(initD.getFullYear())
  const [vm, setVm]       = useState(initD.getMonth())
  const containerRef      = useRef(null)

  useEffect(() => {
    if (!open) return
    function onOut(e) {
      if (!containerRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onOut)
    return () => document.removeEventListener('mousedown', onOut)
  }, [open])

  const nowD    = new Date()
  const canNext = vy < nowD.getFullYear() || (vy === nowD.getFullYear() && vm < nowD.getMonth())

  function prevMonth() {
    if (vm === 0) { setVm(11); setVy(y => y - 1) } else setVm(m => m - 1)
  }
  function nextMonth() {
    if (!canNext) return
    if (vm === 11) { setVm(0); setVy(y => y + 1) } else setVm(m => m + 1)
  }

  function handleDay(day) {
    const dateStr = toISODate(vy, vm, day)
    if (dateStr > today) return
    onChange(dateStr)
    setOpen(false)
  }

  const { offset, total } = calMonthData(vy, vm)

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`flex items-center gap-2 pl-2.5 pr-2 py-1.5 rounded-lg text-sm font-medium shadow-sm border transition-colors ${
          isToday
            ? 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100'
            : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50'
        }`}
      >
        <svg className={`w-4 h-4 shrink-0 ${isToday ? 'text-blue-400' : 'text-slate-400'}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <span className="whitespace-nowrap">{formatDateLabel(value)}</span>
        <svg className={`w-3 h-3 shrink-0 transition-transform duration-150 ${open ? 'rotate-180' : ''} ${isToday ? 'text-blue-300' : 'text-slate-300'}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.16, ease: [0.4, 0, 0.2, 1] } }}
            exit={{ opacity: 0, y: -4, scale: 0.97, transition: { duration: 0.1 } }}
            className="absolute right-0 top-full mt-1.5 z-50 bg-white rounded-xl shadow-xl border border-slate-200"
            style={{ minWidth: '288px' }}
          >
            {/* Month nav */}
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <button onClick={prevMonth}
                className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-slate-500">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <span className="text-sm font-semibold text-slate-800 select-none">
                {monthName(vm)} {vy}
              </span>
              <button onClick={nextMonth} disabled={!canNext}
                className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-slate-500 disabled:opacity-30 disabled:cursor-not-allowed">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 px-3 mb-0.5">
              {weekdayInitials().map((d, i) => (
                <div key={i} className="h-8 flex items-center justify-center text-[11px] font-semibold text-slate-400 uppercase tracking-wide">{d}</div>
              ))}
            </div>

            {/* Day cells */}
            <div className="grid grid-cols-7 px-3 pb-3">
              {Array.from({ length: offset }).map((_, i) => <div key={`e${i}`} className="h-9" />)}
              {Array.from({ length: total }).map((_, i) => {
                const day      = i + 1
                const dateStr  = toISODate(vy, vm, day)
                const isSel    = dateStr === value
                const isTod    = dateStr === today
                const isFuture = dateStr > today

                return (
                  <button
                    key={day}
                    onClick={() => !isFuture && handleDay(day)}
                    disabled={isFuture}
                    className={[
                      'h-9 w-full flex items-center justify-center rounded-full text-sm transition-colors select-none',
                      isSel    ? 'bg-blue-600 text-white font-semibold shadow-sm' : '',
                      isTod && !isSel ? 'ring-1 ring-blue-400 text-blue-700 font-semibold' : '',
                      isFuture ? 'text-slate-200 cursor-not-allowed' : '',
                      !isSel && !isFuture ? 'hover:bg-slate-100 text-slate-700 cursor-pointer' : '',
                    ].join(' ')}
                  >
                    {day}
                  </button>
                )
              })}
            </div>

            {/* Footer */}
            <div className="border-t border-slate-100 px-4 py-2.5 flex items-center justify-between">
              <button
                onClick={() => { onChange(today); setOpen(false) }}
                className="text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors"
              >
                {t('Ir a hoy')}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Componente principal ────────────────────────────────────────────────────
export default function Dashboard() {
  const { business, employee, isAdmin } = useAuth()

  const [selectedDate, setSelectedDate] = useState(todayISO())
  const [exportOpen, setExportOpen]   = useState(false)
  const [justifyTarget, setJustifyTarget] = useState(null) // { emp, justification }
  const [selectedSede, setSelectedSede]   = useState('')   // '' = todas, 'none' = sin sede, o location.id
  const [selectedDept, setSelectedDept]   = useState('')   // '' = todas las áreas, o department.id

  const isToday = selectedDate === todayISO()

  // Actualizar "en curso" cada minuto cuando se ve el día de hoy
  const now = useNow(60000, isToday)

  const { data: employees      = [], isLoading: empLoading } = useEmployees()
  const { data: schedules      = [], isLoading: schLoading } = useSchedules()
  const { data: scheduleExceptions = [] } = useScheduleExceptions()
  const { data: records        = [], isLoading: attLoading } = useAttendance(selectedDate)
  const { data: justifications = {} }                        = useJustifications(selectedDate)
  const { data: holidays }                                   = useHolidays()
  const { data: locations      = [] }                        = useLocations()
  const { data: departments    = [] }                        = useDepartments()

  const holidayDates = useMemo(() => {
    if (!holidays) return new Set()
    return new Set(holidays.map(h => h.date))
  }, [holidays])

  const isLoading = empLoading || schLoading || attLoading

  function handleDateChange(dateStr) {
    setSelectedDate(dateStr)
  }

  // Agrupar registros por empleado
  const recordsByEmployee = records.reduce((acc, r) => {
    if (!acc[r.employee_id]) acc[r.employee_id] = []
    acc[r.employee_id].push(r)
    return acc
  }, {})

  // Solo empleados activos que no son owners
  const activeEmployees = employees.filter(e => e.active && e.role !== 'owner')

  // Filtro por sede (solo cuando hay sedes configuradas)
  const showSedeFilter = locations.length > 0
  const showSedeCol    = showSedeFilter && selectedSede !== ''

  const filteredEmployees = useMemo(() => {
    let list = activeEmployees
    if (selectedDept) list = list.filter(e => e.department_id === selectedDept)
    if (selectedSede) {
      // Sede del empleado ese día: donde marcó su entrada; si aún no marcó (o faltó),
      // su sede asignada. Así el ausente no desaparece de su sede.
      list = list.filter(emp => {
        const checkin = (recordsByEmployee[emp.id] ?? []).find(r => r.type === 'checkin')
        const sedeId  = checkin ? checkin.location_id : emp.location_id
        if (selectedSede === 'none') return !sedeId
        return sedeId === selectedSede
      })
    }
    return list
  }, [activeEmployees, recordsByEmployee, selectedSede, selectedDept])

  function sedeName(locationId) {
    if (!locationId) return t('Sin sede')
    return locations.find(l => l.id === locationId)?.name ?? '-'
  }

  // KPIs
  const nowMinutesKpi = (() => {
    if (!isToday) return null
    const localTime = new Date(now).toLocaleTimeString('en-US', { timeZone: getAppTimezone(), hour: '2-digit', minute: '2-digit', hour12: false })
    const [ph, pm] = localTime.split(':').map(Number)
    return ph * 60 + pm
  })()
  const kpis = activeEmployees.reduce(
    (acc, emp) => {
      const empRecords   = recordsByEmployee[emp.id] ?? []
      const schedule     = getScheduleForDate(emp.id, selectedDate, schedules, emp.location_id, scheduleExceptions)
      const tieneHorario = schedule ? true : !getApplicableSchedule(emp.id, schedules, emp.location_id)
      const isHoliday    = holidayDates.has(selectedDate)
      const checkinRec   = empRecords.find(r => r.type === 'checkin')

      if (isHoliday && checkinRec)  { acc.feriadosTrabajados++; return acc }
      if (isHoliday && !checkinRec) return acc // feriado sin trabajar → no cuenta en KPIs

      // Hoy sin checkin: distingue si el turno ya empezó, sigue en curso, o
      // ya pasó de largo, en vez de contarlo como "falta" desde la medianoche.
      let estado = (isToday && !checkinRec && tieneHorario)
        ? resolveEstadoHoySinCheckin(schedule, nowMinutesKpi)
        : determinarEstado(empRecords, tieneHorario, false)
      if (estado === 'pendiente' && isToday && schedule?.end_time && nowMinutesKpi > timeToMinutes(schedule.end_time)) {
        estado = 'overtime'
      }
      if (estado === 'asistio' || estado === 'pendiente' || estado === 'overtime') acc.presentes++
      if (estado === 'falta')     acc.faltas++
      if (estado === 'pendiente') acc.pendientes++
      // Tardanza, solo cuenta si hay marcación de entrada y horario para compararla
      if (checkinRec && schedule?.start_time) {
        const tardanza = calcularTardanza(extractTime(checkinRec.timestamp), schedule.start_time, business?.tolerance_minutes ?? 5)
        if (tardanza > 0) acc.tarde++
      }
      return acc
    },
    { presentes: 0, faltas: 0, pendientes: 0, feriadosTrabajados: 0, tarde: 0 }
  )

  return (
    <div className="p-4 sm:p-6">

      {!isLoading && (
        <DashboardHero
          business={business}
          userName={employee?.name}
          hasSchedule={schedules.some(s => s.is_default)}
          employeeCount={activeEmployees.length}
          employees={activeEmployees}
          schedules={schedules}
          records={records}
          kpis={kpis}
          isToday={isToday}
        />
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between mb-6 gap-3 sm:gap-4">
        <div>
          {!isLoading && activeEmployees.length > 0 && (
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className="flex items-center gap-1.5 text-xs text-slate-500">
                <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {activeEmployees.length}{' '}{t('empleados')}
              </span>
              <span className="w-px h-3 bg-slate-200" />
              <span className="flex items-center gap-1.5 text-xs text-slate-500">
                <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {t('Tiempo real')}
              </span>
              {isToday && (
                <>
                  <span className="w-px h-3 bg-slate-200" />
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-blue-600">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
                    </span>
                    {t('En vivo')}
                  </span>
                </>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <DatePicker
            value={selectedDate}
            onChange={handleDateChange}
          />

          <button
            onClick={() => setExportOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors shadow-sm border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:border-slate-300"
            title={t('Exportar reporte')}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            <span className="hidden sm:inline">{t('Exportar')}</span>
          </button>
        </div>
      </div>

      {/* KPIs */}
      <motion.div
        variants={staggerContainer} initial="hidden" animate="visible"
        className={`grid gap-3 sm:gap-4 mb-6 ${kpis.feriadosTrabajados > 0 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'}`}
      >
        <motion.div variants={staggerItem} className="bg-white rounded-xl border border-slate-200 p-4 text-center">
          <p className="text-2xl font-bold text-slate-900">{kpis.presentes}</p>
          <p className="text-xs text-slate-500 mt-0.5">{t('Presentes')}</p>
        </motion.div>
        <motion.div variants={staggerItem} className="bg-white rounded-xl border border-slate-200 p-4 text-center">
          <p className="text-2xl font-bold text-rose-600">{kpis.faltas}</p>
          <p className="text-xs text-slate-500 mt-0.5">{t('Faltas')}</p>
        </motion.div>
        <motion.div variants={staggerItem} className="bg-white rounded-xl border border-slate-200 p-4 text-center">
          <p className="text-2xl font-bold text-amber-500">{kpis.pendientes}</p>
          <p className="text-xs text-slate-500 mt-0.5">{t('Pendientes')}</p>
        </motion.div>
        {kpis.feriadosTrabajados > 0 && (
          <motion.div variants={staggerItem} className="bg-violet-50 rounded-xl border border-violet-200 p-4 text-center">
            <p className="text-2xl font-bold text-violet-700">{kpis.feriadosTrabajados}</p>
            <p className="text-xs text-violet-500 mt-0.5">{t('En feriado')}</p>
          </motion.div>
        )}
      </motion.div>

      {/* Filtros en una sola fila: sede (solo con sedes configuradas) y área */}
      {(showSedeFilter || departments.length > 0) && (
        <div className="flex flex-wrap items-center gap-3 mb-4">
          {showSedeFilter && (
            <FilterSelect
              value={selectedSede}
              onChange={setSelectedSede}
              placeholder={t('Todas las sedes')}
              options={[
                { value: '', label: t('Todas las sedes') },
                ...locations.map(loc => ({ value: loc.id, label: loc.name })),
                { value: 'none', label: t('Sin sede (QR general)') },
              ]}
              icon={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-2 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              }
            />
          )}
          {departments.length > 0 && (
            <FilterSelect
              value={selectedDept}
              onChange={setSelectedDept}
              placeholder={t('Todas las áreas')}
              options={[
                { value: '', label: t('Todas las áreas') },
                ...departments.map(d => ({ value: d.id, label: d.name })),
              ]}
              icon={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              }
            />
          )}
          {(selectedSede || selectedDept) && (
            <button
              onClick={() => { setSelectedSede(''); setSelectedDept('') }}
              className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
            >
              {t('Limpiar filtros')}
            </button>
          )}
        </div>
      )}

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="py-16 text-center">
            <p className="text-slate-400 text-sm">{t('Cargando...')}</p>
          </div>
        ) : filteredEmployees.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-slate-500 text-sm font-medium">
              {selectedSede ? t('Sin empleados en esta sede para este día') : t('No hay empleados activos')}
            </p>
            <p className="text-slate-400 text-xs mt-1">
              {selectedSede ? t('Prueba seleccionando otra sede o "Todas las sedes"') : t('Agrega empleados desde la sección Empleados')}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <p className="sm:hidden text-[11px] text-slate-400 px-3 pt-2.5 -mb-1 flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
              </svg>
              {t('Desliza para ver más columnas')}
            </p>
            <table className="w-full text-sm min-w-[760px] sm:min-w-[900px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
                  <th className="px-3 py-3 text-left font-medium sticky left-0 z-20 bg-slate-50">{t('Empleado')}</th>
                  <th className="px-3 py-3 text-left font-medium">{t('Estado')}</th>
                  {showSedeCol && <th className="px-3 py-3 text-left font-medium">{t('Sede')}</th>}
                  <th className="px-3 py-3 text-left font-medium">{t('Entrada')}</th>
                  <th className="px-3 py-3 text-left font-medium">{t('Ini. Refrig.')}</th>
                  <th className="px-3 py-3 text-left font-medium">{t('Fin Refrig.')}</th>
                  <th className="px-3 py-3 text-left font-medium">{t('Salida')}</th>
                  <th className="px-3 py-3 text-left font-medium">{t('Tardanza')}</th>
                  <th className="px-3 py-3 text-left font-medium">{t('Exc. Refrig.')}</th>
                  <th className="px-3 py-3 text-left font-medium">{t('Total hrs')}</th>
                  <th className="px-3 py-3 text-left font-medium">{t('Dif. horario')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.map((emp, idx) => {
                  const empRecords = recordsByEmployee[emp.id] ?? []
                  const checkin    = empRecords.find(r => r.type === 'checkin')
                  const daySchedule = getScheduleForDate(emp.id, selectedDate, schedules, emp.location_id, scheduleExceptions)
                  return (
                    <AttendanceRow
                      key={emp.id}
                      emp={emp}
                      empRecords={empRecords}
                      schedule={daySchedule}
                      tieneHorario={daySchedule ? true : !getApplicableSchedule(emp.id, schedules, emp.location_id)}
                      now={now}
                      isToday={isToday}
                      toleranceMinutes={business?.tolerance_minutes ?? 5}
                      justification={justifications[emp.id] ?? null}
                      isAdmin={isAdmin}
                      onJustify={(emp, justification) => setJustifyTarget({ emp, justification })}
                      isHoliday={holidayDates.has(selectedDate)}
                      showSedeCol={showSedeCol}
                      sedeLabel={showSedeCol ? sedeName(checkin ? checkin.location_id : emp.location_id) : null}
                      rowIndex={idx}
                    />
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

      </div>

      <AnimatePresence>
        {exportOpen && <ExportModal key="export" onClose={() => setExportOpen(false)} />}
      </AnimatePresence>

      <AnimatePresence>
        {justifyTarget && (
          <JustificationModal
            key="justify"
            employee={justifyTarget.emp}
            date={selectedDate}
            justification={justifyTarget.justification}
            onClose={() => setJustifyTarget(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
