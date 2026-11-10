import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../../lib/api'
import { useAuth } from '../../hooks/useAuth.jsx'
import PasswordInput from '../../components/ui/PasswordInput'
import PasswordStrengthMeter from '../../components/ui/PasswordStrengthMeter'
import AuthLayout from '../../components/layout/AuthLayout'
import { BRAND_GRADIENT } from '../../utils/theme'
import { isPasswordStrongEnough } from '../../utils/passwordStrength'
import { t } from '../../i18n'

// An administrator opens the invitation link the owner sent and chooses a password.
export default function AcceptInvite() {
  const navigate = useNavigate()
  const { acceptInvite } = useAuth()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')

  const [invite, setInvite] = useState(null)
  const [invalid, setInvalid] = useState(!token)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!token) return
    let cancelled = false
    api.get(`/auth/invitations/${encodeURIComponent(token)}`)
      .then(data => { if (!cancelled) setInvite(data) })
      .catch(() => { if (!cancelled) setInvalid(true) })
    return () => { cancelled = true }
  }, [token])

  async function handleSubmit(e) {
    e.preventDefault()
    if (password !== confirm) { setError(t('Las contraseñas no coinciden.')); return }
    if (!isPasswordStrongEnough(password)) {
      setError(t('Tu contraseña es muy débil. Combina mayúsculas, minúsculas y números, con al menos 8 caracteres.'))
      return
    }
    setError(null)
    setLoading(true)
    try {
      await acceptInvite({ token, password })
      navigate('/dashboard')
    } catch (err) {
      setLoading(false)
      setError(err.status === 404 ? t('La invitación no es válida o ya venció.') : t('No se pudo crear la cuenta. Inténtalo de nuevo.'))
    }
  }

  return (
    <AuthLayout>
      <div className="mb-8">
        <h1
          className="text-2xl font-bold text-slate-900"
          style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
        >
          {t('Crea tu contraseña')}
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          {invite?.business_name ? t('Te invitaron a administrar {0}', [invite.business_name]) : t('Último paso para entrar')}
        </p>
      </div>

      {invalid ? (
        <div className="space-y-3 text-sm text-slate-600">
          <p className="font-semibold text-slate-800">{t('Esta invitación no es válida o ya venció.')}</p>
          <p>{t('Pídele al dueño del negocio que te envíe una nueva desde la pantalla de Empleados.')}</p>
          <Link to="/login" className="text-blue-600 hover:underline font-medium">{t('Ir a iniciar sesión')}</Link>
        </div>
      ) : !invite ? (
        <div className="py-4">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-sm text-slate-500">{t('Verificando invitación...')}</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-sm">
            <p className="text-slate-800 font-medium">{[invite.name, invite.last_name].filter(Boolean).join(' ')}</p>
            <p className="text-slate-500 text-xs">{invite.email}</p>
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">
              {t('Contraseña')}
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
            {loading ? t('Guardando...') : t('Guardar contraseña y entrar')}
          </button>
        </form>
      )}
    </AuthLayout>
  )
}
