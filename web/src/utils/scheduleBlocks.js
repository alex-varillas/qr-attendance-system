// Schedule blocks: the shape the form edits and how it maps to and from the rows of the API.
// A "block" is a group of days with their start and end time and, optionally, a break (a meal break or a split shift).
import { t } from '../i18n/index.js'

export const EMPTY_BLOCK = {
  days_of_week: [1, 2, 3, 4, 5],
  start_time: '08:00', end_time: '18:00',
  has_break: true, break_start: '13:00', break_end: '14:00',
}

// Filas de la BD (schedules) → bloques del formulario
export function schedulesToBlocks(rows) {
  return rows.map(s => ({
    days_of_week: s.days_of_week ?? [],
    start_time:   s.start_time?.slice(0, 5) ?? '08:00',
    end_time:     s.end_time?.slice(0, 5)   ?? '18:00',
    has_break:    !!(s.break_start && s.break_end),
    break_start:  s.break_start?.slice(0, 5) ?? '13:00',
    break_end:    s.break_end?.slice(0, 5)   ?? '14:00',
  }))
}

// Bloques del formulario → payload del RPC set_horarios
export function blocksToPayload(blocks) {
  return blocks.map(b => ({
    days_of_week: b.days_of_week,
    start_time:   b.start_time,
    end_time:     b.end_time,
    break_start:  b.has_break ? (b.break_start || null) : null,
    break_end:    b.has_break ? (b.break_end || null) : null,
  }))
}

// Valida los bloques. Devuelve un mensaje de error o null si todo OK.
export function validateBlocks(blocks) {
  const seen = new Set()
  for (const b of blocks) {
    if (!b.days_of_week.length) return t('Cada bloque de horario debe tener al menos un día.')
    if (!b.start_time || !b.end_time) return t('Cada bloque debe tener hora de entrada y salida.')
    if (b.has_break && (!b.break_start || !b.break_end)) return t('Completa el inicio y fin del corte/refrigerio, o desactívalo.')
    for (const d of b.days_of_week) {
      if (seen.has(d)) return t('Un día no puede estar en más de un bloque de horario.')
      seen.add(d)
    }
  }
  return null
}
