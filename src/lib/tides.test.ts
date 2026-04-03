import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { predictTide } from './tides.ts'

interface FixtureRow {
  date: string
  time: string
  levelFeet: number
}

interface Constituent {
  name: string
  amplitude: number
  phase: number
  speed: number
  description: string
}

function parsePacificDateTime(date: string, time: string) {
  const [year, month, day] = date.split('/').map(Number)
  const [clock, meridiem] = time.split(' ')
  const [rawHour, minute] = clock.split(':').map(Number)

  let hour = rawHour % 12
  if (meridiem === 'PM') {
    hour += 12
  }

  // The NOAA sample is for early April in Berkeley, which is PDT (UTC-7).
  return Date.UTC(year, month - 1, day, hour + 7, minute)
}

function parseFixture(csv: string): FixtureRow[] {
  return csv
    .trim()
    .split('\n')
    .slice(1)
    .map((line) => {
      const [date, _day, time, levelFeet] = line.split(',')
      return {
        date,
        time,
        levelFeet: Number(levelFeet),
      }
    })
}

const fixtureCsv = readFileSync(
  new URL('../fixtures/noaa-9414816-2026-04-02-2026-04-03.csv', import.meta.url),
  'utf8',
)

const harconJson = JSON.parse(
  readFileSync(
    new URL('../fixtures/noaa-9414816-harcon.json', import.meta.url),
    'utf8',
  ),
)

const datumsJson = JSON.parse(
  readFileSync(
    new URL('../fixtures/noaa-9414816-datums.json', import.meta.url),
    'utf8',
  ),
)

const fixture = parseFixture(fixtureCsv)

const constituents: Constituent[] = harconJson.HarmonicConstituents.map((h: any) => ({
  name: h.name,
  amplitude: h.amplitude,
  phase: h.phase_GMT,
  speed: h.speed,
  description: h.description,
}))

const msl = datumsJson.datums.find((d: any) => d.name === 'MSL').value
const mllw = datumsJson.datums.find((d: any) => d.name === 'MLLW').value
const meanSeaLevel = msl - mllw

function predictionFor(row: FixtureRow) {
  return predictTide(parsePacificDateTime(row.date, row.time), constituents, meanSeaLevel)
}

test('predictTide matches known NOAA hourly predictions at representative timestamps', () => {
  const sample = [fixture[0], fixture[8], fixture[15], fixture[32], fixture[39], fixture[47]]

  for (const row of sample) {
    assert.ok(
      Math.abs(predictionFor(row) - row.levelFeet) < 0.1,
      `expected ${row.date} ${row.time} to be within 0.1 ft of ${row.levelFeet}, got ${predictionFor(row)}`,
    )
  }
})

test('predictTide stays within 0.25 ft RMSE across the full 48-hour NOAA sample', () => {
  const squaredError = fixture.reduce((sum, row) => {
    const error = predictionFor(row) - row.levelFeet
    return sum + error * error
  }, 0)

  const rmse = Math.sqrt(squaredError / fixture.length)
  assert.ok(rmse < 0.25, `expected RMSE < 0.25 ft, got ${rmse}`)
})
