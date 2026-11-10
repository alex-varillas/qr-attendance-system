import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useAttendance } from '../../hooks/useAttendance'
import { useNow } from '../../hooks/useNow'
import { todayISO, extractTime } from '../../utils/dates'
import { calcularTardanza } from '../../utils/attendance'
import { BRAND_GRADIENT } from '../../utils/theme'

const ROTATE_MS = 8000

// Tarjeta destacada del Dashboard, debajo del saludo. Prioriza automáticamente
// qué mostrar según el estado real de la empresa (no hay estado "vacío", y
// nunca repite lo que ya muestran las tarjetas KPI de abajo):
//   1. Faltan pasos básicos de configuración (horario / empleados) → checklist
//   2. Todo listo → rota cada 8s entre las que apliquen ese día:
//      a) Alguien cumple años hoy
//      b) Menos tardanzas que ayer (solo si mejoró, para no sonar regañón)
//      c) Última marcación registrada hoy (actividad en vivo)
export default function DashboardHero({
  business, userName, hasSchedule, employeeCount, employees, schedules, records, kpis, isToday,
}) {
  const navigate = useNavigate()
  const ownerFirstName = (userName ?? '').split(' ')[0]

  const checklist = [
    { done: hasSchedule,       label: 'Horario base configurado' },
    { done: employeeCount > 0, label: 'Al menos un empleado agregado' },
  ]
  const checklistDone = checklist.every(c => c.done)
  const showInsights = checklistDone && isToday

  // Tick cada minuto: sin esto, "hace X minutos" de la actividad en vivo se
  // queda congelado en el valor que tenía la última vez que llegó una
  // marcación nueva, en vez de ir avanzando solo con el paso del tiempo.
  const now = useNow(60000, showInsights)

  // ── a) Cumpleaños de hoy ────────────────────────────────────────────────
  const [todayY, todayM, todayD] = todayISO().split('-').map(Number)
  const birthdayEmployee = showInsights
    ? (employees ?? []).find(e => {
        if (!e.birth_date) return false
        const [, m, d] = e.birth_date.split('-').map(Number)
        return m === todayM && d === todayD
      })
    : null

  // ── b) Comparación de tardanzas vs. ayer (solo si mejoró) ───────────────
  const yesterday = useMemo(() => {
    const dt = new Date(Date.UTC(todayY, todayM - 1, todayD - 1))
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
  }, [todayY, todayM, todayD])

  const { data: yesterdayRecords } = useAttendance(showInsights ? yesterday : null)

  const comparison = useMemo(() => {
    if (!showInsights || !yesterdayRecords) return null
    const defaultSchedule = (schedules ?? []).find(s => s.is_default)
    if (!defaultSchedule?.start_time) return null

    const byEmployee = {}
    yesterdayRecords.forEach(r => {
      if (!byEmployee[r.employee_id]) byEmployee[r.employee_id] = []
      byEmployee[r.employee_id].push(r)
    })
    let yesterdayLate = 0
    Object.values(byEmployee).forEach(empRecords => {
      const checkin = empRecords.find(r => r.type === 'checkin')
      if (!checkin) return
      const tardanza = calcularTardanza(extractTime(checkin.timestamp), defaultSchedule.start_time, business?.tolerance_minutes ?? 5)
      if (tardanza > 0) yesterdayLate++
    })

    if (yesterdayLate > kpis.tarde) return { delta: yesterdayLate - kpis.tarde }
    return null
  }, [showInsights, yesterdayRecords, schedules, business?.tolerance_minutes, kpis.tarde])

  // ── c) Última marcación de hoy (relleno, casi siempre hay algo que decir) ──
  const lastActivity = useMemo(() => {
    if (!showInsights || !records?.length) return null
    const latest = [...records].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0]
    const emp = (employees ?? []).find(e => e.id === latest.employee_id)
    if (!emp) return null
    const minutesAgo = Math.max(0, Math.round((now - new Date(latest.timestamp).getTime()) / 60000))
    const TYPE_LABEL = { checkin: 'marcó su entrada', checkout: 'marcó su salida', break_start: 'inició su refrigerio', break_end: 'terminó su refrigerio' }
    return { name: `${emp.name} ${emp.last_name ?? ''}`.trim(), action: TYPE_LABEL[latest.type] ?? 'marcó asistencia', minutesAgo }
  }, [showInsights, records, employees, now])

  // ── Todas las que apliquen hoy, en el mismo orden de prioridad ─────────
  const insightCards = useMemo(() => {
    if (!showInsights) return []
    const cards = []
    if (birthdayEmployee) {
      cards.push({
        key: 'birthday',
        eyebrow: 'Hoy',
        title: `🎉 ${birthdayEmployee.name} ${birthdayEmployee.last_name ?? ''} cumple años hoy`,
        desc: 'Un pequeño gesto con el equipo no está de más.',
      })
    }
    if (comparison) {
      cards.push({
        key: 'comparison',
        eyebrow: 'Hoy',
        title: `${comparison.delta} tardanza${comparison.delta === 1 ? '' : 's'} menos que ayer 📉`,
        desc: 'Tu equipo está mejorando la puntualidad.',
      })
    }
    if (lastActivity) {
      cards.push({
        key: 'activity',
        eyebrow: 'En vivo',
        title: `${lastActivity.name} ${lastActivity.action}`,
        desc: lastActivity.minutesAgo === 0 ? 'Hace un momento.' : `Hace ${lastActivity.minutesAgo} minuto${lastActivity.minutesAgo === 1 ? '' : 's'}.`,
      })
    }
    // Respaldo: si ningún caso especial aplica hoy (nadie cumple años, no es
    // borde de mes, sin mejora vs. ayer y nadie marcó todavía), la tarjeta no
    // debe desaparecer por completo. Usa un dato que siempre existe.
    if (cards.length === 0 && business?.created_at) {
      const days = Math.max(0, Math.floor((Date.now() - new Date(business.created_at).getTime()) / 86400000))
      cards.push({
        key: 'tenure',
        eyebrow: 'Hoy',
        title: days === 0 ? '¡Bienvenido a Asistia! 🎉' : `Llevas ${days} día${days === 1 ? '' : 's'} con Asistia`,
        desc: 'En cuanto tu equipo empiece a marcar hoy, lo verás aquí en vivo.',
      })
    }
    return cards
  }, [showInsights, birthdayEmployee, comparison, lastActivity, business?.created_at])

  // ── Rotación automática entre las que apliquen ──────────────────────────
  const [activeIndex, setActiveIndex] = useState(0)
  useEffect(() => {
    if (insightCards.length <= 1) return
    const id = setInterval(() => {
      setActiveIndex(i => (i + 1) % insightCards.length)
    }, ROTATE_MS)
    return () => clearInterval(id)
  }, [insightCards.length])

  const activeInsight = insightCards.length
    ? insightCards[activeIndex % insightCards.length]
    : null

  function Card({ eyebrow, title, desc, cta, dots }) {
    return (
      <div
        className="relative rounded-2xl overflow-hidden text-white p-5 sm:p-6"
        style={{ background: BRAND_GRADIENT }}
      >
        <img
          src="/asistia-isotipo.png"
          alt=""
          className="absolute -bottom-10 -right-10 w-40 rotate-6 opacity-10 pointer-events-none select-none"
        />
        <p className="relative text-xs font-semibold uppercase tracking-wide text-blue-100 mb-1">{eyebrow}</p>
        <h2 className="relative text-lg sm:text-xl font-bold leading-snug mb-1">{title}</h2>
        {desc && <p className="relative text-sm text-blue-100 mt-1 max-w-md">{desc}</p>}
        {cta}
        {dots}
      </div>
    )
  }

  return (
    <div className="mb-6">
      <h1 className="text-lg font-semibold text-slate-900">
        {ownerFirstName ? `Hola, ${ownerFirstName} 👋` : 'Hola 👋'}
      </h1>
      <p className="text-sm text-slate-500 mt-0.5 mb-4">Bienvenido de nuevo</p>

      {!checklistDone && (
        <Card
          eyebrow="Primeros pasos"
          title="Termina de configurar tu negocio"
          desc="Te faltan un par de cosas para empezar a usar Asistia al 100%."
          cta={
            <>
              <ul className="relative space-y-1.5 my-4">
                {checklist.map(item => (
                  <li key={item.label} className="flex items-center gap-2 text-sm">
                    {item.done ? (
                      <svg className="w-4 h-4 text-emerald-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <span className="w-4 h-4 rounded-full border-2 border-white/50 shrink-0" />
                    )}
                    <span className={item.done ? 'text-blue-100 line-through' : 'text-white font-medium'}>{item.label}</span>
                  </li>
                ))}
              </ul>
              <button
                onClick={() => navigate(!hasSchedule ? '/settings' : '/employees')}
                className="relative bg-white text-blue-700 font-medium py-2 px-4 rounded-lg text-sm hover:bg-blue-50 transition-colors"
              >
                Continuar configuración
              </button>
            </>
          }
        />
      )}

      {activeInsight && (
        <AnimatePresence mode="wait">
          <motion.div
            key={activeInsight.key}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
          >
            <Card
              eyebrow={activeInsight.eyebrow}
              title={activeInsight.title}
              desc={activeInsight.desc}
              dots={
                insightCards.length > 1 && (
                  <div className="relative flex items-center gap-1.5 mt-4">
                    {insightCards.map((c, i) => (
                      <span
                        key={c.key}
                        className={`h-1.5 rounded-full transition-all ${i === activeIndex % insightCards.length ? 'w-4 bg-white' : 'w-1.5 bg-white/40'}`}
                      />
                    ))}
                  </div>
                )
              }
            />
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  )
}
