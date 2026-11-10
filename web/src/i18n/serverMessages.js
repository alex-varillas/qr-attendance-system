// The server answers in English: that is the language of its API and of its logs. The interface shows those
// messages in its own language, so a Spanish screen does not get a sentence in English.
// `npm run i18n:check` fails when a message written in the server has no entry here.

import { getLocale } from './index.js'

export const SPANISH = {
  'A day cannot be in more than one schedule block': 'Un día no puede estar en más de un bloque de horario',
  'A schedule belongs to one employee or one site, not both': 'Un horario pertenece a un empleado o a una sede, no a ambos',
  'Absence not found': 'No se encontró la ausencia',
  'An account with this email already exists': 'Ya existe una cuenta con este correo',
  'An exception belongs to one employee or one site, not both': 'Una excepción pertenece a un empleado o a una sede, no a ambos',
  'Authentication required': 'Debes iniciar sesión',
  'Authorization not found': 'No se encontró la autorización',
  'Choose an employee or a site, not both': 'Elige un empleado o una sede, no ambos',
  'Choose the employee or the site whose own schedule is removed': 'Elige el empleado o la sede cuyo horario propio se quita',
  'Cross-origin request blocked': 'Solicitud de otro origen bloqueada',
  'Department not found': 'No se encontró el área',
  'Employee not found': 'No se encontró al empleado',
  'Exception not found': 'No se encontró la excepción',
  'Holiday not found': 'No se encontró el feriado',
  'Incorrect email or password': 'Correo o contraseña incorrectos',
  'Internal server error': 'Error interno del servidor',
  'Invalid request': 'Solicitud no válida',
  'Invalid value': 'Valor no válido',
  'Location not found': 'No se encontró la sede',
  'No file received': 'No se recibió ningún archivo',
  'No photo': 'No hay foto',
  'Not found': 'No encontrado',
  'Only administrators can be invited': 'Solo se puede invitar a administradores',
  'Only administrators with an account can have their password reset': 'Solo los administradores con cuenta pueden restablecer su contraseña',
  'Only the owner can change administrators': 'Solo el dueño puede modificar a los administradores',
  'Only the owner can change roles': 'Solo el dueño puede cambiar los roles',
  'Only the owner can change these settings': 'Solo el dueño puede cambiar esta configuración',
  'Only the owner can create administrators': 'Solo el dueño puede crear administradores',
  'Only the owner can do this': 'Solo el dueño puede hacer esto',
  'Permissions can only be set on administrators': 'Los permisos solo se pueden asignar a administradores',
  'Remove the administrator account before making this person a regular employee': 'Quita la cuenta de administrador antes de convertir a esta persona en empleado',
  'Report not found': 'No se encontró el reporte',
  'Send either a PIN or remove_pin, not both': 'Envía un PIN o remove_pin, no ambos',
  'Send the report as multipart form data': 'Envía el reporte como multipart form data',
  'Set the start and end time together, or neither for a non-working day': 'Indica la hora de inicio y la de fin juntas, o ninguna para un día no laborable',
  'The address search is not available right now': 'La búsqueda de direcciones no está disponible por ahora',
  'The current password is incorrect': 'La contraseña actual es incorrecta',
  'The end date cannot be before the start date': 'La fecha final no puede ser anterior a la inicial',
  'The file is no longer available': 'El archivo ya no está disponible',
  'The owner cannot be deactivated': 'El dueño no puede desactivarse',
  'The photo must be a JPEG, PNG or WebP image': 'La foto debe ser una imagen JPEG, PNG o WebP',
  'The role of the owner cannot be changed': 'El rol del dueño no se puede cambiar',
  'The system has not been set up yet': 'El sistema todavía no está configurado',
  'This QR code is not valid': 'Este código QR no es válido',
  'This administrator already has an account': 'Este administrador ya tiene una cuenta',
  'This installation is already set up': 'Esta instalación ya está configurada',
  'This invitation is not valid or has expired': 'Esta invitación no es válida o ya venció',
  'This link is not valid or has expired': 'Este enlace no es válido o ya venció',
  'This record already exists': 'Este registro ya existe',
  'This record is still used by other records': 'Este registro todavía lo usan otros registros',
  'You do not have permission to do this': 'No tienes permiso para hacer esto',
  'Your account does not have this permission': 'Tu cuenta no tiene este permiso',
}

// Messages that carry a value: the server writes them with a template.
export const PATTERNS = [
  [/^The file is not a valid (\w+)$/, (m) => `El archivo no es un ${m[1]} válido`],
  [/^The range cannot exceed (\d+) days$/, (m) => `El rango no puede superar ${m[1]} días`],
]

/** The message of the server in the language of the interface (it stays as written for English or an unknown one). */
export function serverMessage(message) {
  if (getLocale() !== 'es' || typeof message !== 'string') return message
  if (SPANISH[message]) return SPANISH[message]
  for (const [pattern, translate] of PATTERNS) {
    const match = message.match(pattern)
    if (match) return translate(match)
  }
  return message
}
