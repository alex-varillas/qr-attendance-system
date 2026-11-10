import { useState } from 'react'
import Modal from './Modal'

// Shows a one-time link (an invitation, or a new password) so the owner can copy it and send it by any
// channel. Email is optional in this system, so a link is never hidden behind a message that may not arrive.
export default function LinkModal({ title, description, link, emailed = false, email = null, onClose }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      // Clipboard access can be blocked (plain HTTP, permissions): the link is selectable below.
      setCopied(false)
    }
  }

  return (
    <Modal onClose={onClose} ariaLabel={title} className="bg-white rounded-xl shadow-lg w-full max-w-md p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-slate-800">{title}</h2>
          {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
        </div>
        <button onClick={onClose} aria-label="Cerrar" className="text-slate-400 hover:text-slate-600 ml-4 shrink-0">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {emailed && email && (
        <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-3">
          También lo enviamos por correo a {email}.
        </p>
      )}

      <label htmlFor="share-link" className="block text-sm font-medium text-slate-700 mb-1.5">Enlace</label>
      <input
        id="share-link"
        readOnly
        value={link}
        onFocus={e => e.target.select()}
        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono bg-slate-50 text-slate-700"
      />
      <p className="text-xs text-slate-400 mt-1.5">Es de un solo uso y vence pronto. Envíalo por un canal que solo vea la persona.</p>

      <div className="flex gap-2 mt-4">
        <button
          onClick={onClose}
          className="flex-1 border border-slate-300 hover:bg-slate-50 text-slate-600 font-medium py-2 rounded-lg text-sm transition-colors"
        >
          Cerrar
        </button>
        <button
          onClick={handleCopy}
          className="flex-1 bg-violet-600 hover:bg-violet-700 text-white font-medium py-2 rounded-lg text-sm transition-colors"
        >
          {copied ? 'Copiado' : 'Copiar enlace'}
        </button>
      </div>
    </Modal>
  )
}
