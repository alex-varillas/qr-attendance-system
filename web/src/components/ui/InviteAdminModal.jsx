import { useState } from 'react'
import Modal from './Modal'
import { t } from '../../i18n'

// Asks for the email of the new administrator. The row of the table stays compact (one "Invitar" button)
// and this modal is where the address is typed and confirmed.
export default function InviteAdminModal({ employee, initialEmail = '', onSend, sending, error, onClose }) {
  const [email, setEmail] = useState(initialEmail)
  const valid = email.trim().includes('@')

  return (
    <Modal onClose={onClose} ariaLabel={t('Invitar a {0} {1}', [employee.name, employee.last_name])} className="bg-white rounded-xl shadow-lg w-full max-w-sm p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-slate-800">{t('Invitar a')}{' '}{employee.name} {employee.last_name}</h2>
            <p className="text-xs text-slate-500 mt-0.5">{t('Crearemos un enlace para que elija su contraseña y entre como administrador.')}</p>
          </div>
          <button onClick={onClose} aria-label={t('Cerrar')} className="text-slate-400 hover:text-slate-600 ml-4 shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <label htmlFor="invite-email" className="block text-sm font-medium text-slate-700 mb-1.5">
          {t('Correo electrónico')}{' '}<span className="text-rose-500">*</span>
        </label>
        <input
          id="invite-email"
          type="email"
          autoFocus
          value={email}
          onChange={e => setEmail(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && valid && !sending && onSend(email.trim())}
          placeholder={t('correo@ejemplo.com')}
          disabled={sending}
          className={`w-full px-3 py-2 border rounded-lg text-sm mb-1 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent ${
            error ? 'border-rose-400' : 'border-slate-300'
          }`}
        />

        {error && <p className="text-rose-600 text-sm mb-3">{error}</p>}

        <div className="flex gap-2 mt-4">
          <button onClick={onClose}
            className="flex-1 border border-slate-300 hover:bg-slate-50 text-slate-600 font-medium py-2 rounded-lg text-sm transition-colors">
            {t('Cancelar')}
          </button>
          <button
            onClick={() => onSend(email.trim())}
            disabled={!valid || sending}
            className="flex-1 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-medium py-2 rounded-lg text-sm transition-colors"
          >
            {sending ? t('Creando...') : t('Crear invitación')}
          </button>
        </div>
    </Modal>
  )
}
