import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { EMPLOYEES_KEY } from './useEmployees'

const DEPARTMENTS_KEY = ['departments']

export function useDepartments() {
  return useQuery({
    queryKey: DEPARTMENTS_KEY,
    queryFn: () => api.get('/departments'),
  })
}

export function useCreateDepartment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name) => api.post('/departments', { name: name.trim() }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: DEPARTMENTS_KEY }),
  })
}

export function useRenameDepartment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, name }) => api.patch(`/departments/${id}`, { name: name.trim() }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: DEPARTMENTS_KEY }),
  })
}

export function useDeleteDepartment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.delete(`/departments/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: DEPARTMENTS_KEY })
      // People of a deleted department are left without one.
      queryClient.invalidateQueries({ queryKey: EMPLOYEES_KEY })
    },
  })
}
