import * as d3 from 'd3'
import type { ChartContext, OverlayScales } from './types'
import { findNearest } from './types'
import { highlightOverlay, unhighlightOverlay } from './interactions'
import type { MetData } from '../../lib/noaa'
import type { HighlightThresholds } from '../../lib/preferences'

export function drawHighlightRegions(
  ctx: ChartContext,
  data: { time: number; level: number }[],
  metData: MetData | null | undefined,
  thresholds: HighlightThresholds | undefined,
  meanSeaLevel: number,
) {
  const { svg, xScale, margin, height } = ctx
  const th = thresholds
  const tideOffset = (th?.tideReference ?? 'msl') === 'msl' ? meanSeaLevel : 0
  const tideMinVal = th?.tideMin != null ? th.tideMin + tideOffset : null
  const tideMaxVal = th?.tideMax != null ? th.tideMax + tideOffset : null
  const tempMinVal = th?.tempMin ?? null
  const tempMaxVal = th?.tempMax ?? null
  const windMinVal = th?.windMin ?? null
  const windMaxVal = th?.windMax ?? null

  const hasTemp = metData?.temperature?.length
  const hasWind = metData?.wind?.length
  const hasTempThreshold = tempMinVal !== null || tempMaxVal !== null
  const hasWindThreshold = windMinVal !== null || windMaxVal !== null
  const hasTideThreshold = tideMinVal !== null || tideMaxVal !== null
  const anyThreshold = hasTideThreshold || hasTempThreshold || hasWindThreshold

  if (!anyThreshold) return

  const tempData = hasTemp ? metData!.temperature! : []
  const windData = hasWind ? metData!.wind! : []

  const highlightData = data.map((d) => {
    // Tide level check
    if (tideMinVal !== null && d.level < tideMinVal) return { ...d, highlight: false }
    if (tideMaxVal !== null && d.level > tideMaxVal) return { ...d, highlight: false }

    // Temperature check
    if (hasTempThreshold) {
      const temp = findNearest(tempData, d.time, 90 * 60 * 1000)
      if (!temp) return { ...d, highlight: false }
      if (tempMinVal !== null && temp.value < tempMinVal) return { ...d, highlight: false }
      if (tempMaxVal !== null && temp.value > tempMaxVal) return { ...d, highlight: false }
    }

    // Wind check
    if (hasWindThreshold) {
      const wind = findNearest(windData, d.time, 90 * 60 * 1000)
      if (!wind) return { ...d, highlight: false }
      if (windMinVal !== null && wind.speed < windMinVal) return { ...d, highlight: false }
      if (windMaxVal !== null && wind.speed > windMaxVal) return { ...d, highlight: false }
    }

    return { ...d, highlight: true }
  })

  // Build contiguous segments where highlight is true
  const segments: { time: number; level: number }[][] = []
  let current: { time: number; level: number }[] = []
  for (const d of highlightData) {
    if (d.highlight) {
      current.push(d)
    } else if (current.length) {
      segments.push(current)
      current = []
    }
  }
  if (current.length) segments.push(current)

  segments.forEach((seg) => {
    const x0 = xScale(seg[0].time)
    const x1 = xScale(seg[seg.length - 1].time)
    svg
      .append('rect')
      .attr('x', x0)
      .attr('y', margin.top)
      .attr('width', x1 - x0)
      .attr('height', height - margin.top - margin.bottom)
      .attr('fill', '#e8a735')
      .attr('fill-opacity', 0.12)
  })
}

