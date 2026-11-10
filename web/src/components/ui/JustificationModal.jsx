import { useState } from 'react'
import { useCreateJustification, useUpdateJustification, useDeleteJustification } from '../../hooks/useJustifications'
import Modal from './Modal'
import { t } from '../../i18n'

const ABSENCE_TYPES = [
  { value: 'permiso_con_goce',   get label() { return t('Permiso con goce de haber') } },
  { value: 'permiso_sin_goce',   get label() { return t('Permiso sin goce de haber') } },
  { value: 'vacaciones',         get label() { return t('Vacaciones') } },
  { value: 'descanso_medico',    get label() { return t('Descanso médico') } },
  { value: 'licencia',           get label() { return t('Licencia') } },
  { value: 'suspension',         get label() { return t('Suspensión') } },
  { value: 'comision_servicio',  get label() { return t('Comisión de servicio') } },
  { value: 'otro',               get label() { return t('Otro / Permiso general') } },
]

export default function JustificationModal({ employee, date, justification, onClose, defaultType = 'otro' }) {
  const isEditing = !!justification

  const [dateFrom,      setDateFrom]      = useState(justification?.date    ?? date)
  const [type,          setType]          = useState(justification?.type    ?? defaultType)
  const [dateTo,        setDateTo]        = useState(justification?.date_to ?? '')
  const [reason,        setReason]        = useState(justification?.reason  ?? '')
  const [status,        setStatus]        = useState('approved')
  const [confirmDelete, setConfirm]       = useState(false)
  const [error,         setError]         = useState(null)

  const create = useCreateJustification()
  const update = useUpdateJustification()
  const remove = useDeleteJustification()

  const isLoading = create.isPending || update.isPending || remove.isPending

  async function handleSave() {
    setError(null)
    if (!dateFrom) { setError(t('La fecha de inicio es obligatoria.')); return }
    if (dateTo && dateTo < dateFrom) { setError(t('La fecha de fin no puede ser anterior a la fecha de inicio.')); return }
    try {
      const payload = {
        type,
        reason:  reason.trim(),
        date_to: dateTo || null,
      }
      if (isEditing) {
        await update.mutateAsync({ id: justification.id, date, ...payload })
      } else {
        await create.mutateAsync({ employeeId: employee.id, date: dateFrom, ...payload, ...(status === 'pending' ? { status: 'pending' } : {}) })
      }
      onClose()
    } catch {
      setError(t('No se pudo guardar. Intenta nuevamente.'))
    }
  }

  async function handleDelete() {
    setError(null)
    try {
      await remove.mutateAsync({ id: justification.id, date })
      onClose()
    } catch {
      setError(t('No se pudo eliminar. Intenta nuevamente.'))
    }
  }

  return (
    <Modal
      onClose={onClose}
      ariaLabel={isEditing ? t('Editar justificación') : t('Registrar ausencia')}
      className="bg-white rounded-xl shadow-lg w-full max-w-sm p-6"
    >
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-slate-800">
              {isEditing ? t('Editar justificación') : t('Registrar ausencia')}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {employee.name} {employee.last_name}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors ml-4 shrink-0"
            aria-label={t('Cerrar')}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4 mb-5">
          {/* Fecha de inicio (editable solo al crear) */}
          {!isEditing && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                {t('Fecha de inicio')}{' '}<span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={e => { setDateFrom(e.target.value); if (dateTo && e.target.value > dateTo) setDateTo('') }}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          )}

          {/* Tipo de ausencia */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              {t('Tipo de ausencia')}{' '}<span className="text-rose-500">*</span>
            </label>
            <select
              value={type}
              onChange={e => setType(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
            >
              {ABSENCE_TYPES.map(type => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
          </div>

          {/* Estado (solo al crear; la aprobación posterior se hace en Vacaciones) */}
          {!isEditing && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('Estado')}</label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
              >
                <option value="approved">{t('Aprobada')}</option>
                <option value="pending">{t('Pendiente de aprobación')}</option>
              </select>
            </div>
          )}

          {/* Fecha de fin (rango) */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              {t('Fecha de fin')}
              <span className="ml-1 text-xs text-slate-400 font-normal">{t('(dejar vacío si es un solo día)')}</span>
            </label>
            <input
              type="date"
              value={dateTo}
              min={dateFrom || date}
              onChange={e => setDateTo(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Motivo adicional */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              {t('Observación')}
              <span className="ml-1 text-xs text-slate-400 font-normal">{t('(opcional)')}</span>
            </label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder={t('Ej: Certificado médico entregado, aprobado por gerencia...')}
              rows={2}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>
        </div>

        {error && <p className="text-rose-600 text-sm mb-4">{error}</p>}

        {/* Confirmar eliminación */}
        {confirmDelete && (
          <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 mb-4">
            <p className="text-sm text-rose-700 font-medium mb-2">{t('¿Eliminar esta justificación?')}</p>
            <div className="flex gap-2">
              <button
                onClick={handleDelete}
                disabled={isLoading}
                className="flex-1 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-sm font-medium py-1.5 rounded-lg transition-colors"
              >
                {remove.isPending ? t('Eliminando...') : t('Sí, eliminar')}
              </button>
              <button
                onClick={() => setConfirm(false)}
                className="flex-1 border border-slate-300 text-slate-600 text-sm font-medium py-1.5 rounded-lg hover:bg-slate-50 transition-colors"
              >
                {t('Cancelar')}
              </button>
            </div>
          </div>
        )}

        {/* Acciones */}
        <div className="flex gap-2">
          {isEditing && !confirmDelete && (
            <button
              onClick={() => setConfirm(true)}
              className="px-3 py-2 border border-rose-200 text-rose-600 hover:bg-rose-50 rounded-lg text-sm font-medium transition-colors"
              title={t('Eliminar justificación')}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
          {!confirmDelete && (
            <>
              <button
                onClick={onClose}
                className="flex-1 border border-slate-300 hover:bg-slate-50 text-slate-600 font-medium py-2 rounded-lg text-sm transition-colors"
              >
                {t('Cancelar')}
              </button>
              <button
                onClick={handleSave}
                disabled={isLoading}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2 rounded-lg text-sm transition-colors"
              >
                {create.isPending || update.isPending ? t('Guardando...') : t('Guardar')}
              </button>
            </>
          )}
        </div>
    </Modal>
  )
}
