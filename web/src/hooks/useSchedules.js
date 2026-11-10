import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

export const SCHEDULES_KEY = ['schedules']

/** The active schedule blocks of the business, the sites and the employees (the default ones first). */
export function useSchedules() {
  return useQuery({
    queryKey: SCHEDULES_KEY,
    queryFn: () => api.get('/schedules'),
  })
}

/**
 * Replaces the whole set of schedule blocks of one scope.
 * @param {{ employeeId?: string|null, locationId?: string|null, blocks: Array<{days_of_week:number[], start_time:string, end_time:string, break_start?:string|null, break_end?:string|null}> }} args
 *   With neither id: the default schedule of the business. With `locationId`: the own schedule of that
 *   site. With `employeeId`: the own schedule of that employee.
 */
export function useSetSchedules() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ employeeId = null, locationId = null, blocks }) =>
      api.put('/schedules', { employee_id: employeeId, location_id: locationId, blocks }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SCHEDULES_KEY }),
  })
}

/** Removes the own schedule of an employee or a site, so they fall back to the next level. */
export function useDeleteSchedule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ employeeId = null, locationId = null } = {}) =>
      api.delete('/schedules', { employee_id: employeeId ?? undefined, location_id: locationId ?? undefined }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SCHEDULES_KEY }),
  })
}
