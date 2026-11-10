import test from 'node:test'
import assert from 'node:assert/strict'
import { reportNote, reportStart } from './reportRange.js'

test('reportStart uses the day the employee was added when it is inside the period', () => {
  assert.equal(reportStart({ report_from: '2026-10-22' }, '2026-10-01'), '2026-10-22')
})

test('reportStart never goes before the start of the period', () => {
  assert.equal(reportStart({ report_from: '2026-09-15' }, '2026-10-01'), '2026-10-01')
  assert.equal(reportStart({ report_from: '2026-10-01' }, '2026-10-01'), '2026-10-01')
})

test('reportStart falls back to the period start without data', () => {
  assert.equal(reportStart({}, '2026-10-01'), '2026-10-01')
  assert.equal(reportStart(null, '2026-10-01'), '2026-10-01')
  assert.equal(reportStart(undefined, '2026-10-01'), '2026-10-01')
})

test('reportNote only appears when someone was cut short', () => {
  assert.equal(reportNote([{ report_from: '2026-09-01' }, { report_from: '2026-10-01' }], '2026-10-01'), '')
  assert.match(reportNote([{ report_from: '2026-10-22' }], '2026-10-01'), /fecha de alta/)
  assert.equal(reportNote([], '2026-10-01'), '')
  assert.equal(reportNote(undefined, '2026-10-01'), '')
})
