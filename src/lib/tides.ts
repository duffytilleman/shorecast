import { createTidePredictor } from '@neaps/tide-predictor'

export interface Constituent {
  name?: string
  amplitude: number // feet
  phase: number // degrees
  speed: number // degrees / hr
  description: string
}

const RAD_PER_DEG = Math.PI / 180
const MS_PER_HOUR = 1000 * 3600
const BERKELEY_MEAN_SEA_LEVEL_FEET = 3.28
const PACIFIC_STANDARD_TIME_OFFSET_HOURS = 8

const predictorCache = new WeakMap<Constituent[], ReturnType<typeof createTidePredictor>>()

function normalizePhaseToUtc({ phase, speed }: Constituent) {
  // NOAA's station constituent table was exported in local standard time.
  return phase + speed * PACIFIC_STANDARD_TIME_OFFSET_HOURS
}

function getPredictor(constituents: Constituent[]) {
  const cached = predictorCache.get(constituents)
  if (cached) {
    return cached
  }

  const predictor = createTidePredictor(
    constituents.map(({ name, amplitude, phase, speed, description }) => ({
      name: name ?? description,
      amplitude,
      phase: normalizePhaseToUtc({ name, amplitude, phase, speed, description }),
      speed,
      description,
    })),
    { offset: BERKELEY_MEAN_SEA_LEVEL_FEET },
  )

  predictorCache.set(constituents, predictor)
  return predictor
}

export function constit(ts: number, { amplitude, phase, speed }: Constituent) {
  const hrs = ts / MS_PER_HOUR
  return amplitude * Math.cos((speed * hrs - normalizePhaseToUtc({ amplitude, phase, speed, description: '' })) * RAD_PER_DEG)
}

export function predictTide(ts: number, constituents: Constituent[]): number {
  return getPredictor(constituents).getWaterLevelAtTime({ time: new Date(ts) }).level
}
