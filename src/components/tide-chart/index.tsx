import { onMount, onCleanup, createEffect, on } from 'solid-js'
import * as d3 from 'd3'
import { type Constituent, predictTide } from '../../lib/tides'
import type { MetData, TideDatums } from '../../lib/noaa'
import type { HighlightThresholds } from '../../lib/preferences'
import type { ChartContext, ChartMode } from './types'
import { findHighLowTides } from './types'
import { drawChart, setupDatumHover } from './drawChart'
import { drawHighlightRegions, drawThresholdMarkers, setupThresholdDrag } from './thresholds'
import { setupInteractions } from './interactions'

interface TideChartProps {
  constituents: Constituent[]
  meanSeaLevel: number
  datums?: TideDatums
  chartMode?: ChartMode
  metData?: MetData | null
  thresholds?: HighlightThresholds
  onOpenSettings?: () => void
  onUpdateThreshold?: (key: keyof HighlightThresholds, value: number) => void
}

export default function TideChart(props: TideChartProps) {
  let container!: HTMLDivElement
  let futureHours = 24 * 30 // 30 days pre-rendered
  let initialRender = true

  onMount(() => {
    renderChart()
    const interval = setInterval(renderChart, 60_000)
    onCleanup(() => clearInterval(interval))

    const observer = new ResizeObserver(() => renderChart())
    observer.observe(container)
    onCleanup(() => observer.disconnect())
  })

  // Re-render when met data arrives asynchronously
  createEffect(on(() => props.metData, (metData) => {
    if (metData && container) renderChart()
  }, { defer: true }))

  // Re-render when thresholds change
  createEffect(on(() => props.thresholds, () => {
    if (container) renderChart()
  }, { defer: true }))

  // Re-render when chart mode changes
  createEffect(on(() => props.chartMode, () => {
    if (container) renderChart()
  }, { defer: true }))

  function renderChart() {
    // Preserve scroll position across re-renders (except initial)
    const prevScrollLeft = container.querySelector('.tide-scroll')?.scrollLeft
    container.innerHTML = ''

    const rect = container.getBoundingClientRect()
    const containerWidth = Math.max(rect.width, 600)
    const height = Math.max(300, rect.height || 540)
    const mode = props.chartMode ?? 'planning'
    const showWeather = mode === 'planning'
    const metForChart = showWeather ? props.metData : undefined
    const thresholdsForChart = showWeather ? props.thresholds : undefined
    const hasTemp = showWeather && props.metData?.temperature?.length
    const hasWind = showWeather && props.metData?.wind?.length
    const leftExtra = (hasTemp ? 35 : 0) + (hasWind ? 35 : 0)
    const margin = { top: hasWind ? 56 : 26, right: 20, bottom: 52, left: 50 + leftExtra }

    const now = Date.now()
    const startTime = now - 12 * 60 * 60 * 1000
    const endTime = now + futureHours * 60 * 60 * 1000
    const totalHours = (endTime - startTime) / (60 * 60 * 1000)
    const initialHours = 84 // -12h + 72h
    const pxPerHour = containerWidth / initialHours
    const width = pxPerHour * totalHours
    const step = 6 * 60 * 1000 // 6 minutes

    // Create scroll wrapper
    const scrollWrapper = d3.select(container).append('div')
      .attr('class', 'tide-scroll')
      .style('overflow-x', 'auto')
      .style('overflow-y', 'hidden')
      .style('-webkit-overflow-scrolling', 'touch')

    // Extend chart when scrolling near the right edge
    scrollWrapper.on('scroll', () => {
      const el = scrollWrapper.node()!
      const remaining = el.scrollWidth - el.scrollLeft - el.clientWidth
      if (remaining < containerWidth) {
        futureHours += 24 * 30
        renderChart()
      }
    })

    // Generate tide data
    const data: { time: number; level: number }[] = []
    for (let t = startTime; t <= endTime; t += step) {
      data.push({ time: t, level: predictTide(t, props.constituents, props.meanSeaLevel) })
    }

    const currentLevel = predictTide(now, props.constituents, props.meanSeaLevel)
    const recentLevel = predictTide(now - 6 * 60 * 1000, props.constituents, props.meanSeaLevel)
    const rising = currentLevel > recentLevel
    const extremes = findHighLowTides(data)

    // Scales
    const yExtent = d3.extent(data, (d) => d.level) as [number, number]
    // Expand extent to include tide thresholds so markers are always visible
    {
      const th = thresholdsForChart
      const tideOffset = (th?.tideReference ?? 'msl') === 'msl' ? props.meanSeaLevel : 0
      if (th?.tideMin != null) {
        const v = th.tideMin + tideOffset
        if (v < yExtent[0]) yExtent[0] = v
        if (v > yExtent[1]) yExtent[1] = v
      }
      if (th?.tideMax != null) {
        const v = th.tideMax + tideOffset
        if (v < yExtent[0]) yExtent[0] = v
        if (v > yExtent[1]) yExtent[1] = v
      }
    }
    // In tide details mode, expand extent to include datum lines
    if (mode === 'tideDetails' && props.datums) {
      for (const v of [props.datums.mhhw, props.datums.mhw, props.datums.mlw, props.datums.mllw]) {
        if (v < yExtent[0]) yExtent[0] = v
        if (v > yExtent[1]) yExtent[1] = v
      }
    }
    const yPad = (yExtent[1] - yExtent[0]) * 0.15

    const xScale = d3
      .scaleTime()
      .domain([startTime, endTime])
      .range([margin.left, width - margin.right])

    const yScale = d3
      .scaleLinear()
      .domain([yExtent[0] - yPad, yExtent[1] + yPad])
      .range([height - margin.bottom, margin.top])

    const svg = scrollWrapper
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .attr('class', 'tide-svg')

    const ctx: ChartContext = { svg, xScale, yScale, margin, width, height, now }

    // Draw chart layers (order matters for SVG z-index)
    if (showWeather) {
      drawHighlightRegions(ctx, data, props.metData, props.thresholds, props.meanSeaLevel)
    }
    const overlayScales = drawChart(ctx, data, extremes, props.meanSeaLevel, currentLevel, metForChart, thresholdsForChart, mode, props.datums)
    if (showWeather) {
      drawThresholdMarkers(ctx, props.thresholds, props.meanSeaLevel, overlayScales)
      setupThresholdDrag(ctx, props.thresholds, props.meanSeaLevel, overlayScales, {
        onOpenSettings: props.onOpenSettings,
        onUpdateThreshold: props.onUpdateThreshold,
      })
    }
    setupInteractions(ctx, props.constituents, props.meanSeaLevel, metForChart, overlayScales, {
      onOpenSettings: showWeather ? props.onOpenSettings : undefined,
    })
    // Datum hover targets must be appended after setupInteractions so they
    // sit above the crosshair rect in SVG z-order.
    if (mode === 'tideDetails' && props.datums) {
      setupDatumHover(ctx, props.datums)
    }

    // Scroll to "now" on first render, preserve position on re-renders
    const scrollEl = scrollWrapper.node()!
    if (initialRender) {
      const nowScrollX = xScale(now) - containerWidth / 2
      scrollEl.scrollLeft = Math.max(0, nowScrollX)
      initialRender = false
    } else if (prevScrollLeft != null) {
      scrollEl.scrollLeft = prevScrollLeft
    }

    // Current reading info below chart
    const info = d3.select(container).append('div').attr('class', 'tide-info')

    info.append('div').attr('class', 'tide-reading').html(`
      <span class="reading-value">${currentLevel.toFixed(2)} ft</span>
      <span class="reading-label">Current Level</span>
    `)

    info.append('div').attr('class', 'tide-direction').html(`
      <span class="direction-arrow">${rising ? '▲' : '▼'}</span>
      <span class="direction-text">${rising ? 'Rising' : 'Falling'}</span>
    `)

    if (showWeather && props.metData?.temperature?.length) {
      const latest = props.metData!.temperature![props.metData!.temperature!.length - 1]
      info.append('div').attr('class', 'tide-reading').html(`
        <span class="reading-value">${latest.value.toFixed(0)}°F</span>
        <span class="reading-label">Air Temp</span>
      `)
    }

    if (showWeather && props.metData?.wind?.length) {
      const latest = props.metData!.wind![props.metData!.wind!.length - 1]
      info.append('div').attr('class', 'tide-reading').html(`
        <span class="reading-value">${latest.speed.toFixed(0)} kn ${latest.direction}</span>
        <span class="reading-label">Wind</span>
      `)
    }

    const nextExtreme = extremes.find((e) => e.time > now)
    if (nextExtreme) {
      const timeStr = d3.timeFormat('%-I:%M %p')(new Date(nextExtreme.time))
      info.append('div').attr('class', 'tide-next').html(`
        <span class="next-label">Next ${nextExtreme.type === 'high' ? 'High' : 'Low'} Tide</span>
        <span class="next-value">${nextExtreme.level.toFixed(2)} ft at ${timeStr}</span>
      `)
    }

    // In tide details mode, show datum summary
    if (mode === 'tideDetails' && props.datums) {
      const d = props.datums
      info.append('div').attr('class', 'tide-reading').html(`
        <span class="reading-value">${(d.mhhw - d.mlw).toFixed(1)} ft</span>
        <span class="reading-label">Tidal Range</span>
      `)
    }
  }

  return <div ref={container} class="tide-chart-container" />
}
