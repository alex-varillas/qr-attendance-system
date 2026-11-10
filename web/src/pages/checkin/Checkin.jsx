import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { api } from '../../lib/api'
import { avatarGradient } from '../../utils/avatar'
import { BRAND_GRADIENT } from '../../utils/theme'
import { requestLocation } from '../../utils/geolocation'
import { t } from '../../i18n'
import { serverMessage } from '../../i18n/serverMessages'

const stepVariants = {
  hidden:  { opacity: 0, y: 12, scale: 0.98 },
  visible: { opacity: 1, y: 0,  scale: 1,   transition: { duration: 0.25, ease: [0.4, 0, 0.2, 1] } },
  exit:    { opacity: 0, y: -8, scale: 0.98, transition: { duration: 0.18, ease: [0.4, 0, 1,   1] } },
}

const TYPE_CONFIG = {
  checkin:     { get label() { return t('Entrada registrada') },   color: 'text-green-600',  bg: 'bg-green-50',  icon: '✓', accent: '#16a34a' },
  break_start: { get label() { return t('Inicio de refrigerio') }, color: 'text-amber-600',  bg: 'bg-amber-50',  icon: '☕', accent: '#d97706' },
  break_end:   { get label() { return t('Fin de refrigerio') },    color: 'text-blue-600',   bg: 'bg-blue-50',   icon: '↩', accent: '#2563eb' },
  checkout:    { get label() { return t('Salida registrada') },    color: 'text-slate-600',  bg: 'bg-slate-50',  icon: '👋', accent: '#475569' },
}

// Tras marcar, cuánto se muestra la pantalla de éxito antes de volver a la
// lista (para el siguiente empleado que use el mismo dispositivo/kiosko).
const SUCCESS_RESET_MS = 6000

// What the person sees for each reason the server can refuse a mark.
const ERROR_MESSAGES = {
  get employee_not_found() { return t('No encontramos a este empleado.') },
  get wrong_location() { return t('Este empleado no puede marcar en esta sede.') },
  get pin_required() { return t('Ingresa tu PIN.') },
  get pin_invalid() { return t('PIN incorrecto.') },
  get pin_locked() { return t('Demasiados intentos. Intenta de nuevo en 5 minutos.') },
  get geo_required() { return t('Debes activar y permitir tu ubicación para registrar asistencia.') },
  get geo_invalid() { return t('No pudimos leer tu ubicación correctamente. Actívala e intenta nuevamente.') },
  get geo_misconfigured() { return t('La ubicación del local no está configurada. Avisa al administrador.') },
  get geo_out_of_range() { return t('Estás fuera del área permitida para marcar asistencia. Acércate a la ubicación configurada e intenta nuevamente.') },
  get location_not_found() { return t('Este código QR ya no es válido.') },
  get not_configured() { return t('El sistema todavía no está configurado.') },
}

const STEP_LIST      = 'list'
const STEP_PIN       = 'pin'
const STEP_SUCCESS   = 'success'
const STEP_COMPLETED = 'completed'
const STEP_ERROR     = 'error'


