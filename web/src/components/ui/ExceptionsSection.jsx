// Sección reutilizable de horarios excepcionales (override puntual para una
// fecha exacta, sin tocar el horario recurrente). Se usa igual en
// Configuración (empresa), en el modal de Sedes, y en la ficha de empleado,
// cada uno le pasa su propio scope (employeeId o locationId, o ninguno).
import { useState } from 'react'
import { useScheduleExceptions, useSetException, useDeleteException } from '../../hooks/useScheduleExceptions'
import { t } from '../../i18n'

function fmtFecha(dateStr) {
  const [y, m, d] = dateStr.split('-')
  return `${d}/${m}/${y}`
}

export default function ExceptionsSection({ employeeId = null, locationId = null }) {
  const { data: allExceptions = [] } = useScheduleExceptions()
  const setException = useSetException()
  const deleteException = useDeleteException()

  const exceptions = allExceptions
    .filter(e => e.employee_id === employeeId && e.location_id === locationId)
    .sort((a, b) => b.date.localeCompare(a.date))

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ date: '', noLaborable: false, start_time: '09:00', end_time: '18:00', reason: '' })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState(null)

  function openForm() {
    setForm({ date: '', noLaborable: false, start_time: '09:00', end_time: '18:00', reason: '' })
    setError('')
    setShowForm(true)
  }

  async function handleSave() {
    if (!form.date) { setError(t('Selecciona una fecha.')); return }
    if (!form.noLaborable && form.start_time >= form.end_time) {
      setError(t('La hora de salida debe ser posterior a la de entrada.'))
      return
    }
    setSaving(true); setError('')
    try {
      await setException.mutateAsync({
        employeeId, locationId, date: form.date,
        startTime: form.noLaborable ? null : form.start_time,
        endTime:   form.noLaborable ? null : form.end_time,
        reason:    form.reason.trim() || null,
      })
      setShowForm(false)
    } catch (err) {
      setError(err.message ?? t('No se pudo guardar la excepción.'))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    setDeletingId(id)
    try {
      await deleteException.mutateAsync(id)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-slate-700">{t('Horarios excepcionales')}</span>
        {!showForm && (
          <button
            type="button"
            onClick={openForm}
            className="text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors"
          >
            {t('+ Agregar excepción')}
          </button>
        )}
      </div>

      {exceptions.length === 0 && !showForm && (
        <p className="text-xs text-slate-400">
          {t('Para un día puntual con horario distinto (evento, capacitación, jornada reducida), sin afectar el horario habitual.')}
        </p>
      )}

      {exceptions.length > 0 && (
        <ul className="space-y-1.5 mb-3">
          {exceptions.map(e => (
            <li key={e.id} className="flex items-center justify-between gap-2 bg-slate-50 rounded-lg px-3 py-2">
              <div className="min-w-0 text-xs">
                <span className="font-medium text-slate-700">{fmtFecha(e.date)}</span>
                <span className="text-slate-500 ml-2">
                  {e.start_time ? `${e.start_time.slice(0, 5)} - ${e.end_time.slice(0, 5)}` : t('No laborable')}
                </span>
                {e.reason && <span className="text-slate-400 ml-2 truncate">· {e.reason}</span>}
              </div>
              <button
                type="button"
                onClick={() => handleDelete(e.id)}
                disabled={deletingId === e.id}
                className="text-slate-300 hover:text-rose-500 disabled:opacity-50 transition-colors shrink-0"
                aria-label={t('Eliminar excepción')}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}

      {showForm && (
        <div className="bg-slate-50 rounded-lg p-3 space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">{t('Fecha')}</label>
            <input
              type="date"
              value={form.date}
              onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              autoFocus
            />
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={form.noLaborable}
              onChange={e => setForm(f => ({ ...f, noLaborable: e.target.checked }))}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            {t('No laborable ese día')}
          </label>

          {!form.noLaborable && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">{t('Entrada')}</label>
                <input
                  type="time"
                  value={form.start_time}
                  onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">{t('Salida')}</label>
                <input
                  type="time"
                  value={form.end_time}
                  onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs text-slate-500 mb-1">
              {t('Motivo')}{' '}<span className="text-slate-400 font-normal">{t('(opcional)')}</span>
            </label>
            <input
              type="text"
              value={form.reason}
              onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
              placeholder={t('Ej: Partido de la selección')}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {error && <p className="text-xs text-rose-600">{error}</p>}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="flex-1 border border-slate-200 hover:bg-white text-slate-600 font-medium py-2 rounded-lg text-xs transition-colors"
            >
              {t('Cancelar')}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2 rounded-lg text-xs transition-colors"
            >
              {saving ? t('Guardando...') : t('Guardar')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
