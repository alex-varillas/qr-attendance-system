import { useState, useCallback } from 'react'
import Cropper from 'react-easy-crop'
import Modal from './Modal'

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.addEventListener('load', () => resolve(img))
    img.addEventListener('error', reject)
    img.src = src
  })
}

async function getCroppedImg(src, area) {
  const img = await loadImage(src)
  const canvas = document.createElement('canvas')
  canvas.width = area.width
  canvas.height = area.height
  canvas.getContext('2d').drawImage(
    img,
    area.x, area.y, area.width, area.height,
    0, 0, area.width, area.height,
  )
  return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92))
}

/**
 * Modal de recorte circular para fotos de perfil.
 * Props: imageSrc (object URL), onConfirm(blob), onCancel()
 */
export default function CropModal({ imageSrc, onConfirm, onCancel }) {
  const [crop, setCrop]   = useState({ x: 0, y: 0 })
  const [zoom, setZoom]   = useState(1)
  const [croppedArea, setCroppedArea] = useState(null)
  const [saving,    setSaving]    = useState(false)
  const [cropError, setCropError] = useState(null)

  const onCropComplete = useCallback((_, croppedAreaPixels) => {
    setCroppedArea(croppedAreaPixels)
  }, [])

  async function handleConfirm() {
    if (!croppedArea) return
    setSaving(true)
    setCropError(null)
    try {
      const blob = await getCroppedImg(imageSrc, croppedArea)
      if (!blob) throw new Error('No se pudo procesar la imagen. Intenta con otra foto.')
      onConfirm(blob)
    } catch (err) {
      setCropError(err.message ?? 'Error al procesar la imagen.')
      setSaving(false)
    }
  }

  return (
    <Modal
      onClose={onCancel}
      ariaLabel="Ajustar foto"
      backdropClassName="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4"
      className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden"
    >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-800">Ajustar foto</h2>
          <button
            onClick={onCancel}
            aria-label="Cancelar"
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Área de recorte */}
        <div className="relative bg-slate-900" style={{ height: 300 }}>
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
            style={{
              containerStyle: { background: '#0f172a' },
              cropAreaStyle: { border: '2px solid white', boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)' },
            }}
          />
        </div>

        {/* Zoom slider */}
        <div className="px-5 pt-4 pb-3 flex items-center gap-3">
          <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
          </svg>
          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            onChange={e => setZoom(Number(e.target.value))}
            className="flex-1 h-1.5 accent-blue-600 cursor-pointer"
            aria-label="Zoom"
          />
          <svg className="w-5 h-5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
          </svg>
        </div>
        <p className="text-center text-[11px] text-slate-400 -mt-1 pb-1">Arrastra para centrar · desliza para hacer zoom</p>

        {/* Error de recorte */}
        {cropError && (
          <p className="px-5 pb-2 text-xs text-rose-600 text-center">{cropError}</p>
        )}

        {/* Actions */}
        <div className="flex gap-3 px-5 pb-5 pt-2">
          <button
            onClick={onCancel}
            className="flex-1 border border-slate-300 hover:bg-slate-50 text-slate-600 font-medium py-2 rounded-lg text-sm transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={saving}
            className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2 rounded-lg text-sm transition-colors"
          >
            {saving ? 'Procesando...' : 'Guardar foto'}
          </button>
        </div>
    </Modal>
  )
}
