import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

/** Check-ins refused for being outside the allowed area, this calendar month (in the business time zone). */
export function useGeoBlockedAttempts() {
  return useQuery({
    queryKey: ['geo-blocked-attempts'],
    queryFn: () => api.get('/geo-blocked-attempts'),
  })
}
