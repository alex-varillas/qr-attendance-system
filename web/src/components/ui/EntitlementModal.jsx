import { useState } from 'react'
import { useSetEntitlement } from '../../hooks/useVacations'
import { DEFAULT_VACATION_DAYS } from '../../utils/vacations'
import Modal from './Modal'

export default function EntitlementModal({ employee, onClose }) {
  const [days, setDays] = useState(employee.vacation_days_per_year ?? DEFAULT_VACATION_DAYS)
  const [error, setError] = useState(null)
  const setEntitlement = useSetEntitlement()

  async function save() {
    const n = parseInt(days, 10)
    if (Number.isNaN(n) || n < 0) { setError('Indica un número de días válido (mínimo 0).'); return }
    setError(null)
    try {
      await setEntitlement.mutateAsync({ employeeId: employee.id, days: n })
      onClose()
    } catch {
      setError('No se pudo guardar. Intenta nuevamente.')
    }
  }

  return (
    <Modal onClose={onClose} ariaLabel="Días de vacaciones al año" className="bg-white rounded-xl shadow-lg w-full max-w-sm p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-slate-800">Días de vacaciones al año</h2>
            <p className="text-xs text-slate-500 mt-0.5">{employee.name} {employee.last_name}</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="text-slate-400 hover:text-slate-600 ml-4 shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <label htmlFor="entitlement-days" className="block text-sm font-medium text-slate-700 mb-1.5">
          Días al año <span className="text-rose-500">*</span>
        </label>
        <input
          id="entitlement-days"
          type="number"
          min="0"
          value={days}
          onChange={e => setDays(e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <p className="text-xs text-slate-400 mb-5">
          Pon aquí lo que corresponde según la ley y los acuerdos de tu país. Por defecto son {DEFAULT_VACATION_DAYS} días.
        </p>

        {error && <p className="text-rose-600 text-sm mb-4">{error}</p>}

        <div className="flex gap-2">
          <button onClick={onClose}
            className="flex-1 border border-slate-300 hover:bg-slate-50 text-slate-600 font-medium py-2 rounded-lg text-sm transition-colors">
            Cancelar
          </button>
          <button onClick={save} disabled={setEntitlement.isPending}
            className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2 rounded-lg text-sm transition-colors">
            {setEntitlement.isPending ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
    </Modal>
  )
}
