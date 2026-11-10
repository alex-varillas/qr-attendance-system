import { useEffect, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import Modal from './Modal'
import { useCreateEmployee, useUpdateEmployee, useSetAdminPermission, useRemoveEmployeePin } from '../../hooks/useEmployees'
import { useDepartments } from '../../hooks/useDepartments'
import { useLocations } from '../../hooks/useLocations'
import { useSchedules, useSetSchedules, useDeleteSchedule } from '../../hooks/useSchedules'
import ScheduleBlocksEditor from './ScheduleBlocksEditor'
import { EMPTY_BLOCK, schedulesToBlocks, blocksToPayload, validateBlocks } from '../../utils/scheduleBlocks'
import ExceptionsSection from './ExceptionsSection'
import { useAuth } from '../../hooks/useAuth.jsx'
import { DOC_TYPES } from '../../utils/labels'
import AvatarUpload from './AvatarUpload'
import FilterSelect from './FilterSelect'
import { t } from '../../i18n'

const EMPTY_FORM = {
  name: '',
  last_name: '',
  doc_type: 'ID',
  dni: '',
  birth_date: '',
  sex: '',
  email: '',
  phone: '',
  puesto: '',
  department_id: '',
  location_id: '',
  role: 'employee',
  pin: '',
}

export default function EmployeeModal({ employee, onClose }) {
  const isEditing = !!employee
  const { isOwner } = useAuth()
  const docTypes = DOC_TYPES
  const setAdminPermission = useSetAdminPermission()
  const showPermissions = isOwner && isEditing && employee?.role === 'admin'

  const createEmployee = useCreateEmployee()
  const updateEmployee = useUpdateEmployee()
  const removeEmployeePin = useRemoveEmployeePin()
  const { data: departments = [] } = useDepartments()
  const { data: locations = [] } = useLocations()
  const { data: schedules = [] } = useSchedules()
  const setSchedules = useSetSchedules()
  const deleteSchedule = useDeleteSchedule()

  const [form, setForm] = useState(EMPTY_FORM)
  const [removePin, setRemovePin] = useState(false)
  const [changingPin, setChangingPin] = useState(false)
  const [pinJustRemoved, setPinJustRemoved] = useState(false)
  const [pinError, setPinError] = useState(null)
  const [error, setError] = useState(null)

  // Horario
  const [followsBusinessSchedule, setFollowsBusinessSchedule] = useState(true)
  const [scheduleBlocks, setScheduleBlocks] = useState([EMPTY_BLOCK])

  useEffect(() => {
    if (employee) {
      setForm({
        name:       employee.name       ?? '',
        last_name:  employee.last_name   ?? '',
        doc_type:   employee.doc_type    ?? 'ID',
        dni:        employee.dni         ?? '',
        birth_date: employee.birth_date  ?? '',
        sex:        employee.sex         ?? '',
        email:      employee.email       ?? '',
        phone:      employee.phone       ?? '',
        puesto:     employee.puesto      ?? '',
        department_id: employee.department_id ?? '',
        location_id: employee.location_id ?? '',
        role:       employee.role        ?? 'employee',
        pin:        '',
      })
      // Cargar horario personalizado (bloques) si existe
      const own = schedules.filter(s => s.employee_id === employee.id)
      if (own.length > 0) {
        setFollowsBusinessSchedule(false)
        setScheduleBlocks(schedulesToBlocks(own))
      } else {
        setFollowsBusinessSchedule(true)
        setScheduleBlocks([EMPTY_BLOCK])
      }
    }
  }, [employee, schedules])

  function generatePin() {
    const pin = String(Math.floor(Math.random() * 10000)).padStart(4, '0')
    set('pin', pin)
  }

  // Quitar el PIN es inmediato, no queda pendiente hasta "Guardar cambios":
  // al confirmar, ya no hay PIN, y la sección vuelve a verse vacía, lista
  // para poner uno nuevo si se quiere.
  async function handleConfirmRemovePin() {
    setPinError(null)
    try {
      await removeEmployeePin.mutateAsync(employee.id)
      setRemovePin(false)
      setPinJustRemoved(true)
      set('pin', '')
    } catch (err) {
      setPinError(err.message ?? t('No se pudo quitar el PIN.'))
    }
  }

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }))
  }


  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    if (!followsBusinessSchedule) {
      const blockError = validateBlocks(scheduleBlocks)
      if (blockError) { setError(blockError); return }
    }

    if (form.pin && !/^\d{4}$/.test(form.pin)) {
      setError(t('El PIN debe ser exactamente 4 dígitos numéricos.'))
      return
    }

    const payload = {
      name:       form.name.trim(),
      last_name:  form.last_name.trim(),
      doc_type:   form.doc_type,
      dni:        form.dni.trim() || null,
      birth_date: form.birth_date || null,
      sex:        form.sex || null,
      email:      form.email.trim() || null,
      phone:      form.phone.trim() || null,
      puesto:     form.puesto.trim() || null,
      department_id: form.department_id || null,
      location_id: form.location_id || null,
      // Only the owner can set a role, and only when it changes (the server refuses it from anyone else).
      ...(isOwner && form.role !== (employee?.role ?? 'employee') ? { role: form.role } : {}),
      ...(form.pin ? { pin: form.pin } : {}),
    }

    try {
      let empId

      if (isEditing) {
        await updateEmployee.mutateAsync({ id: employee.id, removePin, ...payload })
        empId = employee.id
      } else {
        const newEmp = await createEmployee.mutateAsync(payload)
        empId = newEmp.id
      }

      // Guardar horario personalizado
      if (!followsBusinessSchedule) {
        await setSchedules.mutateAsync({ employeeId: empId, blocks: blocksToPayload(scheduleBlocks) })
      } else if (isEditing) {
        // Si volvió a usar horario de empresa, eliminar el personalizado si existía
        const existing = schedules.find(s => s.employee_id === empId)
        if (existing) {
          await deleteSchedule.mutateAsync({ employeeId: empId })
        }
      }

      onClose()
    } catch (err) {
      setError(err.message ?? t('Ocurrió un error. Intenta nuevamente.'))
    }
  }

  const isPending = createEmployee.isPending || updateEmployee.isPending
    || setSchedules.isPending || deleteSchedule.isPending

  return (
    <>
    <Modal
      onClose={onClose}
      ariaLabel={isEditing ? t('Editar empleado') : t('Agregar empleado')}
      className="bg-white rounded-xl shadow-lg w-full max-w-md max-h-[90vh] flex flex-col"
    >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <h2 className="text-base font-semibold text-slate-800">
            {isEditing ? t('Editar empleado') : t('Agregar empleado')}
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
            aria-label={t('Cerrar')}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form - scrollable */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4 overflow-y-auto">
          {/* Foto de perfil - solo cuando se edita un empleado existente */}
          {isEditing && (
            <div className="flex flex-col items-center gap-1.5 pb-2 border-b border-slate-100">
              <AvatarUpload employee={employee} size="xl" editable />
              <p className="text-xs text-slate-400">{t('Foto de perfil (opcional)')}</p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {t('Nombre')}{' '}<span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={form.name}
                onChange={e => set('name', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder={t('Juan')}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {t('Apellido')}{' '}<span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={form.last_name}
                onChange={e => set('last_name', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder={t('Pérez')}
              />
            </div>
          </div>

          {/* Documento de identidad */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {t('Documento de identidad')}
            </label>
            <div className="flex gap-2">
              <select
                value={form.doc_type}
                onChange={e => { set('doc_type', e.target.value); set('dni', '') }}
                className="w-24 sm:w-36 min-w-0 px-2 sm:px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
              >
                {docTypes.map(dt => (
                  <option key={dt.value} value={dt.value}>{dt.label}</option>
                ))}
              </select>
              <input
                type="text"
                value={form.dni}
                onChange={e => set('dni', e.target.value)}
                maxLength={docTypes.find(dt => dt.value === form.doc_type)?.maxLen ?? 12}
                className="flex-1 min-w-0 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder={t('Nro. de documento')}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('Puesto')}</label>
              <input
                type="text"
                value={form.puesto}
                onChange={e => set('puesto', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder={t('Vendedor')}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('Área')}</label>
              <FilterSelect
                block
                value={form.department_id}
                onChange={v => set('department_id', v)}
                placeholder={t('Sin área')}
                options={[
                  { value: '', label: t('Sin área') },
                  ...departments.map(d => ({ value: d.id, label: d.name })),
                ]}
              />
            </div>
          </div>

          {/* Sede asignada - solo si hay sedes creadas. Restringe en qué QR puede
              marcar el empleado (el servidor lo valida); sin asignar = puede
              marcar en cualquier sede. */}
          {locations.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('Sede asignada')}</label>
              <FilterSelect
                block
                value={form.location_id}
                onChange={v => set('location_id', v)}
                placeholder={t('Cualquier sede')}
                options={[
                  { value: '', label: t('Cualquier sede') },
                  ...locations.map(l => ({ value: l.id, label: l.name })),
                ]}
              />
              <p className="text-xs text-slate-400 mt-1">
                {t('Si asignas una sede, este empleado solo podrá marcar desde el QR de esa sede.')}
              </p>
            </div>
          )}

          {/* Fecha de nacimiento + Sexo (opcionales) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {t('Fecha de nacimiento')}{' '}<span className="text-xs text-slate-400 font-normal">{t('(opcional)')}</span>
              </label>
              <input
                type="date"
                value={form.birth_date}
                max={new Date().toISOString().slice(0, 10)}
                onChange={e => set('birth_date', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {t('Sexo')}{' '}<span className="text-xs text-slate-400 font-normal">{t('(opcional)')}</span>
              </label>
              <FilterSelect
                block
                value={form.sex}
                onChange={v => set('sex', v)}
                placeholder="-"
                options={[
                  { value: '', label: '-' },
                  { value: 'M', label: t('Masculino') },
                  { value: 'F', label: t('Femenino') },
                  { value: 'X', label: t('Otro') },
                ]}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('Correo electrónico')}</label>
              <input
                type="email"
                value={form.email}
                onChange={e => set('email', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder={t('juan@empresa.com')}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {t('Teléfono')}{' '}<span className="text-xs text-slate-400 font-normal">{t('(opcional)')}</span>
              </label>
              <input
                type="tel"
                value={form.phone}
                onChange={e => set('phone', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="+51 999 123 456"
              />
            </div>
          </div>

          {isOwner && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('Rol')}</label>
            <FilterSelect
              block
              value={form.role}
              onChange={v => set('role', v)}
              options={[
                { value: 'employee', label: t('Empleado') },
                { value: 'admin',    label: t('Administrador') },
              ]}
            />
            {form.role === 'admin' && (
              <div className="mt-2 flex gap-2 bg-violet-50 border border-violet-100 rounded-lg px-3 py-2.5">
                <svg className="w-4 h-4 text-violet-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-xs text-violet-700 leading-relaxed">
                  {t('Los administradores necesitan una cuenta para acceder al panel. Una vez guardado, podrás enviarle una invitación desde la lista de empleados para que configure su acceso.')}
                </p>
              </div>
            )}
          </div>
          )}

          {/* PIN */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {t('PIN de check-in')}
              <span className="ml-1 text-slate-400 font-normal">{t('(4 dígitos, opcional)')}</span>
            </label>
            {isEditing && employee.pin_enabled && !pinJustRemoved && !removePin && !changingPin ? (
              <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg">
                <span className="text-sm text-slate-500">{t('PIN activo ••••')}</span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => { setChangingPin(true); set('pin', '') }}
                    className="text-xs font-medium px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    {t('Cambiar')}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setRemovePin(true); setPinError(null) }}
                    className="text-xs font-medium px-2.5 py-1.5 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 transition-colors"
                  >
                    {t('Quitar')}
                  </button>
                </div>
              </div>
            ) : removePin ? (
              <div className="px-3 py-2.5 bg-rose-50 border border-rose-200 rounded-lg">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-rose-700">{t('¿Quitar el PIN de este empleado?')}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setRemovePin(false)}
                      className="text-xs font-medium px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 transition-colors"
                    >
                      {t('Cancelar')}
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmRemovePin}
                      disabled={removeEmployeePin.isPending}
                      className="text-xs font-medium px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white transition-colors"
                    >
                      {removeEmployeePin.isPending ? t('Quitando...') : t('Quitar')}
                    </button>
                  </div>
                </div>
                {pinError && <p className="text-xs text-rose-600 mt-1.5">{pinError}</p>}
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={form.pin}
                    onChange={e => set('pin', e.target.value.replace(/\D/g, '').slice(0, 4))}
                    maxLength={4}
                    inputMode="numeric"
                    pattern="\d{4}"
                    className="flex-1 min-w-0 px-3 py-2 border border-slate-300 rounded-lg text-sm tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="0000"
                  />
                  <button
                    type="button"
                    onClick={generatePin}
                    className="text-xs font-medium px-2.5 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors shrink-0"
                  >
                    {t('Generar')}
                  </button>
                  {form.pin.length === 4 && (
                    <button
                      type="button"
                      onClick={() => navigator.clipboard.writeText(form.pin)}
                      className="text-xs font-medium px-2.5 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors shrink-0"
                    >
                      {t('Copiar')}
                    </button>
                  )}
                </div>
                {isEditing && changingPin && (
                  <button
                    type="button"
                    onClick={() => { setChangingPin(false); set('pin', '') }}
                    className="text-xs font-medium text-slate-500 hover:underline mt-1.5"
                  >
                    {t('Cancelar')}
                  </button>
                )}
              </>
            )}
          </div>

          {/* Horario */}
          <div className="border-t border-slate-200 pt-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-slate-700">{t('Horario')}</span>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <span className="text-xs text-slate-500">{t('Usar horario de empresa')}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={followsBusinessSchedule}
                  onClick={() => setFollowsBusinessSchedule(v => !v)}
                  className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 ${
                    followsBusinessSchedule ? 'bg-blue-600' : 'bg-slate-300'
                  }`}
                >
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                    followsBusinessSchedule ? 'translate-x-4' : 'translate-x-0.5'
                  }`} />
                </button>
              </label>
            </div>

            {!followsBusinessSchedule && (
              <div className="bg-slate-50 rounded-lg p-3">
                <ScheduleBlocksEditor blocks={scheduleBlocks} onChange={setScheduleBlocks} />
              </div>
            )}
          </div>

          {/* Excepciones, solo tiene sentido si el empleado ya existe */}
          {isEditing && (
            <div className="border-t border-slate-200 pt-4">
              <ExceptionsSection employeeId={employee.id} />
            </div>
          )}

          {/* Permisos adicionales - solo owner editando un admin */}
          {showPermissions && (
            <div className="border-t border-slate-200 pt-4">
              <p className="text-sm font-medium text-slate-700 mb-1">{t('Permisos adicionales')}</p>
              <p className="text-xs text-slate-400 mb-3">{t('Los cambios se guardan al instante.')}</p>
              <div className="space-y-3">
                {[
                  {
                    key: 'manage_holidays',
                    label: t('Gestión de feriados'),
                    desc: t('Puede agregar y eliminar feriados del negocio'),
                  },
                  {
                    key: 'manage_settings',
                    label: t('Configuración operativa'),
                    desc: t('Puede editar la tolerancia de tardanza, las áreas y las vacaciones'),
                  },
                ].map(({ key, label, desc }) => {
                  const enabled = !!(employee?.permissions?.[key])
                  return (
                    <div key={key} className="flex items-start justify-between gap-3 py-2 px-3 rounded-lg bg-slate-50">
                      <div>
                        <p className="text-xs font-medium text-slate-700">{label}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={enabled}
                        disabled={setAdminPermission.isPending}
                        onClick={() => setAdminPermission.mutate({
                          employeeId: employee.id,
                          permission: key,
                          value: !enabled,
                        })}
                        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 mt-0.5 ${
                          enabled ? 'bg-blue-600' : 'bg-slate-300'
                        } disabled:opacity-50`}
                      >
                        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                          enabled ? 'translate-x-4' : 'translate-x-0.5'
                        }`} />
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {error && <p role="alert" className="text-rose-600 text-sm">{error}</p>}

          {/* Actions */}
          <div className="flex gap-3 pt-1 pb-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-slate-300 hover:bg-slate-50 text-slate-600 font-medium py-2 px-4 rounded-lg text-sm transition-colors"
            >
              {t('Cancelar')}
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2 px-4 rounded-lg text-sm transition-colors"
            >
              {isPending ? t('Guardando...') : isEditing ? t('Guardar cambios') : t('Agregar empleado')}
            </button>
          </div>
        </form>
    </Modal>
    </>
  )
}
