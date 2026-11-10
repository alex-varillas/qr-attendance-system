import { t } from '../i18n/index.js'
// Shared labels, one source for every screen.

export const ROLE_LABELS = { get owner() { return t('Dueño') }, get admin() { return t('Administrador') }, get employee() { return t('Empleado') } }

export const ABSENCE_TYPE_LABELS = {
  get permiso_con_goce() { return t('Permiso c/goce') },
  get permiso_sin_goce() { return t('Permiso s/goce') },
  get vacaciones() { return t('Vacaciones') },
  get descanso_medico() { return t('Descanso médico') },
  get licencia() { return t('Licencia') },
  get suspension() { return t('Suspensión') },
  get comision_servicio() { return t('Comisión de servicio') },
  get otro() { return t('Permiso') },
}

// Identity documents. Free text in the database: these are only the suggestions of the form.
export const DOC_TYPES = [
  { value: 'ID', get label() { return t('Documento de identidad') }, maxLen: 30 },
  { value: 'PASSPORT', get label() { return t('Pasaporte') }, maxLen: 30 },
  { value: 'OTHER', get label() { return t('Otro') }, maxLen: 30 },
]

/** The label of a document type, or the raw value for one this list does not know (older data). */
export function docTypeLabel(value) {
  return DOC_TYPES.find(type => type.value === value)?.label ?? value ?? ''
}

/** "12345678" for a plain identity document, "Pasaporte X123" for another type. Null when there is nothing to show. */
export function documentText(docType, number) {
  const typeText = !docType || docType === 'ID' ? '' : docTypeLabel(docType)
  return [typeText, number].filter(Boolean).join(' ') || null
}
