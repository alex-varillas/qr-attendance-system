// The attendance report: one row per employee and working day, as Excel, CSV or PDF.
// It is built in the browser from the data of GET /api/reports/data.

import { getApplicableSchedule } from './attendance'
import { DEFAULT_DAYS, dateRange, buildMaps, buildRowData } from './attendanceCore'
import { docTypeLabel } from './labels'
import { reportNote, reportStart } from './reportRange'
import { todayISO } from './dates'
import { XLSX_MIME, loadXlsx } from './xlsx'
import { t } from '../i18n/index.js'

const headers = () => [
  t('Apellidos y Nombres'), t('Tipo Documento'), t('N° Documento'), t('Cargo'), t('Fecha'), t('Estado'),
  t('Entrada'), t('Tardanza (min)'),
  t('Inicio Refrigerio'), t('Fin Refrigerio'), t('Exceso Refrig. (min)'),
  t('Salida'), t('Salida Anticipada (min)'),
  t('Total Horas'), t('Horas Extra'),
]

// The PDF is a compact version of the same table, so it fits a landscape page: indexes into a row.
const PDF_COLUMNS = [
  { get title() { return t('Empleado') }, index: 0 },
  { get title() { return t('Documento') }, index: 2 },
  { get title() { return t('Fecha') }, index: 4 },
  { get title() { return t('Estado') }, index: 5 },
  { get title() { return t('Entrada') }, index: 6 },
  { get title() { return t('Tard. (min)') }, index: 7 },
  { get title() { return t('Ini. refrig.') }, index: 8 },
  { get title() { return t('Fin refrig.') }, index: 9 },
  { get title() { return t('Salida') }, index: 11 },
  { get title() { return t('Total horas') }, index: 13 },
  { get title() { return t('Horas extra') }, index: 14 },
]

// The matrix of rows shared by CSV, Excel and PDF.
function buildRows(
  { employees, schedules, schedule_exceptions: _exceptions, records, justifications = [], holidays = [], overtime_authorizations = [], locations = [] },
  dateFrom,
  dateTo,
) {
  const holidaySet = new Set(holidays.map(h => String(h.date)))
  const { recordMap, justMap, overtimeMap, locationMap } =
    buildMaps(records, justifications, overtime_authorizations, locations)

  const rows = []
  for (const emp of employees) {
    const schedule = getApplicableSchedule(emp.id, schedules, emp.location_id)
    const workingDays = schedule?.days_of_week ?? DEFAULT_DAYS

    // Each person is listed from the day they were added, so days before that never show as absences.
    for (const date of dateRange(reportStart(emp, dateFrom), dateTo)) {
      const dow = new Date(date + 'T12:00:00').getDay()
      const isHoliday = holidaySet.has(date)
      if (!workingDays.includes(dow) && !isHoliday) continue

      const marks = recordMap[`${emp.id}__${date}`] ?? {}
      if (isHoliday && !marks.checkin) continue

      const d = buildRowData(emp, date, marks, schedule, holidaySet, justMap, overtimeMap, locationMap)

      rows.push([
        d.apellidosNombres,
        docTypeLabel(d.docType),
        d.dni,
        d.puesto,
        d.fecha,
        d.estado,
        d.checkin,
        d.tardanzaMin,
        d.breakStart,
        d.breakEnd,
        d.excesoRefMin,
        d.checkout,
        d.salidaAntMin,
        d.horasTrab,
        d.heTotal,
      ])
    }
  }
  return rows
}

function csvVal(value) {
  if (value == null) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function baseFileName(businessName, dateFrom, dateTo) {
  const name = (businessName ?? 'business').replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '') || 'business'
  return `attendance_${name}_${dateFrom}_${dateTo}`
}

// ─── CSV ────────────────────────────────────────────────────────────────────
export function generateAttendanceCSV(data, dateFrom, dateTo) {
  const rows = buildRows(data, dateFrom, dateTo)
  return [headers().map(csvVal).join(','), ...rows.map(r => r.map(csvVal).join(','))].join('\n')
}

export function downloadAttendanceCSV(csvString, businessName, dateFrom, dateTo) {
  const blob = new Blob(['﻿' + csvString], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${baseFileName(businessName, dateFrom, dateTo)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Excel (.xlsx) ──────────────────────────────────────────────────────────
// Resolves to { blob, filename }.
export async function generateAttendanceXLSX(data, dateFrom, dateTo, businessName) {
  const XLSX = await loadXlsx()
  const rows = buildRows(data, dateFrom, dateTo)
  const ws = XLSX.utils.aoa_to_sheet([headers(), ...rows])

  ws['!cols'] = [
    { wch: 28 }, { wch: 22 }, { wch: 14 }, { wch: 18 }, { wch: 11 }, { wch: 14 },
    { wch: 9 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 16 },
    { wch: 9 }, { wch: 16 }, { wch: 11 }, { wch: 11 },
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, t('Asistencia'))
  const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
  return {
    blob: new Blob([buffer], { type: XLSX_MIME }),
    filename: `${baseFileName(businessName, dateFrom, dateTo)}.xlsx`,
    employeeCount: data.employees.length,
  }
}

// ─── PDF ────────────────────────────────────────────────────────────────────
// Resolves to { blob, filename, employeeCount }. The libraries are loaded on demand: they are heavy.
export async function generateAttendancePDF(data, dateFrom, dateTo, business = {}) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const rows = buildRows(data, dateFrom, dateTo)

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.text(t('Reporte de asistencia'), 14, 16)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(business.name ?? '', 14, 22)
  if (business.tax_id) doc.text(business.tax_id, 14, 27)
  doc.text(`Periodo: ${dateFrom} a ${dateTo}`, pageWidth - 14, 16, { align: 'right' })
  doc.text(t('Generado: {0}', [todayISO()]), pageWidth - 14, 22, { align: 'right' })

  const note = reportNote(data.employees, dateFrom)
  if (note) {
    doc.setFontSize(8)
    doc.setTextColor(100)
    doc.text(note, 14, business.tax_id ? 32 : 27)
    doc.setTextColor(0)
  }

  autoTable(doc, {
    head: [PDF_COLUMNS.map(c => c.title)],
    body: rows.map(row => PDF_COLUMNS.map(c => String(row[c.index] ?? ''))),
    startY: note ? (business.tax_id ? 35 : 30) : (business.tax_id ? 31 : 26),
    styles: { fontSize: 7, cellPadding: 1.4, overflow: 'ellipsize' },
    headStyles: { fillColor: [46, 125, 233], textColor: 255 },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    margin: { left: 14, right: 14, bottom: 14 },
    didDrawPage: () => {
      doc.setFontSize(8)
      doc.setTextColor(120)
      doc.text(t('Página {0}', [doc.getNumberOfPages()]), pageWidth - 14, doc.internal.pageSize.getHeight() - 6, { align: 'right' })
      doc.setTextColor(0)
    },
  })

  return {
    blob: doc.output('blob'),
    filename: `${baseFileName(business.name, dateFrom, dateTo)}.pdf`,
    employeeCount: data.employees.length,
  }
}
