import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { subscribeLive } from '../lib/liveEvents'
import { useToast } from '../components/ui/Toast'
import { useEmployees } from './useEmployees'
import { useSchedules } from './useSchedules'
import { useScheduleExceptions } from './useScheduleExceptions'
import { getScheduleForDate, calcularTardanza } from '../utils/attendance'
import { todayISO, extractTime } from '../utils/dates'
import { t } from '../i18n'

// Own threshold for the alert, separate from the tolerance of the business (which only defines when
// something counts as "late" on the dashboard). Alerting from the first minute would be too noisy: this
// only speaks up when the delay is already noticeable.
const LATE_ALERT_THRESHOLD_MINUTES = 20

// Lives in the app layout (not in the dashboard) so the alert shows whichever section the owner or
// administrator is looking at.
export function useLateCheckinAlerts() {
  const { showToast } = useToast()
  const queryClient = useQueryClient()

  // Keeps the employees and schedules cached whatever page is open; if a page already loaded them,
  // React Query reuses that cache instead of asking again.
  useEmployees()
  useSchedules()
  useScheduleExceptions()

  useEffect(() => {
    return subscribeLive('attendance', (event) => {
      if (event.type !== 'checkin') return
      const employees = queryClient.getQueryData(['employees']) ?? []
      const schedules = queryClient.getQueryData(['schedules']) ?? []
      const exceptions = queryClient.getQueryData(['scheduleExceptions']) ?? []
      const employee = employees.find(e => e.id === event.employee_id)
      if (!employee) return
      const schedule = getScheduleForDate(employee.id, todayISO(), schedules, employee.location_id, exceptions)
      if (!schedule?.start_time) return
      const delay = calcularTardanza(extractTime(event.timestamp), schedule.start_time, 0)
      if (delay !== null && delay >= LATE_ALERT_THRESHOLD_MINUTES) {
        showToast(t('{0} {1} llegó con {2} min de tardanza', [employee.name, employee.last_name, delay]))
      }
    })
  }, [queryClient, showToast])
}
