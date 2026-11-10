import { useRef, useState } from 'react'
import { useImportEmployees } from '../../hooks/useEmployees'
import { BRAND_GRADIENT } from '../../utils/theme'
import Modal from './Modal'
import { getLocale, t, tn } from '../../i18n'
import { weekdayInitials } from '../../utils/dates'

// The file can be written with Spanish or English column names (and day names); the template follows the
// language of the interface. Internally every row is read through the Spanish names.
const COLUMN_ALIASES = {
  nombre: ['nombre', 'first_name', 'name'],
  apellido: ['apellido', 'last_name', 'surname'],
  dni: ['dni', 'document', 'document_number', 'id_number'],
  puesto: ['puesto', 'job_title', 'position'],
  dias_descanso: ['dias_descanso', 'rest_days', 'days_off'],
}
const REQUIRED_HEADERS = ['nombre', 'apellido']

function templateColumns() {
  return getLocale() === 'en'
    ? ['first_name', 'last_name', 'document', 'job_title', 'rest_days']
    : ['nombre', 'apellido', 'dni', 'puesto', 'dias_descanso']
}

function templateCSV() {
  if (getLocale() === 'en') {
    return templateColumns().join(',') + '\n' +
      'Carlos,Mendoza,1001,Salesperson,company\n' +
      'Elena,Ramos,1002,Cashier,saturday/sunday\n' +
      'Pedro,Torres,1003,Warehouse clerk,sunday\n'
  }
  return templateColumns().join(',') + '\n' +
    'Carlos,Mendoza,1001,Vendedor,empresa\n' +
    'Elena,Ramos,1002,Cajera,sabado/domingo\n' +
    'Pedro,Torres,1003,Almacenero,domingo\n'
}

/** Maps the headers of the file (Spanish or English) to the internal names, so the rest of the code is language free. */
function canonicalHeader(header) {
  for (const [canonical, aliases] of Object.entries(COLUMN_ALIASES)) {
    if (aliases.includes(header)) return canonical
  }
  return header
}

// Convierte "S/D" o "sabado/domingo" → días laborables (getDay convention)
function parseRestDays(str) {
  if (!str) return null
  const normalized = str.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  if (normalized === '' || normalized === 'empresa' || normalized === 'company') return null

  const dayMap = {
    lunes: 1, l: 1, lu: 1,
    martes: 2, m: 2, ma: 2,
    miercoles: 3, x: 3, mi: 3,
    jueves: 4, j: 4, ju: 4,
    viernes: 5, v: 5, vi: 5,
    sabado: 6, s: 6, sa: 6,
    domingo: 0, d: 0, do: 0,
    // English names (the file can be written in English)
    monday: 1, mon: 1, tuesday: 2, tue: 2, wednesday: 3, wed: 3, thursday: 4, thu: 4,
    friday: 5, fri: 5, saturday: 6, sat: 6, sunday: 0, sun: 0,
    mo: 1, tu: 2, we: 3, th: 4, fr: 5, su: 0,
  }

  const parts = normalized.split(/[\s/]+/).map(p => p.trim()).filter(Boolean)
  const restDays = parts.map(p => dayMap[p]).filter(d => d !== undefined)
  if (restDays.length === 0) return null

  // Días laborables = todos menos los de descanso
  return [0, 1, 2, 3, 4, 5, 6].filter(d => !restDays.includes(d))
}

const dayInitial = day => weekdayInitials()[(day + 6) % 7]

/* ── Parser CSV simple (sin dependencias externas) ─── */
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) return { headers: [], rows: [] }

  const headers = lines[0].split(',').map(h => canonicalHeader(h.trim().toLowerCase().replace(/['"]/g, '')))
  const rows = lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim().replace(/^["']|["']$/g, ''))
    return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? '']))
  }).filter(row => Object.values(row).some(v => v !== ''))

  return { headers, rows }
}

