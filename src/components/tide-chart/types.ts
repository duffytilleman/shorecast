import type * as d3 from 'd3'

export interface ChartContext {
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>
  xScale: d3.ScaleTime<number, number>
  yScale: d3.ScaleLinear<number, number>
  margin: { top: number; right: number; bottom: number; left: number }
  width: number
  height: number
  now: number
}

export interface OverlayScales {
  tempScale: d3.ScaleLinear<number, number> | null
  tempAxisX: number
  windScale: d3.ScaleLinear<number, number> | null
  windAxisX: number
}

export function findHighLowTides(
  data: { time: number; level: number }[],
): { time: number; level: number; type: 'high' | 'low' }[] {
  const extremes: { time: number; level: number; type: 'high' | 'low' }[] = []
  for (let i = 1; i < data.length - 1; i++) {
    const prev = data[i - 1].level
    const curr = data[i].level
    const next = data[i + 1].level
    if (curr > prev && curr > next) {
      extremes.push({ time: data[i].time, level: curr, type: 'high' })
    } else if (curr < prev && curr < next) {
      extremes.push({ time: data[i].time, level: curr, type: 'low' })
    }
  }
  return extremes
}

export function findNearest<T extends { time: number }>(arr: T[], time: number, maxDist = 60 * 60 * 1000): T | null {
  if (!arr.length) return null
  let best = arr[0]
  let bestDist = Math.abs(arr[0].time - time)
  for (let i = 1; i < arr.length; i++) {
    const dist = Math.abs(arr[i].time - time)
    if (dist < bestDist) { best = arr[i]; bestDist = dist }
    else break
  }
  return bestDist < maxDist ? best : null
}