/* ── Logo reutilizable ─────────────────────────────── */
function AsistiaLogo({ size = 32 }) {
  return (
    <div
      className="flex items-center justify-center shrink-0 rounded-[28%]"
      style={{
        width: size, height: size,
        background: BRAND_GRADIENT,
        boxShadow: '0 4px 14px rgba(46,125,233,0.45)',
      }}
    >
      <svg viewBox="0 0 64 64" fill="none" style={{ width: size * 0.6, height: size * 0.6 }}>
        <rect x="10" y="10" width="18" height="18" rx="3" fill="white"/>
        <rect x="14" y="14" width="10" height="10" rx="1.5" fill="#2E7DE9"/>
        <rect x="17" y="17" width="4"  height="4"  rx="1"   fill="white"/>
        <rect x="36" y="10" width="18" height="18" rx="3" fill="white"/>
        <rect x="40" y="14" width="10" height="10" rx="1.5" fill="#2E7DE9"/>
        <rect x="43" y="17" width="4"  height="4"  rx="1"   fill="white"/>
        <rect x="10" y="36" width="18" height="18" rx="3" fill="white"/>
        <rect x="14" y="40" width="10" height="10" rx="1.5" fill="#2E7DE9"/>
        <rect x="17" y="43" width="4"  height="4"  rx="1"   fill="white"/>
        <rect x="36" y="36" width="5" height="5" rx="1" fill="white"/>
        <rect x="43" y="36" width="5" height="5" rx="1" fill="white"/>
        <rect x="50" y="36" width="5" height="5" rx="1" fill="white"/>
        <rect x="36" y="43" width="5" height="5" rx="1" fill="white"/>
        <rect x="43" y="43" width="8" height="5" rx="1" fill="white"/>
        <rect x="36" y="50" width="8" height="5" rx="1" fill="white"/>
        <rect x="50" y="43" width="5" height="12" rx="1" fill="white"/>
        <rect x="44" y="50" width="5" height="5" rx="1" fill="white"/>
      </svg>
    </div>
  )
}

/* ── Contenedor de página ──────────────────────────── */
function PageWrap({ children }) {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-start px-4 pt-10 pb-8">
      {children}
    </div>
  )
}

/* ── Header con logo ───────────────────────────────── */
function Header({ businessName }) {
  return (
    <div className="flex flex-col items-center text-center mb-6 gap-2">
      <AsistiaLogo size={48} />
      <p className="text-sm font-semibold text-blue-600 tracking-wide">
        {t('Check-in Asistia')}
      </p>
      <p className="text-base font-semibold text-slate-700">
        {businessName ?? '...'}
      </p>
    </div>
  )
}

/* ── Card contenedor ───────────────────────────────── */
function Card({ children, className = '' }) {
  return (
    <div
      className={`w-full bg-white rounded-2xl overflow-hidden border border-slate-200 ${className}`}
      style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.07)' }}
    >
      {children}
    </div>
  )
}

