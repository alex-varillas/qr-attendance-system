import { createContext, useContext, useCallback, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

const ToastContext = createContext(null)

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast debe usarse dentro de <ToastProvider>')
  return ctx
}

let nextId = 0

// Campanilla de 2 notas generada con Web Audio, sin depender de un archivo de
// audio. Envuelto en try/catch porque algunos navegadores bloquean audio sin
// interacción previa del usuario, y eso no debería romper el toast en sí.
function playChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const notes = [740, 988]
    notes.forEach((freq, i) => {
      const start = ctx.currentTime + i * 0.11
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(0.18, start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.22)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(start)
      osc.stop(start + 0.24)
      // Cerrar el AudioContext cuando termina la última nota — si no, cada
      // toast deja uno abierto (los navegadores limitan cuántos puede haber
      // vivos a la vez).
      if (i === notes.length - 1) osc.onended = () => ctx.close()
    })
  } catch { /* audio bloqueado por el navegador, no interrumpe el toast */ }
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const dismissToast = useCallback((id) => {
    setToasts(list => list.filter(t => t.id !== id))
  }, [])

  const showToast = useCallback((message, { duration = 9000 } = {}) => {
    const id = ++nextId
    setToasts(list => [...list, { id, message }])
    playChime()
    setTimeout(() => dismissToast(id), duration)
  }, [dismissToast])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="fixed top-4 right-4 z-[100] flex flex-col gap-2 w-full max-w-sm px-4 sm:px-0 pointer-events-none"
      >
        <AnimatePresence>
          {toasts.map(t => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: -12, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.15 } }}
              className="bg-white border border-amber-200 shadow-lg rounded-xl px-4 py-3 flex items-start gap-3 pointer-events-auto"
            >
              <div className="w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-sm text-slate-700 leading-snug pt-1 flex-1">{t.message}</p>
              <button
                onClick={() => dismissToast(t.id)}
                className="text-slate-300 hover:text-slate-500 transition-colors shrink-0"
                aria-label="Cerrar"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}
