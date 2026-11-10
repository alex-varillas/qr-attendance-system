import { useState } from 'react'
import { useAuth } from '../../hooks/useAuth.jsx'
import { api } from '../../lib/api'
import { generateAttendanceXLSX, generateAttendancePDF } from '../../utils/attendanceReport'
import { todayISO, monthName, weekdayInitials } from '../../utils/dates'
import { downloadBlob } from '../../utils/download'
import { useArchiveReport } from '../../hooks/useReports'
import Modal from './Modal'
import { calMonthData, toISODate as toISO } from './Calendar'
import { t } from '../../i18n'

// Guardrail: without this a range of many years could be asked at once. 366 days covers the normal case
// (up to a calendar year). The server enforces a limit too.
const MAX_REPORT_RANGE_DAYS = 366

function primerDiaMes(offset = 0) {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth() + offset, 1).toLocaleDateString('en-CA')
}

function ultimoDiaMes(offset = 0) {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth() + offset + 1, 0).toLocaleDateString('en-CA')
}

// ─── Helpers de calendario ────────────────────────────────────────────────────

function fmtLabel(dateStr) {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-')
  return `${parseInt(d)} ${monthName(parseInt(m) - 1, true)} ${y}`
}

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  )
}

// ─── Range Calendar ───────────────────────────────────────────────────────────
function RangeCalendar({ dateFrom, dateTo, onChange }) {
  const today = todayISO()
  const now   = new Date()
  const [vy, setVy]       = useState(now.getFullYear())
  const [vm, setVm]       = useState(now.getMonth())
  const [hover, setHover] = useState(null)
  // 'from' = next click sets start; 'to' = next click sets end
  const [phase, setPhase] = useState('from')

  const nowD    = new Date()
  const canNext = vy < nowD.getFullYear() || (vy === nowD.getFullYear() && vm < nowD.getMonth())

  function prevMonth() {
    if (vm === 0) { setVm(11); setVy(y => y - 1) } else setVm(m => m - 1)
  }
  function nextMonth() {
    if (!canNext) return
    if (vm === 11) { setVm(0); setVy(y => y + 1) } else setVm(m => m + 1)
  }

  function handleDayClick(dateStr) {
    if (dateStr > today) return
    if (phase === 'from') {
      onChange({ from: dateStr, to: null })
      setPhase('to')
      setHover(null)
    } else {
      if (dateStr < dateFrom) {
        onChange({ from: dateStr, to: null })
        setPhase('to')
        setHover(null)
      } else {
        onChange({ from: dateFrom, to: dateStr })
        setPhase('from')
        setHover(null)
      }
    }
  }

  function getDayState(dateStr) {
    if (dateStr > today) return 'future'
    const effectiveTo = phase === 'to' && hover && hover >= dateFrom ? hover : dateTo
    if (dateStr === dateFrom && dateFrom === effectiveTo) return 'single'
    if (dateStr === dateFrom) return 'start'
    if (effectiveTo && dateStr === effectiveTo) return 'end'
    if (dateFrom && effectiveTo && dateStr > dateFrom && dateStr < effectiveTo) return 'range'
    return 'none'
  }

  const { offset, total } = calMonthData(vy, vm)

  return (
    <div>
      {/* Month nav */}
      <div className="flex items-center justify-between mb-2">
        <button onClick={prevMonth}
          className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-slate-500">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="text-sm font-semibold text-slate-800 select-none">
          {monthName(vm)} {vy}
        </span>
        <button onClick={nextMonth} disabled={!canNext}
          className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-slate-500 disabled:opacity-30 disabled:cursor-not-allowed">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-0.5">
        {weekdayInitials().map((d, i) => (
          <div key={i} className="h-8 flex items-center justify-center text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7" onMouseLeave={() => setHover(null)}>
        {Array.from({ length: offset }).map((_, i) => <div key={`e${i}`} className="h-9" />)}
        {Array.from({ length: total }).map((_, i) => {
          const day      = i + 1
          const dateStr  = toISO(vy, vm, day)
          const state    = getDayState(dateStr)
          const isFuture = state === 'future'
          const isStart  = state === 'start'
          const isEnd    = state === 'end'
          const isSingle = state === 'single'
          const isRange  = state === 'range'
          const isSel    = isStart || isEnd || isSingle
          const isToday  = dateStr === today

          return (
            <div
              key={day}
              className="relative h-9 flex items-center justify-center"
              onMouseEnter={() => phase === 'to' && dateFrom && setHover(dateStr)}
            >
              {/* Range background strip */}
              {(isRange || isStart || isEnd) && (
                <div className={`absolute inset-y-1.5 bg-blue-100 ${
                  isStart ? 'left-1/2 right-0' :
                  isEnd   ? 'left-0 right-1/2' :
                  'inset-x-0'
                }`} />
              )}

              <button
                onClick={() => handleDayClick(dateStr)}
                disabled={isFuture}
                className={[
                  'relative z-10 h-8 w-8 flex items-center justify-center rounded-full text-sm font-medium transition-colors select-none',
                  isSel    ? 'bg-blue-600 text-white shadow-sm' : '',
                  isRange  ? 'text-slate-700 hover:bg-blue-200' : '',
                  isToday && !isSel ? 'ring-1 ring-blue-400 text-blue-700 font-semibold' : '',
                  isFuture ? 'text-slate-200 cursor-not-allowed' : '',
                  !isSel && !isFuture && !isRange ? 'hover:bg-slate-100 text-slate-700 cursor-pointer' : '',
                ].join(' ')}
              >
                {day}
              </button>
            </div>
          )
        })}
      </div>

      {/* Hint */}
      <p className="text-[11px] text-slate-400 text-center mt-2 select-none">
        {phase === 'to' && dateFrom
          ? t('Selecciona la fecha de fin')
          : t('Selecciona la fecha de inicio')}
      </p>
    </div>
  )
}

// ─── Modal principal ──────────────────────────────────────────────────────────
export default function ExportModal({ onClose }) {
  const { business } = useAuth()
  const archiveReport = useArchiveReport()
  const today = todayISO()

  const [dateFrom, setDateFrom] = useState(() => primerDiaMes())
  const [dateTo,   setDateTo]   = useState(today)
  const [loading,  setLoading]  = useState(null) // null | 'excel' | 'pdf'
  const [error,    setError]    = useState(null)

  function handleRangeChange({ from, to }) {
    setDateFrom(from)
    setDateTo(to ?? null)
    setError(null)
  }

  function applyPreset(from, to) {
    setDateFrom(from)
    setDateTo(to)
    setError(null)
  }

  async function fetchData() {
    if (!dateTo) { setError(t('Selecciona la fecha de fin para continuar.')); return null }
    const rangeDays = (new Date(dateTo) - new Date(dateFrom)) / (1000 * 60 * 60 * 24)
    if (rangeDays > MAX_REPORT_RANGE_DAYS) {
      setError(t('El rango máximo para un reporte es de {0} días (aprox. 1 año). Acorta las fechas o exporta por partes.', [MAX_REPORT_RANGE_DAYS]))
      return null
    }
    setError(null)
    let data
    try {
      data = await api.get('/reports/data', { from: dateFrom, to: dateTo })
    } catch {
      setError(t('No se pudo generar el reporte. Intenta nuevamente.'))
      return null
    }
    if (!data.employees?.length) { setError(t('No hay empleados activos para exportar.')); return null }
    if (!data.records?.length)   { setError(t('No hay marcaciones en el rango seleccionado.')); return null }
    return data
  }

  // Builds the file in the browser, downloads it and keeps a copy on the server (a failed copy never blocks the download).
  async function run(kind, build) {
    setLoading(kind)
    try {
      const data = await fetchData()
      if (!data) return
      const result = await build(data)
      downloadBlob(result.blob, result.filename)
      onClose()
      try {
        await archiveReport.mutateAsync({
          blob: result.blob, filename: result.filename,
          format: kind === 'pdf' ? 'pdf' : 'xlsx', report_kind: 'attendance',
          date_from: dateFrom, date_to: dateTo,
          employee_count: result.employeeCount,
        })
      } catch (err) {
        console.error('[ExportModal] could not keep a copy of the report:', err)
      }
    } catch {
      setError(t('No se pudo generar el reporte. Intenta nuevamente.'))
    } finally {
      setLoading(null)
    }
  }

  const handleExcel = () => run('excel', data => generateAttendanceXLSX(data, dateFrom, dateTo, business?.name))
  const handlePDF = () => run('pdf', data => generateAttendancePDF(data, dateFrom, dateTo, business ?? {}))

  const rangeReady = dateFrom && dateTo

  return (
    <Modal
      onClose={onClose}
      ariaLabel={t('Exportar reporte')}
      className="bg-white rounded-xl shadow-lg w-full max-w-sm p-5"
    >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-slate-800">{t('Exportar reporte')}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors" aria-label={t('Cerrar')}>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Presets de rango */}
        <div className="flex gap-1.5 mb-3">
          <button
            type="button"
            onClick={() => applyPreset(primerDiaMes(), today)}
            className="flex-1 text-xs font-medium px-2 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors"
          >
            {t('Mes actual')}
          </button>
          <button
            type="button"
            onClick={() => applyPreset(primerDiaMes(-1), ultimoDiaMes(-1))}
            className="flex-1 text-xs font-medium px-2 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors"
          >
            {t('Mes anterior')}
          </button>
          <button
            type="button"
            onClick={() => applyPreset(`${new Date().getFullYear()}-01-01`, today)}
            className="flex-1 text-xs font-medium px-2 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors"
          >
            {t('Año actual')}
          </button>
        </div>

        {/* Calendario de rango */}
        <RangeCalendar dateFrom={dateFrom} dateTo={dateTo} onChange={handleRangeChange} />

        {/* Rango seleccionado */}
        <div className="mt-3 mb-4 flex items-center justify-center gap-2">
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${
            dateFrom ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-slate-50 text-slate-400 border border-slate-200'
          }`}>
            {dateFrom ? fmtLabel(dateFrom) : t('Desde')}
          </div>
          <svg className="w-3 h-3 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${
            dateTo ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-slate-50 text-slate-400 border border-slate-200 border-dashed'
          }`}>
            {dateTo ? fmtLabel(dateTo) : t('Hasta')}
          </div>
        </div>

        {error && <p role="alert" className="text-rose-600 text-xs mb-3 text-center bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">{error}</p>}

        <button
          type="button"
          onClick={handleExcel}
          disabled={!!loading || !rangeReady}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm transition-colors mb-2"
        >
          {loading === 'excel' ? <Spinner /> : (
            <>
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              {t('Descargar Excel')}
            </>
          )}
        </button>

        <button
          type="button"
          onClick={handlePDF}
          disabled={!!loading || !rangeReady}
          className="w-full flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm transition-colors mb-2"
        >
          {loading === 'pdf' ? <Spinner /> : (
            <>
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              {t('Descargar PDF')}
            </>
          )}
        </button>

        <button
          type="button"
          onClick={onClose}
          className="w-full border border-slate-200 hover:bg-slate-50 text-slate-500 font-medium py-2 rounded-lg text-sm transition-colors"
        >
          {t('Cancelar')}
        </button>
    </Modal>
  )
}
