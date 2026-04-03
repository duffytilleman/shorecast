import { onMount, onCleanup } from 'solid-js'
import * as d3 from 'd3'
import type { Constituent } from '../lib/tides'

interface HarmonicCirclesProps {
  constituents: Constituent[]
}

const RAD = Math.PI / 180
const MS_HR = 3_600_000

const CHAIN_COLORS = [
  '#1a3a5c', '#6b5335', '#2a6a4a', '#8b4513',
  '#4a4a7a', '#7b5b3b', '#5a3a3a', '#3a5a5a',
]

export default function HarmonicCircles(props: HarmonicCirclesProps) {
  let container!: HTMLDivElement

  onMount(() => {
    let rafId = 0

    function setup() {
      cancelAnimationFrame(rafId)
      container.innerHTML = ''

      const rect = container.getBoundingClientRect()
      const width = Math.max(rect.width, 600)

      const sorted = [...props.constituents].sort((a, b) => b.amplitude - a.amplitude)
      const chain = sorted.slice(0, 8)
      const totalR = chain.reduce((s, c) => s + c.amplitude, 0)

      // Scale so epicycles fit in ~30% of width
      const pxPerFt = Math.min((width * 0.14) / totalR, 50)
      const epicycleCX = totalR * pxPerFt + 25
      const legendH = 36
      const height = Math.max(totalR * pxPerFt * 2 + 50 + legendH, 220)
      const cy = (height - legendH) / 2

      // Wave area
      const waveGap = 30
      const waveLeft = epicycleCX + totalR * pxPerFt + waveGap
      const waveRight = width - 15
      const backHrs = 2
      const fwdHrs = 10

      const yOf = (ft: number) => cy - ft * pxPerFt

      const svg = d3
        .select(container)
        .append('svg')
        .attr('viewBox', `0 0 ${width} ${height}`)
        .attr('class', 'harmonic-svg')

      // --- Static wave curve ---
      const now = Date.now()

      function tideFromChain(t: number) {
        const h = t / MS_HR
        let level = 0
        for (const c of chain) level += c.amplitude * Math.cos((c.speed * h - c.phase) * RAD)
        return level
      }

      const waveData: { mins: number; level: number }[] = []
      for (let m = -backHrs * 60; m <= fwdHrs * 60; m += 4) {
        waveData.push({ mins: m, level: tideFromChain(now + m * 60000) })
      }

      const wxScale = d3
        .scaleLinear()
        .domain([-backHrs * 60, fwdHrs * 60])
        .range([waveLeft, waveRight])

      // Zero line across wave
      svg
        .append('line')
        .attr('x1', waveLeft)
        .attr('x2', waveRight)
        .attr('y1', cy)
        .attr('y2', cy)
        .attr('stroke', '#8b7355')
        .attr('stroke-width', 0.5)
        .attr('stroke-opacity', 0.15)
        .attr('stroke-dasharray', '4,3')

      // Wave path
      const waveLine = d3
        .line<{ mins: number; level: number }>()
        .x((d) => wxScale(d.mins))
        .y((d) => yOf(d.level))
        .curve(d3.curveBasis)

      svg
        .append('path')
        .datum(waveData)
        .attr('d', waveLine)
        .attr('fill', 'none')
        .attr('stroke', '#1a3a5c')
        .attr('stroke-width', 1.5)
        .attr('stroke-opacity', 0.45)

      // Time tick marks on wave
      for (let h = -backHrs; h <= fwdHrs; h += 2) {
        const x = wxScale(h * 60)
        svg
          .append('line')
          .attr('x1', x)
          .attr('x2', x)
          .attr('y1', cy - 3)
          .attr('y2', cy + 3)
          .attr('stroke', '#8b7355')
          .attr('stroke-opacity', 0.25)
          .attr('stroke-width', 0.5)

        svg
          .append('text')
          .attr('x', x)
          .attr('y', height - legendH - 6)
          .attr('text-anchor', 'middle')
          .attr('class', h === 0 ? 'harmonic-name' : 'harmonic-value')
          .text(h === 0 ? 'now' : `${h > 0 ? '+' : ''}${h}h`)
      }

      // --- Epicycle chain elements (animated) ---
      const orbits: d3.Selection<SVGCircleElement, unknown, null, undefined>[] = []
      const armLines: d3.Selection<SVGLineElement, unknown, null, undefined>[] = []

      chain.forEach((c, i) => {
        const r = c.amplitude * pxPerFt
        const color = CHAIN_COLORS[i % CHAIN_COLORS.length]

        orbits.push(
          svg
            .append('circle')
            .attr('r', r)
            .attr('fill', 'none')
            .attr('stroke', color)
            .attr('stroke-width', 0.75)
            .attr('stroke-opacity', 0.2 + 0.1 * (1 - i / chain.length)),
        )

        armLines.push(
          svg
            .append('line')
            .attr('stroke', color)
            .attr('stroke-width', Math.max(2 - i * 0.15, 0.75))
            .attr('stroke-opacity', 0.55)
            .attr('stroke-linecap', 'round'),
        )
      })

      // Endpoint dot
      const endDot = svg
        .append('circle')
        .attr('r', 4.5)
        .attr('fill', '#c0392b')
        .attr('stroke', '#f0e6d3')
        .attr('stroke-width', 2)

      // Horizontal connector to wave
      const connector = svg
        .append('line')
        .attr('stroke', '#c0392b')
        .attr('stroke-width', 1)
        .attr('stroke-opacity', 0.35)
        .attr('stroke-dasharray', '4,3')

      // Dot on wave at "now"
      const waveDot = svg
        .append('circle')
        .attr('cx', wxScale(0))
        .attr('r', 3.5)
        .attr('fill', '#c0392b')
        .attr('stroke', '#f0e6d3')
        .attr('stroke-width', 1.5)

      // --- Legend ---
      const legendY = height - legendH + 14
      const legendItemW = Math.min((width - 40) / chain.length, 110)
      const legendStartX = (width - legendItemW * chain.length) / 2

      chain.forEach((c, i) => {
        const x = legendStartX + legendItemW * (i + 0.5)
        svg
          .append('circle')
          .attr('cx', x - 16)
          .attr('cy', legendY)
          .attr('r', 4)
          .attr('fill', CHAIN_COLORS[i % CHAIN_COLORS.length])
          .attr('fill-opacity', 0.7)
        svg
          .append('text')
          .attr('x', x - 8)
          .attr('y', legendY + 3.5)
          .attr('class', 'harmonic-legend-text')
          .text(c.description)
      })

      // --- Animation loop ---
      function animate() {
        const t = Date.now()
        const h = t / MS_HR

        let x = epicycleCX
        let y = cy

        chain.forEach((c, i) => {
          const r = c.amplitude * pxPerFt
          const theta = (c.speed * h - c.phase) * RAD

          orbits[i].attr('cx', x).attr('cy', y)

          const nx = x + r * Math.sin(theta)
          const ny = y - r * Math.cos(theta)

          armLines[i].attr('x1', x).attr('y1', y).attr('x2', nx).attr('y2', ny)

          x = nx
          y = ny
        })

        endDot.attr('cx', x).attr('cy', y)

        const waveNowX = wxScale(0)
        connector.attr('x1', x).attr('y1', y).attr('x2', waveNowX).attr('y2', y)
        waveDot.attr('cy', y)

        rafId = requestAnimationFrame(animate)
      }

      rafId = requestAnimationFrame(animate)
    }

    setup()

    const refreshInterval = setInterval(setup, 60_000)

    const observer = new ResizeObserver(() => setup())
    observer.observe(container)

    onCleanup(() => {
      cancelAnimationFrame(rafId)
      clearInterval(refreshInterval)
      observer.disconnect()
    })
  })

  return <div ref={container} class="harmonic-container" />
}
