import test from 'node:test'
import assert from 'node:assert/strict'
import { estadoConJustificacion } from './attendance.js'

const justification = { id: 'x', type: 'vacaciones', status: 'approved' }

test('a person with a justified absence is shown as justified, whether the day is still going or over', () => {
  assert.equal(estadoConJustificacion('ausente', justification), 'justificado')
  assert.equal(estadoConJustificacion('falta', justification), 'justificado')
})

test('without a justification the status stays as it is', () => {
  assert.equal(estadoConJustificacion('ausente', null), 'ausente')
  assert.equal(estadoConJustificacion('falta', undefined), 'falta')
})

test('a justification never hides that someone did show up', () => {
  assert.equal(estadoConJustificacion('asistio', justification), 'asistio')
  assert.equal(estadoConJustificacion('pendiente', justification), 'pendiente')
  assert.equal(estadoConJustificacion('no_iniciado', justification), 'no_iniciado')
})
