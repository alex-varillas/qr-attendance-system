import { useState, useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../../hooks/useAuth.jsx'
import { BRAND_GRADIENT } from '../../utils/theme'
import { ROLE_LABELS } from '../../utils/labels'

// Navigation grouped by section. Each item has its own visibility rule (show) and icon.
const NAV_SECTIONS = [
  {
    label: 'General',
    items: [
      {
        to: '/dashboard',
        label: 'Dashboard',
        show: () => true,
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
        ),
      },
    ],
  },
  {
    label: 'Equipo',
    items: [
      {
        to: '/employees',
        label: 'Empleados',
        show: () => true,
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        ),
      },
      {
        to: '/leave',
        label: 'Vacaciones',
        show: () => true,
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        ),
      },
      {
        to: '/stats',
        label: 'Estadísticas',
        show: () => true,
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        ),
      },
    ],
  },
  {
    label: 'Asistencia',
    items: [
      {
        to: '/qr',
        label: 'Código QR',
        show: ({ isOwner }) => isOwner,
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
          </svg>
        ),
      },
      {
        to: '/locations',
        label: 'Sedes',
        show: ({ isOwner }) => isOwner,
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-2 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        ),
      },
      {
        to: '/reports',
        label: 'Reportes',
        show: () => true,
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        ),
      },
    ],
  },
  {
    label: 'Cuenta',
    items: [
      {
        to: '/settings',
        label: 'Configuración',
        show: ({ isOwner, hasPermission }) => isOwner || hasPermission('manage_settings') || hasPermission('manage_holidays'),
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        ),
      },
    ],
  },
]

// The Asistia logo, used in the sidebar and the mobile top bar.
function Isotipo({ className = 'w-8 h-8' }) {
  return (
    <img
      src="/asistia-isotipo.png"
      alt="Asistia"
      className={`${className} shrink-0`}
      style={{ boxShadow: '0 2px 8px rgba(46,125,233,0.25)' }}
    />
  )
}

