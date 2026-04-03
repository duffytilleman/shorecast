export interface Constituent {
  amplitude: number // feet
  phase: number // degrees
  speed: number // degrees / hr
  description: string
}

const RAD_PER_DEG = Math.PI / 180
const MS_PER_HOUR = 1000 * 3600

export function constit(ts: number, { amplitude, phase, speed }: Constituent) {
  const hrs = ts / MS_PER_HOUR
  return amplitude * Math.cos((speed * hrs - phase) * RAD_PER_DEG)
}

export function predictTide(ts: number, constituents: Constituent[]): number {
  return constituents.reduce((sum, c) => sum + constit(ts, c), 0)
}
