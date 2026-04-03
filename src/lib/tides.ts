import { astro, constituents as constituentModels, createTidePredictor } from '@neaps/tide-predictor'

export interface Constituent {
  name?: string
  amplitude: number // feet
  phase: number // degrees, GMT
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

const predictorCache = new WeakMap<Constituent[], ReturnType<typeof createTidePredictor>>()

function getPredictor(constituents: Constituent[], meanSeaLevel: number) {
  const cached = predictorCache.get(constituents)
  if (cached) {
    return cached
  }

  const predictor = createTidePredictor(
    constituents.map(({ name, amplitude, phase, speed, description }) => ({
      name: name ?? description,
      amplitude,
      phase,
      speed,
      description,
    })),
    { offset: meanSeaLevel },
  )

  predictorCache.set(constituents, predictor)
  return predictor
}

export function getConstituentVector(ts: number, constituent: Constituent): ConstituentVector {
  const model = constituent.name ? constituentModels[constituent.name] : undefined

  if (!model) {
    const hours = ts / (1000 * 3600)
    const theta = (constituent.speed * hours - constituent.phase) * RAD_PER_DEG
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
  const theta = (model.value(astronomicalState) + correction.u - constituent.phase) * RAD_PER_DEG
  const level = radius * Math.cos(theta)

  return {
    dx: radius * Math.sin(theta),
    dy: -level,
    level,
    radius,
    theta,
  }
}

export function predictTide(ts: number, constituents: Constituent[], meanSeaLevel: number): number {
  return getPredictor(constituents, meanSeaLevel).getWaterLevelAtTime({ time: new Date(ts) }).level
}
