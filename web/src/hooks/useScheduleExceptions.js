import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

const EXCEPTIONS_KEY = ['scheduleExceptions']

export function useScheduleExceptions() {
  return useQuery({
    queryKey: EXCEPTIONS_KEY,
    queryFn: () => api.get('/schedule-exceptions'),
  })
}

/**
 * Creates or replaces the exception of one scope and date.
 * @param {{ employeeId?: string|null, locationId?: string|null, date: string,
 *   startTime?: string|null, endTime?: string|null, breakStart?: string|null,
 *   breakEnd?: string|null, reason?: string|null }} args
 *   With neither id: an exception for the whole business. No start and end time: a non-working day.
 */
export function useSetException() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ employeeId = null, locationId = null, date, startTime = null, endTime = null, breakStart = null, breakEnd = null, reason = null }) =>
      api.put('/schedule-exceptions', {
        date,
        employee_id: employeeId,
        location_id: locationId,
        start_time: startTime,
        end_time: endTime,
        break_start: breakStart,
        break_end: breakEnd,
        reason,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: EXCEPTIONS_KEY }),
  })
}

export function useDeleteException() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.delete(`/schedule-exceptions/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: EXCEPTIONS_KEY }),
  })
}
