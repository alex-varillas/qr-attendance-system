import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { onLiveReconnect, subscribeLive } from '../lib/liveEvents'
import { dateOf, dayRangeISO, todayISO } from '../utils/dates'

export const ATTENDANCE_KEY = (date) => ['attendance', date]

/** Every mark of one calendar day (in the business time zone), oldest first. */
export function useAttendance(date) {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ATTENDANCE_KEY(date),
    enabled: !!date,
    queryFn: () => {
      const { start, end } = dayRangeISO(date)
      return api.get('/attendance', { start, end })
    },
  })

  // Live: when someone checks in, refresh the day it belongs to. Only worth listening while looking at
  // today (a past day gets no new marks), and a refresh after a dropped connection covers what was missed.
  useEffect(() => {
    if (!date || date !== todayISO()) return
    const stop = subscribeLive('attendance', (event) => {
      queryClient.invalidateQueries({ queryKey: ATTENDANCE_KEY(event.timestamp ? dateOf(event.timestamp) : date) })
    })
    const stopReconnect = onLiveReconnect(() => queryClient.invalidateQueries({ queryKey: ATTENDANCE_KEY(date) }))
    return () => {
      stop()
      stopReconnect()
    }
  }, [date, queryClient])

  return query
}
