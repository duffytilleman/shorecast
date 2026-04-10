import assert from 'node:assert/strict'
import test from 'node:test'
import { formatStationName } from './format.ts'

test('title-cases a simple uppercase name', () => {
  assert.equal(formatStationName('SAN FRANCISCO'), 'San Francisco')
})

test('adds space after comma', () => {
  assert.equal(formatStationName('BERKELEY,S.F.BAY'), 'Berkeley, S.F.Bay')
})

test('handles multiple commas', () => {
  assert.equal(formatStationName('PORT ORFORD,OR'), 'Port Orford, Or')
})

test('leaves already-formatted names unchanged', () => {
  assert.equal(formatStationName('San Francisco'), 'San Francisco')
})

test('handles empty string', () => {
  assert.equal(formatStationName(''), '')
})

test('preserves spaces after commas that already exist', () => {
  assert.equal(formatStationName('NEWPORT, RI'), 'Newport, Ri')
})
