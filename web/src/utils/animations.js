// Shared Framer Motion variants — use these consistently across the app

export const backdropVariants = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2 } },
  exit:    { opacity: 0, transition: { duration: 0.18, delay: 0.06 } },
}

export const modalVariants = {
  hidden:  { opacity: 0, scale: 0.88, y: 28 },
  visible: { opacity: 1, scale: 1,    y: 0,  transition: { duration: 0.28, ease: [0.34, 1.56, 0.64, 1] } },
  exit:    { opacity: 0, scale: 0.92, y: 16, transition: { duration: 0.18, ease: [0.4, 0, 1, 1] } },
}

export const slideUp = {
  hidden:  { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0,  transition: { duration: 0.32, ease: [0.4, 0, 0.2, 1] } },
}

export const staggerContainer = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
}

export const staggerItem = {
  hidden:  { opacity: 0, y: 18, scale: 0.96 },
  visible: { opacity: 1, y: 0,  scale: 1, transition: { duration: 0.35, ease: [0.34, 1.56, 0.64, 1] } },
}

export const fadeIn = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.25 } },
  exit:    { opacity: 0, transition: { duration: 0.15 } },
}

// Spring bounce for success icons
export const successBounce = {
  hidden:  { scale: 0.5, opacity: 0 },
  visible: { scale: 1,   opacity: 1, transition: { type: 'spring', damping: 14, stiffness: 220 } },
}
