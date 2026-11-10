import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

const REPORTS_KEY = ['reports']

/** The report files saved on the server, most recent first. */
export function useReports() {
  return useQuery({
    queryKey: REPORTS_KEY,
    queryFn: () => api.get('/reports'),
  })
}

/** Keeps a copy of a file the browser just built, so it can be downloaded again later. */
export function useArchiveReport() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ blob, filename, format, report_kind, date_from, date_to, employee_count }) =>
      api.upload('POST', '/reports', blob, {
        file_name: filename,
        format,
        report_kind: report_kind ?? 'attendance',
        date_from,
        date_to,
        employee_count,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: REPORTS_KEY }),
  })
}

export function useDeleteReport() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (report) => api.delete(`/reports/${report.id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: REPORTS_KEY }),
  })
}
