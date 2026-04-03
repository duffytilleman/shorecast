import { astro, constituents as constituentModels, createTidePredictor } from '@neaps/tide-predictor'

export interface Constituent {
  name?: string
  amplitude: number // feet
  phase: number // degrees
  speed: number // degrees / hr
  description: string
}

export interface ConstituentVector {
  dx: number
  dy: number
  level: number
  radius: number
  theta: number
}

const RAD_PER_DEG = Math.PI / 180
export const BERKELEY_MEAN_SEA_LEVEL_FEET = 3.28
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

export function getConstituentVector(ts: number, constituent: Constituent): ConstituentVector {
  const model = constituent.name ? constituentModels[constituent.name] : undefined

  if (!model) {
    const hours = ts / (1000 * 3600)
    const theta = (constituent.speed * hours - normalizePhaseToUtc(constituent)) * RAD_PER_DEG
    const level = constituent.amplitude * Math.cos(theta)
    return {
      dx: constituent.amplitude * Math.sin(theta),
      dy: -level,
      level,
      radius: constituent.amplitude,
      theta,
    }
  }

  const astronomicalState = astro(new Date(ts))
  const correction = model.correction(astronomicalState)
  const radius = constituent.amplitude * correction.f
  const theta = (model.value(astronomicalState) + correction.u - normalizePhaseToUtc(constituent)) * RAD_PER_DEG
  const level = radius * Math.cos(theta)

  return {
    dx: radius * Math.sin(theta),
    dy: -level,
    level,
    radius,
    theta,
  }
}

export function constit(ts: number, { amplitude, phase, speed }: Constituent) {
  return getConstituentVector(ts, { amplitude, phase, speed, description: '' }).level
}

export function predictTide(ts: number, constituents: Constituent[]): number {
  return getPredictor(constituents).getWaterLevelAtTime({ time: new Date(ts) }).level
}
