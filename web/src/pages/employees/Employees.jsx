import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { useAuth } from '../../hooks/useAuth.jsx'
import { useEmployees, useToggleEmployee, useInviteAdmin, useAdminResetLink } from '../../hooks/useEmployees'
import EmployeeModal from '../../components/ui/EmployeeModal'
import InviteAdminModal from '../../components/ui/InviteAdminModal'
import LinkModal from '../../components/ui/LinkModal'
import ImportCSVModal from '../../components/ui/ImportCSVModal'
import DepartmentsModal from '../../components/ui/DepartmentsModal'
import Modal from '../../components/ui/Modal'
import { useDepartments } from '../../hooks/useDepartments'
import FilterSelect from '../../components/ui/FilterSelect'
import { ROLE_LABELS } from '../../utils/labels'

function RoleBadge({ role }) {
  const colors = {
    owner:    'bg-purple-100 text-purple-700',
    admin:    'bg-blue-100 text-blue-700',
    employee: 'bg-slate-100 text-slate-600',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colors[role] ?? colors.employee}`}>
      {ROLE_LABELS[role] ?? role}
    </span>
  )
}

export default function Employees() {
  const { isOwner } = useAuth()
  const { data: employees = [], isLoading, isError } = useEmployees()
  const toggleEmployee = useToggleEmployee()
  const inviteAdmin = useInviteAdmin()
  const resetLink = useAdminResetLink()
  const { data: departments = [] } = useDepartments()

  const [inviteState, setInviteState] = useState({})   // { [empId]: 'sending'|'sent'|'error' }
  const [inviteErrors, setInviteErrors] = useState({}) // { [empId]: string }
  const [inviteTarget, setInviteTarget] = useState(null) // employee con el modal de invitar abierto

  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState(null)
  const [linkResult, setLinkResult] = useState(null)        // { title, description, link, emailed, email }
  const [showInactive, setShowInactive] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [confirmToggle, setConfirmToggle] = useState(null)
  const [deptFilter, setDeptFilter] = useState('')
  const [deptModalOpen, setDeptModalOpen] = useState(false)
  const deptName = id => departments.find(d => d.id === id)?.name

  const activeCount = employees.filter(e => e.active && e.role !== 'owner').length
  // The modal always gets the latest copy of the employee: some of its controls (the permission
  // switches) save instantly, and must show the new state without closing and reopening it.
  const editingCurrent = editingEmployee ? (employees.find(e => e.id === editingEmployee.id) ?? editingEmployee) : null

  const filtered = employees
    .filter(e => showInactive ? true : e.active)
    .filter(e => !deptFilter || e.department_id === deptFilter)
    .filter(e =>
      `${e.name} ${e.last_name} ${e.dni ?? ''} ${e.puesto ?? ''}`
        .toLowerCase()
        .includes(search.toLowerCase())
    )

  function handleAdd() {
    setEditingEmployee(null)
    setModalOpen(true)
  }

  async function handleResetLink(emp) {
    try {
      const { link } = await resetLink.mutateAsync(emp.id)
      setLinkResult({
        title: `Nuevo acceso para ${emp.name} ${emp.last_name}`,
        description: 'Con este enlace elegirá una nueva contraseña. Sus sesiones abiertas se cerrarán.',
        link,
      })
    } catch (err) {
      setInviteErrors(s => ({ ...s, [emp.id]: err.message ?? 'No se pudo crear el enlace' }))
    }
  }

  function handleEdit(employee) {
    setEditingEmployee(employee)
    setModalOpen(true)
  }

  function handleConfirmToggle() {
    if (!confirmToggle) return
    toggleEmployee.mutate({ id: confirmToggle.id, active: !confirmToggle.active })
    setConfirmToggle(null)
  }

  async function handleSendInvite(emp, email) {
    if (!email.includes('@')) return
    setInviteState(s => ({ ...s, [emp.id]: 'sending' }))
    try {
      const result = await inviteAdmin.mutateAsync({ employee_id: emp.id, email })
      setInviteState(s => ({ ...s, [emp.id]: 'sent' }))
      setInviteTarget(null)
      setLinkResult({
        title: `Invitación para ${emp.name} ${emp.last_name}`,
        description: 'Envíale este enlace para que cree su contraseña y entre como administrador.',
        ...result,
      })
    } catch (err) {
      // Estado 'error' persistente y visible en la fila, si cierra el modal
      // sin reintentar, no se pierde el rastro del fallo.
      setInviteState(s => ({ ...s, [emp.id]: 'error' }))
      setInviteErrors(s => ({ ...s, [emp.id]: err.message ?? 'No se pudo crear la invitación' }))
    }
  }

  return (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Empleados</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {activeCount} empleados activos
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setDeptModalOpen(true)}
            className="inline-flex items-center gap-2 border border-slate-200 hover:bg-slate-50 text-slate-600 font-medium py-2 px-4 rounded-lg text-sm transition-colors leading-none"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <span>Áreas</span>
          </button>
          <button
            onClick={() => setImportOpen(true)}
            className="inline-flex items-center gap-2 border border-slate-200 hover:bg-slate-50 text-slate-600 font-medium py-2 px-4 rounded-lg text-sm transition-colors leading-none"
          >
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M12 12V4m0 0l-3 3m3-3l3 3" />
            </svg>
            <span>Importar CSV</span>
          </button>
          <button
            onClick={handleAdd}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg text-sm transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Agregar empleado
          </button>
        </div>
      </div>

      {/* Barra de búsqueda + filtro */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <div className="relative w-full sm:flex-1 sm:max-w-sm">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre, documento o puesto..."
            className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        {departments.length > 0 && (
          <FilterSelect
            value={deptFilter}
            onChange={setDeptFilter}
            placeholder="Todas las áreas"
            options={[
              { value: '', label: 'Todas las áreas' },
              ...departments.map(d => ({ value: d.id, label: d.name })),
            ]}
          />
        )}
        <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={e => setShowInactive(e.target.checked)}
            className="rounded border-slate-300"
          />
          Mostrar inactivos
        </label>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {isLoading && (
          <div className="p-8 text-center text-sm text-slate-500">Cargando empleados...</div>
        )}

        {isError && (
          <div className="p-8 text-center text-sm text-rose-500">
            Error al cargar empleados. Recarga la página.
          </div>
        )}

        {!isLoading && !isError && filtered.length === 0 && (
          <div className="p-8 text-center">
            <p className="text-sm text-slate-500">
              {search ? 'Sin resultados para esa búsqueda.' : 'Aún no hay empleados. Agrega el primero.'}
            </p>
          </div>
        )}

        {!isLoading && !isError && filtered.length > 0 && (
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Nombre</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Documento</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Puesto</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Área</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Rol</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">PIN</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Estado</th>
                <th className="px-4 py-3 w-px" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((emp, idx) => (
                <tr
                  key={emp.id}
                  className={`hover:bg-slate-50 transition-colors row-enter ${!emp.active ? 'opacity-50' : ''}`}
                  style={{ animationDelay: `${Math.min(idx * 25, 250)}ms` }}
                >
                  <td className="px-4 py-3 font-medium text-slate-800">
                    <Link to={`/employees/${emp.id}`} className="hover:text-blue-600 transition-colors">
                      {emp.name} {emp.last_name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{emp.dni ?? '-'}</td>
                  <td className="px-4 py-3 text-slate-500">{emp.puesto ?? '-'}</td>
                  <td className="px-4 py-3 text-slate-500">{deptName(emp.department_id) ?? '-'}</td>
                  <td className="px-4 py-3">
                    <RoleBadge role={emp.role} />
                  </td>
                  <td className="px-4 py-3">
                    {emp.pin_enabled
                      ? <span className="text-green-600 text-xs font-medium">Activo</span>
                      : <span className="text-slate-400 text-xs">Sin PIN</span>
                    }
                  </td>
                  <td className="px-4 py-3">
                    {emp.active
                      ? <span className="text-green-600 text-xs font-medium">Activo</span>
                      : <span className="text-slate-400 text-xs">Inactivo</span>
                    }
                  </td>
                  <td className="px-4 py-3 w-px whitespace-nowrap">
                    {emp.role !== 'owner' && (
                      <div className="flex items-center justify-end gap-3">
                        {/* Flujo de invitación para admins sin cuenta, solo visible al owner */}
                        {isOwner && emp.role === 'admin' && (
                          emp.user_id ? (
                            // Ya tiene cuenta vinculada
                            <div className="flex items-center gap-1.5">
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                                Acceso activo
                              </span>
                              <button
                                onClick={() => handleResetLink(emp)}
                                className="text-xs font-medium text-violet-600 hover:underline shrink-0"
                              >
                                Nuevo acceso
                              </button>
                            </div>
                          ) : (inviteState[emp.id] === 'sent' || emp.invite_sent_at) ? (
                            // Invitación enviada
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-violet-700 bg-violet-50 border border-violet-200 px-2 py-0.5 rounded-full">
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                              Invitación pendiente
                            </span>
                          ) : inviteState[emp.id] === 'error' ? (
                            // Invitación falló, queda visible con motivo y reintento
                            // (reabre el modal, precargado con el último correo intentado),
                            // en vez de volver al botón como si no hubiera pasado nada
                            <div className="flex items-center gap-1.5">
                              <span
                                className="inline-flex items-center gap-1 text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full max-w-[160px] truncate"
                                title={inviteErrors[emp.id]}
                              >
                                <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                                </svg>
                                No se pudo invitar
                              </span>
                              <button
                                onClick={() => setInviteTarget(emp)}
                                className="text-xs font-medium text-violet-600 hover:underline shrink-0"
                              >
                                Reintentar
                              </button>
                            </div>
                          ) : (
                            // Idle → un solo botón compacto, siempre del mismo tamaño
                            // que editar/desactivar. Todo el detalle (correo, envío,
                            // confirmación) vive en el modal, no en la fila.
                            <button
                              onClick={() => setInviteTarget(emp)}
                              disabled={inviteState[emp.id] === 'sending'}
                              className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border border-violet-200 text-violet-600 hover:bg-violet-50 disabled:opacity-40 transition-colors"
                            >
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                              </svg>
                              Invitar
                            </button>
                          )
                        )}
                        <button
                          onClick={() => handleEdit(emp)}
                          className="text-slate-400 hover:text-blue-600 transition-colors"
                          aria-label="Editar"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => setConfirmToggle(emp)}
                          className="text-slate-400 hover:text-rose-500 transition-colors"
                          aria-label={emp.active ? 'Desactivar' : 'Activar'}
                        >
                          {emp.active
                            ? <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                  d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                              </svg>
                            : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                          }
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* Modals */}
      <AnimatePresence>
        {modalOpen && (
          <EmployeeModal
            key="employee-modal"
            employee={editingCurrent}
            onClose={() => { setModalOpen(false); setEditingEmployee(null) }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {importOpen && (
          <ImportCSVModal
            key="import-modal"
            onClose={() => setImportOpen(false)}
            existingEmployees={employees}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {deptModalOpen && (
          <DepartmentsModal key="dept-modal" onClose={() => setDeptModalOpen(false)} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {inviteTarget && (
          <InviteAdminModal
            key="invite-admin"
            employee={inviteTarget}
            initialEmail={inviteTarget.email ?? inviteTarget.invite_email ?? ''}
            sending={inviteState[inviteTarget.id] === 'sending'}
            error={inviteState[inviteTarget.id] === 'error' ? inviteErrors[inviteTarget.id] : null}
            onSend={email => handleSendInvite(inviteTarget, email)}
            onClose={() => setInviteTarget(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {linkResult && (
          <LinkModal key="link-modal" {...linkResult} onClose={() => setLinkResult(null)} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {confirmToggle && (
          <Modal
            key="confirm-toggle"
            onClose={() => setConfirmToggle(null)}
            ariaLabel={confirmToggle.active ? 'Desactivar empleado' : 'Activar empleado'}
            className="bg-white rounded-xl shadow-lg w-full max-w-sm p-6"
          >
              <div className={`w-11 h-11 rounded-full flex items-center justify-center mb-4 ${confirmToggle.active ? 'bg-rose-100' : 'bg-green-100'}`}>
                {confirmToggle.active
                  ? <svg className="w-5 h-5 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                    </svg>
                  : <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                }
              </div>
              <h2 className="text-base font-semibold text-slate-800 mb-1">
                {confirmToggle.active ? 'Desactivar empleado' : 'Activar empleado'}
              </h2>
              <p className="text-sm text-slate-500 mb-5">
                {confirmToggle.active
                  ? <>¿Seguro que deseas desactivar a <strong>{confirmToggle.name} {confirmToggle.last_name}</strong>? No podrá marcar asistencia hasta que lo vuelvas a activar.</>
                  : <>¿Deseas volver a activar a <strong>{confirmToggle.name} {confirmToggle.last_name}</strong>? Podrá marcar asistencia nuevamente.</>
                }
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmToggle(null)}
                  className="flex-1 border border-slate-300 hover:bg-slate-50 text-slate-600 font-medium py-2 rounded-lg text-sm transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleConfirmToggle}
                  className={`flex-1 font-medium py-2 rounded-lg text-sm transition-colors text-white ${
                    confirmToggle.active ? 'bg-rose-600 hover:bg-rose-700' : 'bg-green-600 hover:bg-green-700'
                  }`}
                >
                  {confirmToggle.active ? 'Sí, desactivar' : 'Sí, activar'}
                </button>
              </div>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  )
}
