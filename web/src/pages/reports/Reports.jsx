import { useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { useAuth } from '../../hooks/useAuth.jsx'
import { useReports, useDeleteReport } from '../../hooks/useReports'
import { downloadReport } from '../../utils/reports'
import ExportModal from '../../components/ui/ExportModal'
import Modal from '../../components/ui/Modal'
import { formatShortDate as fmtDate } from '../../utils/dates'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

function fmtBytes(bytes) {
  if (!bytes) return '-'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function fmtRelative(dateStr) {
  const d = new Date(dateStr)
  const now = new Date()
  const diff = Math.floor((now - d) / 1000)
  if (diff < 60)    return 'hace un momento'
  if (diff < 3600)  return `hace ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })
}

function monthKey(dateStr) {
  if (!dateStr) return ''
  const [y, m] = String(dateStr).split('-')
  return `${y}-${m}`
}

function monthLabel(key) {
  const [y, m] = key.split('-')
  return `${MONTH_NAMES[parseInt(m, 10) - 1]} ${y}`
}

function groupByMonth(reports) {
  const groups = {}
  for (const r of reports) {
    const key = monthKey(r.date_from)
    if (!groups[key]) groups[key] = []
    groups[key].push(r)
  }
  return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]))
}

// ─── Badges ──────────────────────────────────────────────────────────────────

function FormatBadge({ format }) {
  if (format === 'pdf') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-100">
        PDF
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
      Excel
    </span>
  )
}

function OriginBadge({ source }) {
  if (source === 'auto') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-100">
        Automático
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
      Manual
    </span>
  )
}

// ─── Row ─────────────────────────────────────────────────────────────────────

function ReportRow({ report, isOwner, onDelete }) {
  const [downloading, setDownloading] = useState(false)
  const [dlError, setDlError]         = useState(null)

  async function handleDownload() {
    setDownloading(true)
    setDlError(null)
    try {
      await downloadReport(report)
    } catch {
      setDlError('No se pudo descargar. Intenta nuevamente.')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <li className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
      {/* Período + badges */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center flex-wrap gap-1.5 mb-0.5">
          <FormatBadge format={report.format} />
          <OriginBadge source={report.source} />
        </div>
        <p className="text-sm font-medium text-slate-800 mt-1">
          {fmtDate(report.date_from)} – {fmtDate(report.date_to)}
        </p>
        <p className="text-xs text-slate-400 mt-0.5">
          {report.employee_count != null ? `${report.employee_count} empleado${report.employee_count === 1 ? '' : 's'}` : ''}
          {report.employee_count != null && report.size_bytes ? ' · ' : ''}
          {fmtBytes(report.size_bytes)}
          {report.created_by_email ? ` · ${report.created_by_email}` : ''}
        </p>
        {dlError && <p className="text-xs text-rose-600 mt-1">{dlError}</p>}
      </div>

      {/* Fecha */}
      <p className="text-xs text-slate-400 shrink-0 hidden sm:block">{fmtRelative(report.created_at)}</p>

      {/* Acciones */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white transition-colors"
        >
          {downloading ? (
            <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          )}
          Descargar
        </button>
        {isOwner && (
          <button
            onClick={() => onDelete(report)}
            className="flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 text-slate-400 hover:text-rose-500 hover:border-rose-200 hover:bg-rose-50 transition-colors"
            title="Eliminar reporte"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        )}
      </div>
    </li>
  )
}

// ─── Confirm delete modal ─────────────────────────────────────────────────────

function DeleteConfirm({ report, onConfirm, onCancel, isDeleting }) {
  return (
    <Modal onClose={onCancel} ariaLabel="Eliminar reporte" className="bg-white rounded-xl shadow-lg w-full max-w-xs p-5 text-center">
        <div className="w-10 h-10 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-3">
          <svg className="w-5 h-5 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </div>
        <h3 className="text-sm font-semibold text-slate-800 mb-1">Eliminar reporte</h3>
        <p className="text-xs text-slate-500 mb-4 leading-relaxed">
          Se eliminará el archivo <span className="font-medium text-slate-700">{report.file_name}</span> del historial y del almacenamiento. Esta acción no se puede deshacer.
        </p>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            disabled={isDeleting}
            className="flex-1 border border-slate-200 text-slate-600 text-sm font-medium py-2 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="flex-1 bg-rose-600 hover:bg-rose-700 text-white text-sm font-medium py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            {isDeleting ? 'Eliminando…' : 'Eliminar'}
          </button>
        </div>
    </Modal>
  )
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="animate-pulse">
      {[1, 2].map(i => (
        <div key={i} className="bg-white rounded-xl border border-slate-200 mb-4 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50">
            <div className="h-4 bg-slate-200 rounded w-28" />
          </div>
          {[1, 2, 3].map(j => (
            <div key={j} className="px-4 py-3 flex items-center gap-4 border-b border-slate-100 last:border-0">
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-slate-100 rounded w-20" />
                <div className="h-4 bg-slate-100 rounded w-40" />
                <div className="h-3 bg-slate-100 rounded w-32" />
              </div>
              <div className="h-8 w-24 bg-slate-100 rounded-lg" />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-8 sm:p-12 flex flex-col items-center text-center">
      <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center mb-4">
        <svg className="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      </div>
      <h3 className="text-sm font-semibold text-slate-700 mb-1">Sin reportes aún</h3>
      <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
        Los reportes de asistencia (Excel y PDF) que generes aparecerán aquí automáticamente.
      </p>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function Reports() {
  const { isOwner } = useAuth()
  const { data: reports = [], isLoading } = useReports()
  const deleteReport = useDeleteReport()

  const [toDelete, setToDelete]     = useState(null)
  const [exportOpen, setExportOpen] = useState(false)

  function handleDeleteConfirm() {
    deleteReport.mutate(toDelete, { onSuccess: () => setToDelete(null) })
  }

  const groups = groupByMonth(reports)

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Reportes</h1>
          <p className="text-sm text-slate-500 mt-0.5">Historial de reportes de asistencia generados.</p>
        </div>
        <button
          onClick={() => setExportOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors shadow-sm border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:border-slate-300 shrink-0"
          title="Generar reporte"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          <span className="hidden sm:inline">Generar reporte</span>
        </button>
      </div>

      {/* Content */}
      {isLoading ? (
        <Skeleton />
      ) : reports.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-4">
          {groups.map(([key, items]) => (
            <div key={key} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50">
                <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  {monthLabel(key)}
                  <span className="ml-2 font-normal normal-case text-slate-400">
                    {items.length} reporte{items.length !== 1 ? 's' : ''}
                  </span>
                </h2>
              </div>
              <ul className="divide-y divide-slate-100">
                {items.map(r => (
                  <ReportRow
                    key={r.id}
                    report={r}
                    isOwner={isOwner}
                    onDelete={setToDelete}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {/* Modal de confirmación de eliminación */}
      {toDelete && (
        <DeleteConfirm
          report={toDelete}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setToDelete(null)}
          isDeleting={deleteReport.isPending}
        />
      )}

      {/* Modal para generar un nuevo reporte, mismo que en el dashboard */}
      <AnimatePresence>
        {exportOpen && <ExportModal key="export" onClose={() => setExportOpen(false)} />}
      </AnimatePresence>
    </div>
  )
}