export function drawThresholdMarkers(
  ctx: ChartContext,
  thresholds: HighlightThresholds | undefined,
  meanSeaLevel: number,
  overlayScales: OverlayScales,
) {
  const { svg, yScale, margin, width, height } = ctx
  const th = thresholds
  if (!th) return

  function drawMarker(
    yPos: number, axisX: number, label: string, color: string,
    value: number, tickValues: number[], thresholdClass?: string,
    thresholdKey?: string,
  ) {
    if (yPos < margin.top || yPos > height - margin.bottom) return
    // Dashed line across chart
    const isTide = thresholdClass === 'tide-threshold'
    const thLine = svg.append('line')
      .attr('x1', margin.left)
      .attr('x2', width - margin.right)
      .attr('y1', yPos)
      .attr('y2', yPos)
      .attr('stroke', color)
      .attr('stroke-width', isTide ? 1.5 : 1)
      .attr('stroke-dasharray', isTide ? '6,4' : '4,4')
      .attr('stroke-opacity', isTide ? 0.7 : 0.4)
    if (thresholdClass) thLine.attr('class', thresholdClass)
    if (thresholdKey) thLine.attr('data-threshold-key', thresholdKey)

    // Triangle marker on the axis
    const g = svg.append('g')
      .attr('class', 'threshold-marker')
      .style('cursor', 'ns-resize')
    if (thresholdKey) g.attr('data-threshold-key', thresholdKey)

    g.append('path')
      .attr('d', 'M0,-5 L8,0 L0,5 Z')
      .attr('transform', `translate(${axisX},${yPos})`)
      .attr('fill', color)
      .attr('fill-opacity', 0.8)

    // Skip label if value coincides with a tick to avoid overlap
    const onTick = tickValues.some((t) => Math.abs(t - value) < 1e-9)
    if (!onTick) {
      g.append('text')
        .attr('x', axisX - 4)
        .attr('y', yPos + 3.5)
        .attr('text-anchor', 'end')
        .attr('font-size', '10px')
        .attr('font-style', 'italic')
        .attr('fill', color)
        .text(label)
    }

    // Invisible wider click/drag target
    g.append('rect')
      .attr('x', axisX - 40)
      .attr('y', yPos - 8)
      .attr('width', 52)
      .attr('height', 16)
      .attr('fill', 'transparent')
  }

  // Tide thresholds on main y-axis
  const tideTicks = yScale.ticks(6)
  const tideOffset = (th.tideReference ?? 'msl') === 'msl' ? meanSeaLevel : 0
  if (th.tideMin != null) {
    const datumVal = th.tideMin + tideOffset
    drawMarker(yScale(datumVal), margin.left, `${datumVal.toFixed(1)} ft`, '#9b4d2b', datumVal, tideTicks, 'tide-threshold', 'tideMin')
  }
  if (th.tideMax != null) {
    const datumVal = th.tideMax + tideOffset
    drawMarker(yScale(datumVal), margin.left, `${datumVal.toFixed(1)} ft`, '#9b4d2b', datumVal, tideTicks, 'tide-threshold', 'tideMax')
  }

  // Temperature thresholds on temp axis
  const { tempScale, tempAxisX, windScale, windAxisX } = overlayScales
  if (tempScale) {
    const tempTicks = tempScale.ticks(5)
    if (th.tempMin != null) {
      drawMarker(tempScale(th.tempMin), tempAxisX, `${th.tempMin}°`, '#b35900', th.tempMin, tempTicks, 'temp-threshold', 'tempMin')
    }
    if (th.tempMax != null) {
      drawMarker(tempScale(th.tempMax), tempAxisX, `${th.tempMax}°`, '#b35900', th.tempMax, tempTicks, 'temp-threshold', 'tempMax')
    }
  }

  // Wind thresholds on wind axis
  if (windScale) {
    const windTicks = windScale.ticks(5)
    if (th.windMin != null) {
      drawMarker(windScale(th.windMin), windAxisX, `${th.windMin}`, '#2a6b5a', th.windMin, windTicks, 'wind-threshold', 'windMin')
    }
    if (th.windMax != null) {
      drawMarker(windScale(th.windMax), windAxisX, `${th.windMax}`, '#2a6b5a', th.windMax, windTicks, 'wind-threshold', 'windMax')
    }
  }
}

