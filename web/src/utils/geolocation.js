import { t } from '../i18n/index.js'
// Pide la ubicación del dispositivo para el check-in.
//
// Regla: cuando la empresa/sede tiene la verificación de ubicación activada
// (required = true) NUNCA se devuelven coordenadas vacías. Si no se puede
// obtener la ubicación (el navegador no lo soporta, el usuario negó el permiso,
// el GPS está apagado o se agotó el tiempo) se lanza un Error con un mensaje
// para mostrarle al usuario, y el check-in no continúa. El servidor aplica la
// misma regla por su cuenta (rechaza la marcación sin coordenadas), esto
// solo evita el viaje y explica qué hacer.
//
// La lectura siempre es fresca (maximumAge: 0): nunca se reusa una posición
// vieja de otro momento o de otro lugar. El navegador solo muestra el aviso de
// permiso la primera vez (o si el usuario lo había negado); si ya lo había
// permitido, la ubicación se lee igual, en silencio, en cada marcación.

export const GEO_MESSAGES = {
  get unsupported() { return t('Tu dispositivo no soporta geolocalización.') },
  get denied() { return t('Debes permitir el acceso a tu ubicación para registrar asistencia. Activa el permiso en tu navegador e intenta nuevamente.') },
  get unavailable() { return t('No pudimos obtener tu ubicación. Activa la ubicación (GPS) de tu dispositivo e intenta nuevamente.') },
  get timeout() { return t('Tardó demasiado en obtener tu ubicación. Acércate a una ventana o al exterior e intenta nuevamente.') },
}

const GEO_OPTIONS = { timeout: 8000, maximumAge: 0 }

function messageFor(err) {
  switch (err?.code) {
    case 1: return GEO_MESSAGES.denied       // PERMISSION_DENIED
    case 3: return GEO_MESSAGES.timeout      // TIMEOUT
    default: return GEO_MESSAGES.unavailable // POSITION_UNAVAILABLE u otro error
  }
}

// `geolocation` es inyectable para poder probarlo sin un navegador real.
export async function requestLocation(required, geolocation = globalThis.navigator?.geolocation) {
  const vacio = { lat: null, lng: null, accuracy: null }

  if (!geolocation) {
    if (required) throw new Error(GEO_MESSAGES.unsupported)
    return vacio
  }

  try {
    const pos = await new Promise((resolve, reject) =>
      geolocation.getCurrentPosition(resolve, reject, GEO_OPTIONS)
    )
    const { latitude, longitude, accuracy } = pos?.coords ?? {}
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw Object.assign(new Error(t('coordenadas inválidas')), { code: 2 })
    }
    return { lat: latitude, lng: longitude, accuracy: Number.isFinite(accuracy) ? accuracy : null }
  } catch (err) {
    if (required) throw new Error(messageFor(err))
    return vacio
  }
}
