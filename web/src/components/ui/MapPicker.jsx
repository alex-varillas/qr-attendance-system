import { useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, Marker, Circle, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'
import { api } from '../../lib/api'
import { t } from '../../i18n'

// Fix ícono de Leaflet con Vite
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl:       markerIcon,
  shadowUrl:     markerShadow,
})

// Componente interno que captura clicks en el mapa
function ClickHandler({ onSelect }) {
  useMapEvents({
    click(e) {
      onSelect({ lat: e.latlng.lat, lng: e.latlng.lng })
    },
  })
  return null
}

// With no pin yet, the map opens on `defaultCenter` (the saved place of the business) or on a world view.
const WORLD_CENTER = [20, 0]

export default function MapPicker({ lat, lng, radius = 100, defaultCenter = null, onChange }) {
  const [searchQuery, setSearchQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState(null)
  const [suggestions, setSuggestions] = useState([])
  const mapRef = useRef(null)
  const mapWrapRef = useRef(null)
  const debounceRef = useRef(null)
  const reqIdRef = useRef(0)

  const hasPin = lat != null && lng != null
  const center = hasPin ? [lat, lng] : (defaultCenter ?? WORLD_CENTER)

  function handleSelect({ lat: newLat, lng: newLng }) {
    onChange({ lat: newLat, lng: newLng })
    // Reverse geocoding (through the server) to get the address.
    // Fallo silencioso: el pin se coloca igual aunque no haya dirección.
    api.post('/geocode', { mode: 'reverse', lat: newLat, lng: newLng })
      .then((data) => {
        if (data?.address) onChange({ lat: newLat, lng: newLng, address: data.address })
      })
      .catch(() => {})
  }

  function pickResult(r) {
    onChange({ lat: r.lat, lng: r.lng, address: r.address })
    mapRef.current?.setView([r.lat, r.lng], 17)
    setSuggestions([])
    setSearchQuery(r.address)
    setSearchError(null)
  }

  // Busca en la edge function e ignora respuestas obsoletas (out-of-order).
  async function runSearch(q) {
    const id = ++reqIdRef.current
    setSearching(true)
    setSearchError(null)
    try {
      const data = await api.post('/geocode', { mode: 'search', q })
      if (id !== reqIdRef.current) return // llegó tarde: ya hay una búsqueda más nueva
      if (data?.error) {
        setSuggestions([])
        setSearchError(t('No pudimos buscar la dirección ahora. Intenta de nuevo o haz clic en el mapa.'))
        return
      }
      const found = data?.results ?? []
      setSuggestions(found)
      if (!found.length) {
        setSearchError(t('No se encontró esa dirección. Prueba con otra o haz clic en el mapa.'))
      }
    } catch {
      if (id !== reqIdRef.current) return
      setSuggestions([])
      setSearchError(t('No pudimos buscar la dirección ahora. Intenta de nuevo o haz clic en el mapa.'))
    } finally {
      if (id === reqIdRef.current) setSearching(false)
    }
  }

  // Autocompletado: dispara la búsqueda con debounce mientras el usuario escribe.
  function handleQueryChange(value) {
    setSearchQuery(value)
    setSearchError(null)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const q = value.trim()
    if (q.length < 3) {
      setSuggestions([])
      return
    }
    debounceRef.current = setTimeout(() => runSearch(q), 500)
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (suggestions.length) { pickResult(suggestions[0]); return }
    const q = searchQuery.trim()
    if (q.length >= 3) runSearch(q)
  }

  // Limpiar el timer pendiente al desmontar
  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current) }, [])

  // Centrar mapa cuando cambian las coordenadas desde fuera (hasPin sale de lat y lng)
  useEffect(() => {
    if (hasPin && mapRef.current) {
      mapRef.current.setView([lat, lng], mapRef.current.getZoom())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng])

  // Leaflet calcula su tamaño una sola vez al montar. Si el layout de la
  // página cambia el ancho de este contenedor después (como pasó al mover
  // el mapa a ancho completo), Leaflet se queda con el tamaño viejo y deja
  // sin pintar la parte nueva (se ve gris). El ResizeObserver le avisa que
  // recalcule cada vez que el contenedor cambia de tamaño.
  useEffect(() => {
    if (!mapWrapRef.current) return
    const observer = new ResizeObserver(() => {
      mapRef.current?.invalidateSize()
    })
    observer.observe(mapWrapRef.current)
    return () => observer.disconnect()
  }, [])

  return (
    // `isolate` crea un contexto de apilamiento propio para todo el picker:
    // Leaflet usa z-index internos altos (hasta ~800 en sus controles) que,
    // sin esto, comparaban directo contra elementos de la página (como una
    // barra "sticky" con z-index bajo) y le ganaban, el mapa se pintaba
    // por encima de contenido que debía quedar arriba de él.
    <div className="relative isolate space-y-2">
      {/* Buscador de dirección con autocompletado en vivo */}
      <form onSubmit={handleSubmit} className="relative">
        <input
          type="text"
          value={searchQuery}
          onChange={e => handleQueryChange(e.target.value)}
          placeholder={t('Escribe la dirección de tu local...')}
          autoComplete="off"
          className="w-full px-3 py-2 pr-9 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        {searching && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 animate-pulse">…</span>
        )}
        {/* Sugerencias en vivo (se superponen al mapa) */}
        {suggestions.length > 0 && (
          <ul className="absolute z-[1000] left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg divide-y divide-slate-100 overflow-hidden max-h-60 overflow-y-auto">
            {suggestions.map((r, i) => (
              <li key={i}>
                <button
                  type="button"
                  onMouseDown={e => { e.preventDefault(); pickResult(r) }}
                  className="w-full text-left px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  {r.address}
                </button>
              </li>
            ))}
          </ul>
        )}
      </form>

      {searchError && (
        <p className="text-xs text-rose-600">{searchError}</p>
      )}

      {/* Mapa */}
      <div ref={mapWrapRef} className="rounded-lg overflow-hidden border border-slate-200 h-[220px] sm:h-[280px]">
        <MapContainer
          center={center}
          zoom={hasPin ? 16 : defaultCenter ? 13 : 2}
          style={{ height: '100%', width: '100%' }}
          ref={mapRef}
        >
          {/* Teselas de OpenStreetMap: las de CARTO pasaron a exigir API key y
              devolvían la imagen "API KEY REQUIRED" en cada cuadro. */}
          <TileLayer
            attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
          />
          <ClickHandler onSelect={handleSelect} />
          {hasPin && (
            <>
              <Marker position={[lat, lng]} />
              <Circle
                center={[lat, lng]}
                radius={radius}
                pathOptions={{ color: '#2563eb', fillColor: '#3b82f6', fillOpacity: 0.15, weight: 2 }}
              />
            </>
          )}
        </MapContainer>
      </div>

      <p className="text-xs text-slate-400">
        {hasPin
          ? t('Pin colocado: {0}, {1}', [lat.toFixed(6), lng.toFixed(6)])
          : t('Escribe tu dirección y elige una opción, o haz clic en el mapa para marcar la ubicación de tu local')}
      </p>
    </div>
  )
}
