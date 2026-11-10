// From which date an employee is reported.
//
// The server gives each employee a `report_from` (YYYY-MM-DD): the day they were added, or the day of their
// first mark if that was earlier. Earlier days are not listed: the person did not exist in the system yet and
// would show up as an absence in a document that may be used as a record.
//
// No dependencies on purpose, so it can be tested with `node --test`.

// First day to report for `emp`: `report_from` when it falls inside the period, `dateFrom` when there is no
// value or it is earlier. Dates are YYYY-MM-DD, so comparing them as text is the same as comparing dates.
export function reportStart(emp, dateFrom) {
  const from = emp?.report_from
  return from && from > dateFrom ? from : dateFrom
}

// Note for the header of the file, only when some employee was cut short.
export function reportNote(employees, dateFrom) {
  const trimmed = (employees ?? []).some(e => e?.report_from && e.report_from > dateFrom)
  return trimmed ? 'Nota: cada empleado figura desde su fecha de alta en el sistema.' : ''
}
