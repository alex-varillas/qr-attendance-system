import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth.jsx'
import { BRAND_GRADIENT } from '../../utils/theme'
import PasswordInput from '../../components/ui/PasswordInput'
import AuthLayout from '../../components/layout/AuthLayout'

export default function Login() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await signIn({ email, password })
      navigate('/dashboard')
    } catch (err) {
      setLoading(false)
      setError(err.status === 401 ? 'Correo o contraseña incorrectos.' : 'No se pudo iniciar sesión. Inténtalo de nuevo.')
    }
  }

  return (
    <AuthLayout>
      <div className="mb-8">
        <h1
          className="text-2xl font-bold text-slate-900"
          style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
        >
          Bienvenido de nuevo
        </h1>
        <p className="text-slate-500 text-sm mt-1">Ingresa a tu cuenta</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">
            Correo electrónico
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="tu@correo.com"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label htmlFor="password" className="block text-sm font-medium text-slate-700">
              Contraseña
            </label>
            <Link to="/forgot-password" className="text-xs text-blue-600 hover:underline">
              ¿Olvidaste tu contraseña?
            </Link>
          </div>
          <PasswordInput
            id="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </div>

        {error && (
          <p role="alert" className="text-rose-600 text-sm">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full text-white font-medium py-2 px-4 rounded-lg text-sm transition-all disabled:opacity-50 hover:brightness-95"
          style={{ background: BRAND_GRADIENT }}
        >
          {loading ? 'Ingresando...' : 'Ingresar'}
        </button>
      </form>

      <p className="text-center text-xs text-slate-400 mt-6">
        Las cuentas las crea el dueño del negocio. Si necesitas acceso, pídele una invitación.
      </p>
    </AuthLayout>
  )
}
