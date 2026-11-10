import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { EMPLOYEES_KEY } from './useEmployees'
import { JUSTIFICATIONS_KEY } from './useJustifications'

/** Absences (of any kind) that start in a given year. */
export function useYearJustifications(year) {
  return useQuery({
    queryKey: [...JUSTIFICATIONS_KEY, 'year', year],
    enabled: !!year,
    queryFn: () => api.get('/justifications', { year }),
  })
}

export function useVacationAdjustments() {
  return useQuery({
    queryKey: ['vac-adjustments'],
    queryFn: () => api.get('/vacation-adjustments'),
  })
}

/** Approves or rejects an absence request. Needs the settings permission. */
export function useApproveAbsence() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }) => api.post(`/justifications/${id}/status`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: JUSTIFICATIONS_KEY }),
  })
}

export function useCreateAdjustment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ employeeId, days, reason }) =>
      api.post('/vacation-adjustments', { employee_id: employeeId, days, reason: reason || '' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['vac-adjustments'] }),
  })
}

/** Sets how many vacation days a year an employee has. */
export function useSetEntitlement() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ employeeId, days }) => api.patch(`/employees/${employeeId}`, { vacation_days_per_year: days }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: EMPLOYEES_KEY }),
  })
}
