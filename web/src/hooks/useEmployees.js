import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

export const EMPLOYEES_KEY = ['employees']

/** Everyone in the business: the owner, administrators and regular employees (never the PIN hash). */
export function useEmployees() {
  return useQuery({
    queryKey: EMPLOYEES_KEY,
    queryFn: () => api.get('/employees'),
  })
}

function useEmployeeMutation(mutationFn, { alsoInvalidate = [] } = {}) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: EMPLOYEES_KEY })
      for (const key of alsoInvalidate) queryClient.invalidateQueries({ queryKey: key })
    },
  })
}

export function useCreateEmployee() {
  return useEmployeeMutation(({ pin, ...fields }) => api.post('/employees', { ...fields, ...(pin ? { pin } : {}) }))
}

export function useUpdateEmployee() {
  return useEmployeeMutation(({ id, pin, removePin, ...fields }) =>
    api.patch(`/employees/${id}`, { ...fields, ...(pin ? { pin } : {}), ...(removePin && !pin ? { remove_pin: true } : {}) }),
  )
}

/** Removes the PIN right away, without waiting for the rest of the form to be saved. */
export function useRemoveEmployeePin() {
  return useEmployeeMutation((employeeId) => api.delete(`/employees/${employeeId}/pin`))
}

/** Rows come already filtered (no duplicates). A row with its own working days also gets its own schedule. */
export function useImportEmployees() {
  return useEmployeeMutation((rows) => api.post('/employees/import', { rows }), { alsoInvalidate: [['schedules']] })
}

export function useToggleEmployee() {
  return useEmployeeMutation(({ id, active }) => api.patch(`/employees/${id}`, { active }))
}

/** Turns a granular permission on or off for an administrator. Only the owner can. */
export function useSetAdminPermission() {
  return useEmployeeMutation(({ employeeId, permission, value }) =>
    api.put(`/employees/${employeeId}/permissions`, { permission, value }),
  )
}

/** Creates a one-time invitation link for an administrator. Resolves to { link, emailed, email }. */
export function useInviteAdmin() {
  return useEmployeeMutation(({ employee_id, email }) => api.post(`/employees/${employee_id}/invite`, { email }))
}

/** A one-time link so an administrator who lost access can choose a new password. Resolves to { link }. */
export function useAdminResetLink() {
  return useMutation({ mutationFn: (employeeId) => api.post(`/employees/${employeeId}/reset-link`) })
}
