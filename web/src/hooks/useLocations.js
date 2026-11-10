import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

const LOCATIONS_KEY = ['locations']

export function useLocations() {
  return useQuery({
    queryKey: LOCATIONS_KEY,
    queryFn: () => api.get('/locations'),
  })
}

export function useCreateLocation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (values) => api.post('/locations', values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LOCATIONS_KEY }),
  })
}

export function useUpdateLocation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...values }) => api.patch(`/locations/${id}`, values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LOCATIONS_KEY }),
  })
}
