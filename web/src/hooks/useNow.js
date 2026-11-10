import { useState, useEffect } from 'react'

// "Ahora" (Date.now()) que se refresca cada `intervalMs`, solo mientras
// `enabled` es true - evita timers de fondo cuando la vista no los necesita
// (ej. un día pasado en el Dashboard no necesita re-render por minuto).
// Antes duplicado en Dashboard.jsx y DashboardHero.jsx.
export function useNow(intervalMs = 60000, enabled = true) {
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    if (!enabled) return
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [enabled, intervalMs])

  return now
}
