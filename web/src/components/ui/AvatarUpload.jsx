import { useRef, useState, useEffect } from 'react'
import { AnimatePresence } from 'framer-motion'
import { useUploadEmployeePhoto, useDeleteEmployeePhoto } from '../../hooks/useEmployeePhoto'
import CropModal from './CropModal'
import { avatarGradient } from '../../utils/avatar'

const SIZES = {
  sm: { outer: 'w-9 h-9',   text: 'text-sm',  cam: 'w-3.5 h-3.5' },
  md: { outer: 'w-12 h-12', text: 'text-base', cam: 'w-4 h-4'     },
  lg: { outer: 'w-14 h-14', text: 'text-lg',   cam: 'w-4 h-4'     },
  xl: { outer: 'w-16 h-16', text: 'text-xl',   cam: 'w-5 h-5'     },
}

/**
 * Avatar circular con foto o iniciales. Si `editable`, click → CropModal → subir foto.
 * Mantiene estado local de la URL para reflejar cambios de inmediato (sin esperar al padre).
 */
export default function AvatarUpload({ employee, size = 'lg', editable = false }) {
  const fileRef  = useRef(null)
  const [menuOpen,      setMenuOpen]      = useState(false)
  const [cropSrc,       setCropSrc]       = useState(null)
  // Estado local de la URL — se actualiza al instante tras upload/delete
  const [localPhotoUrl, setLocalPhotoUrl] = useState(employee.photo_url ?? null)

  // Sincronizar si el prop externo cambia (p.ej. recarga de datos)
  useEffect(() => {
    setLocalPhotoUrl(employee.photo_url ?? null)
  }, [employee.photo_url])

  const upload = useUploadEmployeePhoto()
  const remove = useDeleteEmployeePhoto()
  const sz = SIZES[size] ?? SIZES.lg

  const initials  = [employee.name, employee.last_name]
    .filter(Boolean).map(s => s[0].toUpperCase()).join('').slice(0, 2) || '?'
  const isPending  = upload.isPending || remove.isPending
  const uploadError = upload.error?.message ?? remove.error?.message ?? null

  function handleClick() {
    if (!editable || isPending) return
    if (localPhotoUrl) {
      setMenuOpen(m => !m)
    } else {
      fileRef.current?.click()
    }
  }

  function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setCropSrc(URL.createObjectURL(file))
    e.target.value = ''
    setMenuOpen(false)
  }

  function handleCropConfirm(blob) {
    const src = cropSrc
    setCropSrc(null)
    URL.revokeObjectURL(src)

    upload.mutate(
      { employeeId: employee.id, file: blob, ext: 'jpg' },
      {
        // El hook ya devuelve la URL con ?t= de cache-buster — no añadir otro
        onSuccess: (urlWithBust) => setLocalPhotoUrl(urlWithBust),
      },
    )
  }

  function handleCropCancel() {
    URL.revokeObjectURL(cropSrc)
    setCropSrc(null)
  }

  function handleDelete() {
    remove.mutate(
      { employeeId: employee.id },
      { onSuccess: () => setLocalPhotoUrl(null) },
    )
    setMenuOpen(false)
  }

  return (
    <>
      <div className="relative shrink-0">
        {/* Avatar */}
        <div
          onClick={handleClick}
          className={`relative ${sz.outer} rounded-full overflow-hidden shrink-0 ${editable ? 'group cursor-pointer' : ''} ${isPending ? 'opacity-60' : ''}`}
        >
          {localPhotoUrl ? (
            <img
              src={localPhotoUrl}
              alt={initials}
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <div
              className={`absolute inset-0 flex items-center justify-center text-white font-bold ${sz.text}`}
              style={{ background: avatarGradient(employee.id) }}
            >
              {initials}
            </div>
          )}

          {/* Camera overlay on hover */}
          {editable && !isPending && (
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/35 transition-colors flex items-center justify-center">
              <svg
                className={`${sz.cam} text-white opacity-0 group-hover:opacity-100 transition-opacity`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
          )}

          {/* Spinner */}
          {isPending && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <svg className="animate-spin w-4 h-4 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          )}
        </div>

        {/* Dropdown (solo si tiene foto) */}
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
            <div className="absolute top-full left-0 mt-1.5 z-20 bg-white rounded-lg border border-slate-200 shadow-lg py-1 min-w-[148px]">
              <button
                onClick={() => { fileRef.current?.click(); setMenuOpen(false) }}
                className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Cambiar foto
              </button>
              <button
                onClick={handleDelete}
                className="w-full text-left px-3 py-2 text-sm text-rose-600 hover:bg-rose-50 transition-colors"
              >
                Eliminar foto
              </button>
            </div>
          </>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleFile}
        />
      </div>

      {/* Error de upload */}
      {editable && uploadError && (
        <p className="mt-1.5 text-xs text-rose-600 text-center max-w-[140px] leading-tight">
          {uploadError}
        </p>
      )}

      {/* CropModal — fuera del div relativo */}
      <AnimatePresence>
        {cropSrc && (
          <CropModal
            key="crop"
            imageSrc={cropSrc}
            onConfirm={handleCropConfirm}
            onCancel={handleCropCancel}
          />
        )}
      </AnimatePresence>
    </>
  )
}
