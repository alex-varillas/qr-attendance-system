/**
 * Agregación de analítica por empleado a partir del JSON de get_attendance_report.
 * Reutiliza buildMaps/dateRange (attendanceCore.js) y las funciones de cálculo de
 * attendance.js para no duplicar lógica de negocio.
 */
import { buildMaps, dateRange } from './attendanceCore'
import {
  getScheduleForDate,
  calcularTotalHoras,
  calcularTardanza,
  determinarEstado,
  resolveEstadoHoySinCheckin,
} from './attendance'
import { todayISO, getAppTimezone } from './dates'

const TIPOS = ['checkin', 'break_start', 'break_end', 'checkout']

/**
 * Metadatos de cada categoría de día: label, color hex (Recharts) y clases
 * Tailwind (heatmap / leyenda). Reutilizado por StatusDonut y MonthHeatmap.
 */
export const STAT_CATEGORIES = {
  asistio:           { label: 'Asistió',        hex: '#22c55e', bg: 'bg-emerald-200', text: 'text-emerald-800' },
  tardanza:          { label: 'Tardanza',       hex: '#f59e0b', bg: 'bg-amber-200',   text: 'text-amber-800' },
  pendiente:         { label: 'Pendiente',      hex: '#fbbf24', bg: 'bg-amber-100',   text: 'text-amber-700' },
  falta:             { label: 'Falta',          hex: '#f43f5e', bg: 'bg-rose-200',    text: 'text-rose-800' },
  permiso:           { label: 'Permiso',        hex: '#0ea5e9', bg: 'bg-sky-200',     text: 'text-sky-800' },
  descanso:          { label: 'Descanso',       hex: '#cbd5e1', bg: 'bg-slate-200',   text: 'text-slate-600' },
  feriado:           { label: 'Feriado',        hex: '#fb923c', bg: 'bg-orange-200',  text: 'text-orange-800' },
  feriado_trabajado: { label: 'Feriado trab.',  hex: '#a78bfa', bg: 'bg-violet-200',  text: 'text-violet-800' },
  no_iniciado:       { label: 'Aún no inicia',  hex: '#e2e8f0', bg: 'bg-slate-100',   text: 'text-slate-500' },
  futuro:            { label: '-',              hex: '#f1f5f9', bg: 'bg-slate-50',    text: 'text-slate-300' },
}

function categoria(estado, tardanzaMin) {
  if (estado === 'asistio' || estado === 'feriado_trabajado') {
    return tardanzaMin > 0 ? 'tardanza' : estado === 'feriado_trabajado' ? 'feriado_trabajado' : 'asistio'
  }
  if (estado === 'pendiente') return tardanzaMin > 0 ? 'tardanza' : 'pendiente'
  return estado // falta | permiso | descanso | feriado
}

/**
 * @param {object} report  resultado de get_attendance_report
 * @param {string} employeeId
 * @param {string} from 'YYYY-MM-DD'
 * @param {string} to   'YYYY-MM-DD'
 * @param {number} tolerance tolerancia de tardanza (min)
 * @returns {{ serie, kpis, distribucion }}
 */
