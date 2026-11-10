import { Link } from 'react-router-dom'
import { formatShortDate } from '../../utils/dates'
import { minutesToReadable } from '../../utils/attendance'
import AvatarUpload from '../ui/AvatarUpload'
import { ROLE_LABELS } from '../../utils/labels'

const DOW = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const fmtTime = t => (t ? t.slice(0, 5) : null)
const formatDays = dows =>
  Array.isArray(dows) && dows.length > 0
    ? dows.slice().sort((a, b) => a - b).map(d => DOW[d]).join(', ')
    : null

// Muestra el teléfono solo si contiene caracteres válidos (dígitos, +, espacios, guiones)
const sanitizePhone = p => (p && /^[+\d\s()-]+$/.test(p.trim()) ? p.trim() : null)

function antiguedad(createdAt) {
  if (!createdAt) return '-'
  const desde = new Date(createdAt)
  const ahora = new Date()
  const meses = (ahora.getFullYear() - desde.getFullYear()) * 12 + (ahora.getMonth() - desde.getMonth())
  if (meses < 1) return 'Menos de 1 mes'
  if (meses < 12) return `${meses} ${meses === 1 ? 'mes' : 'meses'}`
  const años = Math.floor(meses / 12)
  const resto = meses % 12
  const base = `${años} ${años === 1 ? 'año' : 'años'}`
  return resto > 0 ? `${base} y ${resto} ${resto === 1 ? 'mes' : 'meses'}` : base
}

function Row({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-2 py-1.5">
      <span className="text-xs text-slate-400 shrink-0">{label}</span>
      <span className="text-xs text-slate-700 font-medium text-right leading-relaxed">{value || '-'}</span>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">{title}</p>
      <div className="divide-y divide-slate-100">{children}</div>
    </div>
  )
}

/**
 * Props:
 *   employee    — objeto empleado (con photo_url opcional)
 *   departments — array de departamentos
 *   schedules   — array de horarios del reporte
 *   kpis        — (opcional) resultado de computeEmployeeStats.kpis, para la sección "Mes"
 *   insights    — (opcional) resultado de computeEmployeeStats.insights
 *   monthLabel  — (opcional) string, ej. "junio 2026"
 */
export default function EmployeeProfileCard({ employee, departments = [], schedules = [], kpis, insights, monthLabel }) {
  if (!employee) return null

  const dept = departments.find(d => d.id === employee.department_id)
  const fullName = [employee.name, employee.last_name].filter(Boolean).join(' ')

  const ownBlocks = schedules.filter(s => s.employee_id === employee.id && s.active)
  const scheduleBlocks = ownBlocks.length > 0
    ? ownBlocks
    : schedules.filter(s => s.is_default && s.employee_id == null && s.active)

  const sexLabel = employee.sex === 'M' ? 'Masculino' : employee.sex === 'F' ? 'Femenino' : null

  const hasKpis = kpis && (kpis.diasLaborables > 0 || kpis.horasMin > 0)

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <AvatarUpload employee={employee} size="lg" editable />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900 truncate">{fullName || '-'}</p>
          <div className="flex flex-wrap items-center gap-1.5 mt-1">
            {employee.puesto && (
              <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full truncate max-w-[120px]">
                {employee.puesto}
              </span>
            )}
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              employee.active ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'
            }`}>
              {employee.active ? 'Activo' : 'Inactivo'}
            </span>
          </div>
        </div>
      </div>

      {/* Sección Laboral */}
      <Section title="Laboral">
        <Row label="Área" value={dept?.name} />
        <Row label="Rol" value={ROLE_LABELS[employee.role] ?? employee.role} />
        <Row
          label="Días lab."
          value={scheduleBlocks.length > 0
            ? scheduleBlocks.map(b => formatDays(b.days_of_week)).filter(Boolean).join(' / ')
            : null}
        />
        <Row
          label="Horario"
          value={scheduleBlocks.length > 0
            ? scheduleBlocks.map(b => {
                const from = fmtTime(b.start_time)
                const to   = fmtTime(b.end_time)
                return from && to ? `${from}–${to}` : null
              }).filter(Boolean).join(' / ')
            : null}
        />
        <Row label="Antigüedad" value={antiguedad(employee.created_at)} />
      </Section>

      {/* Sección Datos personales */}
      <Section title="Datos personales">
        <Row label="Documento" value={[employee.doc_type ?? 'DNI', employee.dni].filter(Boolean).join(' ') || null} />
        <Row label="Correo" value={employee.email} />
        <Row label="Teléfono" value={sanitizePhone(employee.phone)} />
        <Row label="Nacimiento" value={formatShortDate(employee.birth_date)} />
        {sexLabel && <Row label="Sexo" value={sexLabel} />}
      </Section>

      {/* Sección Estadísticas del mes (solo si hay datos) */}
      {hasKpis && (
        <Section title={monthLabel ? `Estadísticas · ${monthLabel}` : 'Estadísticas del mes'}>
          <Row
            label="Asistencia"
            value={kpis.asistenciaPct != null ? `${kpis.asistenciaPct}%` : '-'}
          />
          <Row
            label="Puntualidad"
            value={insights?.puntualidadPct != null ? `${insights.puntualidadPct}%` : '-'}
          />
          <Row
            label="Tardanzas"
            value={kpis.tardanzasCount > 0 ? `${kpis.tardanzasCount} veces` : 'Sin tardanzas'}
          />
          {kpis.tardanzasCount > 0 && (
            <Row label="Tiempo acum." value={minutesToReadable(kpis.tardanzasMin)} />
          )}
          <Row
            label="Horas trabajadas"
            value={kpis.horasMin > 0 ? minutesToReadable(kpis.horasMin) : '-'}
          />
        </Section>
      )}

      {/* CTA */}
      <div className="pt-2 border-t border-slate-100">
        <Link
          to={`/employees/${employee.id}`}
          className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors"
        >
          Ver perfil completo
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      </div>
    </div>
  )
}
