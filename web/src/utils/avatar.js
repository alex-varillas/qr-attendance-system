// Gradientes de avatar por id, único origen (antes duplicado en
// AvatarUpload.jsx, Vacaciones.jsx y Checkin.jsx).

export const AVATAR_GRADIENTS = [
  'linear-gradient(135deg,#2E7DE9,#1d6cd8)',
  'linear-gradient(135deg,#7c3aed,#6d28d9)',
  'linear-gradient(135deg,#0891b2,#0e7490)',
  'linear-gradient(135deg,#d97706,#b45309)',
  'linear-gradient(135deg,#dc2626,#b91c1c)',
  'linear-gradient(135deg,#059669,#047857)',
]

// Hash simple sobre el id completo (no solo el primer carácter, que es lo
// que hacía charCodeAt(0) y producía colisiones triviales: dos ids con la
// misma inicial siempre caían en el mismo color).
function hashString(str) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

export function avatarGradient(id = '') {
  return AVATAR_GRADIENTS[hashString(id) % AVATAR_GRADIENTS.length] ?? AVATAR_GRADIENTS[0]
}
