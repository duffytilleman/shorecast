import * as d3 from 'd3'
import type { ChartContext, OverlayScales } from './types'
import { findNearest } from './types'
import { type Constituent, predictTide } from '../../lib/tides'
import type { MetData } from '../../lib/noaa'

export function highlightOverlay(ctx: ChartContext, lineClass: string, axisClass: string) {
  if (!lineClass) return
  const { svg } = ctx
  svg.selectAll(`.${lineClass}`).each(function () {
    const el = d3.select(this)
    el.attr('data-orig-width', el.attr('stroke-width'))
      .attr('data-orig-opacity', el.attr('stroke-opacity'))
      .attr('stroke-width', 3)
      .attr('stroke-opacity', 1)
  })
  const axis = svg.select(`.${axisClass}`)
  axis.select('.domain').attr('data-orig-opacity', axis.select('.domain').attr('stroke-opacity'))
    .attr('stroke-opacity', 0.8).attr('stroke-width', 2)
  axis.selectAll('.tick line').each(function () {
    const el = d3.select(this)
    el.attr('data-orig-opacity', el.attr('stroke-opacity'))
      .attr('stroke-opacity', 0.6)
  })
  axis.selectAll('.tick text').each(function () {
    const el = d3.select(this)
    el.attr('data-orig-weight', el.attr('font-weight'))
      .attr('font-weight', '600')
  })
  // Bold corresponding threshold lines
  const thresholdClass = lineClass.replace('-line', '-threshold')
  svg.selectAll(`.${thresholdClass}`).each(function () {
    const el = d3.select(this)
    el.attr('data-orig-width', el.attr('stroke-width'))
      .attr('data-orig-opacity', el.attr('stroke-opacity'))
      .attr('stroke-width', 2)
      .attr('stroke-opacity', 0.8)
  })
}

export function unhighlightOverlay(ctx: ChartContext, lineClass: string, axisClass: string) {
  if (!lineClass) return
  const { svg } = ctx
  svg.selectAll(`.${lineClass}`).each(function () {
    const el = d3.select(this)
    el.attr('stroke-width', el.attr('data-orig-width'))
      .attr('stroke-opacity', el.attr('data-orig-opacity'))
  })
  const axis = svg.select(`.${axisClass}`)
  axis.select('.domain').attr('stroke-opacity', axis.select('.domain').attr('data-orig-opacity'))
    .attr('stroke-width', 1)
  axis.selectAll('.tick line').each(function () {
    const el = d3.select(this)
    el.attr('stroke-opacity', el.attr('data-orig-opacity'))
  })
  axis.selectAll('.tick text').each(function () {
    const el = d3.select(this)
    el.attr('font-weight', el.attr('data-orig-weight'))
  })
  const thresholdClass = lineClass.replace('-line', '-threshold')
  svg.selectAll(`.${thresholdClass}`).each(function () {
    const el = d3.select(this)
    el.attr('stroke-width', el.attr('data-orig-width'))
      .attr('stroke-opacity', el.attr('data-orig-opacity'))
  })
}

