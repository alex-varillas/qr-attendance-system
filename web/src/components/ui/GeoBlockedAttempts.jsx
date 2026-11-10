import { useGeoBlockedAttempts } from '../../hooks/useGeoBlockedAttempts'
import { t } from '../../i18n'

// Igual granularidad que fmtRelative en Reportes.jsx (minutos/horas recientes,
// fecha completa después de 24h) - no se unifica a propósito, ver
// docs/referencia/DEUDA-TECNICA.md.
function timeAgo(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000)
  if (diff < 60)    return t('hace un momento')
  if (diff < 3600)  return t('hace {0} min', [Math.floor(diff / 60)])
  if (diff < 86400) return t('hace {0} h', [Math.floor(diff / 3600)])
  return new Date(dateStr).toLocaleDateString('es-PE', { day: '2-digit', month: 'short' })
}

// Lista de intentos de check-in rechazados por estar fuera del radio
// permitido, del mes en curso. Vive junto a la config de geolocalización en
// Settings porque es el feedback directo de esa configuración (¿el radio
// está bien calibrado?), no un feed en vivo - ver conversación de diseño.
export default function GeoBlockedAttempts() {
  const { data: attempts = [], isLoading } = useGeoBlockedAttempts()

  if (isLoading) return null

  return (
    <div className="mt-4 pt-4 border-t border-slate-100">
      <p className="text-sm font-medium text-slate-700 mb-2">{t('Intentos bloqueados este mes')}</p>

      {attempts.length === 0 ? (
        <p className="text-xs text-slate-400">{t('Ningún intento fuera de rango este mes.')}</p>
      ) : (
        <div className="space-y-1.5 max-h-56 overflow-y-auto">
          {attempts.map(a => (
            <div
              key={a.id}
              className="flex items-center justify-between gap-3 text-xs bg-rose-50/60 border border-rose-100 rounded-lg px-3 py-2"
            >
              <div className="min-w-0">
                <p className="font-medium text-slate-700 truncate">{a.employee_name} {a.employee_last_name}</p>
                <p className="text-slate-400">
                  {Math.round(a.distance_meters)}{t('m del punto permitido')}{a.location_name ? ` · ${a.location_name}` : ''}
                </p>
              </div>
              <span className="text-slate-400 shrink-0">{timeAgo(a.created_at)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
