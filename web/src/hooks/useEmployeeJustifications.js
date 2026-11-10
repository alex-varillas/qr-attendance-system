import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { JUSTIFICATIONS_KEY } from './useJustifications'

// Same prefix as the other absence queries, so one invalidation refreshes the dashboard, the leave page
// and the employee profile together.
export const EMPLOYEE_JUSTIFICATIONS_KEY = (employeeId) => [...JUSTIFICATIONS_KEY, 'employee', employeeId]

/** Every absence of one employee, most recent first. */
export function useEmployeeJustifications(employeeId) {
  return useQuery({
    queryKey: EMPLOYEE_JUSTIFICATIONS_KEY(employeeId),
    enabled: !!employeeId,
    queryFn: () => api.get('/justifications', { employee_id: employeeId }),
  })
}
