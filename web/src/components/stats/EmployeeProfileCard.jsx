import { Link } from 'react-router-dom'
import { formatShortDate, weekdayShort } from '../../utils/dates'
import { minutesToReadable } from '../../utils/attendance'
import AvatarUpload from '../ui/AvatarUpload'
import { ROLE_LABELS, documentText } from '../../utils/labels'
import { t, tn } from '../../i18n'

const fmtTime = time => (time ? time.slice(0, 5) : null)
const formatDays = dows =>
  Array.isArray(dows) && dows.length > 0
    ? dows.slice().sort((a, b) => a - b).map(d => weekdayShort(d)).join(', ')
    : null

// Muestra el teléfono solo si contiene caracteres válidos (dígitos, +, espacios, guiones)
const sanitizePhone = p => (p && /^[+\d\s()-]+$/.test(p.trim()) ? p.trim() : null)

function antiguedad(createdAt) {
  if (!createdAt) return '-'
  const desde = new Date(createdAt)
  const ahora = new Date()
  const meses = (ahora.getFullYear() - desde.getFullYear()) * 12 + (ahora.getMonth() - desde.getMonth())
  if (meses < 1) return t('Menos de 1 mes')
  if (meses < 12) return tn(meses, '{0} mes', '{0} meses')
  const años = Math.floor(meses / 12)
  const resto = meses % 12
  const base = tn(años, '{0} año', '{0} años')
  return resto > 0 ? t('{0} y {1}', [base, tn(resto, '{0} mes', '{0} meses')]) : base
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
 *   employee    - objeto empleado (con photo_url opcional)
 *   departments - array de departamentos
 *   schedules   - array de horarios del reporte
 *   kpis        - (opcional) resultado de computeEmployeeStats.kpis, para la sección "Mes"
 *   insights    - (opcional) resultado de computeEmployeeStats.insights
 *   monthLabel  - (opcional) string, ej. "junio 2026"
 */
export default function EmployeeProfileCard({ employee, departments = [], schedules = [], kpis, insights, monthLabel }) {
  if (!employee) return null

  const dept = departments.find(d => d.id === employee.department_id)
  const fullName = [employee.name, employee.last_name].filter(Boolean).join(' ')

  const ownBlocks = schedules.filter(s => s.employee_id === employee.id && s.active)
  const scheduleBlocks = ownBlocks.length > 0
    ? ownBlocks
    : schedules.filter(s => s.is_default && s.employee_id == null && s.active)

  const sexLabel = employee.sex === 'M' ? t('Masculino') : employee.sex === 'F' ? t('Femenino') : null

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
              {employee.active ? t('Activo') : t('Inactivo')}
            </span>
          </div>
        </div>
      </div>

      {/* Sección Laboral */}
      <Section title={t('Laboral')}>
        <Row label={t('Área')} value={dept?.name} />
        <Row label={t('Rol')} value={ROLE_LABELS[employee.role] ?? employee.role} />
        <Row
          label={t('Días lab.')}
          value={scheduleBlocks.length > 0
            ? scheduleBlocks.map(b => formatDays(b.days_of_week)).filter(Boolean).join(' / ')
            : null}
        />
        <Row
          label={t('Horario')}
          value={scheduleBlocks.length > 0
            ? scheduleBlocks.map(b => {
                const from = fmtTime(b.start_time)
                const to   = fmtTime(b.end_time)
                return from && to ? `${from}–${to}` : null
              }).filter(Boolean).join(' / ')
            : null}
        />
        <Row label={t('Antigüedad')} value={antiguedad(employee.created_at)} />
      </Section>

      {/* Sección Datos personales */}
      <Section title={t('Datos personales')}>
        <Row label={t('Documento')} value={documentText(employee.doc_type, employee.dni)} />
        <Row label={t('Correo')} value={employee.email} />
        <Row label={t('Teléfono')} value={sanitizePhone(employee.phone)} />
        <Row label={t('Nacimiento')} value={formatShortDate(employee.birth_date)} />
        {sexLabel && <Row label={t('Sexo')} value={sexLabel} />}
      </Section>

      {/* Sección Estadísticas del mes (solo si hay datos) */}
      {hasKpis && (
        <Section title={monthLabel ? t('Estadísticas · {0}', [monthLabel]) : t('Estadísticas del mes')}>
          <Row
            label={t('Asistencia')}
            value={kpis.asistenciaPct != null ? `${kpis.asistenciaPct}%` : '-'}
          />
          <Row
            label={t('Puntualidad')}
            value={insights?.puntualidadPct != null ? `${insights.puntualidadPct}%` : '-'}
          />
          <Row
            label={t('Tardanzas')}
            value={kpis.tardanzasCount > 0 ? t('{0} veces', [kpis.tardanzasCount]) : t('Sin tardanzas')}
          />
          {kpis.tardanzasCount > 0 && (
            <Row label={t('Tiempo acum.')} value={minutesToReadable(kpis.tardanzasMin)} />
          )}
          <Row
            label={t('Horas trabajadas')}
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
          {t('Ver perfil completo')}
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      </div>
    </div>
  )
}
