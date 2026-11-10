// Pure adapters around two OpenStreetMap-based services (Photon, with Nominatim as a fallback).
// The client always receives lat, lng and address, whichever service answered.
export type GeocodingResult = { lat: number; lng: number; address: string }

const PHOTON = 'https://photon.komoot.io'
export const NOMINATIM = 'https://nominatim.openstreetmap.org'

export function photonSearchUrl(q: string): URL {
  const url = new URL(`${PHOTON}/api/`)
  url.search = new URLSearchParams({ q, limit: '5' }).toString()
  return url
}

export function photonReverseUrl(lat: number, lng: number): URL {
  const url = new URL(`${PHOTON}/reverse`)
  url.search = new URLSearchParams({ lat: String(lat), lon: String(lng) }).toString()
  return url
}

export function nominatimSearchUrl(q: string, language: string): string {
  return `${NOMINATIM}/search?q=${encodeURIComponent(q)}&format=jsonv2&limit=5&addressdetails=1&accept-language=${encodeURIComponent(language)}`
}

export function nominatimReverseUrl(lat: number, lng: number, language: string): string {
  return `${NOMINATIM}/reverse?lat=${lat}&lon=${lng}&format=jsonv2&accept-language=${encodeURIComponent(language)}`
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

export function photonAddress(value: unknown): string | null {
  const properties = object(value)
  const street = [text(properties.street), text(properties.housenumber)].filter(Boolean).join(' ')
  const parts = [
    properties.name,
    street,
    properties.locality,
    properties.district,
    properties.city,
    properties.county,
    properties.state,
    properties.country,
  ]
    .map(text)
    .filter(Boolean)
  // district and city often repeat the same name.
  return parts.filter((part, index) => part !== parts[index - 1]).join(', ') || null
}

function coordinates(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
  return typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
    ? { lat, lng }
    : null
}

export function parsePhotonSearch(data: unknown): GeocodingResult[] {
  const features = object(data).features
  if (!Array.isArray(features)) return []
  const results: GeocodingResult[] = []
  for (const value of features) {
    const feature = object(value)
    const geometry = object(feature.geometry)
    if (geometry.type !== 'Point' || !Array.isArray(geometry.coordinates)) continue
    const [lng, lat] = geometry.coordinates
    const point = coordinates(lat, lng)
    const address = photonAddress(feature.properties)
    if (point && address) results.push({ ...point, address })
    if (results.length === 5) break
  }
  return results
}

export function parsePhotonReverse(data: unknown): string | null {
  const features = object(data).features
  return photonAddress(Array.isArray(features) ? object(features[0]).properties : null)
}

export function parseNominatimSearch(data: unknown): GeocodingResult[] {
  if (!Array.isArray(data)) return []
  return data
    .flatMap((value) => {
      const item = object(value)
      const point = coordinates(Number.parseFloat(text(item.lat)), Number.parseFloat(text(item.lon)))
      const address = text(item.display_name)
      return point && address ? [{ ...point, address }] : []
    })
    .slice(0, 5)
}

export function parseNominatimReverse(data: unknown): string | null {
  return text(object(data).display_name) || null
}
