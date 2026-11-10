import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../../lib/api'
import PasswordInput from '../../components/ui/PasswordInput'
import PasswordStrengthMeter from '../../components/ui/PasswordStrengthMeter'
import AuthLayout from '../../components/layout/AuthLayout'
import { BRAND_GRADIENT } from '../../utils/theme'
import { isPasswordStrongEnough } from '../../utils/passwordStrength'
import { t } from '../../i18n'

export default function ResetPassword() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (password !== confirm) {
      setError(t('Las contraseñas no coinciden.'))
      return
    }
    if (!isPasswordStrongEnough(password)) {
      setError(t('Tu contraseña es muy débil. Combina mayúsculas, minúsculas y números, con al menos 8 caracteres.'))
      return
    }
    setError(null)
    setLoading(true)
    try {
      await api.post('/auth/reset-password', { token, password })
      setDone(true)
      setTimeout(() => navigate('/login'), 2000)
    } catch (err) {
      setError(err.status === 404 ? t('El enlace no es válido o ya venció. Pide uno nuevo.') : t('No se pudo actualizar la contraseña.'))
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
          {t('Nueva contraseña')}
        </h1>
        <p className="text-slate-500 text-sm mt-1">{t('Elige una contraseña segura')}</p>
      </div>

      {!token ? (
        <p className="text-sm text-slate-600">
          {t('Este enlace está incompleto. Pide uno nuevo.')}{' '}
          <Link to="/forgot-password" className="text-blue-600 hover:underline">{t('Recuperar contraseña')}</Link>
        </p>
      ) : done ? (
        <div className="space-y-4">
          <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
            <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <p className="font-semibold text-slate-800 text-sm">{t('Contraseña actualizada')}</p>
            <p className="text-slate-500 text-sm mt-1">{t('Ya puedes iniciar sesión con tu nueva contraseña.')}</p>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">
              {t('Nueva contraseña')}
            </label>
            <PasswordInput
              id="password"
              required
              autoComplete="new-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={t('Mínimo 8 caracteres')}
            />
            <PasswordStrengthMeter password={password} />
          </div>

          <div>
            <label htmlFor="confirm" className="block text-sm font-medium text-slate-700 mb-1">
              {t('Confirmar contraseña')}
            </label>
            <PasswordInput
              id="confirm"
              required
              autoComplete="new-password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder={t('Repite la contraseña')}
            />
          </div>

          {error && <p role="alert" className="text-rose-600 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full text-white font-medium py-2 px-4 rounded-lg text-sm transition-all disabled:opacity-50 hover:brightness-95"
            style={{ background: BRAND_GRADIENT }}
          >
            {loading ? t('Guardando...') : t('Guardar contraseña')}
          </button>
        </form>
      )}
    </AuthLayout>
  )
}