function downloadTemplate() {
  const blob = new Blob([templateCSV()], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = getLocale() === 'en' ? 'employees_template.csv' : 'plantilla_empleados.csv'
  a.click()
  URL.revokeObjectURL(url)
}

/* ══════════════════════════════════════════════════ */
export default function ImportCSVModal({ onClose, existingEmployees = [] }) {
  const fileRef   = useRef(null)
  const importEmp = useImportEmployees()

  const [stage, setStage]     = useState('upload')   // upload | preview | done
  const [parseError, setParseError] = useState('')
  const [preview, setPreview] = useState([])          // [{name,last_name,dni,puesto,status}]
  const [result, setResult]   = useState(null)        // {created, skipped}
  const [dragOver, setDragOver] = useState(false)

  const existingDNIs = new Set(
    existingEmployees.map(e => e.dni).filter(Boolean)
  )

  function processFile(file) {
    if (!file || !file.name.endsWith('.csv')) {
      setParseError(t('Solo se aceptan archivos .csv'))
      return
    }
    const reader = new FileReader()
    reader.onload = e => {
      const { headers, rows } = parseCSV(e.target.result)

      // Validar cabeceras requeridas
      const missing = REQUIRED_HEADERS.filter(h => !headers.includes(h))
      if (missing.length) {
        setParseError(t('Columnas requeridas no encontradas: {0}', [templateColumns().filter(col => missing.includes(canonicalHeader(col))).join(', ')]))
        return
      }
      if (rows.length === 0) {
        setParseError(t('El archivo no tiene datos.'))
        return
      }

      // Mapear columnas y marcar estado
      const mapped = rows.map(row => {
        const name          = row['nombre']         ?? ''
        const last_name     = row['apellido']       ?? ''
        const dni           = row['dni']            ?? ''
        const puesto        = row['puesto']         ?? ''
        const diasDescanso  = row['dias_descanso']  ?? ''

        if (!name.trim() || !last_name.trim()) return null  // fila sin nombre o apellido → ignorar

        const isDuplicate = dni && existingDNIs.has(dni.trim())
        const days_of_week = parseRestDays(diasDescanso)  // null = usa horario empresa
        const diasLabel = days_of_week
          ? days_of_week.map(dayInitial).join('')
          : t('Empresa')

        return {
          name:        name.trim(),
          last_name:   last_name.trim(),
          dni:         dni.trim(),
          puesto:      puesto.trim(),
          days_of_week,
          diasLabel,
          status: isDuplicate ? 'skip' : 'new',
        }
      }).filter(Boolean)

      if (mapped.length === 0) {
        setParseError(t('No se encontraron filas válidas en el archivo.'))
        return
      }

      setParseError('')
      setPreview(mapped)
      setStage('preview')
    }
    reader.readAsText(file, 'UTF-8')
  }

  function handleFileChange(e) { processFile(e.target.files[0]) }
  function handleDrop(e) {
    e.preventDefault(); setDragOver(false)
    processFile(e.dataTransfer.files[0])
  }

  async function handleConfirm() {
    const toCreate = preview.filter(r => r.status === 'new')
    await importEmp.mutateAsync(toCreate)
    setResult({ created: toCreate.length, skipped: preview.filter(r => r.status === 'skip').length })
    setStage('done')
  }

  const toCreateCount = preview.filter(r => r.status === 'new').length
  const toSkipCount   = preview.filter(r => r.status === 'skip').length

  return (
    <Modal onClose={onClose} ariaLabel={t('Importar empleados desde CSV')} className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-semibold text-slate-800">{t('Importar empleados desde CSV')}</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {stage === 'upload'  && t('Sube tu archivo o descarga la plantilla')}
              {stage === 'preview' && t('{0} filas encontradas, revisa antes de importar', [preview.length])}
              {stage === 'done'    && t('Importación completada')}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── Stage: Upload ───────────────────────── */}
        {stage === 'upload' && (
          <div className="px-6 py-5 space-y-4">
            {/* Zona de drop */}
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-xl px-6 py-10 text-center cursor-pointer transition-colors ${
                dragOver ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'
              }`}
            >
              <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <p className="text-sm font-medium text-slate-700">{t('Arrastra tu archivo aquí o')}{' '}<span className="text-blue-600">{t('selecciona')}</span></p>
              <p className="text-xs text-slate-400 mt-1">{t('Solo archivos .csv · UTF-8')}</p>
              <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
            </div>

            {parseError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{parseError}</p>
            )}

            {/* Formato esperado */}
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
              <p className="text-xs font-semibold text-slate-600 mb-2">{t('Formato requerido (columnas):')}</p>
              <div className="flex gap-2 flex-wrap">
                {templateColumns().map((col, i) => (
                  <span key={col} className={`text-[11px] font-mono px-2 py-0.5 rounded ${i < REQUIRED_HEADERS.length ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-600'}`}>
                    {col}{i < REQUIRED_HEADERS.length ? ' *' : ''}
                  </span>
                ))}
              </div>
              <p className="text-[11px] text-slate-400 mt-2">{t('* obligatorio · Los duplicados por documento serán omitidos')}</p>
              <p className="text-[11px] text-slate-400 mt-1">
                <span className="font-medium text-slate-500">{t('dias_descanso:')}</span>{' '}{t('"empresa" para usar el horario general, o días separados por /. Ej:')}{' '}<span className="font-mono">{t('D')}</span>, <span className="font-mono">{t('S/D')}</span>, <span className="font-mono">{t('sabado/domingo')}</span>
              </p>
            </div>

            {/* Descargar plantilla */}
            <button
              onClick={downloadTemplate}
              className="w-full flex items-center justify-center gap-2 border border-slate-200 hover:bg-slate-50 text-slate-600 font-medium py-2.5 rounded-xl text-sm transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              {t('Descargar plantilla CSV')}
            </button>
          </div>
        )}

        {/* ── Stage: Preview ──────────────────────── */}
        {stage === 'preview' && (
          <>
            {/* Resumen */}
            <div className="px-6 pt-4 pb-3 flex items-center gap-3">
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 border border-green-100 rounded-lg">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-xs font-semibold text-green-700">{toCreateCount}{' '}{t('a crear')}</span>
              </div>
              {toSkipCount > 0 && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-100 rounded-lg">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  <span className="text-xs font-semibold text-amber-700">{toSkipCount}{' '}{t('ya existen (documento duplicado)')}</span>
                </div>
              )}
            </div>

            {/* Tabla preview */}
            <div className="mx-3 sm:mx-6 mb-4 border border-slate-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight: '280px' }}>
                <table className="w-full text-xs min-w-[520px]">
                  <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left text-slate-500 font-medium">{t('Nombre')}</th>
                      <th className="px-3 py-2 text-left text-slate-500 font-medium">{t('Documento')}</th>
                      <th className="px-3 py-2 text-left text-slate-500 font-medium hidden sm:table-cell">{t('Puesto')}</th>
                      <th className="px-3 py-2 text-left text-slate-500 font-medium">{t('Días trabajo')}</th>
                      <th className="px-3 py-2 text-left text-slate-500 font-medium">{t('Estado')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {preview.map((row, i) => (
                      <tr key={i} className={row.status === 'skip' ? 'bg-amber-50/40 opacity-60' : ''}>
                        <td className="px-3 py-2 text-slate-800 font-medium">{row.name} {row.last_name}</td>
                        <td className="px-3 py-2 text-slate-500 font-mono">{row.dni || '-'}</td>
                        <td className="px-3 py-2 text-slate-500 hidden sm:table-cell">{row.puesto || '-'}</td>
                        <td className="px-3 py-2">
                          <span className={`text-xs font-mono ${row.days_of_week ? 'text-blue-600' : 'text-slate-400'}`}>
                            {row.diasLabel}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          {row.status === 'new'
                            ? <span className="inline-flex items-center gap-1 text-green-600 font-semibold"><span>✓</span>{' '}{t('Nuevo')}</span>
                            : <span className="inline-flex items-center gap-1 text-amber-600 font-semibold"><span>–</span>{' '}{t('Omitir')}</span>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {parseError && (
              <p className="mx-6 mb-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{parseError}</p>
            )}

            {/* Acciones */}
            <div className="px-6 pb-5 flex gap-3">
              <button
                onClick={() => { setStage('upload'); setPreview([]); setParseError('') }}
                className="flex-1 border border-slate-200 hover:bg-slate-50 text-slate-600 font-medium py-2.5 rounded-xl text-sm transition-colors"
              >
                {t('Volver')}
              </button>
              <button
                onClick={handleConfirm}
                disabled={toCreateCount === 0 || importEmp.isPending}
                className="flex-1 text-white font-semibold py-2.5 rounded-xl text-sm transition-all disabled:opacity-50"
                style={{ background: BRAND_GRADIENT, boxShadow: toCreateCount > 0 ? '0 4px 14px rgba(46,125,233,0.35)' : 'none' }}
              >
                {importEmp.isPending ? t('Importando...') : tn(toCreateCount, 'Importar {0} empleado', 'Importar {0} empleados')}
              </button>
            </div>
          </>
        )}

        {/* ── Stage: Done ─────────────────────────── */}
        {stage === 'done' && result && (
          <div className="px-6 py-8 text-center">
            <div className="w-14 h-14 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-slate-800 mb-1">{t('¡Importación exitosa!')}</h3>
            <p className="text-sm text-slate-500 mb-1">
              <span className="font-semibold text-green-600">{tn(result.created, '{0} empleado creado', '{0} empleados creados')}</span>
              {result.skipped > 0 && <> · <span className="text-amber-600">{tn(result.skipped, '{0} omitido', '{0} omitidos')}</span>{' '}{t('(documento duplicado)')}</>}
            </p>
            <button
              onClick={onClose}
              className="mt-5 w-full text-white font-semibold py-2.5 rounded-xl text-sm"
              style={{ background: BRAND_GRADIENT }}
            >
              {t('Cerrar')}
            </button>
          </div>
        )}

    </Modal>
  )
}