export function setupInteractions(
  ctx: ChartContext,
  constituents: Constituent[],
  meanSeaLevel: number,
  metData: MetData | null | undefined,
  overlayScales: OverlayScales,
  callbacks: { onOpenSettings?: () => void },
) {
  const { svg, xScale, yScale, margin, width, height } = ctx
  const { tempAxisX, windAxisX } = overlayScales
  const hasTemp = metData?.temperature?.length
  const hasWind = metData?.wind?.length

  function bindOverlayHover(targetSel: d3.Selection<any, any, any, any>, lineClass: string, axisClass: string, clickable = false) {
    targetSel
      .style('cursor', clickable ? 'pointer' : 'default')
      .on('mouseenter', () => highlightOverlay(ctx, lineClass, axisClass))
      .on('mouseleave', () => unhighlightOverlay(ctx, lineClass, axisClass))
    if (clickable) {
      targetSel.on('click', () => callbacks.onOpenSettings?.())
    }
  }

  function addAxisHitTarget(axisX: number, lineClass: string, axisClass: string) {
    const hitTarget = svg.append('rect')
      .attr('x', axisX - 16)
      .attr('y', margin.top)
      .attr('width', 32)
      .attr('height', height - margin.top - margin.bottom)
      .attr('fill', 'transparent')
      .attr('pointer-events', 'all')
    bindOverlayHover(hitTarget, lineClass, axisClass, true)
  }

  // Bind hover on axes with wider invisible hit targets
  if (hasTemp) addAxisHitTarget(tempAxisX, 'temp-line', 'temp-axis')
  if (hasWind) addAxisHitTarget(windAxisX, 'wind-line', 'wind-axis')

  // --- Hover crosshair ---
  const hoverGroup = svg.append('g').style('display', 'none')

  hoverGroup.append('line')
    .attr('class', 'hover-line')
    .attr('y1', margin.top)
    .attr('y2', height - margin.bottom)
    .attr('stroke', '#5a4430')
    .attr('stroke-width', 1)
    .attr('stroke-dasharray', '4,3')
    .attr('stroke-opacity', 0.6)

  const hoverDot = hoverGroup.append('circle')
    .attr('r', 4)
    .attr('fill', '#1a3a5c')
    .attr('stroke', '#f0e6d3')
    .attr('stroke-width', 1.5)

  const hoverTooltip = hoverGroup.append('g').attr('class', 'hover-tooltip')

  const tooltipBg = hoverTooltip.append('rect')
    .attr('fill', 'rgba(240, 230, 211, 0.92)')
    .attr('stroke', '#8b7355')
    .attr('stroke-width', 0.5)
    .attr('rx', 4)

  const tooltipText = hoverTooltip.append('text')
    .attr('fill', '#5a4430')
    .attr('font-size', '11px')

  function updateTooltip(mx: number) {
    const hoverTime = xScale.invert(mx).getTime()
    const level = predictTide(hoverTime, constituents, meanSeaLevel)
    const x = xScale(hoverTime)
    const y = yScale(level)

    hoverGroup.select('.hover-line')
      .attr('x1', x).attr('x2', x)

    hoverDot.attr('cx', x).attr('cy', y)

    // Build tooltip lines
    const timeStr = d3.timeFormat('%a %-I:%M %p')(new Date(hoverTime))
    const lines: string[] = [timeStr, `${level.toFixed(2)} ft`]

    if (metData?.temperature?.length) {
      const temp = findNearest(metData.temperature, hoverTime)
      if (temp) lines.push(`${temp.value.toFixed(0)}°F`)
    }
    if (metData?.wind?.length) {
      const wind = findNearest(metData.wind, hoverTime)
      if (wind) lines.push(`${Math.round(wind.speed)} kn ${wind.direction}`)
    }

    tooltipText.selectAll('tspan').remove()
    lines.forEach((line, i) => {
      tooltipText.append('tspan')
        .attr('x', 8)
        .attr('dy', i === 0 ? '1em' : '1.3em')
        .text(line)
    })

    const bbox = (tooltipText.node()! as SVGTextElement).getBBox()
    const tooltipW = bbox.width + 16
    const tooltipH = bbox.height + 10

    // Position tooltip to the right of cursor, flip if near edge
    const tooltipX = x + 12
    const flip = tooltipX + tooltipW > width - margin.right
    hoverTooltip.attr('transform', `translate(${flip ? x - tooltipW - 12 : tooltipX},${Math.max(margin.top, y - tooltipH / 2)})`)

    tooltipBg
      .attr('width', tooltipW)
      .attr('height', tooltipH)
  }

  const hitRect = svg.append('rect')
    .attr('x', margin.left)
    .attr('y', margin.top)
    .attr('width', width - margin.left - margin.right)
    .attr('height', height - margin.top - margin.bottom)
    .attr('fill', 'none')
    .attr('pointer-events', 'all')
    .on('mouseenter', () => hoverGroup.style('display', null))
    .on('mouseleave', () => hoverGroup.style('display', 'none'))
    .on('mousemove', (event: MouseEvent) => {
      const [mx] = d3.pointer(event)
      updateTooltip(mx)
    })

  // Touch support: tap to show tooltip, tap elsewhere to dismiss
  hitRect
    .on('touchstart', (event: TouchEvent) => {
      event.preventDefault()
      hoverGroup.style('display', null)
      const [mx] = d3.pointer(event.touches[0], svg.node())
      updateTooltip(mx)
    }, { passive: false } as any)
    .on('touchmove', (event: TouchEvent) => {
      event.preventDefault()
      const [mx] = d3.pointer(event.touches[0], svg.node())
      updateTooltip(mx)
    }, { passive: false } as any)
    .on('touchend', () => {
      // Keep tooltip visible for a moment after lifting finger
      setTimeout(() => hoverGroup.style('display', 'none'), 1500)
    })

  // Invisible wider hit-targets for temp/wind lines (on top of crosshair overlay)
  for (const [lineClass, axisClass] of [['temp-line', 'temp-axis'], ['wind-line', 'wind-axis']] as const) {
    svg.selectAll(`.${lineClass}`).each(function () {
      const hitTarget = svg.append('path')
        .attr('d', d3.select(this).attr('d'))
        .attr('fill', 'none')
        .attr('stroke', 'transparent')
        .attr('stroke-width', 12)
        .attr('pointer-events', 'stroke')
      bindOverlayHover(hitTarget, lineClass, axisClass)
    })
  }
}
