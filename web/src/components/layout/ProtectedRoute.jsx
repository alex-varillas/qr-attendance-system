import { Navigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth.jsx'

function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-slate-500 text-sm">Cargando...</div>
    </div>
  )
}

function ConnectionError() {
  const { reload } = useAuth()
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="text-center max-w-sm">
        <p className="text-slate-800 font-semibold">No se pudo conectar con el servidor</p>
        <p className="text-slate-500 text-sm mt-1">Revisa que el servidor esté en marcha e inténtalo de nuevo.</p>
        <button
          type="button"
          onClick={reload}
          className="mt-4 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
        >
          Reintentar
        </button>
      </div>
    </div>
  )
}

/** Waits for the session to load. Sends a brand new installation to its setup. */
export function SetupGate({ children }) {
  const { status } = useAuth()
  if (status === 'loading') return <Spinner />
  if (status === 'error') return <ConnectionError />
  if (status === 'needs_setup') return <Navigate to="/setup" replace />
  return children
}

/** Pages for people who are not signed in (sign in, forgot password). Signed-in people go to the dashboard. */
export function PublicRoute({ children }) {
  const { status } = useAuth()
  if (status === 'signed_in') return <Navigate to="/dashboard" replace />
  return <SetupGate>{children}</SetupGate>
}

/** Requires a signed-in account (the owner or an administrator). */
export function ProtectedRoute({ children }) {
  const { status } = useAuth()
  if (status === 'loading') return <Spinner />
  if (status === 'error') return <ConnectionError />
  if (status === 'needs_setup') return <Navigate to="/setup" replace />
  if (status !== 'signed_in') return <Navigate to="/login" replace />
  return children
}

function Restricted({ message }) {
  return (
    <div className="p-6 flex items-center justify-center h-64">
      <div className="text-center">
        <p className="text-slate-700 font-medium text-sm">Acceso restringido</p>
        <p className="text-slate-400 text-xs mt-1">{message}</p>
      </div>
    </div>
  )
}

/** Requires the owner. Administrators see an access-denied message. */
export function OwnerRoute({ children }) {
  const { isOwner } = useAuth()
  if (!isOwner) return <Restricted message="Esta sección es solo para el dueño de la cuenta." />
  return children
}

/**
 * Requires the owner, or an administrator with one of the permissions.
 * Usage: <PermissionRoute permission="manage_settings"> or
 *        <PermissionRoute anyOf={['manage_settings', 'manage_holidays']}>
 */
export function PermissionRoute({ permission, anyOf, children }) {
  const { isOwner, hasPermission } = useAuth()
  const needed = anyOf ?? (permission ? [permission] : [])
  const allowed = isOwner || needed.some(p => hasPermission(p))
  if (!allowed) return <Restricted message="No tienes permisos para acceder a esta sección." />
  return children
}