/* ══════════════════════════════════════════════════════
   COMPONENTE PRINCIPAL
══════════════════════════════════════════════════════ */
export default function Checkin() {
  const { checkinId } = useParams()

  const [context, setContext]               = useState(null)  // { type, business_name, location_id, location_name, geo_enabled, geo_radius_meters }
  const [employees, setEmployees]           = useState([])
  const [loadingEmployees, setLoadingEmployees] = useState(true)
  const [search, setSearch]                 = useState('')
  const [step, setStep]                     = useState(STEP_LIST)
  const [selected, setSelected]             = useState(null)
  const [pin, setPin]                       = useState('')
  const [submitting, setSubmitting]         = useState(false)
  const [result, setResult]                 = useState(null)
  const [errorMsg, setErrorMsg]             = useState('')

  useEffect(() => {
    if (!checkinId) return
    let cancelled = false
    ;(async () => {
      try {
        const ctx = await api.get(`/public/checkin/${checkinId}`)
        const list = await api.get(`/public/checkin/${checkinId}/employees`)
        if (cancelled) return
        setContext(ctx)
        setEmployees(list ?? [])
      } catch {
        // Not a valid code: the page shows its empty state.
      } finally {
        if (!cancelled) setLoadingEmployees(false)
      }
    })()
    return () => { cancelled = true }
  }, [checkinId])

  useEffect(() => {
    if (step !== STEP_SUCCESS) return
    const timer = setTimeout(resetFlow, SUCCESS_RESET_MS)
    return () => clearTimeout(timer)
  }, [step])

  function resetFlow() {
    setStep(STEP_LIST); setSelected(null); setPin('')
    setResult(null); setErrorMsg('')
    // No limpiamos search para no perder el filtro al volver de PIN
  }

  function handleSelectEmployee(emp) {
    // Si ya estaba seleccionado, deseleccionar
    if (selected?.id === emp.id) { setSelected(null); return }
    setSelected(emp)
  }

  function handleConfirm() {
    if (!selected) return
    if (selected.pin_enabled) setStep(STEP_PIN)
    else submitCheckin(selected, null)
  }

  async function submitCheckin(emp, pinValue) {
    setSubmitting(true); setErrorMsg('')
    let lat = null, lng = null, accuracy = null
    const geoRequired = context?.geo_enabled === true
    try {
      const loc = await requestLocation(geoRequired)
      lat = loc.lat; lng = loc.lng; accuracy = loc.accuracy
    } catch (geoErr) {
      setSubmitting(false); setErrorMsg(geoErr.message); setStep(STEP_ERROR); return
    }
    let data
    try {
      data = await api.post('/public/checkin', {
        employee_id: emp.id,
        pin: pinValue || null,
        lat,
        lng,
        accuracy,
        location_id: context.location_id ?? null,
        device_info: navigator.userAgent,
      })
    } catch (err) {
      setSubmitting(false)
      // A refusal from the server carries its reason; anything else is a connection problem.
      if (!err.body?.code) { setErrorMsg(t('Error de conexión. Intenta nuevamente.')); setStep(STEP_ERROR); return }
      data = { ok: false, ...err.body }
    }
    setSubmitting(false)
    if (!data.ok) {
      if (data.code === 'day_complete') {
        setSelected(emp); setStep(STEP_COMPLETED)
      } else {
        // El servidor exigió ubicación aunque esta página creía que no hacía falta
        // (el owner la activó con la página ya abierta): desde el reintento se pide.
        if (data.code === 'geo_required' || data.code === 'geo_invalid') {
          setContext(c => (c ? { ...c, geo_enabled: true } : c))
        }
        setErrorMsg(ERROR_MESSAGES[data.code] ?? serverMessage(data.error) ?? t('No se pudo registrar la asistencia.')); setStep(STEP_ERROR)
      }
      return
    }
    setResult(data); setStep(STEP_SUCCESS)
  }

  async function handlePinSubmit(e) {
    e.preventDefault()
    if (pin.length !== 4) return
    await submitCheckin(selected, pin)
  }

  const filtered = employees.filter(emp =>
    `${emp.name} ${emp.last_name}`.toLowerCase().includes(search.toLowerCase())
  )

  // Nombre a mostrar en el header
  const displayName = context?.location_name
    ? `${context.location_name} · ${context.business_name}`
    : context?.business_name ?? null

  /* ── Loading ─────────────────────────────────────── */
  if (loadingEmployees) {
    return (
      <PageWrap>
        <Header businessName={null} />
        <div className="w-full max-w-sm">
          <Card className="p-10 flex flex-col items-center gap-3">
            <div className="w-8 h-8 rounded-full border-2 border-blue-200 border-t-blue-600 animate-spin" />
            <p className="text-sm text-slate-400">{t('Cargando...')}</p>
          </Card>
        </div>
      </PageWrap>
    )
  }

  /* ── Sin empleados / no encontrado ──────────────── */
  if (!context || employees.length === 0) {
    return (
      <PageWrap>
        <Header businessName={displayName} />
        <div className="w-full max-w-sm">
          <Card className="p-10 text-center">
            <p className="text-slate-800 font-semibold mb-1">{t('Sin empleados registrados')}</p>
            <p className="text-slate-400 text-sm">{t('Pide al administrador que agregue empleados.')}</p>
          </Card>
        </div>
      </PageWrap>
    )
  }

  return (
    <PageWrap>
      <div className="w-full max-w-sm">
        <Header businessName={displayName} />

        <AnimatePresence mode="wait">

        {/* ── Lista de empleados ─────────────────── */}
        {step === STEP_LIST && (
          <motion.div key="list" variants={stepVariants} initial="hidden" animate="visible" exit="exit">
          <Card>
            {/* Buscador */}
            <div className="px-4 pt-4 pb-3 border-b border-slate-100">
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
                  fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                </svg>
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder={t('Buscar por nombre...')}
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all"
                  autoFocus
                />
              </div>
            </div>

            {/* Label */}
            <div className="px-4 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                {t('Selecciona tu nombre')}
              </p>
            </div>

            {/* Lista */}
            <div className="overflow-y-auto" style={{ maxHeight: '52vh' }}>
              {filtered.length === 0 ? (
                <p className="text-center text-sm text-slate-400 py-10">{t('Sin resultados')}</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {filtered.map(emp => {
                    const isSelected = selected?.id === emp.id
                    return (
                      <button
                        key={emp.id}
                        onClick={() => handleSelectEmployee(emp)}
                        className={`w-full flex items-center justify-between px-4 py-3.5 transition-colors text-left ${
                          isSelected
                            ? 'bg-blue-50'
                            : 'hover:bg-slate-50 active:bg-slate-100'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-sm font-bold text-white transition-transform"
                            style={{
                              background: avatarGradient(emp.id),
                              boxShadow: isSelected ? '0 0 0 3px rgba(46,125,233,0.25)' : 'none',
                              transform: isSelected ? 'scale(1.08)' : 'scale(1)',
                            }}
                          >
                            {emp.name[0]?.toUpperCase()}
                          </div>
                          <span className={`text-sm font-medium transition-colors ${isSelected ? 'text-blue-700' : 'text-slate-800'}`}>
                            {emp.name} {emp.last_name}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {emp.pin_enabled && (
                            <svg className="w-3.5 h-3.5 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                          )}
                          {isSelected ? (
                            <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: BRAND_GRADIENT }}>
                              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            </div>
                          ) : (
                            <svg className="w-4 h-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Botón confirmar + footer */}
            <div className="border-t border-slate-100">
              <div className="px-4 pt-3 pb-4">
                <button
                  onClick={handleConfirm}
                  disabled={!selected || submitting}
                  className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{
                    background: selected ? BRAND_GRADIENT : '#94a3b8',
                    boxShadow: selected ? '0 4px 16px rgba(46,125,233,0.35)' : 'none',
                  }}
                >
                  {submitting
                    ? t('Registrando...')
                    : selected
                      ? t('Registrar asistencia de {0} {1}', [selected.name, selected.last_name])
                      : t('Selecciona tu nombre')}
                </button>
                {selected && (
                  <button
                    onClick={() => setSelected(null)}
                    className="w-full mt-2 text-xs text-slate-400 hover:text-slate-600 transition-colors py-1"
                  >
                    {t('Cancelar selección')}
                  </button>
                )}
              </div>
              <div className="px-4 pb-3 text-center">
                <p className="text-[10px] text-slate-400">
                  {filtered.length}{' '}{t('de')}{' '}{employees.length}{' '}{t('empleados')}
                </p>
              </div>
            </div>
          </Card>
          </motion.div>
        )}

        {/* ── Ingreso de PIN ─────────────────────── */}
        {step === STEP_PIN && (
          <motion.div key="pin" variants={stepVariants} initial="hidden" animate="visible" exit="exit">
          <Card className="p-6">
            <button
              onClick={resetFlow}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 mb-6 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              {t('Volver')}
            </button>

            <div className="text-center mb-6">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3 text-xl font-bold text-white"
                style={{ background: avatarGradient(selected?.id), boxShadow: '0 4px 16px rgba(46,125,233,0.25)' }}
              >
                {selected?.name[0]?.toUpperCase()}
              </div>
              <p className="font-semibold text-slate-900">{selected?.name} {selected?.last_name}</p>
              <p className="text-sm text-slate-400 mt-0.5">{t('Ingresa tu PIN de 4 dígitos')}</p>
            </div>

            <form onSubmit={handlePinSubmit}>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={pin}
                onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
                className="w-full text-center text-3xl tracking-[0.6em] px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all"
                placeholder="••••"
                autoFocus
              />
              <button
                type="submit"
                disabled={pin.length !== 4 || submitting}
                className="w-full mt-4 text-white font-semibold py-3 rounded-xl text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: BRAND_GRADIENT, boxShadow: pin.length === 4 ? '0 4px 16px rgba(46,125,233,0.35)' : 'none' }}
              >
                {submitting ? t('Verificando...') : t('Marcar asistencia')}
              </button>
            </form>
          </Card>
          </motion.div>
        )}

        {/* ── Éxito ──────────────────────────────── */}
        {step === STEP_SUCCESS && result && (
          <motion.div key="success" variants={stepVariants} initial="hidden" animate="visible" exit="exit">
            <SuccessScreen result={result} onReset={resetFlow} />
          </motion.div>
        )}

        {/* ── Jornada completa ───────────────────── */}
        {step === STEP_COMPLETED && (
          <motion.div key="completed" variants={stepVariants} initial="hidden" animate="visible" exit="exit">
          <Card className="p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </div>
            <h2 className="text-base font-semibold text-slate-800 mb-2">{t('Jornada completa')}</h2>
            <p className="text-slate-500 text-sm">
              <span className="font-medium text-slate-700">{selected?.name} {selected?.last_name}</span>
              {' '}{t('ya registró todas sus marcaciones de hoy.')}
            </p>
            <button
              onClick={resetFlow}
              className="mt-6 w-full border border-slate-200 hover:bg-slate-50 text-slate-600 font-medium py-2.5 rounded-xl text-sm transition-colors"
            >
              {t('Volver a la lista')}
            </button>
          </Card>
          </motion.div>
        )}

        {/* ── Error ──────────────────────────────── */}
        {step === STEP_ERROR && (
          <motion.div key="error" variants={stepVariants} initial="hidden" animate="visible" exit="exit">
          <Card className="p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-rose-50 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="text-base font-semibold text-slate-800 mb-2">{t('No se pudo registrar')}</h2>
            <p className="text-rose-500 text-sm leading-relaxed">{errorMsg}</p>
            <button
              onClick={resetFlow}
              className="mt-6 w-full border border-slate-200 hover:bg-slate-50 text-slate-600 font-medium py-2.5 rounded-xl text-sm transition-colors"
            >
              {t('Intentar nuevamente')}
            </button>
          </Card>
          </motion.div>
        )}

        </AnimatePresence>

      </div>
    </PageWrap>
  )
}

/* ── Pantalla de éxito ─────────────────────────────── */
function SuccessScreen({ result, onReset }) {
  const config = TYPE_CONFIG[result.type] ?? TYPE_CONFIG.checkin
  const time = new Date(result.timestamp).toLocaleTimeString(undefined, {
    hour: '2-digit', minute: '2-digit',
  })

  return (
    <div
      className="w-full bg-white rounded-2xl overflow-hidden text-center"
      style={{ boxShadow: '0 24px 64px rgba(0,0,0,0.35)' }}
    >
      {/* Franja de color en top */}
      <div className="h-1.5 w-full" style={{ background: `linear-gradient(90deg, ${config.accent}, ${config.accent}88)` }} />

      <div className="p-8">
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', damping: 16, stiffness: 260, delay: 0.1 }}
          className={`w-16 h-16 rounded-full ${config.bg} flex items-center justify-center mx-auto mb-4`}
        >
          <svg className={`w-8 h-8 ${config.color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        </motion.div>

        <h2 className={`text-lg font-bold mb-1 ${config.color}`}>{config.label}</h2>
        <p className="text-slate-800 font-semibold">{result.employee.name} {result.employee.last_name}</p>
        <p className="text-2xl font-mono font-bold text-slate-900 mt-2">{time}</p>

        <p className="text-slate-400 text-xs mt-5">{t('Esta pantalla se reiniciará en unos segundos...')}</p>
        <button
          onClick={onReset}
          className="mt-2 text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
        >
          {t('Marcar otro empleado →')}
        </button>
      </div>
    </div>
  )
}
