import test from 'node:test'
import assert from 'node:assert/strict'
import { getLocale, setLocale, t, tn } from './index.js'
import { serverMessage } from './serverMessages.js'
import { weekdayInitials, monthName } from '../utils/dates.js'

test.afterEach(() => setLocale('es'))

test('Spanish is the source: a text comes back as written, with its values filled in', () => {
  setLocale('es')
  assert.equal(t('Guardar'), 'Guardar')
  assert.equal(t('Hola, {0} 👋', ['Ana']), 'Hola, Ana 👋')
})

test('English translates the text and fills in the values', () => {
  setLocale('en')
  assert.equal(t('Guardar'), 'Save')
  assert.equal(t('Hola, {0} 👋', ['Ana']), 'Hello, Ana 👋')
})

test('a text without translation stays in Spanish instead of breaking the screen', () => {
  setLocale('en')
  assert.equal(t('Un texto que todavía no existe'), 'Un texto que todavía no existe')
})

test('an unknown language is ignored', () => {
  setLocale('en')
  setLocale('fr')
  assert.equal(getLocale(), 'en')
})

test('tn picks the singular for exactly one and the plural for any other quantity', () => {
  setLocale('en')
  assert.equal(tn(1, '{0} reporte', '{0} reportes'), '1 report')
  assert.equal(tn(0, '{0} reporte', '{0} reportes'), '0 reports')
  assert.equal(tn(3, '{0} reporte', '{0} reportes'), '3 reports')
  setLocale('es')
  assert.equal(tn(1, '{0} reporte', '{0} reportes'), '1 reporte')
  assert.equal(tn(3, '{0} reporte', '{0} reportes'), '3 reportes')
})

test('messages of the server are shown in Spanish on a Spanish screen and untouched in English', () => {
  setLocale('es')
  assert.equal(serverMessage('Incorrect email or password'), 'Correo o contraseña incorrectos')
  assert.equal(serverMessage('The range cannot exceed 366 days'), 'El rango no puede superar 366 días')
  assert.equal(serverMessage('Some message nobody translated'), 'Some message nobody translated')
  setLocale('en')
  assert.equal(serverMessage('Incorrect email or password'), 'Incorrect email or password')
})

test('weekday initials and month names follow the language', () => {
  setLocale('es')
  assert.deepEqual(weekdayInitials(), ['L', 'M', 'X', 'J', 'V', 'S', 'D'])
  setLocale('en')
  assert.deepEqual(weekdayInitials(), ['M', 'T', 'W', 'T', 'F', 'S', 'S'])
  assert.equal(monthName(0), 'January')
  setLocale('es')
  assert.equal(monthName(0).toLowerCase(), 'enero')
})
