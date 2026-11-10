import { useState, useRef, lazy, Suspense } from 'react'
import { AnimatePresence } from 'framer-motion'
import { QRCodeSVG } from 'qrcode.react'
import { useAuth } from '../../hooks/useAuth.jsx'
import { useLocations, useCreateLocation, useUpdateLocation } from '../../hooks/useLocations'
import { useSchedules, useSetSchedules, useDeleteSchedule } from '../../hooks/useSchedules'
import ScheduleBlocksEditor from '../../components/ui/ScheduleBlocksEditor'
import { EMPTY_BLOCK, schedulesToBlocks, blocksToPayload, validateBlocks } from '../../utils/scheduleBlocks'
import ExceptionsSection from '../../components/ui/ExceptionsSection'
import Modal from '../../components/ui/Modal'
import { t, tn } from '../../i18n'

const MapPicker = lazy(() => import('../../components/ui/MapPicker'))

const EMPTY_FORM = {
  name: '', address: '',
  geo_enabled: false, lat: null, lng: null, geo_radius_meters: 100,
}

export default function Locations() {
  const { business, isOwner } = useAuth()

  const { data: locations = [], isLoading } = useLocations()
  const createLocation = useCreateLocation()
  const updateLocation = useUpdateLocation()
  const { data: schedules = [] } = useSchedules()
  const setSchedules     = useSetSchedules()
  const deleteSchedule  = useDeleteSchedule()

  const [showModal,   setShowModal]   = useState(false)
  const [editingLoc,  setEditingLoc]  = useState(null)
  const [showQrFor,   setShowQrFor]   = useState(null)

  const [form,      setForm]      = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [saving,    setSaving]    = useState(false)

  const [useSedeSchedule, setUseSedeSchedule] = useState(false)
  const [scheduleBlocks,  setScheduleBlocks]  = useState([EMPTY_BLOCK])

  function openCreate() {
    setForm(EMPTY_FORM)
    setFormError('')
    setEditingLoc(null)
    setUseSedeSchedule(false)
    setScheduleBlocks([EMPTY_BLOCK])
    setShowModal(true)
  }

  function openEdit(loc) {
    setForm({
      name:              loc.name,
      address:           loc.address ?? '',
      geo_enabled:       loc.geo_enabled ?? false,
      lat:               loc.lat ?? null,
      lng:               loc.lng ?? null,
      geo_radius_meters: loc.geo_radius_meters ?? 100,
    })
    setFormError('')
    setEditingLoc(loc)

    const own = schedules.filter(s => s.location_id === loc.id && s.employee_id == null)
    if (own.length > 0) {
      setUseSedeSchedule(true)
      setScheduleBlocks(schedulesToBlocks(own))
    } else {
      setUseSedeSchedule(false)
      setScheduleBlocks([EMPTY_BLOCK])
    }
    setShowModal(true)
  }

  function handleMapChange({ lat, lng }) {
    setForm(f => ({ ...f, lat, lng }))
  }

  async function handleSave() {
    if (!form.name.trim()) { setFormError(t('El nombre es obligatorio')); return }
    if (form.geo_enabled && (form.lat == null || form.lng == null)) {
      setFormError(t('Marca la ubicación de esta sede en el mapa antes de activar la verificación de ubicación.'))
      return
    }
    if (useSedeSchedule) {
      const blockError = validateBlocks(scheduleBlocks)
      if (blockError) { setFormError(blockError); return }
    }

    setSaving(true); setFormError('')
    try {
      const payload = {
        name:              form.name.trim(),
        address:           form.address.trim() || null,
        geo_enabled:       form.geo_enabled,
        lat:               form.geo_enabled ? form.lat : null,
        lng:               form.geo_enabled ? form.lng : null,
        geo_radius_meters: Number(form.geo_radius_meters) || 100,
      }

      let locationId = editingLoc?.id
      if (editingLoc) {
        await updateLocation.mutateAsync({ id: editingLoc.id, ...payload })
      } else {
        const created = await createLocation.mutateAsync(payload)
        locationId = created.id
      }

      if (useSedeSchedule) {
        await setSchedules.mutateAsync({ locationId, blocks: blocksToPayload(scheduleBlocks) })
      } else if (editingLoc) {
        const hadOwn = schedules.some(s => s.location_id === editingLoc.id && s.employee_id == null)
        if (hadOwn) await deleteSchedule.mutateAsync({ locationId })
      }

      setShowModal(false)
    } catch (err) {
      setFormError(err.message ?? t('Error al guardar'))
    } finally {
      setSaving(false)
    }
  }

  async function handleToggle(loc) {
    await updateLocation.mutateAsync({ id: loc.id, active: !loc.active })
  }

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">{t('Sedes')}</h1>
          <p className="text-sm text-slate-500">{tn(locations.length, '{0} sede registrada', '{0} sedes registradas')}</p>
        </div>
        {isOwner && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg text-sm transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            {t('Nueva sede')}
          </button>
        )}
      </div>

      {/* Explicación del QR general */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 mb-6 flex items-start gap-3">
        <svg className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-xs text-blue-700 leading-relaxed">
          {t('El')}{' '}<strong>{t('QR general de la empresa')}</strong>{' '}{t('(en "Código QR") sigue funcionando para marcaciones sin sede específica. Cada sede aquí tiene su propio QR independiente.')}
        </p>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 rounded-full border-2 border-blue-200 border-t-blue-600 animate-spin" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && locations.length === 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center"
             style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
          <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <p className="font-medium text-slate-700 mb-1">{t('Aún no tienes sedes')}</p>
          <p className="text-sm text-slate-400 mb-5">{t('Crea tu primera sede para obtener su QR independiente.')}</p>
          {isOwner && (
            <button
              onClick={openCreate}
              className="text-blue-600 hover:text-blue-700 text-sm font-medium transition-colors"
            >
              {t('Crear primera sede →')}
            </button>
          )}
        </div>
      )}

      {/* Grid de sedes */}
      {!isLoading && locations.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {locations.map(loc => (
            <LocationCard
              key={loc.id}
              location={loc}
              isOwner={isOwner}
              onEdit={() => openEdit(loc)}
              onQr={() => setShowQrFor(loc)}
              onToggle={() => handleToggle(loc)}
            />
          ))}
        </div>
      )}

      {/* Modal crear/editar */}
      <AnimatePresence>
        {showModal && (
          <LocationModal
            key="location-modal"
            editing={editingLoc}
            form={form}
            setForm={setForm}
            error={formError}
            saving={saving}
            onSave={handleSave}
            onClose={() => setShowModal(false)}
            defaultCenter={business?.location_lat != null && business?.location_lng != null ? [business.location_lat, business.location_lng] : null}
            onMapChange={handleMapChange}
            useSedeSchedule={useSedeSchedule}
            setUseSedeSchedule={setUseSedeSchedule}
            scheduleBlocks={scheduleBlocks}
            setScheduleBlocks={setScheduleBlocks}
          />
        )}
      </AnimatePresence>

      {/* Modal QR */}
      <AnimatePresence>
        {showQrFor && (
          <QrModal
            key="qr-modal"
            location={showQrFor}
            business={business}
            onClose={() => setShowQrFor(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

/* ── LocationCard ─────────────────────────────────────────────────────────── */
function LocationCard({ location, isOwner, onEdit, onQr, onToggle }) {
  return (
    <div
      className={`bg-white rounded-xl border p-5 transition-opacity ${
        location.active ? 'border-slate-200' : 'border-slate-100 opacity-60'
      }`}
      style={{ boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0 mr-3">
          <h3 className="font-semibold text-slate-900 text-base leading-tight">{location.name}</h3>
          {location.address ? (
            <p className="text-xs text-slate-400 mt-0.5 truncate">{location.address}</p>
          ) : (
            <p className="text-xs text-slate-300 mt-0.5 italic">{t('Sin dirección')}</p>
          )}
        </div>
        <span className={`shrink-0 inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
          location.active ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${location.active ? 'bg-green-500' : 'bg-slate-400'}`} />
          {location.active ? t('Activa') : t('Inactiva')}
        </span>
      </div>

      {/* URL truncada */}
      <p className="text-[10px] text-slate-300 font-mono mb-4 truncate">
        /checkin/{location.id}
      </p>

      {/* Acciones */}
      <div className="flex items-center gap-2">
        <button
          onClick={onQr}
          className="flex items-center gap-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
          </svg>
          {t('Ver QR')}
        </button>

        {isOwner && (
          <>
            <button
              onClick={onEdit}
              className="text-xs font-medium text-slate-600 bg-slate-50 hover:bg-slate-100 px-3 py-1.5 rounded-lg transition-colors"
            >
              {t('Editar')}
            </button>
            <button
              onClick={onToggle}
              className="ml-auto text-xs font-medium text-slate-400 hover:text-slate-600 px-2 py-1.5 rounded-lg transition-colors"
            >
              {location.active ? t('Desactivar') : t('Activar')}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

/* ── Toggle reutilizable dentro del modal ────────────────────────────────── */
function ModalToggle({ checked, onChange, label }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <span className="text-xs text-slate-500">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 ${
          checked ? 'bg-blue-600' : 'bg-slate-300'
        }`}
      >
        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0.5'
        }`} />
      </button>
    </label>
  )
}

/* ── LocationModal ────────────────────────────────────────────────────────── */
function LocationModal({
  editing, form, setForm, error, saving, onSave, onClose, defaultCenter, onMapChange,
  useSedeSchedule, setUseSedeSchedule, scheduleBlocks, setScheduleBlocks,
}) {
  return (
    <Modal
      onClose={onClose}
      ariaLabel={editing ? t('Editar sede') : t('Nueva sede')}
      className="bg-white rounded-xl shadow-lg w-full max-w-md max-h-[90vh] overflow-y-auto"
    >
        <div className="p-6">
          <h2 className="text-base font-semibold text-slate-800 mb-5">
            {editing ? t('Editar sede') : t('Nueva sede')}
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                {t('Nombre de la sede')}{' '}<span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder={t('Ej: Sede Central')}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                {t('Dirección')}{' '}<span className="text-slate-400 font-normal">{t('(opcional)')}</span>
              </label>
              <input
                type="text"
                value={form.address}
                onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                placeholder={t('Ej: Av. Principal 345')}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all"
              />
            </div>
          </div>

          {/* Geolocalización, propia de esta sede */}
          <div className="border-t border-slate-200 mt-5 pt-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-slate-700">{t('Verificar ubicación al marcar')}</span>
              <ModalToggle
                checked={form.geo_enabled}
                onChange={v => setForm(f => ({ ...f, geo_enabled: v }))}
                label={form.geo_enabled ? t('Activo') : t('Inactivo')}
              />
            </div>

            {form.geo_enabled && (
              <div className="space-y-3">
                <Suspense fallback={<div className="h-56 bg-slate-100 rounded-lg animate-pulse" />}>
                  <MapPicker
                    lat={form.lat}
                    lng={form.lng}
                    radius={Number(form.geo_radius_meters) || 100}
                    defaultCenter={defaultCenter}
                    onChange={onMapChange}
                  />
                </Suspense>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min={10}
                    max={1000}
                    value={form.geo_radius_meters}
                    onChange={e => setForm(f => ({ ...f, geo_radius_meters: e.target.value }))}
                    className="w-24 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <span className="text-sm text-slate-500">{t('metros desde el pin')}</span>
                </div>
              </div>
            )}
          </div>

          {/* Horario propio de esta sede */}
          <div className="border-t border-slate-200 mt-4 pt-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-slate-700">{t('Horario')}</span>
              <ModalToggle
                checked={useSedeSchedule}
                onChange={setUseSedeSchedule}
                label={t('Horario propio de esta sede')}
              />
            </div>
            {!useSedeSchedule && (
              <p className="text-xs text-slate-400">{t('Se usará el horario general de la empresa.')}</p>
            )}
            {useSedeSchedule && (
              <div className="bg-slate-50 rounded-lg p-3">
                <ScheduleBlocksEditor blocks={scheduleBlocks} onChange={setScheduleBlocks} />
              </div>
            )}
          </div>

          {/* Excepciones, solo tiene sentido si la sede ya existe */}
          {editing && (
            <div className="border-t border-slate-200 mt-4 pt-4">
              <ExceptionsSection locationId={editing.id} />
            </div>
          )}

          {error && (
            <p className="text-xs text-red-500 mt-4 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex gap-2 mt-6">
            <button
              onClick={onClose}
              className="flex-1 border border-slate-200 hover:bg-slate-50 text-slate-600 font-medium py-2.5 rounded-lg text-sm transition-colors"
            >
              {t('Cancelar')}
            </button>
            <button
              onClick={onSave}
              disabled={saving}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
            >
              {saving ? t('Guardando...') : editing ? t('Guardar cambios') : t('Crear sede')}
            </button>
          </div>
        </div>
    </Modal>
  )
}

/* ── QrModal ──────────────────────────────────────────────────────────────── */
function QrModal({ location, business, onClose }) {
  const qrRef = useRef(null)
  const checkinUrl = `${window.location.origin}/checkin/${location.id}`

  function handleDownload() {
    const svg = qrRef.current?.querySelector('svg')
    if (!svg) return

    const qrSize = 560
    const pad    = 48
    const W      = qrSize + pad * 2       // 656
    const H      = qrSize + pad * 2 + 160 // 816

    const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
      <rect width="64" height="64" rx="10" fill="#2E7DE9"/>
      <rect x="10" y="10" width="18" height="18" rx="3" fill="white"/>
      <rect x="14" y="14" width="10" height="10" rx="1.5" fill="#2E7DE9"/>
      <rect x="17" y="17" width="4" height="4" rx="1" fill="white"/>
      <rect x="36" y="10" width="18" height="18" rx="3" fill="white"/>
      <rect x="40" y="14" width="10" height="10" rx="1.5" fill="#2E7DE9"/>
      <rect x="43" y="17" width="4" height="4" rx="1" fill="white"/>
      <rect x="10" y="36" width="18" height="18" rx="3" fill="white"/>
      <rect x="14" y="40" width="10" height="10" rx="1.5" fill="#2E7DE9"/>
      <rect x="17" y="43" width="4" height="4" rx="1" fill="white"/>
      <rect x="36" y="36" width="5" height="5" rx="1" fill="white"/>
      <rect x="43" y="36" width="5" height="5" rx="1" fill="white"/>
      <rect x="50" y="36" width="5" height="5" rx="1" fill="white"/>
      <rect x="36" y="43" width="5" height="5" rx="1" fill="white"/>
      <rect x="43" y="43" width="8" height="5" rx="1" fill="white"/>
      <rect x="36" y="50" width="8" height="5" rx="1" fill="white"/>
      <rect x="50" y="43" width="5" height="12" rx="1" fill="white"/>
      <rect x="44" y="50" width="5" height="5" rx="1" fill="white"/>
    </svg>`

    const loadImg = src => new Promise(res => {
      const i = new Image(); i.onload = () => res(i); i.src = src
    })
    const svgData = new XMLSerializer().serializeToString(svg)
    const qrSrc   = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)))
    const logoSrc = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(logoSvg)))

    Promise.all([loadImg(qrSrc), loadImg(logoSrc)]).then(([qrImg, logoImg]) => {
      const canvas = document.createElement('canvas')
      canvas.width  = W
      canvas.height = H
      const ctx = canvas.getContext('2d')

      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, W, H)

      // QR
      ctx.drawImage(qrImg, pad, pad, qrSize, qrSize)

      const base = pad + qrSize // 608

      // Nombre empresa
      ctx.fillStyle = '#64748b'
      ctx.font = '500 20px system-ui, -apple-system, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(business.name, W / 2, base + 36)

      // Nombre sede
      ctx.fillStyle = '#0f172a'
      ctx.font = '700 30px system-ui, -apple-system, sans-serif'
      ctx.fillText(location.name, W / 2, base + 76)

      // Separador
      ctx.strokeStyle = '#e2e8f0'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(pad * 2, base + 100)
      ctx.lineTo(W - pad * 2, base + 100)
      ctx.stroke()

      // Logo Asistia (ícono + wordmark)
      const iconSize = 32
      ctx.font = '800 28px system-ui, -apple-system, sans-serif'
      const wordW  = ctx.measureText(t('Asistia')).width
      const logoX  = W / 2 - (iconSize + 10 + wordW) / 2
      const logoY  = base + 144
      ctx.drawImage(logoImg, logoX, logoY - iconSize + 4, iconSize, iconSize)
      ctx.fillStyle  = '#2E7DE9'
      ctx.textAlign  = 'left'
      ctx.fillText(t('Asistia'), logoX + iconSize + 10, logoY)

      const link = document.createElement('a')
      link.download = `qr-${location.name.replace(/\s+/g, '-').toLowerCase()}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
    })
  }

  return (
    <Modal onClose={onClose} ariaLabel={t('Código QR | {0}', [location.name])} className="bg-white rounded-xl shadow-lg w-full max-w-sm">
        <div className="p-6">
          {/* Header modal */}
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-base font-semibold text-slate-800">{location.name}</h2>
              {location.address && (
                <p className="text-xs text-slate-400 mt-0.5">{location.address}</p>
              )}
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors p-1">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* QR */}
          <div ref={qrRef} className="flex justify-center mb-4">
            <div className="p-4 bg-white border-2 border-slate-100 rounded-xl">
              <QRCodeSVG
                value={checkinUrl}
                size={200}
                bgColor="#ffffff"
                fgColor="#0f172a"
                level="H"
              />
            </div>
          </div>

          {/* Etiqueta (preview de lo que se imprimirá) */}
          <div className="text-center mb-4 bg-slate-50 rounded-lg py-2.5">
            <p className="text-xs text-slate-400">{business.name}</p>
            <p className="text-sm font-bold text-slate-800">{location.name}</p>
          </div>

          <p className="text-[10px] text-slate-300 text-center font-mono mb-5 break-all px-2">{checkinUrl}</p>

          <button
            onClick={handleDownload}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {t('Descargar QR con nombre')}
          </button>
        </div>
    </Modal>
  )
}
