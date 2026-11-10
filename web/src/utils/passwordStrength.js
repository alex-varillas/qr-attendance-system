// Live password strength meter, with no external dependency (zxcvbn and similar weigh several hundred KB).
// The server enforces the real rule (a minimum length); this is feedback so people do not have to fail
// the submit to find out their password is weak.

const COMMON_PASSWORDS = new Set([
  '12345678', '123456789', '1234567890', 'password', 'password1', 'password123',
  'qwerty123', 'qwertyui', '11111111', '00000000', 'abc12345', 'admin123',
  'contraseña', 'contrasena', 'iloveyou1', 'letmein1',
])

// Returns { score: 0-4, label, colorClass, checks: {...} }
export function scorePassword(password) {
  const p = password ?? ''

  const checks = {
    length8: p.length >= 8,
    length12: p.length >= 12,
    lower: /[a-z]/.test(p),
    upper: /[A-Z]/.test(p),
    digit: /[0-9]/.test(p),
    symbol: /[^A-Za-z0-9]/.test(p),
  }

  if (!p) return { score: 0, label: '', colorClass: 'bg-slate-200', checks }

  const isCommon = COMMON_PASSWORDS.has(p.toLowerCase())
  const isSequence = /^(.)\1+$/.test(p) || /0123|1234|2345|3456|4567|5678|6789|abcd|qwer/i.test(p)
  const meetsRequired = checks.lower && checks.upper && checks.digit

  let score = 0
  if (checks.length8) score++
  if (checks.lower && checks.upper) score++
  if (checks.digit) score++
  if (checks.symbol || checks.length12) score++

  if (!meetsRequired) score = Math.min(score, 2)
  if (isCommon || isSequence) score = Math.min(score, 1)
  if (!checks.length8) score = 0

  const LEVELS = [
    { label: 'Muy débil', colorClass: 'bg-rose-500' },
    { label: 'Débil', colorClass: 'bg-rose-500' },
    { label: 'Media', colorClass: 'bg-amber-500' },
    { label: 'Fuerte', colorClass: 'bg-green-500' },
    { label: 'Muy fuerte', colorClass: 'bg-green-600' },
  ]

  return { score, ...LEVELS[score], checks }
}

// Minimum to allow choosing a password (blocks "very weak" and "weak").
export const MIN_ACCEPTABLE_SCORE = 2

export function isPasswordStrongEnough(password) {
  const { score, checks } = scorePassword(password)
  return score >= MIN_ACCEPTABLE_SCORE && checks.lower && checks.upper && checks.digit
}
