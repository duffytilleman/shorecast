import { onMount, onCleanup, createSignal } from 'solid-js'
import * as d3 from 'd3'
import type { Constituent } from '../lib/tides'

interface HarmonicCirclesProps {
  constituents: Constituent[]
}

const RAD = Math.PI / 180
const MS_HR = 3_600_000
const RANGE_HRS = 12

const CHAIN_COLORS = [
  '#1a3a5c', '#6b5335', '#2a6a4a', '#8b4513',
  '#4a4a7a', '#7b5b3b', '#5a3a3a', '#3a5a5a',
]

const RATES = [60, 360, 720, 3600]

export default function HarmonicCircles(props: HarmonicCirclesProps) {
  let svgBox!: HTMLDivElement
  let scrubberEl!: HTMLInputElement
  let timeLabelEl!: HTMLSpanElement

  const anchorTime = Date.now()
  const scrubMin = anchorTime - RANGE_HRS * MS_HR
  const scrubMax = anchorTime + RANGE_HRS * MS_HR

  const [mode, setMode] = createSignal<'live' | 'playing' | 'paused'>('live')
  const [playRate, setPlayRate] = createSignal(360)

  let playAnchorReal = 0
  let playAnchorSim = 0
  let frozenTime = anchorTime

  function getTime(): number {
    if (mode() === 'live') return Date.now()
    if (mode() === 'playing') {
      return playAnchorSim + (Date.now() - playAnchorReal) * playRate()
    }
    return frozenTime
  }

  function play() {
    playAnchorSim = getTime()
    playAnchorReal = Date.now()
    setMode('playing')
  }

  function pause() {
    frozenTime = getTime()
    setMode('paused')
  }

  function goLive() {
    setMode('live')
  }

  function changeRate(r: number) {
    if (mode() === 'playing') {
      playAnchorSim = getTime()
      playAnchorReal = Date.now()
    }
    setPlayRate(r)
  }

  function scrub(t: number) {
    frozenTime = t
    setMode('paused')
  }

  onMount(() => {
    let rafId = 0

    function setup() {
      cancelAnimationFrame(rafId)
      svgBox.innerHTML = ''

      const rect = svgBox.getBoundingClientRect()
      const width = Math.max(rect.width, 600)

      const sorted = [...props.constituents].sort((a, b) => b.amplitude - a.amplitude)
      const chain = sorted.slice(0, 8)
      const totalR = chain.reduce((s, c) => s + c.amplitude, 0)

      const pxPerFt = Math.min((width * 0.14) / totalR, 50)
      const epicycleCX = totalR * pxPerFt + 25
      const legendH = 36
      const height = Math.max(totalR * pxPerFt * 2 + 50 + legendH, 220)
      const cy = (height - legendH) / 2

      const waveGap = 30
      const waveLeft = epicycleCX + totalR * pxPerFt + waveGap
      const waveRight = width - 15
      const yOf = (ft: number) => cy - ft * pxPerFt

      const svg = d3
        .select(svgBox)
        .append('svg')
        .attr('viewBox', `0 0 ${width} ${height}`)
        .attr('class', 'harmonic-svg')

      // --- Wave curve (covers full scrubber range) ---
      function tideFromChain(t: number) {
        const h = t / MS_HR
        let level = 0
        for (const c of chain) level += c.amplitude * Math.cos((c.speed * h - c.phase) * RAD)
        return level
      }

      const waveData: { mins: number; level: number }[] = []
      for (let m = -RANGE_HRS * 60; m <= RANGE_HRS * 60; m += 4) {
        waveData.push({ mins: m, level: tideFromChain(anchorTime + m * 60000) })
      }

      const wxScale = d3
        .scaleLinear()
        .domain([-RANGE_HRS * 60, RANGE_HRS * 60])
        .range([waveLeft, waveRight])

      // Zero line
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
      svg
        .append('path')
        .datum(waveData)
        .attr(
          'd',
          d3
            .line<{ mins: number; level: number }>()
            .x((d) => wxScale(d.mins))
            .y((d) => yOf(d.level))
            .curve(d3.curveBasis),
        )
        .attr('fill', 'none')
        .attr('stroke', '#1a3a5c')
        .attr('stroke-width', 1.5)
        .attr('stroke-opacity', 0.45)

      // Time ticks
      for (let h = -RANGE_HRS; h <= RANGE_HRS; h += 3) {
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
      }

      // --- Epicycle elements ---
      const orbits: d3.Selection<SVGCircleElement, unknown, null, undefined>[] = []
      const armLines: d3.Selection<SVGLineElement, unknown, null, undefined>[] = []

      chain.forEach((c, i) => {
        const r = c.amplitude * pxPerFt
        const color = CHAIN_COLORS[i]
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

      const endDot = svg
        .append('circle')
        .attr('r', 4.5)
        .attr('fill', '#c0392b')
        .attr('stroke', '#f0e6d3')
        .attr('stroke-width', 2)

      const connector = svg
        .append('line')
        .attr('stroke', '#c0392b')
        .attr('stroke-width', 1)
        .attr('stroke-opacity', 0.35)
        .attr('stroke-dasharray', '4,3')

      const waveDot = svg
        .append('circle')
        .attr('r', 3.5)
        .attr('fill', '#c0392b')
        .attr('stroke', '#f0e6d3')
        .attr('stroke-width', 1.5)

      // Time marker line on wave
      const timeMarker = svg
        .append('line')
        .attr('stroke', '#c0392b')
        .attr('stroke-width', 1)
        .attr('stroke-opacity', 0.2)
        .attr('stroke-dasharray', '2,2')

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
          .attr('fill', CHAIN_COLORS[i])
          .attr('fill-opacity', 0.7)
        svg
          .append('text')
          .attr('x', x - 8)
          .attr('y', legendY + 3.5)
          .attr('class', 'harmonic-legend-text')
          .text(c.description)
      })

      // --- Animation loop ---
      const fmt = d3.timeFormat('%-I:%M %p, %b %-d')

      function animate() {
        const t = getTime()
        const h = t / MS_HR
        const simMins = (t - anchorTime) / 60000

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

        const waveX = Math.max(waveLeft, Math.min(waveRight, wxScale(simMins)))
        connector.attr('x1', x).attr('y1', y).attr('x2', waveX).attr('y2', y)
        waveDot.attr('cx', waveX).attr('cy', y)
        timeMarker
          .attr('x1', waveX)
          .attr('x2', waveX)
          .attr('y1', cy - totalR * pxPerFt)
          .attr('y2', cy + totalR * pxPerFt)

        scrubberEl.value = String(Math.max(scrubMin, Math.min(scrubMax, t)))
        timeLabelEl.textContent = fmt(new Date(t))

        rafId = requestAnimationFrame(animate)
      }

      rafId = requestAnimationFrame(animate)
    }

    setup()

    const observer = new ResizeObserver(() => setup())
    observer.observe(svgBox)

    onCleanup(() => {
      cancelAnimationFrame(rafId)
      observer.disconnect()
    })
  })

  return (
    <div class="harmonic-container">
      <div ref={svgBox} />
      <div class="hc-controls">
        <button
          class="hc-btn"
          classList={{ 'hc-btn-active': mode() === 'live' }}
          onClick={goLive}
        >
          Live
        </button>
        <button class="hc-btn hc-play-btn" onClick={() => (mode() === 'playing' ? pause() : play())}>
          {mode() === 'playing' ? '\u23F8' : '\u25B6'}
        </button>
        <div class="hc-rates">
          {RATES.map((r) => (
            <button
              class="hc-rate"
              classList={{ 'hc-rate-active': playRate() === r }}
              onClick={() => changeRate(r)}
            >
              {r}&times;
            </button>
          ))}
        </div>
        <input
          ref={scrubberEl}
          type="range"
          class="hc-scrubber"
          min={scrubMin}
          max={scrubMax}
          step={60000}
          onInput={(e) => scrub(Number(e.currentTarget.value))}
        />
        <span ref={timeLabelEl} class="hc-time" />
      </div>
    </div>
  )
}
