// Helpers puros de calendario, compartidos por el DatePicker de Dashboard.jsx
// (fecha única, popover) y el RangeCalendar de ExportModal.jsx (rango,
// inline). Antes cada uno tenía su propia copia idéntica - se dejan como
// funciones/arrays sueltos, no como un componente polimórfico único: los dos
// calendarios tienen interacción genuinamente distinta (popover vs. inline,
// una fecha vs. un rango con fase from/to) y forzarlos a un solo componente
// habría sido más riesgo que beneficio para lo que en realidad se duplicaba.

/** Offset (lunes=0) del primer día del mes + total de días del mes. */
export function calMonthData(year, month) {
  const firstDow = new Date(year, month, 1).getDay()
  const offset   = (firstDow + 6) % 7
  const total    = new Date(year, month + 1, 0).getDate()
  return { offset, total }
}

/** año/mes(0-indexado)/día → 'YYYY-MM-DD'. */
export function toISODate(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