export default function AppLayout({ children }) {
  const { user, business, userRole, isOwner, hasPermission } = useAuth()
  const [collapsed, setCollapsed]   = useState(() => localStorage.getItem('sidebar_collapsed') === '1')
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()

  // Persistir el colapso del sidebar (desktop)
  useEffect(() => {
    localStorage.setItem('sidebar_collapsed', collapsed ? '1' : '0')
  }, [collapsed])

  // Cerrar el drawer móvil al cambiar de ruta
  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  // Classes that depend on the collapsed state (desktop only, with md:)
  const labelHidden  = collapsed ? 'md:hidden' : ''
  const itemJustify  = collapsed ? 'md:justify-center' : ''

  // One navigation link
  const renderItem = (item) => {
    return (
      <NavLink
        key={item.to}
        to={item.to}
        title={item.label}
        className={({ isActive }) =>
          `relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${itemJustify} ${
            isActive
              ? 'text-blue-700'
              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
          }`
        }
      >
        {({ isActive }) => (
          <>
            <AnimatePresence initial={false}>
              {isActive && (
                <motion.span
                  key="active-bg"
                  initial={{ opacity: 0, scale: 0.82 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.82 }}
                  transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
                  className="absolute inset-0 bg-blue-50 rounded-lg"
                  style={{ zIndex: 0 }}
                />
              )}
            </AnimatePresence>
            <span className={`relative flex items-center gap-3 ${itemJustify}`} style={{ zIndex: 1 }}>
              {item.icon}
              <span className={labelHidden}>{item.label}</span>
            </span>
          </>
        )}
      </NavLink>
    )
  }

  return (
    <div className="h-screen bg-slate-50 overflow-hidden">

      {/* Top bar, solo móvil */}
      <header className="md:hidden fixed top-0 inset-x-0 h-14 bg-white border-b border-slate-200 flex items-center gap-3 px-4 z-30">
        <button
          onClick={() => setMobileOpen(true)}
          aria-label="Abrir menú"
          className="w-9 h-9 -ml-1 flex items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <Isotipo className="w-8 h-8" />
        <span className="text-[17px] font-extrabold text-slate-900 tracking-tight" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Asistia</span>
      </header>

      {/* Backdrop del drawer móvil */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setMobileOpen(false)}
            className="md:hidden fixed inset-0 bg-black/40 z-40"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 bg-white border-r border-slate-200 flex flex-col
          transition-[width,transform] duration-200 ease-out w-56 ${collapsed ? 'md:w-16' : 'md:w-56'}
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}
      >
        {/* Marca + empresa */}
        <div className={`px-3 pt-4 pb-3 ${collapsed ? 'md:px-0' : ''}`}>
          <div className={`flex items-center gap-2.5 px-1 ${collapsed ? 'md:justify-center md:px-0' : ''}`}>
            <Isotipo className="w-7 h-7" />
            <span className={`text-[15px] font-extrabold text-slate-900 tracking-tight ${labelHidden}`} style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Asistia</span>
            {/* Cerrar drawer, solo móvil */}
            <button
              onClick={() => setMobileOpen(false)}
              aria-label="Cerrar menú"
              className="md:hidden ml-auto w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Chip de empresa */}
          {business && (
            <div className={`mt-3 flex items-center gap-2 px-2.5 py-2 rounded-xl bg-slate-50 border border-slate-100 ${labelHidden}`}>
              <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-2 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400 leading-none mb-0.5">Negocio</p>
                <p className="text-sm font-semibold text-slate-700 truncate leading-tight">{business.name}</p>
              </div>
            </div>
          )}
        </div>
        <div className="mx-3 border-b border-slate-200" />

        {/* Nav por secciones */}
        <nav className="flex-1 px-3 py-4 overflow-y-auto">
          {NAV_SECTIONS.map((section, si) => {
            const visible = section.items.filter(item => item.show({ isOwner, hasPermission }))
            if (!visible.length) return null
            return (
              <div key={section.label} className={si > 0 ? 'mt-6' : ''}>
                <p className={`px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400 ${collapsed ? 'md:hidden' : ''}`}>
                  {section.label}
                </p>
                <div className="space-y-1">
                  {visible.map(renderItem)}
                </div>
              </div>
            )
          })}
        </nav>

        {/* Botón colapsar, solo desktop */}
        <button
          onClick={() => setCollapsed(c => !c)}
          title={collapsed ? 'Expandir menú' : 'Colapsar menú'}
          aria-expanded={!collapsed}
          className={`hidden md:flex items-center gap-3 mx-3 mb-1 px-3 py-2 rounded-lg text-sm font-medium text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors ${itemJustify}`}
        >
          <svg className={`w-5 h-5 shrink-0 transition-transform ${collapsed ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
          </svg>
          <span className={labelHidden}>Colapsar</span>
        </button>

        {/* Footer, usuario */}
        <div className="px-3 py-3 border-t border-slate-100">
          <div className={`flex items-center gap-2.5 px-2 py-2 rounded-xl bg-slate-50 border border-slate-100 ${collapsed ? 'md:flex-col md:gap-2 md:px-1' : ''}`}>
            {/* Avatar */}
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold text-white"
                 style={{ background: BRAND_GRADIENT }}>
              {user?.email?.[0]?.toUpperCase() ?? 'U'}
            </div>

            {/* Info */}
            <div className={`flex-1 min-w-0 ${labelHidden}`}>
              <p className="text-xs font-medium text-slate-700 truncate leading-tight">{user?.email}</p>
              <span className="inline-flex items-center gap-1 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
                  {ROLE_LABELS[userRole] ?? userRole}
                </span>
              </span>
            </div>

            {/* Cerrar sesión, icono */}
            <SignOutButton />
          </div>
        </div>
      </aside>

      {/* Contenido principal */}
      <main className={`h-full overflow-y-auto transition-[padding] duration-200 pt-14 md:pt-0 ${collapsed ? 'md:pl-16' : 'md:pl-56'}`}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            className="min-h-full"
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  )
}

function SignOutButton() {
  const { signOut } = useAuth()
  return (
    <button
      onClick={signOut}
      title="Cerrar sesión"
      className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all"
    >
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
      </svg>
    </button>
  )
}
