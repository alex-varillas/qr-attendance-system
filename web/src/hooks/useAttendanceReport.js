import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

/**
 * The attendance data of a range of dates, in one request: the business, the active employees (each with
 * the date they are reported from), schedules and exceptions, sites, every mark, absences, holidays and
 * overtime authorizations. The same data feeds the statistics and the exports.
 */
export function useAttendanceReport(dateFrom, dateTo) {
  return useQuery({
    queryKey: ['attendance-report', dateFrom, dateTo],
    enabled: !!dateFrom && !!dateTo,
    staleTime: 60_000,
    queryFn: () => api.get('/reports/data', { from: dateFrom, to: dateTo }),
  })
}
