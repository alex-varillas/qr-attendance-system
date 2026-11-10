import { motion } from 'framer-motion'
import { BRAND_GRADIENT } from '../../utils/theme'
import { t } from '../../i18n'

const BENEFITS = [
  {
    get title() { return t('Check-in por QR, sin apps') },
    get desc() { return t('Tus empleados escanean y listo. Nada que instalar.') },
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
      </svg>
    ),
  },
  {
    get title() { return t('Reportes en Excel y PDF') },
    get desc() { return t('Exporta la asistencia de cualquier periodo en un clic.') },
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    get title() { return t('Todo en tiempo real') },
    get desc() { return t('Mira quién llegó, quién tardó y quién falta, al instante.') },
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
  },
  {
    get title() { return t('Tus datos, en tu servidor') },
    get desc() { return t('Código abierto y autoalojado. La información es tuya.') },
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
      </svg>
    ),
  },
]

// Shared wrapper (brand gradient and logo watermark), reused by the first-run setup to build a
// different panel for each step.
export function GradientPanel({ children }) {
  return (
    <div
      className="relative w-full h-full flex flex-col justify-center px-14 py-16 overflow-hidden text-white"
      style={{ background: BRAND_GRADIENT }}
    >
      <img
        src="/asistia-isotipo.png"
        alt=""
        className="absolute -bottom-16 -right-16 w-96 rotate-6 opacity-10 pointer-events-none select-none"
      />
      <div className="relative max-w-md">{children}</div>
    </div>
  )
}

function BrandPanel() {
  return (
    <GradientPanel>
      <h2
        className="text-3xl font-extrabold tracking-tight leading-tight mb-3"
        style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
      >
        {t('Control de asistencia,')}<br />{t('sin complicaciones.')}
      </h2>
      <p className="text-blue-100 text-sm mb-10 leading-relaxed">
        {t('La forma más simple de registrar la asistencia de tu equipo, sin hojas de cálculo.')}
      </p>

      <div className="space-y-6">
        {BENEFITS.map(b => (
          <div key={b.title} className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-white/15 flex items-center justify-center shrink-0 text-white">
              {b.icon}
            </div>
            <div>
              <p className="text-sm font-semibold">{b.title}</p>
              <p className="text-blue-100 text-xs mt-0.5">{b.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </GradientPanel>
  )
}

// Split-screen shell for the sign-in, setup and password pages: a fixed visual panel on the right
// (hidden below `lg`) and the form on the left. `panel` replaces the default panel.
export default function AuthLayout({ children, panel }) {
  return (
    <div className="min-h-screen flex bg-white">
      <div className="w-full lg:w-1/2 flex items-center justify-center px-4 sm:px-6 lg:px-16 py-12">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
          className="w-full max-w-sm"
        >
          {/* Compact brand, mobile only (on desktop the brand lives in the panel) */}
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <img
              src="/asistia-isotipo.png"
              alt={t('Asistia')}
              className="w-9 h-9"
              style={{ boxShadow: '0 2px 8px rgba(46,125,233,0.25)' }}
            />
            <span
              className="text-lg font-extrabold text-slate-900 tracking-tight"
              style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
            >
              {t('Asistia')}
            </span>
          </div>

          {children}
        </motion.div>
      </div>

      <div className="hidden lg:block lg:w-1/2">
        {panel ?? <BrandPanel />}
      </div>
    </div>
  )
}
