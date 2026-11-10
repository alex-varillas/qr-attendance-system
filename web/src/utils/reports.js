// Downloading a saved report is not a hook (it uses no React state), so it lives here and not in hooks/useReports.js.
import { downloadBlob } from './download'

export async function downloadReport(report) {
  const response = await fetch(`/api/reports/${report.id}/file`, { credentials: 'same-origin' })
  if (!response.ok) throw new Error('No se pudo descargar el archivo.')
  downloadBlob(await response.blob(), report.file_name)
}
