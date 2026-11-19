import { t } from '../i18n/index.js'

/**
 * The status a row of the dashboard shows. Someone with a justified absence (a vacation, a medical leave) is
 * shown as justified, both while the day is still going ('ausente') and once it is over ('falta'). Before, only
 * 'falta' was, so a person on approved vacation looked absent in red until the end of the working day.
 */
export function estadoConJustificacion(estado, justification) {
  return (estado === 'falta' || estado === 'ausente') && justification ? 'justificado' : estado
}
/**
 * Lógica de cálculo de asistencia de Asistia.
 * Toda la lógica de negocio definida en docs/referencia/LOGICA-ASISTENCIA.md vive aquí.
 */

/**
 * Convierte "HH:MM" a minutos desde medianoche.
 */
export function timeToMinutes(time) {
  if (!time) return null
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

/**
 * Convierte minutos a string "H h MM min" legible.
 */
export function minutesToReadable(minutes) {
  if (minutes === null || minutes === undefined) return '-'
  const h = Math.floor(Math.abs(minutes) / 60)
  const m = Math.abs(minutes) % 60
  if (h === 0) return `${m} min`
  if (m === 0) return `${h} h`
  return `${h} h ${m} min`
}

/**
 * Calcula los minutos de tardanza.
 * Si la diferencia es <= toleranciaMinutos, retorna 0.
 */
export function calcularTardanza(horaEntrada, horarioInicio, toleranciaMinutos = 5) {
  if (!horaEntrada || !horarioInicio) return null
  const entradaMin = timeToMinutes(horaEntrada)
  const inicioMin = timeToMinutes(horarioInicio)
  const diff = entradaMin - inicioMin
  return diff > toleranciaMinutos ? diff : 0
}

/**
 * Calcula minutos de exceso en el refrigerio.
 */
export function calcularExcesoRefrigerio(breakStart, breakEnd, breakStartRef, breakEndRef) {
  if (!breakStart || !breakEnd || !breakStartRef || !breakEndRef) return null
  const duracionReal = timeToMinutes(breakEnd) - timeToMinutes(breakStart)
  const duracionPermitida = timeToMinutes(breakEndRef) - timeToMinutes(breakStartRef)
  const exceso = duracionReal - duracionPermitida
  return exceso > 0 ? exceso : 0
}

/**
 * Calcula minutos de salida anticipada.
 */
export function calcularSalidaAnticipada(horaSalida, horarioFin) {
  if (!horaSalida || !horarioFin) return null
  const salidaMin = timeToMinutes(horaSalida)
  const finMin = timeToMinutes(horarioFin)
  const diff = finMin - salidaMin
  return diff > 0 ? diff : 0
}

/**
 * Calcula total de horas trabajadas en minutos.
 * Total = (checkout - checkin) - duración real del refrigerio.
 */
export function calcularTotalHoras(checkin, checkout, breakStart, breakEnd) {
  if (!checkin || !checkout) return null
  const totalBruto = timeToMinutes(checkout) - timeToMinutes(checkin)
  const refrigerio = (breakStart && breakEnd)
    ? timeToMinutes(breakEnd) - timeToMinutes(breakStart)
    : 0
  return totalBruto - refrigerio
}

/**
 * Calcula horas extra en minutos.
 */
export function calcularHorasExtra(horasTrabajadas, horarioInicio, horarioFin, breakStartRef, breakEndRef) {
  if (!horasTrabajadas || !horarioInicio || !horarioFin) return null
  const jornadaMinutos = timeToMinutes(horarioFin) - timeToMinutes(horarioInicio)
  const refrigerioMinutos = (breakStartRef && breakEndRef)
    ? timeToMinutes(breakEndRef) - timeToMinutes(breakStartRef)
    : 0
  const horasAsignadas = jornadaMinutos - refrigerioMinutos
  const extra = horasTrabajadas - horasAsignadas
  return extra > 0 ? extra : 0
}

/**
 * Determina el estado de asistencia de un empleado en un día.
 * @returns 'asistio' | 'falta' | 'ausente' | 'permiso' | 'pendiente'
 */
export function determinarEstado(registrosDia = [], tieneHorarioEseDia = true, tienePermiso = false) {
  if (tienePermiso) return 'permiso'

  const checkin = registrosDia.find(r => r.type === 'checkin')
  const checkout = registrosDia.find(r => r.type === 'checkout')

  if (!checkin && !tieneHorarioEseDia) return 'descanso'
  if (!checkin && tieneHorarioEseDia) return 'falta'
  if (checkin && !checkout) return 'pendiente'
  return 'asistio'
}

/**
 * Resuelve el estado de HOY para un empleado que todavía no marcó entrada,
 * distinguiendo si su turno ya empezó o no. Sin esto, determinarEstado()
 * devuelve 'falta' desde la medianoche, antes de que arranque la jornada,
 * lo que hace ver a todo el mundo como "ausente/falta" a primera hora.
 * @returns 'no_iniciado' (aún no llega la hora de entrada) | 'ausente'
 *          (turno en curso, todavía puede marcar) | 'falta' (pasó la hora
 *          de salida + 1h de tolerancia sin ninguna marcación)
 */
export function resolveEstadoHoySinCheckin(schedule, nowMinutes) {
  const endTime = schedule?.end_time
  if (!endTime) return 'ausente'

  const startTime = schedule?.start_time
  const startMinutes = startTime ? timeToMinutes(startTime) : null
  if (startMinutes !== null && nowMinutes < startMinutes) return 'no_iniciado'

  const cutoffMinutes = timeToMinutes(endTime) + 60
  return nowMinutes >= cutoffMinutes ? 'falta' : 'ausente'
}

/**
 * Mapa de colores del dashboard por estado.
 */
export const ESTADO_COLORS = {
  asistio:           'bg-white',
  falta:             'bg-rose-50',
  ausente:           'bg-red-100',
  no_iniciado:       'bg-white',
  pendiente:         'bg-amber-50',
  permiso:           'bg-sky-50',
  descanso:          'bg-slate-50',
  feriado:           'bg-orange-50',
  feriado_trabajado: 'bg-violet-50',
}

/**
 * Retorna el horario aplicable a un empleado.
 * Prioridad: horario propio del empleado > horario de su sede > default de
 * la empresa. `locationId` es opcional (empleados sin sede asignada, o
 * llamadas que todavía no la conocen, simplemente no pasan por ese nivel).
 */
export function getApplicableSchedule(employeeId, allSchedules = [], locationId = null) {
  const own = allSchedules.find(s => s.employee_id === employeeId && s.active)
  if (own) return own
  if (locationId) {
    const bySede = allSchedules.find(s => s.employee_id == null && s.location_id === locationId && s.active)
    if (bySede) return bySede
  }
  return allSchedules.find(s => s.is_default && s.employee_id == null && s.location_id == null && s.active) ?? null
}

/**
 * Retorna el horario aplicable a un empleado en una FECHA concreta.
 * Antes que nada revisa si hay una excepción para esa fecha exacta (misma
 * prioridad de scope: empleado > sede > empresa); si existe, gana por
 * completo sobre el horario recurrente, aunque sea "no laborable"
 * (start_time null → devuelve null, día sin horario).
 * Sin excepción, aplica la misma prioridad al horario recurrente
 * (personal > sede > empresa), y el nivel elegido manda por completo: si el
 * empleado tiene bloques propios (o de su sede) y ninguno cubre ese día de
 * la semana, el resultado es null (descanso), no se sigue buscando en el
 * nivel siguiente.
 * `date` puede ser 'YYYY-MM-DD' o Date. Devuelve null si no hay horario ese día.
 */
export function getScheduleForDate(employeeId, date, allSchedules = [], locationId = null, exceptions = []) {
  const dateObj = date instanceof Date ? date : new Date(date + 'T12:00:00')
  const dateStr = date instanceof Date ? date.toLocaleDateString('en-CA') : date
  const dow = dateObj.getDay() // 0=Dom..6=Sáb

  const exPersonal = exceptions.find(e => e.employee_id === employeeId && e.date === dateStr)
  if (exPersonal) return exPersonal.start_time ? exPersonal : null
  if (locationId) {
    const exSede = exceptions.find(e => e.employee_id == null && e.location_id === locationId && e.date === dateStr)
    if (exSede) return exSede.start_time ? exSede : null
  }
  const exEmpresa = exceptions.find(e => e.employee_id == null && e.location_id == null && e.date === dateStr)
  if (exEmpresa) return exEmpresa.start_time ? exEmpresa : null

  const covers = s => s.active && Array.isArray(s.days_of_week) && s.days_of_week.includes(dow)
  const ownAll = allSchedules.filter(s => s.employee_id === employeeId && s.active)
  if (ownAll.length > 0) return ownAll.find(covers) ?? null
  if (locationId) {
    const sedeAll = allSchedules.filter(s => s.employee_id == null && s.location_id === locationId && s.active)
    if (sedeAll.length > 0) return sedeAll.find(covers) ?? null
  }
  return allSchedules.find(s => s.is_default && s.employee_id == null && s.location_id == null && covers(s)) ?? null
}

/**
 * Calcula la diferencia firmada entre horas trabajadas y jornada asignada.
 * Positivo = horas extra. Negativo = salida anticipada.
 */
export function calcDiferenciaHorario(totalMinutos, schedStart, schedEnd, breakStartRef, breakEndRef) {
  if (totalMinutos === null || !schedStart || !schedEnd) return null
  const jornadaBruta = timeToMinutes(schedEnd) - timeToMinutes(schedStart)
  const refrigerio = (breakStartRef && breakEndRef)
    ? timeToMinutes(breakEndRef) - timeToMinutes(breakStartRef)
    : 0
  return totalMinutos - (jornadaBruta - refrigerio)
}

/**
 * Formatea minutos firmados para la columna Dif.horario.
 * Ej: 65 → "+1h 5m", -20 → "-20 min", 0 → "A tiempo"
 */
export function formatMinutes(minutes) {
  if (minutes === null || minutes === undefined) return '-'
  if (minutes === 0) return t('A tiempo')
  const abs = Math.abs(minutes)
  const h = Math.floor(abs / 60)
  const m = abs % 60
  const sign = minutes > 0 ? '+' : '-'
  if (h === 0) return `${sign}${m} min`
  if (m === 0) return `${sign}${h}h`
  return `${sign}${h}h ${m}m`
}

/**
 * Labels de estado en español.
 */
export const ESTADO_LABELS = {
  get asistio() { return t('Asistió') },
  get falta() { return t('Falta') },
  get ausente() { return t('Ausente') },
  get no_iniciado() { return t('Aún no inicia') },
  get pendiente() { return t('Pendiente') },
  get permiso() { return t('Permiso') },
  get descanso() { return t('Descanso') },
  get feriado() { return t('Feriado') },
  get feriado_trabajado() { return t('Feriado trabajado') },
}
