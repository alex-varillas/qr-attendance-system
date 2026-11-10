import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

const HOLIDAYS_KEY = ['holidays']

/** The holidays of the business: a plain list of { id, date, name }, oldest first. */
export function useHolidays() {
  return useQuery({
    queryKey: HOLIDAYS_KEY,
    staleTime: 1000 * 60 * 10, // holidays rarely change
    queryFn: () => api.get('/holidays'),
  })
}

export function useAddHoliday() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ date, name }) => api.post('/holidays', { date, name }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: HOLIDAYS_KEY }),
  })
}

export function useDeleteHoliday() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id }) => api.delete(`/holidays/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: HOLIDAYS_KEY }),
  })
}
