// Pruebas de requestLocation. Correr con: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { requestLocation, GEO_MESSAGES } from './geolocation.js'

// Geolocalización falsa: registra cómo se la llamó y responde lo que se le pida
function fakeGeo({ coords, error }) {
  const geo = {
    llamadas: [],
    getCurrentPosition(ok, fail, options) {
      geo.llamadas.push(options)
      if (error !== undefined) fail(error)
      else ok({ coords })
    },
  }
  return geo
}

test('activada + dispositivo sin geolocalización: se bloquea con mensaje claro', async () => {
  await assert.rejects(requestLocation(true, null), { message: GEO_MESSAGES.unsupported })
})

test('desactivada + dispositivo sin geolocalización: sigue sin coordenadas, sin bloquear', async () => {
  assert.deepEqual(await requestLocation(false, null), { lat: null, lng: null, accuracy: null })
})

test('activada + permiso denegado: se bloquea pidiendo permitir la ubicación', async () => {
  await assert.rejects(requestLocation(true, fakeGeo({ error: { code: 1 } })), { message: GEO_MESSAGES.denied })
})

test('activada + GPS apagado o no disponible: se bloquea pidiendo activar la ubicación', async () => {
  await assert.rejects(requestLocation(true, fakeGeo({ error: { code: 2 } })), { message: GEO_MESSAGES.unavailable })
})

test('activada + tiempo agotado: se bloquea con mensaje de tiempo', async () => {
  await assert.rejects(requestLocation(true, fakeGeo({ error: { code: 3 } })), { message: GEO_MESSAGES.timeout })
})

test('activada + ubicación obtenida: devuelve coordenadas y precisión', async () => {
  const geo = fakeGeo({ coords: { latitude: -12.0464, longitude: -77.0428, accuracy: 18 } })
  assert.deepEqual(await requestLocation(true, geo), { lat: -12.0464, lng: -77.0428, accuracy: 18 })
})

test('la lectura es siempre fresca: nunca se reusa una posición guardada', async () => {
  const geo = fakeGeo({ coords: { latitude: 1, longitude: 2, accuracy: 5 } })
  await requestLocation(true, geo)
  assert.equal(geo.llamadas.length, 1)
  assert.equal(geo.llamadas[0].maximumAge, 0)
  assert.ok(Number.isFinite(geo.llamadas[0].timeout), 'tiene que tener un tiempo máximo de espera')
})

test('sin precisión informada: accuracy queda en null (el servidor aplica margen 0)', async () => {
  const geo = fakeGeo({ coords: { latitude: 1, longitude: 2 } })
  assert.deepEqual(await requestLocation(true, geo), { lat: 1, lng: 2, accuracy: null })
})

test('coordenadas inválidas (NaN / vacías) nunca se aceptan cuando es obligatoria', async () => {
  for (const coords of [{ latitude: NaN, longitude: 2 }, { latitude: 1, longitude: undefined }, {}, null]) {
    await assert.rejects(requestLocation(true, fakeGeo({ coords })), { message: GEO_MESSAGES.unavailable })
  }
})

test('activada: NINGUNA falla puede terminar en coordenadas vacías', async () => {
  const errores = [{ code: 1 }, { code: 2 }, { code: 3 }, { code: 99 }, {}, null, 'boom', new Error('x')]
  for (const error of errores) {
    await assert.rejects(requestLocation(true, fakeGeo({ error })), Error, `error ${JSON.stringify(error)} debía bloquear`)
  }
})

test('desactivada + permiso denegado: no se bloquea (la verificación de ubicación está apagada)', async () => {
  assert.deepEqual(await requestLocation(false, fakeGeo({ error: { code: 1 } })), { lat: null, lng: null, accuracy: null })
})
