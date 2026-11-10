import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { backdropVariants, modalVariants } from '../../utils/animations'

// Modal accesible genérico — antes cada uno de los ~14 modales de la app
// tenía su propio par de <motion.div> backdrop+panel copiado a mano, sin
// role="dialog", sin cierre con Esc y sin focus trap. Este componente solo
// reemplaza ese wrapper (backdrop + panel + accesibilidad); el contenido de
// cada modal sigue siendo suyo, pasado como children, para no forzar una
// reestructura de 14 componentes con contenido muy distinto entre sí.
//
// El click en el backdrop para cerrar es opt-in (closeOnBackdropClick): de
// los modales existentes, solo uno lo tenía, así que no se activa por
// defecto (cambiaría el comportamiento de los otros 13).
export default function Modal({
  onClose,
  children,
  ariaLabel,
  className = 'bg-white rounded-xl shadow-lg w-full max-w-sm',
  backdropClassName = 'fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4',
  closeOnBackdropClick = false,
}) {
  const panelRef = useRef(null)

  // Foco inicial al panel (no a un campo específico: el contenido varía
  // demasiado entre modales para adivinar cuál sería el correcto) — salvo
  // que algún hijo ya se haya autoenfocado (varios modales usan autoFocus en
  // su primer input), en cuyo caso se respeta eso. Restaura el foco a quien
  // lo tenía antes de abrir, al cerrar.
  useEffect(() => {
    const previouslyFocused = document.activeElement
    if (!panelRef.current?.contains(document.activeElement)) {
      panelRef.current?.focus()
    }
    return () => {
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus()
    }
  }, [])

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        onClose?.()
        return
      }
      if (e.key !== 'Tab' || !panelRef.current) return
      const focusable = panelRef.current.querySelectorAll(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last  = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <motion.div
      variants={backdropVariants} initial="hidden" animate="visible" exit="exit"
      className={backdropClassName}
      onClick={closeOnBackdropClick ? onClose : undefined}
    >
      <motion.div
        ref={panelRef}
        variants={modalVariants} initial="hidden" animate="visible" exit="exit"
        className={className}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
        onClick={e => e.stopPropagation()}
      >
        {children}
      </motion.div>
    </motion.div>
  )
}
