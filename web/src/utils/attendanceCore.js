// Helpers de datos de asistencia sin dependencias pesadas (nada de jsPDF/xlsx
// aquí) - para que quien solo necesita dateRange/buildMaps (LeaveCalendar,
// vacations.js, employeeStats.js, attendanceReport.js) no arrastre esas
// librerías al bundle.

import {
  calcularTardanza,
  calcularExcesoRefrigerio,
  calcularSalidaAnticipada,
} from './attendance'
import { ABSENCE_TYPE_LABELS } from './labels'
import { t } from '../i18n/index.js'

export const DEFAULT_DAYS = [1, 2, 3, 4, 5]

export function dateRange(from, to) {
  const dates = []
  const current = new Date(from + 'T12:00:00')
  const end     = new Date(to   + 'T12:00:00')
  while (current <= end) {
    dates.push(current.toLocaleDateString('en-CA'))
    current.setDate(current.getDate() + 1)
  }
  return dates
}

// Exportada: attendanceReport.js también la usa directo para cabeceras de Excel,
// fuera de buildRowData.
export function formatFecha(dateStr) {
  const [y, m, d] = dateStr.split('-')
  return `${d}/${m}/${y}`
}

function calcHorasTrabajadasMin(checkin, checkout, breakStart, breakEnd) {
  if (!checkin || !checkout) return null
  const toMin = time => { const [h, m] = time.split(':').map(Number); return h * 60 + m }
  const bruto = toMin(checkout) - toMin(checkin)
  const ref   = (breakStart && breakEnd) ? toMin(breakEnd) - toMin(breakStart) : 0
  return Math.max(0, bruto - ref)
}

function calcMinutosHorasExtra(checkin, checkout, breakStart, breakEnd, schedule) {
  if (!checkin || !checkout || !schedule?.start_time || !schedule?.end_time) return null
  const toMin = time => { const [h, m] = time.split(':').map(Number); return h * 60 + m }
  const bruto = toMin(checkout) - toMin(checkin)
  const refReal = (breakStart && breakEnd) ? toMin(breakEnd) - toMin(breakStart) : 0
  const trabajados = bruto - refReal
  const jornadaBruta = toMin(schedule.end_time) - toMin(schedule.start_time)
  const refEsperado = (schedule.break_start && schedule.break_end)
    ? toMin(schedule.break_end) - toMin(schedule.break_start)
    : 0
  const asignados = jornadaBruta - refEsperado
  const extra = trabajados - asignados
  return extra > 0 ? extra : 0
}

function formatHHMM(minutes) {
  if (minutes === null || minutes === undefined) return ''
  const h = Math.floor(minutes / 60)
  const mn = minutes % 60
  return `${h}:${String(mn).padStart(2, '0')}`
}