export function computeEmployeeStats(report, employeeId, from, to, tolerance = 5) {
  const empty = { serie: [], kpis: null, distribucion: [] }
  if (!report || !employeeId || !from || !to) return empty

  const schedules   = report.schedules ?? []
  const exceptions  = report.schedule_exceptions ?? []
  const locationId  = (report.employees ?? []).find(e => e.id === employeeId)?.location_id ?? null
  const { recordMap, justMap } = buildMaps(
    report.records ?? [],
    report.justifications ?? [],
    report.overtime_authorizations ?? [],
    report.locations ?? [],
  )
  const holidaySet = new Set([
    ...(report.holidays ?? []).map(h => h.date),
  ])

  const today = todayISO()
  // Hora actual en la timezone de la empresa, solo hace falta si el rango
  // incluye el día de hoy (ver uso más abajo).
  const nowMinutes = (() => {
    const localTime = new Date().toLocaleTimeString('en-US', { timeZone: getAppTimezone(), hour: '2-digit', minute: '2-digit', hour12: false })
    const [h, m] = localTime.split(':').map(Number)
    return h * 60 + m
  })()
  const serie = []
  const dist = {}
  let diasLaborables = 0
  let faltas = 0
  let tardanzasMin = 0
  let tardanzasCount = 0
  let horasMin = 0

  for (const date of dateRange(from, to)) {
    // Días futuros: se muestran vacíos en el calendario, no cuentan en KPIs.
    if (date > today) {
      serie.push({ date, cat: 'futuro', estado: 'futuro', horasMin: 0, tardanzaMin: 0 })
      continue
    }

    const key      = `${employeeId}__${date}`
    const marks    = recordMap[key] ?? {}
    const just     = justMap[key]
    const schedule = getScheduleForDate(employeeId, date, schedules, locationId, exceptions)
    const isHoliday = holidaySet.has(date)
    const tieneCheckin = !!marks.checkin

    const registrosDia = TIPOS.filter(t => marks[t]).map(type => ({ type }))
    // Hoy sin checkin: distingue si el turno ya empezó o no, en vez de
    // marcar "falta" desde la medianoche (mismo ajuste que el Dashboard).
    let estado = (date === today && !tieneCheckin && schedule && !just)
      ? resolveEstadoHoySinCheckin(schedule, nowMinutes)
      : determinarEstado(registrosDia, !!schedule, !!just)
    if (isHoliday && estado !== 'permiso') {
      estado = tieneCheckin ? 'feriado_trabajado' : 'feriado'
    }

    const horas = calcularTotalHoras(marks.checkin, marks.checkout, marks.break_start, marks.break_end)
    if (horas != null && horas > 0) horasMin += horas

    let tardanza = 0
    if (tieneCheckin && schedule?.start_time && !isHoliday && !just) {
      tardanza = calcularTardanza(marks.checkin, schedule.start_time, tolerance) ?? 0
    }
    if (tardanza > 0) { tardanzasMin += tardanza; tardanzasCount++ }

    if (schedule && !isHoliday && !just) diasLaborables++
    if (estado === 'falta') faltas++

    const cat = categoria(estado, tardanza)
    dist[cat] = (dist[cat] ?? 0) + 1

    serie.push({ date, cat, estado, horasMin: horas ?? 0, tardanzaMin: tardanza })
  }

  const asistenciaPct = diasLaborables > 0
    ? Math.round(((diasLaborables - faltas) / diasLaborables) * 100)
    : null

  const distribucion = Object.entries(dist)
    .filter(([cat, v]) => v > 0 && cat !== 'futuro')
    .map(([cat, value]) => ({ cat, value }))
    .sort((a, b) => b.value - a.value)

  return {
    serie,
    distribucion,
    kpis: { asistenciaPct, tardanzasMin, tardanzasCount, horasMin, faltas, diasLaborables },
    insights: computeInsights(serie),
  }
}

const ASISTIDO_CATS = ['asistio', 'tardanza', 'pendiente', 'feriado_trabajado']

/**
 * Métricas resumidas del mes, derivadas de la serie diaria.
 * @returns {{ avgHorasMin, topDay, avgTardanzaMin, puntualidadPct, mejorRacha }}
 */
export function computeInsights(serie = []) {
  const trabajados = serie.filter(d => d.cat !== 'futuro' && d.horasMin > 0)
  const avgHorasMin = trabajados.length
    ? Math.round(trabajados.reduce((s, d) => s + d.horasMin, 0) / trabajados.length)
    : 0

  const topDay = trabajados.reduce(
    (best, d) => (d.horasMin > (best?.horasMin ?? 0) ? { date: d.date, horasMin: d.horasMin } : best),
    null,
  )

  const conTardanza = serie.filter(d => d.tardanzaMin > 0)
  const avgTardanzaMin = conTardanza.length
    ? Math.round(conTardanza.reduce((s, d) => s + d.tardanzaMin, 0) / conTardanza.length)
    : 0

  const asistidos = serie.filter(d => ASISTIDO_CATS.includes(d.cat))
  const aTiempo = asistidos.filter(d => d.tardanzaMin === 0)
  const puntualidadPct = asistidos.length
    ? Math.round((aTiempo.length / asistidos.length) * 100)
    : null

  // Mejor racha: días con asistencia consecutivos; 'falta' corta la racha;
  // descanso/permiso/feriado/futuro se ignoran (no suman ni cortan).
  let mejorRacha = 0
  let actual = 0
  for (const d of serie) {
    if (ASISTIDO_CATS.includes(d.cat)) {
      actual++
      if (actual > mejorRacha) mejorRacha = actual
    } else if (d.cat === 'falta') {
      actual = 0
    }
  }

  return { avgHorasMin, topDay, avgTardanzaMin, puntualidadPct, mejorRacha }
}
