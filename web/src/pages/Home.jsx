import { useAuth } from '../hooks/useAuth.jsx'

// Temporary landing screen while the dashboard is being ported.
export default function Home() {
  const { business, employee, signOut } = useAuth()
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="bg-white border border-slate-200 rounded-xl p-8 max-w-md w-full text-center shadow-sm">
        <img src="/asistia-isotipo.png" alt="Asistia" className="w-12 h-12 mx-auto mb-4" />
        <h1 className="text-lg font-semibold text-slate-900">{business?.name}</h1>
        <p className="text-sm text-slate-500 mt-1">
          {employee?.name} {employee?.last_name} ({employee?.role})
        </p>
        <button
          type="button"
          onClick={signOut}
          className="mt-6 px-4 py-2 rounded-lg border border-slate-300 text-sm text-slate-700 hover:bg-slate-50"
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  )
}
