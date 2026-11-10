import { useState } from 'react'
import {
  useDepartments, useCreateDepartment, useRenameDepartment, useDeleteDepartment,
} from '../../hooks/useDepartments'
import Modal from './Modal'

export default function DepartmentsModal({ onClose }) {
  const { data: departments = [] } = useDepartments()
  const create = useCreateDepartment()
  const rename = useRenameDepartment()
  const remove = useDeleteDepartment()

  const [name, setName] = useState('')
  const [editing, setEditing] = useState(null)   // { id, name }
  const [error, setError] = useState(null)

  async function handleAdd(e) {
    e.preventDefault()
    if (!name.trim()) return
    setError(null)
    try { await create.mutateAsync(name); setName('') }
    catch { setError('No se pudo crear. ¿Aplicaste la migración de áreas en Supabase?') }
  }

  async function handleRename() {
    if (!editing?.name.trim()) return
    try { await rename.mutateAsync({ id: editing.id, name: editing.name }); setEditing(null) }
    catch { setError('No se pudo renombrar.') }
  }

  return (
    <Modal onClose={onClose} ariaLabel="Áreas" className="bg-white rounded-xl shadow-lg w-full max-w-sm p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-slate-800">Áreas</h2>
            <p className="text-xs text-slate-500 mt-0.5">Organiza a tus empleados por área.</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Cerrar">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <form onSubmit={handleAdd} className="flex gap-2 mb-4">
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Nueva área (ej. Ventas)"
            className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button type="submit" disabled={create.isPending || !name.trim()}
            className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-40 transition-colors">
            Añadir
          </button>
        </form>

        {error && <p className="text-rose-600 text-xs mb-3">{error}</p>}

        {departments.length === 0 ? (
          <p className="text-sm text-slate-400 py-4 text-center">Aún no hay áreas.</p>
        ) : (
          <ul className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
            {departments.map(d => (
              <li key={d.id} className="py-2 flex items-center gap-2">
                {editing?.id === d.id ? (
                  <>
                    <input
                      value={editing.name}
                      onChange={e => setEditing({ ...editing, name: e.target.value })}
                      onKeyDown={e => e.key === 'Enter' && handleRename()}
                      autoFocus
                      className="flex-1 px-2 py-1 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button onClick={handleRename} className="text-xs font-medium text-blue-600 hover:text-blue-700">Guardar</button>
                    <button onClick={() => setEditing(null)} className="text-xs text-slate-400 hover:text-slate-600">Cancelar</button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm text-slate-700">{d.name}</span>
                    <button onClick={() => setEditing({ id: d.id, name: d.name })} className="text-slate-400 hover:text-blue-600" aria-label="Renombrar">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    </button>
                    <button onClick={() => remove.mutate(d.id)} className="text-slate-400 hover:text-rose-500" aria-label="Eliminar">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="text-[11px] text-slate-400 mt-3">Eliminar un área no borra empleados; solo quedan "sin área".</p>
    </Modal>
  )
}
