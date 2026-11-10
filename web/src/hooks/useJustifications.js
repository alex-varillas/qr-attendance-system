import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

// One prefix for every view (a day, a year, one employee), so a single invalidation refreshes them all.
export const JUSTIFICATIONS_KEY = ['justifications']

/** Absences recorded for one date, as an object keyed by employee id. */
export function useJustifications(date) {
  return useQuery({
    queryKey: [...JUSTIFICATIONS_KEY, 'date', date],
    enabled: !!date,
    queryFn: async () => {
      const rows = await api.get('/justifications', { date })
      return Object.fromEntries(rows.map(row => [row.employee_id, row]))
    },
  })
}

export function useCreateJustification() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ employeeId, date, type = 'otro', reason = '', date_to = null, status }) =>
      api.post('/justifications', {
        employee_id: employeeId,
        date,
        date_to: date_to || null,
        type,
        reason: reason || '',
        ...(status ? { status } : {}),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: JUSTIFICATIONS_KEY }),
  })
}

export function useUpdateJustification() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, type, reason, date_to }) =>
      api.patch(`/justifications/${id}`, { type, reason: reason ?? '', date_to: date_to || null }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: JUSTIFICATIONS_KEY }),
  })
}

export function useDeleteJustification() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id }) => api.delete(`/justifications/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: JUSTIFICATIONS_KEY }),
  })
}
