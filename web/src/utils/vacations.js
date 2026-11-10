/**
 * Vacation balance (a simple model).
 * balance = yearly entitlement + adjustments - days taken (approved vacation absences of the year).
 */
import { dateRange } from './attendanceCore'

/** Days a person gets per year when nobody has set a different number (also the database default). */
export const DEFAULT_VACATION_DAYS = 30

/** Calendar days of an absence that fall inside `year`. */
export function daysInYear(absence, year) {
  const start = absence.date
  const end = absence.date_to || absence.date
  return dateRange(start, end).filter(day => day.startsWith(`${year}-`)).length
}

/**
 * @param {object} args
 * @param {Array}  args.employees       active employees (with vacation_days_per_year)
 * @param {Array}  args.justifications  the year's absences (with type, status, date, date_to)
 * @param {Array}  args.adjustments     adjustments (employee_id, days)
 * @param {number} args.year
 * @returns {Array} rows { employee, entitlement, adjustment, taken, available }
 */
export function computeBalances({ employees, justifications, adjustments = [], year }) {
  const takenByEmployee = {}
  for (const absence of justifications) {
    if (absence.type !== 'vacaciones' || absence.status !== 'approved') continue
    takenByEmployee[absence.employee_id] = (takenByEmployee[absence.employee_id] ?? 0) + daysInYear(absence, year)
  }

  const adjustmentByEmployee = {}
  for (const adjustment of adjustments) {
    adjustmentByEmployee[adjustment.employee_id] = (adjustmentByEmployee[adjustment.employee_id] ?? 0) + adjustment.days
  }

  return employees.map(employee => {
    const entitlement = employee.vacation_days_per_year ?? DEFAULT_VACATION_DAYS
    const adjustment = adjustmentByEmployee[employee.id] ?? 0
    const taken = takenByEmployee[employee.id] ?? 0
    return { employee, entitlement, adjustment, taken, available: entitlement + adjustment - taken }
  })
}
