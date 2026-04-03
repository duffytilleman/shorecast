import { onMount, onCleanup, createSignal } from 'solid-js'
import * as d3 from 'd3'
import { getConstituentVector, type Constituent } from '../lib/tides'

interface HarmonicCirclesProps {
  constituents: Constituent[]
  meanSeaLevel: number
}

const MS_HR = 3_600_000
const RANGE_HRS = 12
const SAMPLE_STEP_MINUTES = 4

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
      const width = Math.max(rect.width, 720)

      const sorted = [...props.constituents].sort((a, b) => b.amplitude - a.amplitude)
      const chain = sorted.slice(0, 8)
      const remainder = sorted.slice(8)

      function tideFromConstituents(t: number) {
        return props.meanSeaLevel + sorted.reduce((sum, constituent) => sum + getConstituentVector(t, constituent).level, 0)
      }

      function buildWaveData(centerTime: number) {
        const waveData: { mins: number; level: number }[] = []
        for (let m = -RANGE_HRS * 60; m <= RANGE_HRS * 60; m += SAMPLE_STEP_MINUTES) {
          waveData.push({ mins: m, level: tideFromConstituents(centerTime + m * 60000) })
        }
        return waveData
      }

      const initialWaveData = buildWaveData(anchorTime)

      const totalR = chain.reduce((sum, constituent) => sum + constituent.amplitude, 0)
      const maxDeviation = d3.max(initialWaveData, (d) => Math.abs(d.level - props.meanSeaLevel)) ?? totalR
      const verticalSpanFeet = Math.max(totalR, maxDeviation) + 0.6

      const pxPerFt = Math.min((width * 0.17) / totalR, 58)
      const epicycleCX = totalR * pxPerFt + 18
      const legendH = 72
      const height = Math.max(verticalSpanFeet * pxPerFt * 2 + 50 + legendH, 220)
      const cy = (height - legendH) / 2

      const waveGap = 24
      const waveLeft = epicycleCX + totalR * pxPerFt + waveGap
      const waveRight = width - 10
      const yOf = (ft: number) => cy - (ft - props.meanSeaLevel) * pxPerFt

      const svg = d3
        .select(svgBox)
        .append('svg')
        .attr('viewBox', `0 0 ${width} ${height}`)
        .attr('class', 'harmonic-svg')

      const defs = svg.append('defs')

      const waveGradientId = 'harmonic-wave-gradient'
      const panelGradientId = 'harmonic-panel-gradient'
      const filterId = 'harmonic-paper-grain'

      const panelGradient = defs
        .append('linearGradient')
        .attr('id', panelGradientId)
        .attr('x1', '0')
        .attr('y1', '0')
        .attr('x2', '0')
        .attr('y2', '1')

      panelGradient.append('stop').attr('offset', '0%').attr('stop-color', '#f6efdf').attr('stop-opacity', 0.95)
      panelGradient.append('stop').attr('offset', '100%').attr('stop-color', '#eadfc8').attr('stop-opacity', 0.92)

      const waveGradient = defs
        .append('linearGradient')
        .attr('id', waveGradientId)
        .attr('x1', '0')
        .attr('y1', '0')
        .attr('x2', '0')
        .attr('y2', '1')

      waveGradient.append('stop').attr('offset', '0%').attr('stop-color', '#2a5a7b').attr('stop-opacity', 0.32)
      waveGradient.append('stop').attr('offset', '100%').attr('stop-color', '#1a3a4a').attr('stop-opacity', 0.05)

      const filter = defs.append('filter').attr('id', filterId)
      filter
        .append('feTurbulence')
        .attr('type', 'fractalNoise')
        .attr('baseFrequency', '0.9')
        .attr('numOctaves', '4')
        .attr('result', 'noise')
      filter
        .append('feColorMatrix')
        .attr('type', 'saturate')
        .attr('values', '0')
        .attr('in', 'noise')
        .attr('result', 'mono')
      filter
        .append('feBlend')
        .attr('in', 'SourceGraphic')
        .attr('in2', 'mono')
        .attr('mode', 'multiply')

      const wxScale = d3
        .scaleLinear()
        .domain([-RANGE_HRS * 60, RANGE_HRS * 60])
        .range([waveLeft, waveRight])

      const panelTop = 14
      const panelBottom = height - legendH - 10
      const panelHeight = panelBottom - panelTop

      svg
        .append('rect')
        .attr('x', 12)
        .attr('y', panelTop)
        .attr('width', width - 24)
        .attr('height', panelHeight)
        .attr('fill', `url(#${panelGradientId})`)
        .attr('filter', `url(#${filterId})`)
        .attr('opacity', 0.42)

      svg
        .append('rect')
        .attr('x', 12)
        .attr('y', panelTop)
        .attr('width', width - 24)
        .attr('height', panelHeight)
        .attr('fill', 'none')
        .attr('stroke', '#8b7355')
        .attr('stroke-width', 0.75)
        .attr('stroke-opacity', 0.14)

      const yTicks = d3.range(-1, 2).map((n) => props.meanSeaLevel + n * 2)
      svg
        .selectAll('.harmonic-grid-line-y')
        .data(yTicks)
        .enter()
        .append('line')
        .attr('x1', 12)
        .attr('x2', width - 12)
        .attr('y1', (d) => yOf(d))
        .attr('y2', (d) => yOf(d))
        .attr('stroke', '#8b7355')
        .attr('stroke-opacity', 0.12)
        .attr('stroke-width', 0.5)

      // Mean sea level line
      svg
        .append('line')
        .attr('x1', 12)
        .attr('x2', width - 12)
        .attr('y1', cy)
        .attr('y2', cy)
        .attr('stroke', '#7d7d7d')
        .attr('stroke-width', 0.5)
        .attr('stroke-opacity', 0.6)
        .attr('stroke-dasharray', '8,4')

      svg
        .append('text')
        .attr('x', waveRight)
        .attr('y', cy - 6)
        .attr('text-anchor', 'end')
        .attr('class', 'mean-label')
        .text('Mean sea level')

      const datumY = yOf(0)
      if (datumY > 0 && datumY < height - legendH) {
        svg
          .append('line')
          .attr('x1', waveLeft)
          .attr('x2', waveRight)
          .attr('y1', datumY)
          .attr('y2', datumY)
          .attr('stroke', '#8b7355')
          .attr('stroke-width', 0.5)
          .attr('stroke-opacity', 0.1)
          .attr('stroke-dasharray', '2,3')

        svg
          .append('text')
          .attr('x', waveRight)
          .attr('y', datumY - 6)
          .attr('text-anchor', 'end')
          .attr('class', 'datum-label')
          .text('MLLW datum')

        svg
          .append('line')
          .attr('x1', epicycleCX)
          .attr('x2', epicycleCX)
          .attr('y1', datumY)
          .attr('y2', cy)
          .attr('stroke', '#7d7d7d')
          .attr('stroke-width', 1)
          .attr('stroke-opacity', 0.45)
          .attr('stroke-dasharray', '6,4')

        svg
          .append('circle')
          .attr('cx', epicycleCX)
          .attr('cy', datumY)
          .attr('r', 2.5)
          .attr('fill', '#7d7d7d')
          .attr('fill-opacity', 0.55)

        svg
          .append('text')
          .attr('x', epicycleCX + 8)
          .attr('y', cy - 8)
          .attr('class', 'offset-label')
          .text(`Z0 ${props.meanSeaLevel.toFixed(2)} ft`)
      }

      svg
        .selectAll('.harmonic-grid-line-x')
        .data(d3.range(-RANGE_HRS, RANGE_HRS + 1, 3))
        .enter()
        .append('line')
        .attr('x1', (d) => wxScale(d * 60))
        .attr('x2', (d) => wxScale(d * 60))
        .attr('y1', panelTop)
        .attr('y2', panelBottom)
        .attr('stroke', '#8b7355')
        .attr('stroke-opacity', 0.1)
        .attr('stroke-width', 0.5)

      const area = d3
        .area<{ mins: number; level: number }>()
        .x((d) => wxScale(d.mins))
        .y0(cy)
        .y1((d) => yOf(d.level))
        .curve(d3.curveBasis)

      const line = d3
        .line<{ mins: number; level: number }>()
        .x((d) => wxScale(d.mins))
        .y((d) => yOf(d.level))
        .curve(d3.curveBasis)

      const waveArea = svg
        .append('path')
        .datum(initialWaveData)
        .attr('d', area)
        .attr('fill', `url(#${waveGradientId})`)

      // Wave path
      const wavePath = svg
        .append('path')
        .datum(initialWaveData)
        .attr('d', line)
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

      const chainDot = svg
        .append('circle')
        .attr('r', 2.5)
        .attr('fill', '#1a3a5c')
        .attr('stroke', '#f0e6d3')
        .attr('stroke-width', 1)

      const remainderArm = svg
        .append('line')
        .attr('stroke', '#c0392b')
        .attr('stroke-width', 1.25)
        .attr('stroke-opacity', 0.35)
        .attr('stroke-dasharray', '3,3')

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
      const legendTop = height - legendH + 14
      const legendColumns = 4
      const legendItemW = (width - 40) / legendColumns
      const legendItemH = 24
      const legendStartX = 20

      chain.forEach((c, i) => {
        const column = i % legendColumns
        const row = Math.floor(i / legendColumns)
        const x = legendStartX + legendItemW * column
        const y = legendTop + legendItemH * row

        svg
          .append('circle')
          .attr('cx', x)
          .attr('cy', y)
          .attr('r', 4)
          .attr('fill', CHAIN_COLORS[i])
          .attr('fill-opacity', 0.75)

        svg
          .append('text')
          .attr('x', x + 10)
          .attr('y', y - 1)
          .attr('class', 'harmonic-name')
          .text(c.name ?? `C${i + 1}`)

        svg
          .append('text')
          .attr('x', x + 10)
          .attr('y', y + 10)
          .attr('class', 'harmonic-value')
          .text(`${c.amplitude.toFixed(2)} ft`)
      })

      // --- Animation loop ---
      const fmt = d3.timeFormat('%-I:%M %p, %b %-d')

      function animate() {
        const t = getTime()
        const waveData = buildWaveData(t)

        waveArea.datum(waveData).attr('d', area)
        wavePath.datum(waveData).attr('d', line)

        let x = epicycleCX
        let y = cy

        chain.forEach((c, i) => {
          const vector = getConstituentVector(t, c)
          orbits[i].attr('cx', x).attr('cy', y).attr('r', vector.radius * pxPerFt)
          const nx = x + vector.dx * pxPerFt
          const ny = y + vector.dy * pxPerFt
          armLines[i].attr('x1', x).attr('y1', y).attr('x2', nx).attr('y2', ny)
          x = nx
          y = ny
        })

        chainDot.attr('cx', x).attr('cy', y)

        const remainderVector = remainder.reduce(
          (sum, constituent) => {
            const vector = getConstituentVector(t, constituent)
            return {
              dx: sum.dx + vector.dx,
              dy: sum.dy + vector.dy,
              level: sum.level + vector.level,
            }
          },
          { dx: 0, dy: 0, level: 0 },
        )

        const fullX = x + remainderVector.dx * pxPerFt
        const fullLevel = props.meanSeaLevel + chain.reduce((sum, constituent) => sum + getConstituentVector(t, constituent).level, 0) + remainderVector.level
        const fullY = yOf(fullLevel)

        remainderArm
          .attr('x1', x)
          .attr('y1', y)
          .attr('x2', fullX)
          .attr('y2', fullY)

        endDot.attr('cx', fullX).attr('cy', fullY)

        const waveX = wxScale(0)
        connector.attr('x1', fullX).attr('y1', fullY).attr('x2', waveX).attr('y2', fullY)
        waveDot.attr('cx', waveX).attr('cy', fullY)
        timeMarker
          .attr('x1', waveX)
          .attr('x2', waveX)
          .attr('y1', cy - verticalSpanFeet * pxPerFt)
          .attr('y2', cy + verticalSpanFeet * pxPerFt)

        if (mode() !== 'paused') {
          scrubberEl.min = String(t - RANGE_HRS * MS_HR)
          scrubberEl.max = String(t + RANGE_HRS * MS_HR)
        }
        scrubberEl.value = String(t)
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
