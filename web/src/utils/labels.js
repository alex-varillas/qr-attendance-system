// Shared labels, one source for every screen.

export const ROLE_LABELS = { owner: 'Dueño', admin: 'Administrador', employee: 'Empleado' }

export const ABSENCE_TYPE_LABELS = {
  permiso_con_goce: 'Permiso c/goce',
  permiso_sin_goce: 'Permiso s/goce',
  vacaciones: 'Vacaciones',
  descanso_medico: 'Descanso médico',
  licencia: 'Licencia',
  suspension: 'Suspensión',
  comision_servicio: 'Comisión de servicio',
  otro: 'Permiso',
}

// Identity documents. Free text in the database: these are only the suggestions of the form.
export const DOC_TYPES = [
  { value: 'ID', label: 'Documento de identidad', maxLen: 30 },
  { value: 'PASSPORT', label: 'Pasaporte', maxLen: 30 },
  { value: 'OTHER', label: 'Otro', maxLen: 30 },
]

/** The label of a document type, or the raw value for one this list does not know (older data). */
export function docTypeLabel(value) {
  return DOC_TYPES.find(type => type.value === value)?.label ?? value ?? ''
}
