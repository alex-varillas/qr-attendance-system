import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import AuthLayout from '../../components/layout/AuthLayout'
import { BRAND_GRADIENT } from '../../utils/theme'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  // null until the server answers; then whether this installation can send email at all
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      setResult(await api.post('/auth/forgot-password', { email }))
    } catch {
      setError('No se pudo procesar la solicitud. Inténtalo de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout>
      <div className="mb-8">
        <h1
          className="text-2xl font-bold text-slate-900"
          style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
        >
          Recupera tu contraseña
        </h1>
        <p className="text-slate-500 text-sm mt-1">Te ayudamos a volver a entrar</p>
      </div>

      {result?.email_configured ? (
        <div className="space-y-4">
          <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
            <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <p className="font-semibold text-slate-800 text-sm">Revisa tu correo</p>
            <p className="text-slate-500 text-sm mt-1">
              Si <strong>{email}</strong> tiene una cuenta, te enviamos un enlace para crear una nueva contraseña.
            </p>
          </div>
          <p className="text-xs text-slate-400">¿No lo ves? Revisa la carpeta de spam.</p>
        </div>
      ) : result ? (
        <div className="space-y-3 text-sm text-slate-600">
          <p className="font-semibold text-slate-800">Este sistema no envía correos.</p>
          <p>
            Pídele al dueño del negocio un enlace para crear una nueva contraseña: puede generarlo desde la
            pantalla de Empleados.
          </p>
          <p>
            Si eres el dueño, ejecuta este comando en el servidor y abre el enlace que muestra:
          </p>
          <pre className="bg-slate-100 rounded-lg px-3 py-2 text-xs overflow-x-auto">npm run reset-password -- {email || 'tu@correo.com'}</pre>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">
              Correo electrónico
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="tu@correo.com"
            />
          </div>

          {error && <p role="alert" className="text-rose-600 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full text-white font-medium py-2 px-4 rounded-lg text-sm transition-all disabled:opacity-50 hover:brightness-95"
            style={{ background: BRAND_GRADIENT }}
          >
            {loading ? 'Enviando...' : 'Continuar'}
          </button>
        </form>
      )}

      <p className="text-center text-sm text-slate-500 mt-6">
        <Link to="/login" className="text-blue-600 hover:underline font-medium">
          Volver al inicio de sesión
        </Link>
      </p>
    </AuthLayout>
  )
}
