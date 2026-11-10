import { useEffect, useState, lazy, Suspense } from 'react'
import { AnimatePresence } from 'framer-motion'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../hooks/useAuth.jsx'
import { api } from '../../lib/api'
import { useSchedules, useSetSchedules } from '../../hooks/useSchedules'
import ScheduleBlocksEditor from '../../components/ui/ScheduleBlocksEditor'
import { EMPTY_BLOCK, schedulesToBlocks, blocksToPayload, validateBlocks } from '../../utils/scheduleBlocks'
import ExceptionsSection from '../../components/ui/ExceptionsSection'
import { listTimeZones } from '../../utils/dates'
import { useHolidays, useAddHoliday, useDeleteHoliday } from '../../hooks/useHolidays'
import HolidayCalendar from '../../components/ui/HolidayCalendar'
import Modal from '../../components/ui/Modal'
import GeoBlockedAttempts from '../../components/ui/GeoBlockedAttempts'
import { t, useLocale } from '../../i18n'

// Carga diferida, Leaflet es pesado y solo se necesita en esta sección
const MapPicker = lazy(() => import('../../components/ui/MapPicker'))

function GeoActivationModal({ onConfirm, onCancel }) {
  return (
    <Modal onClose={onCancel} ariaLabel={t('Configura la ubicación de tu local')} className="bg-white rounded-xl shadow-lg w-full max-w-sm p-6">
        <div className="w-11 h-11 bg-blue-100 rounded-full flex items-center justify-center mb-4">
          <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>
        <h2 className="text-base font-semibold text-slate-800 mb-2">
          {t('Configura la ubicación de tu local')}
        </h2>
        <p className="text-sm text-slate-500 mb-5">
          {t('Para verificar que tus empleados marcan desde el local, necesitas indicar la ubicación exacta en el mapa. Puedes buscar la dirección o hacer clic directamente sobre el mapa.')}
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 border border-slate-300 hover:bg-slate-50 text-slate-600 font-medium py-2 rounded-lg text-sm transition-colors"
          >
            {t('Cancelar')}
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-lg text-sm transition-colors"
          >
            {t('Configurar ahora')}
          </button>
        </div>
    </Modal>
  )
}

