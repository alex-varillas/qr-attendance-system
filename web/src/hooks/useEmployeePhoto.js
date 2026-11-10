import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { EMPLOYEES_KEY } from './useEmployees'

/** Uploads the employee's photo (already cropped by the browser). Resolves to the URL to show. */
export function useUploadEmployeePhoto() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ employeeId, file }) => {
      const { photo_url: photoUrl } = await api.upload('PUT', `/employees/${employeeId}/photo`, file)
      return photoUrl
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: EMPLOYEES_KEY }),
  })
}

export function useDeleteEmployeePhoto() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ employeeId }) => api.delete(`/employees/${employeeId}/photo`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: EMPLOYEES_KEY }),
  })
}