export function setupThresholdDrag(
  ctx: ChartContext,
  thresholds: HighlightThresholds | undefined,
  meanSeaLevel: number,
  overlayScales: OverlayScales,
  callbacks: {
    onOpenSettings?: () => void
    onUpdateThreshold?: (key: keyof HighlightThresholds, value: number) => void
  },
) {
  const { svg, yScale, margin, height } = ctx
  const { tempScale, windScale } = overlayScales

  const tideOffset = thresholds
    ? ((thresholds.tideReference ?? 'msl') === 'msl' ? meanSeaLevel : 0)
    : 0

  function scaleForKey(key: string): d3.ScaleLinear<number, number> | null {
    if (key.startsWith('tide')) return yScale
    if (key.startsWith('temp')) return tempScale
    if (key.startsWith('wind')) return windScale
    return null
  }

  function addThresholdDrag(target: d3.Selection<any, any, any, any>, thresholdKey: string, lineClass: string, axisClass: string) {
    const scale = scaleForKey(thresholdKey)
    if (!scale) return
    let dragged = false
    let markerAxisX = 0

    // Convert a raw pixel Y to a clamped value and pixel Y
    function clampDrag(eventY: number): { y: number; value: number } {
      const y = Math.max(margin.top, Math.min(height - margin.bottom, eventY))
      let val = scale.invert(y)
      if (thresholdKey.startsWith('tide')) val -= tideOffset
      let clamped = Math.round(val * 10) / 10
      if (thresholdKey.startsWith('wind')) clamped = Math.max(0, clamped)
      const th = thresholds
      if (th) {
        const pairs: [string, string][] = [['tideMin', 'tideMax'], ['tempMin', 'tempMax'], ['windMin', 'windMax']]
        for (const [minKey, maxKey] of pairs) {
          if (thresholdKey === minKey && th[maxKey as keyof HighlightThresholds] != null)
            clamped = Math.min(clamped, th[maxKey as keyof HighlightThresholds] as number)
          if (thresholdKey === maxKey && th[minKey as keyof HighlightThresholds] != null)
            clamped = Math.max(clamped, th[minKey as keyof HighlightThresholds] as number)
        }
      }
      const scaleVal = thresholdKey.startsWith('tide') ? clamped + tideOffset : clamped
      return { y: scale(scaleVal), value: thresholdKey.startsWith('tide') ? scaleVal : clamped }
    }

    function formatLabel(value: number): string {
      if (thresholdKey.startsWith('tide')) return `${value.toFixed(1)} ft`
      if (thresholdKey.startsWith('temp')) return `${value}°`
      return `${value}`
    }

    const drag = d3.drag<any, any>()
      .on('start', () => {
        dragged = false
        highlightOverlay(ctx, lineClass, axisClass)
        // Cache the marker's x position from the triangle transform
        const markerG = svg.select(`g[data-threshold-key="${thresholdKey}"]`)
        const transform = markerG.select('path').attr('transform') || ''
        const match = transform.match(/translate\(([^,]+)/)
        markerAxisX = match ? parseFloat(match[1]) : 0
      })
      .on('drag', (event) => {
        dragged = true
        const { y: newY, value } = clampDrag(event.y)
        const label = formatLabel(value)
        // Move the threshold line
        svg.selectAll(`line[data-threshold-key="${thresholdKey}"]`).attr('y1', newY).attr('y2', newY)
        // Move the marker group elements and update label
        svg.selectAll(`g[data-threshold-key="${thresholdKey}"]`).each(function () {
          const g = d3.select(this)
          g.select('path').attr('transform', `translate(${markerAxisX},${newY})`)
          const text = g.select('text')
          if (text.empty()) {
            // Label was hidden (coincided with a tick); create it
            g.append('text')
              .attr('x', markerAxisX - 4)
              .attr('y', newY + 3.5)
              .attr('text-anchor', 'end')
              .attr('font-size', '10px')
              .attr('font-style', 'italic')
              .attr('fill', g.select('path').attr('fill'))
              .text(label)
          } else {
            text.attr('y', newY + 3.5).text(label)
          }
          g.select('rect').attr('y', newY - 8)
        })
        // Move hit-target line if present
        if (target.attr('y1') != null) {
          target.attr('y1', newY).attr('y2', newY)
        }
      })
      .on('end', (event) => {
        unhighlightOverlay(ctx, lineClass, axisClass)
        if (!dragged) {
          callbacks.onOpenSettings?.()
          return
        }
        const { value } = clampDrag(event.y)
        // For tide, clampDrag returns datum-relative; convert back to user reference
        const finalValue = thresholdKey.startsWith('tide') ? Math.round((value - tideOffset) * 10) / 10 : value
        callbacks.onUpdateThreshold?.(thresholdKey as keyof HighlightThresholds, finalValue)
      })

    target.call(drag)
      .style('cursor', 'ns-resize')
  }

  // Hit targets for temp/wind threshold lines (hover + drag)
  for (const [lineClass, axisClass] of [['temp-line', 'temp-axis'], ['wind-line', 'wind-axis']] as const) {
    const thresholdClass = lineClass.replace('-line', '-threshold')
    svg.selectAll(`.${thresholdClass}`).each(function () {
      const orig = d3.select(this)
      const key = orig.attr('data-threshold-key')
      const hitTarget = svg.append('line')
        .attr('x1', orig.attr('x1'))
        .attr('x2', orig.attr('x2'))
        .attr('y1', orig.attr('y1'))
        .attr('y2', orig.attr('y2'))
        .attr('stroke', 'transparent')
        .attr('stroke-width', 12)
        .attr('pointer-events', 'stroke')
      hitTarget
        .on('mouseenter', () => highlightOverlay(ctx, lineClass, axisClass))
        .on('mouseleave', () => unhighlightOverlay(ctx, lineClass, axisClass))
      if (key) addThresholdDrag(hitTarget, key, lineClass, axisClass)
    })
  }

  // Hit targets for tide threshold lines (drag only)
  svg.selectAll('.tide-threshold').each(function () {
    const orig = d3.select(this)
    const key = orig.attr('data-threshold-key')
    const hitTarget = svg.append('line')
      .attr('x1', orig.attr('x1'))
      .attr('x2', orig.attr('x2'))
      .attr('y1', orig.attr('y1'))
      .attr('y2', orig.attr('y2'))
      .attr('stroke', 'transparent')
      .attr('stroke-width', 12)
      .attr('pointer-events', 'stroke')
    if (key) addThresholdDrag(hitTarget, key, '', '')
  })

  // Add drag to threshold marker groups (triangle + label on the axis)
  svg.selectAll('.threshold-marker').each(function () {
    const g = d3.select(this)
    const key = g.attr('data-threshold-key')
    if (!key) return
    const lineClass = key.startsWith('temp') ? 'temp-line' : key.startsWith('wind') ? 'wind-line' : ''
    const axisClass = key.startsWith('temp') ? 'temp-axis' : key.startsWith('wind') ? 'wind-axis' : ''
    addThresholdDrag(g, key, lineClass, axisClass)
  })
}