export default function Settings() {
  const { business, isOwner, hasPermission, refreshBusiness } = useAuth()
  useLocale() // the language is changed on this screen and applies as soon as it is saved
  const isAdminView = !isOwner && hasPermission('manage_settings')
  const canSettings = isOwner || hasPermission('manage_settings')
  const canHolidays = isOwner || hasPermission('manage_holidays')
  const queryClient = useQueryClient()

  const [form, setForm] = useState({
    name:               '',
    tax_id:             '',
    timezone:           'UTC',
    locale:             'es',
    tolerance_minutes:  5,
    geo_enabled:        false,
    geo_radius_meters:  100,
    location_lat:       null,
    location_lng:       null,
    location_address:   '',
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)
  const [showGeoModal, setShowGeoModal] = useState(false)

  // Horario de empresa, uno o más bloques (días con horario propio / jornada partida)
  const { data: schedules = [] } = useSchedules()
  const setSchedules = useSetSchedules()
  const [scheduleBlocks, setScheduleBlocks] = useState([EMPTY_BLOCK])

  // Cargar los bloques del horario por defecto cuando los schedules se carguen
  useEffect(() => {
    const defaults = schedules.filter(s => s.is_default && s.employee_id == null)
    if (defaults.length > 0) setScheduleBlocks(schedulesToBlocks(defaults))
  }, [schedules])

  // Feriados (calendario de la empresa). Los feriados afectan el cálculo de
  // asistencia, por eso viven en Configuración.
  const { data: holidays, isLoading: holidaysLoading } = useHolidays()
  const addHoliday    = useAddHoliday()
  const deleteHoliday = useDeleteHoliday()
  const defaultSchedule = schedules.find(s => s.is_default)
  const restDays = defaultSchedule
    ? [0, 1, 2, 3, 4, 5, 6].filter(d => !defaultSchedule.days_of_week?.includes(d))
    : [0]

  useEffect(() => {
    if (!business) return
    setForm({
      name:               business.name ?? '',
      tax_id:             business.tax_id ?? '',
      timezone:           business.timezone ?? 'UTC',
      locale:             business.locale ?? 'es',
      tolerance_minutes:  business.tolerance_minutes ?? 5,
      geo_enabled:        business.geo_enabled ?? false,
      geo_radius_meters:  business.geo_radius_meters ?? 100,
      location_lat:       business.location_lat ?? null,
      location_lng:       business.location_lng ?? null,
      location_address:   business.location_address ?? '',
    })
  }, [business])

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }))
  }

  const timeZones = listTimeZones()

  function handleGeoToggle() {
    if (!form.geo_enabled) {
      // Al activar: mostrar modal de configuración
      setShowGeoModal(true)
    } else {
      set('geo_enabled', false)
    }
  }

  function handleGeoModalConfirm() {
    setShowGeoModal(false)
    set('geo_enabled', true)
    setTimeout(() => {
      document.getElementById('map-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 100)
  }

  function handleMapChange({ lat, lng, address }) {
    setForm(f => ({
      ...f,
      location_lat:     lat,
      location_lng:     lng,
      location_address: address ?? f.location_address,
    }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!isAdminView && !form.name.trim()) {
      setError(t('El nombre del negocio es obligatorio.'))
      return
    }
    if (!isAdminView && form.geo_enabled && (form.location_lat == null || form.location_lng == null)) {
      setError(t('Debes marcar la ubicación de tu local en el mapa antes de activar la verificación de geo.'))
      return
    }
    // Validar bloques de horario (solo si el owner los edita)
    if (!isAdminView) {
      const blockError = validateBlocks(scheduleBlocks)
      if (blockError) { setError(blockError); return }
    }

    setSaving(true)
    setError(null)
    setSaved(false)

    // Horario de empresa (bloques), solo el owner puede crearlo/modificarlo
    if (!isAdminView) {
      try {
        await setSchedules.mutateAsync({ employeeId: null, blocks: blocksToPayload(scheduleBlocks) })
      } catch {
        setSaving(false)
        setError(t('No se pudo guardar el horario. Revisa que los días no se repitan entre bloques.'))
        return
      }
    }

    try {
      await api.patch('/business', isAdminView
        // An administrator with the settings permission can only change the tolerance.
        ? { tolerance_minutes: Number(form.tolerance_minutes) }
        : {
            name:               form.name.trim(),
            tax_id:             form.tax_id.trim() || null,
            timezone:           form.timezone,
            locale:             form.locale,
            tolerance_minutes:  Number(form.tolerance_minutes),
            geo_enabled:        form.geo_enabled,
            geo_radius_meters:  Number(form.geo_radius_meters),
            location_lat:       form.location_lat,
            location_lng:       form.location_lng,
            location_address:   form.location_address || null,
          })
      queryClient.invalidateQueries({ queryKey: ['schedules'] })
      await refreshBusiness()
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch {
      setError(t('No se pudo guardar. Intenta nuevamente.'))
    } finally {
      setSaving(false)
    }
  }

  if (!business) return null

  // Contenido "pelado" (sin tarjeta propia), se inserta dentro del panel
  // principal si el form es visible (canSettings), o se envuelve en su
  // propia tarjeta si un admin tiene manage_holidays pero no manage_settings
  // (permisos independientes, sin panel donde vivir).
  const feriadosContent = canHolidays && (
    <>
      <h2 className="text-sm font-semibold text-slate-800 mb-1">{t('Feriados')}</h2>
      <p className="text-xs text-slate-500 mb-4">
        {t('Los días de feriado no cuentan como falta. Haz clic en un día laboral para agregar un feriado del negocio.')}
      </p>
      <HolidayCalendar
        companyHolidays={holidays ?? []}
        restDays={restDays}
        canManage={canHolidays}
        loading={holidaysLoading || addHoliday.isPending || deleteHoliday.isPending}
        onAdd={async (date, name) => { await addHoliday.mutateAsync({ date, name }) }}
        onDelete={(id) => deleteHoliday.mutate({ id })}
      />
    </>
  )

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <h1 className="text-lg font-semibold text-slate-900 mb-6">{t('Configuración')}</h1>

      <AnimatePresence>
        {showGeoModal && (
          <GeoActivationModal
            key="geo-modal"
            onConfirm={handleGeoModalConfirm}
            onCancel={() => setShowGeoModal(false)}
          />
        )}
      </AnimatePresence>

      {canSettings && (
      <form onSubmit={handleSubmit} className="space-y-5 pb-2">

          {!isAdminView && (
            <section className="bg-white rounded-xl border border-slate-200 p-5">
              <h2 className="text-sm font-semibold text-slate-800 mb-4">{t('Datos del negocio')}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    {t('Nombre del negocio')}{' '}<span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="settings-name"
                    type="text"
                    required
                    value={form.name}
                    onChange={e => set('name', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    {t('Identificación fiscal')}{' '}<span className="text-slate-400 font-normal">{t('(opcional)')}</span>
                  </label>
                  <input
                    id="settings-tax-id"
                    type="text"
                    value={form.tax_id}
                    onChange={e => set('tax_id', e.target.value.slice(0, 50))}
                    maxLength={50}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder={t('RUC, NIT, RFC, EIN...')}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t('Zona horaria')}</label>
                  <select
                    id="settings-timezone"
                    value={form.timezone}
                    onChange={e => set('timezone', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    {timeZones.map(zone => <option key={zone} value={zone}>{zone}</option>)}
                  </select>
                  <p className="text-xs text-slate-400 mt-1">{t('Todas las horas se muestran en esta zona.')}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t('Idioma')}</label>
                  <select
                    id="settings-locale"
                    value={form.locale}
                    onChange={e => set('locale', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="es">{t('Español')}</option>
                    <option value="en">{t('English')}</option>
                  </select>
                </div>
              </div>
            </section>
          )}

          <section className="bg-white rounded-xl border border-slate-200 p-5">
              <div>
                <h2 className="text-sm font-semibold text-slate-800 mb-1">{t('Tolerancia de tardanza')}</h2>
                <p className="text-xs text-slate-500 mb-4">
                  {t('Minutos de gracia antes de marcar a un empleado como tarde.')}
                </p>
                <div className="flex items-center gap-3">
                  <input
                    id="settings-tolerance"
                    type="number"
                    min={0}
                    max={60}
                    value={form.tolerance_minutes}
                    onChange={e => set('tolerance_minutes', e.target.value)}
                    className="w-24 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <span className="text-sm text-slate-500">{t('minutos')}</span>
                </div>
              </div>

              <div className="mt-6 pt-6 border-t border-slate-200">
                <h2 className="text-sm font-semibold text-slate-800 mb-1">{t('Horario de empresa')}</h2>
                <p className="text-xs text-slate-500 mb-4">
                  {t('Define uno o más bloques. Usa varios bloques si algunos días tienen horario distinto (p. ej. sábados) o jornada partida. Puedes asignar horarios propios por empleado en la sección Empleados.')}
                </p>
                <ScheduleBlocksEditor blocks={scheduleBlocks} onChange={setScheduleBlocks} />
              </div>

              <div className="mt-6 pt-6 border-t border-slate-200">
                <ExceptionsSection />
              </div>
          </section>

          {!isAdminView && (
            <section id="map-section" className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div className="flex-1">
                  <h2 className="text-sm font-semibold text-slate-800">{t('Verificación de ubicación')}</h2>
                  <p className="text-xs text-slate-500 mt-1">
                    {t('Requiere que el empleado esté físicamente en tu local para registrar asistencia.')}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={form.geo_enabled}
                  onClick={handleGeoToggle}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                    form.geo_enabled ? 'bg-blue-600' : 'bg-slate-200'
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    form.geo_enabled ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </div>

              {/* Banner recomendación, desactivado */}
              {!form.geo_enabled && (
                <div className="flex gap-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <svg className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  </svg>
                  <div>
                    <p className="text-xs font-medium text-amber-800">{t('Recomendamos activar la verificación de ubicación')}</p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      {t('Sin esto, los empleados pueden registrar asistencia desde cualquier lugar.')}
                    </p>
                  </div>
                </div>
              )}

              {/* Mapa + radio, activado. El mapa va a ancho completo (se ve raro
                  angosto), y el radio permitido debajo en vez de al lado, ya que
                  es un solo campo corto y dejaba un hueco vacío junto al mapa. */}
              {form.geo_enabled && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      {t('Ubicación de tu local')}{' '}<span className="text-rose-500">*</span>
                    </label>
                    <Suspense fallback={<div className="h-72 bg-slate-100 rounded-lg animate-pulse" />}>
                      <MapPicker
                        lat={form.location_lat}
                        lng={form.location_lng}
                        radius={Number(form.geo_radius_meters) || 100}
                        onChange={handleMapChange}
                      />
                    </Suspense>
                    {form.location_address && (
                      <p className="text-xs text-slate-500 mt-1 truncate">{form.location_address}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      {t('Radio permitido')}
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="number"
                        min={10}
                        max={1000}
                        value={form.geo_radius_meters}
                        onChange={e => set('geo_radius_meters', e.target.value)}
                        className="w-24 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      <span className="text-sm text-slate-500">{t('metros desde el pin')}</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">{t('Recomendado: 100 metros.')}</p>
                  </div>

                  <GeoBlockedAttempts />
                </div>
              )}
            </section>
          )}

          {feriadosContent && (
            <section className="bg-white rounded-xl border border-slate-200 p-5">
              {feriadosContent}
            </section>
          )}

          {/* Barra de guardar, fija (sticky) al fondo del área con scroll,
              siempre visible sin importar cuánto hayas bajado en la página.
              Resuelve que el botón quedara "perdido" al final de un formulario
              largo, donde un cambio podía sentirse como guardado solo sin serlo.
              Fondo sólido (no semi-transparente): con opacidad se alcanzaba a
              ver el mapa detrás al hacer scroll, como si "cortara" el botón.
              Misma tarjeta redondeada que el resto, no una barra a todo lo
              ancho, así no rompe el lenguaje visual del resto de la página. */}
          <div className="sticky bottom-4 z-40 w-fit max-w-full bg-white border border-slate-200 rounded-xl shadow-lg px-5 py-3">
            {error && <p className="text-rose-600 text-sm mb-2 max-w-sm">{error}</p>}
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={saving}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2 px-5 rounded-lg text-sm transition-colors"
              >
                {saving ? t('Guardando...') : t('Guardar cambios')}
              </button>
              {saved && (
                <span className="text-sm text-green-600 flex items-center gap-1.5">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {t('Cambios guardados')}
                </span>
              )}
            </div>
          </div>

      </form>
      )}

      {/* Fallback: admin con manage_holidays pero sin manage_settings, Feriados
          no tiene dónde vivir dentro del form (que no se renderiza), así que
          se muestra suelto, en su propia tarjeta, a ancho completo. */}
      {!canSettings && feriadosContent && (
        <div className="mt-5 bg-white rounded-xl border border-slate-200 p-5">
          {feriadosContent}
        </div>
      )}
    </div>
  )
}
