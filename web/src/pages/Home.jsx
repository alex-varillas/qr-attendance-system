import { useAuth } from '../hooks/useAuth.jsx'

// Temporary dashboard while it is being ported.
export default function Home() {
  const { business, employee } = useAuth()
  return (
    <div className="p-4 sm:p-6">
      <h1 className="text-lg font-semibold text-slate-900">{business?.name}</h1>
      <p className="text-sm text-slate-500 mt-1">
        {employee?.name} {employee?.last_name}
      </p>
    </div>
  )
}
