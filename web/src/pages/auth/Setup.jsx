import { useMemo, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { useAuth } from '../../hooks/useAuth.jsx'
import PasswordInput from '../../components/ui/PasswordInput'
import PasswordStrengthMeter from '../../components/ui/PasswordStrengthMeter'
import AuthLayout from '../../components/layout/AuthLayout'
import { BRAND_GRADIENT } from '../../utils/theme'
import { isPasswordStrongEnough } from '../../utils/passwordStrength'
import { listTimeZones, setAppLocale } from '../../utils/dates'
import { t, useLocale } from '../../i18n'

const INPUT = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'
const PRIMARY = 'w-full text-white font-medium py-2 px-4 rounded-lg text-sm transition-all disabled:opacity-50 hover:brightness-95'

// First run of a new installation: the first person creates the owner account and the business,
// then picks the usual working hours. After this there is no public registration.
export default function Setup() {
  const { status, completeSetup } = useAuth()
  useLocale() // the language can be chosen on this very screen
  const navigate = useNavigate()
  const [step, setStep] = useState('account') // 'account' | 'schedule'

  const zones = useMemo(listTimeZones, [])
  const [form, setForm] = useState({
    business_name: '',
    tax_id: '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    locale: navigator.language?.startsWith('es') ? 'es' : 'en',
    name: '',
    last_name: '',
    email: '',
    password: '',
    confirm: '',
  })
  const [schedule, setSchedule] = useState({ start_time: '09:00', end_time: '18:00', break_start: '', break_end: '' })
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  // A signed-in person has nothing to set up (except while finishing this wizard).
  if (status === 'signed_in' && step === 'account') return <Navigate to="/dashboard" replace />
  if (status === 'signed_out') return <Navigate to="/login" replace />

  const set = (field) => (e) => setForm(current => ({ ...current, [field]: e.target.value }))

  async function handleAccount(e) {
    e.preventDefault()
    setError(null)
    if (form.password !== form.confirm) { setError(t('Las contraseñas no coinciden.')); return }
    if (!isPasswordStrongEnough(form.password)) {
      setError(t('Tu contraseña es muy débil. Combina mayúsculas, minúsculas y números, con al menos 8 caracteres.'))
      return
    }
    setLoading(true)
    try {
      await completeSetup({
        business_name: form.business_name,
        tax_id: form.tax_id || null,
        timezone: form.timezone,
        locale: form.locale,
        name: form.name,
        last_name: form.last_name,
        email: form.email,
        password: form.password,
      })
      setStep('schedule')
    } catch (err) {
      setError(
        err.code === 'already_setup'
          ? t('Este sistema ya está configurado. Inicia sesión.')
          : err.code === 'validation'
            ? t('Revisa los datos ingresados.')
            : t('No se pudo completar la configuración. Inténtalo de nuevo.'),
      )
    } finally {
      setLoading(false)
    }
  }

  async function handleSchedule(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await api.post('/schedules/default', {
        start_time: schedule.start_time,
        end_time: schedule.end_time,
        break_start: schedule.break_start || null,
        break_end: schedule.break_end || null,
      })
      navigate('/dashboard')
    } catch {
      setLoading(false)
      setError(t('No se pudo guardar el horario. Puedes configurarlo después en Configuración.'))
    }
  }

  return (
    <AuthLayout>
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 mb-1">
          {step === 'account' ? t('Paso 1 de 2') : t('Paso 2 de 2')}
        </p>
        <h1
          className="text-2xl font-bold text-slate-900"
          style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
        >
          {step === 'account' ? t('Configura tu negocio') : t('Tu horario de trabajo')}
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          {step === 'account'
            ? t('Crea la cuenta del dueño. Será quien administre todo.')
            : t('Define el horario habitual de lunes a viernes. Podrás cambiarlo después.')}
        </p>
      </div>

      {step === 'account' ? (
        <form onSubmit={handleAccount} className="space-y-4">
          <div>
            <label htmlFor="business_name" className="block text-sm font-medium text-slate-700 mb-1">{t('Nombre del negocio')}</label>
            <input id="business_name" required maxLength={150} value={form.business_name} onChange={set('business_name')} className={INPUT} placeholder={t('Mi negocio')} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="timezone" className="block text-sm font-medium text-slate-700 mb-1">{t('Zona horaria')}</label>
              <select id="timezone" value={form.timezone} onChange={set('timezone')} className={INPUT}>
                {zones.map(zone => <option key={zone} value={zone}>{zone}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="locale" className="block text-sm font-medium text-slate-700 mb-1">{t('Idioma')}</label>
              <select id="locale" value={form.locale} onChange={e => { set('locale')(e); setAppLocale(e.target.value) }} className={INPUT}>
                <option value="es">{t('Español')}</option>
                <option value="en">{t('English')}</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="tax_id" className="block text-sm font-medium text-slate-700 mb-1">
              {t('Identificación fiscal')}{' '}<span className="text-slate-400 font-normal">{t('(opcional)')}</span>
            </label>
            <input id="tax_id" maxLength={50} value={form.tax_id} onChange={set('tax_id')} className={INPUT} placeholder={t('RUC, NIT, RFC, EIN...')} />
          </div>

          <hr className="border-slate-200" />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-slate-700 mb-1">{t('Nombre')}</label>
              <input id="name" required maxLength={100} autoComplete="given-name" value={form.name} onChange={set('name')} className={INPUT} />
            </div>
            <div>
              <label htmlFor="last_name" className="block text-sm font-medium text-slate-700 mb-1">{t('Apellido')}</label>
              <input id="last_name" required maxLength={100} autoComplete="family-name" value={form.last_name} onChange={set('last_name')} className={INPUT} />
            </div>
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">{t('Correo electrónico')}</label>
            <input id="email" type="email" required autoComplete="username" value={form.email} onChange={set('email')} className={INPUT} placeholder={t('tu@correo.com')} />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">{t('Contraseña')}</label>
            <PasswordInput id="password" required autoComplete="new-password" value={form.password} onChange={set('password')} placeholder={t('Mínimo 8 caracteres')} />
            <PasswordStrengthMeter password={form.password} />
          </div>

          <div>
            <label htmlFor="confirm" className="block text-sm font-medium text-slate-700 mb-1">{t('Confirmar contraseña')}</label>
            <PasswordInput id="confirm" required autoComplete="new-password" value={form.confirm} onChange={set('confirm')} placeholder={t('Repite la contraseña')} />
          </div>

          {error && <p role="alert" className="text-rose-600 text-sm">{error}</p>}

          <button type="submit" disabled={loading} className={PRIMARY} style={{ background: BRAND_GRADIENT }}>
            {loading ? t('Creando...') : t('Continuar')}
          </button>
        </form>
      ) : (
        <form onSubmit={handleSchedule} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="start_time" className="block text-sm font-medium text-slate-700 mb-1">{t('Entrada')}</label>
              <input id="start_time" type="time" required value={schedule.start_time} onChange={e => setSchedule(s => ({ ...s, start_time: e.target.value }))} className={INPUT} />
            </div>
            <div>
              <label htmlFor="end_time" className="block text-sm font-medium text-slate-700 mb-1">{t('Salida')}</label>
              <input id="end_time" type="time" required value={schedule.end_time} onChange={e => setSchedule(s => ({ ...s, end_time: e.target.value }))} className={INPUT} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="break_start" className="block text-sm font-medium text-slate-700 mb-1">
                {t('Inicio de refrigerio')}{' '}<span className="text-slate-400 font-normal">{t('(opcional)')}</span>
              </label>
              <input id="break_start" type="time" value={schedule.break_start} onChange={e => setSchedule(s => ({ ...s, break_start: e.target.value }))} className={INPUT} />
            </div>
            <div>
              <label htmlFor="break_end" className="block text-sm font-medium text-slate-700 mb-1">
                {t('Fin de refrigerio')}{' '}<span className="text-slate-400 font-normal">{t('(opcional)')}</span>
              </label>
              <input id="break_end" type="time" value={schedule.break_end} onChange={e => setSchedule(s => ({ ...s, break_end: e.target.value }))} className={INPUT} />
            </div>
          </div>

          {error && <p role="alert" className="text-rose-600 text-sm">{error}</p>}

          <button type="submit" disabled={loading} className={PRIMARY} style={{ background: BRAND_GRADIENT }}>
            {loading ? t('Guardando...') : t('Guardar y entrar')}
          </button>
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="w-full text-sm text-slate-500 hover:text-slate-700 py-1"
          >
            {t('Configurarlo después')}
          </button>
        </form>
      )}
    </AuthLayout>
  )
}