export function buildRowData(emp, date, marks, schedule, holidaySet, justMap, overtimeMap, locationMap) {
  const checkin    = marks.checkin     ?? ''
  const breakStart = marks.break_start ?? ''
  const breakEnd   = marks.break_end   ?? ''
  const checkout   = marks.checkout    ?? ''
  const isManual   = marks.is_manual   ?? false
  const manualReason = marks.manual_reason ?? ''
  const locationId = marks.location_id ?? null
  const isHoliday  = holidaySet.has(date)

  const justKey  = `${emp.id}__${date}`
  const just     = justMap[justKey]
  const justType = just?.type  ?? ''
  const justText = just?.reason ?? ''

  const horasTrabMin = calcHorasTrabajadasMin(checkin, checkout, breakStart, breakEnd)
  const heMin        = calcMinutosHorasExtra(checkin, checkout, breakStart, breakEnd, schedule)

  const tardanzaMin  = (checkin && schedule?.start_time)
    ? calcularTardanza(checkin, schedule.start_time, 0)
    : null

  const excesoRefMin = (breakStart && breakEnd && schedule?.break_start && schedule?.break_end)
    ? calcularExcesoRefrigerio(breakStart, breakEnd, schedule.break_start, schedule.break_end)
    : null

  const salidaAntMin = (checkout && schedule?.end_time)
    ? calcularSalidaAnticipada(checkout, schedule.end_time)
    : null

  const overtimeKey  = `${emp.id}__${date}`
  const overtime     = overtimeMap[overtimeKey]
  const heAutorizado = overtime?.minutes_authorized ?? null
  const heNoAut      = (heMin !== null && heAutorizado !== null)
    ? Math.max(0, heMin - heAutorizado)
    : null
  const compensacion = overtime?.compensation ?? ''
  const consentimiento = overtime ? (overtime.consent ? t('Sí') : 'No') : ''

  let estado
  if (isHoliday)           estado = t('Feriado trabajado')
  else if (justType)       estado = ABSENCE_TYPE_LABELS[justType] ?? t('Permiso')
  else if (checkin)        estado = t('Asistió')
  else                     estado = t('Falta')

  const sede  = locationId ? (locationMap[locationId] ?? '') : ''
  const horarioProg = schedule
    ? `${schedule.start_time?.slice(0,5) ?? ''}–${schedule.end_time?.slice(0,5) ?? ''}`
    : ''
  const refProg = (schedule?.break_start && schedule?.break_end)
    ? `${schedule.break_start.slice(0,5)}–${schedule.break_end.slice(0,5)}`
    : ''

  return {
    apellidosNombres: `${emp.last_name}, ${emp.name}`,
    docType:    emp.doc_type ?? 'ID',
    dni:        emp.dni      ?? '',
    puesto:     emp.puesto   ?? '',
    fecha:      formatFecha(date),
    estado,
    horarioProg,
    refProg,
    checkin,
    tardanzaMin:  tardanzaMin  !== null ? String(tardanzaMin)  : '',
    breakStart,
    breakEnd,
    excesoRefMin: excesoRefMin !== null ? String(excesoRefMin) : '',
    checkout,
    salidaAntMin: salidaAntMin !== null ? String(salidaAntMin) : '',
    horasTrab:    horasTrabMin !== null ? formatHHMM(horasTrabMin) : '',
    heTotal:      heMin        !== null ? formatHHMM(heMin)        : '',
    heAutorizado: heAutorizado !== null ? formatHHMM(heAutorizado) : '',
    heNoAut:      heNoAut      !== null ? formatHHMM(heNoAut)      : '',
    compensacion,
    consentimiento,
    sede,
    origen:      isManual ? t('Manual') : t('Autoservicio'),
    motivoManual: manualReason,
    justType:    justType ? (ABSENCE_TYPE_LABELS[justType] ?? justType) : '',
    justText,
  }
}

export function buildMaps(records, justifications, overtimeAuthorizations, locations) {
  const recordMap = {}
  for (const r of records) {
    const key = `${r.employee_id}__${r.date}`
    if (!recordMap[key]) recordMap[key] = {}
    recordMap[key][r.type] = r.time
    if (r.is_manual)     recordMap[key].is_manual = r.is_manual
    if (r.manual_reason) recordMap[key].manual_reason = r.manual_reason
    if (r.location_id)   recordMap[key].location_id = r.location_id
  }

  const justMap = {}
  for (const j of (justifications ?? [])) {
    // Expandir rango date..date_to para que una ausencia multi-día se refleje
    // en todos sus días (no solo el primero).
    const days = dateRange(j.date, j.date_to || j.date)
    for (const d of (days.length ? days : [j.date])) {
      justMap[`${j.employee_id}__${d}`] = j
    }
  }

  const overtimeMap = {}
  for (const o of (overtimeAuthorizations ?? [])) {
    overtimeMap[`${o.employee_id}__${o.date}`] = o
  }

  const locationMap = {}
  for (const l of (locations ?? [])) {
    locationMap[l.id] = l.name
  }

  return { recordMap, justMap, overtimeMap, locationMap }
}
