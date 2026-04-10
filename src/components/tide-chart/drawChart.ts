import * as d3 from 'd3'
import type { ChartContext, ChartMode, OverlayScales } from './types'
import type { MetData, TideDatums } from '../../lib/noaa'
import type { HighlightThresholds } from '../../lib/preferences'

export function drawChart(
  ctx: ChartContext,
  data: { time: number; level: number }[],
  extremes: { time: number; level: number; type: 'high' | 'low' }[],
  meanSeaLevel: number,
  currentLevel: number,
  metData: MetData | null | undefined,
  thresholds: HighlightThresholds | undefined,
  chartMode: ChartMode = 'planning',
  datums?: TideDatums,
): OverlayScales {
  const { svg, xScale, yScale, margin, width, height, now } = ctx
  const hasTemp = metData?.temperature?.length
  const hasWind = metData?.wind?.length

  // Defs: gradient for area fill and filters
  const defs = svg.append('defs')

  const gradient = defs
    .append('linearGradient')
    .attr('id', 'tide-area-gradient')
    .attr('x1', '0')
    .attr('y1', '0')
    .attr('x2', '0')
    .attr('y2', '1')
  gradient.append('stop').attr('offset', '0%').attr('stop-color', '#2a5a7b').attr('stop-opacity', 0.35)
  gradient.append('stop').attr('offset', '100%').attr('stop-color', '#1a3a4a').attr('stop-opacity', 0.05)

  // Subtle paper grain filter
  const filter = defs.append('filter').attr('id', 'paper-grain')
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

  // Grid lines — faint, like ruled ledger paper
  const yTicks = yScale.ticks(6)
  svg
    .selectAll('.grid-line-y')
    .data(yTicks)
    .enter()
    .append('line')
    .attr('x1', margin.left)
    .attr('x2', width - margin.right)
    .attr('y1', (d) => yScale(d))
    .attr('y2', (d) => yScale(d))
    .attr('stroke', '#8b7355')
    .attr('stroke-opacity', 0.15)
    .attr('stroke-width', 0.5)

  const xTicks = xScale.ticks(d3.timeHour.every(3)!)
  svg
    .selectAll('.grid-line-x')
    .data(xTicks)
    .enter()
    .append('line')
    .attr('x1', (d) => xScale(d))
    .attr('x2', (d) => xScale(d))
    .attr('y1', margin.top)
    .attr('y2', height - margin.bottom)
    .attr('stroke', '#8b7355')
    .attr('stroke-opacity', 0.12)
    .attr('stroke-width', 0.5)

  // Mean sea level line
  svg
    .append('line')
    .attr('x1', margin.left)
    .attr('x2', width - margin.right)
    .attr('y1', yScale(meanSeaLevel))
    .attr('y2', yScale(meanSeaLevel))
    .attr('stroke', '#7d7d7d')
    .attr('stroke-width', 1)
    .attr('stroke-dasharray', '8,4')
    .attr('stroke-opacity', 0.6)

  svg
    .append('text')
    .attr('x', width - margin.right - 4)
    .attr('y', yScale(meanSeaLevel) - 6)
    .attr('text-anchor', 'end')
    .attr('class', 'mean-label')
    .text('Mean Sea Level')

  const datumY = yScale(0)
  if (datumY > margin.top && datumY < height - margin.bottom) {
    svg
      .append('line')
      .attr('x1', margin.left)
      .attr('x2', width - margin.right)
      .attr('y1', datumY)
      .attr('y2', datumY)
      .attr('stroke', '#8b7355')
      .attr('stroke-width', 0.5)
      .attr('stroke-dasharray', '2,3')
      .attr('stroke-opacity', 0.12)
  }

  // Datum reference lines (tide details mode) — static lines and labels only.
  // Interactive hover targets are added later via setupDatumHover() so they
  // sit above the crosshair interaction rect in SVG z-order.
  if (chartMode === 'tideDetails' && datums) {
    const datumDefs: { value: number; label: string; color: string }[] = [
      { value: datums.mhhw, label: 'MHHW', color: '#2a5a7b' },
      { value: datums.mhw, label: 'MHW', color: '#3a7ca5' },
      { value: datums.mlw, label: 'MLW', color: '#8b5e3c' },
      { value: datums.mllw, label: 'MLLW', color: '#6b4226' },
    ]

    datumDefs.forEach(({ value, label, color }) => {
      const y = yScale(value)
      if (y < margin.top || y > height - margin.bottom) return

      svg
        .append('line')
        .attr('class', `datum-line datum-line-${label.toLowerCase()}`)
        .attr('x1', margin.left)
        .attr('x2', width - margin.right)
        .attr('y1', y)
        .attr('y2', y)
        .attr('stroke', color)
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '6,4')
        .attr('stroke-opacity', 0.5)

      svg
        .append('text')
        .attr('x', margin.left + 6)
        .attr('y', y - 5)
        .attr('text-anchor', 'start')
        .attr('class', 'datum-ref-label')
        .attr('fill', color)
        .text(`${label}  ${value.toFixed(1)} ft`)
    })
  }

  // Area fill
  const area = d3
    .area<{ time: number; level: number }>()
    .x((d) => xScale(d.time))
    .y0(yScale(meanSeaLevel))
    .y1((d) => yScale(d.level))
    .curve(d3.curveBasis)

  svg
    .append('path')
    .datum(data)
    .attr('d', area)
    .attr('fill', 'url(#tide-area-gradient)')

  // Tide line
  const line = d3
    .line<{ time: number; level: number }>()
    .x((d) => xScale(d.time))
    .y((d) => yScale(d.level))
    .curve(d3.curveBasis)

  svg
    .append('path')
    .datum(data)
    .attr('d', line)
    .attr('fill', 'none')
    .attr('stroke', '#1a3a5c')
    .attr('stroke-width', 2.5)
    .attr('stroke-linecap', 'round')

  // High/low tide markers
  extremes.forEach((ext) => {
    const x = xScale(ext.time)
    const y = yScale(ext.level)

    svg
      .append('circle')
      .attr('cx', x)
      .attr('cy', y)
      .attr('r', 3)
      .attr('fill', ext.type === 'high' ? '#1a3a5c' : '#6b5335')
      .attr('stroke', '#f0e6d3')
      .attr('stroke-width', 1)

    svg
      .append('text')
      .attr('x', x)
      .attr('y', ext.type === 'high' ? y - 12 : y + 16)
      .attr('text-anchor', 'middle')
      .attr('class', 'extrema-label')
      .text(`${ext.level.toFixed(1)} ft`)

    svg
      .append('text')
      .attr('x', x)
      .attr('y', ext.type === 'high' ? y - 24 : y + 28)
      .attr('text-anchor', 'middle')
      .attr('class', 'extrema-time')
      .text(d3.timeFormat('%-I:%M %p')(new Date(ext.time)))
  })

  // "Now" marker — vermillion navigator's line
  const nowX = xScale(now)
  svg
    .append('line')
    .attr('x1', nowX)
    .attr('x2', nowX)
    .attr('y1', margin.top)
    .attr('y2', height - margin.bottom)
    .attr('stroke', '#c0392b')
    .attr('stroke-width', 1.5)
    .attr('stroke-dasharray', '6,3')
    .attr('stroke-opacity', 0.8)

  // Current level dot
  svg
    .append('circle')
    .attr('cx', nowX)
    .attr('cy', yScale(currentLevel))
    .attr('r', 5)
    .attr('fill', '#c0392b')
    .attr('stroke', '#f0e6d3')
    .attr('stroke-width', 2)

  // --- Temperature overlay ---
  let tempScale: d3.ScaleLinear<number, number> | null = null
  let tempAxisX = 0
  if (hasTemp) {
    const tempData = metData!.temperature!
    const observed = tempData.filter((d) => !d.forecast)
    const forecast = tempData.filter((d) => d.forecast)
    const tempExtent = d3.extent(tempData, (d) => d.value) as [number, number]
    // Expand to include temp thresholds
    if (thresholds?.tempMin != null) {
      if (thresholds.tempMin < tempExtent[0]) tempExtent[0] = thresholds.tempMin
      if (thresholds.tempMin > tempExtent[1]) tempExtent[1] = thresholds.tempMin
    }
    if (thresholds?.tempMax != null) {
      if (thresholds.tempMax < tempExtent[0]) tempExtent[0] = thresholds.tempMax
      if (thresholds.tempMax > tempExtent[1]) tempExtent[1] = thresholds.tempMax
    }
    const tempPad = (tempExtent[1] - tempExtent[0]) * 0.2 || 5

    tempScale = d3
      .scaleLinear()
      .domain([tempExtent[0] - tempPad, tempExtent[1] + tempPad])
      .range([height - margin.bottom, margin.top])

    const tempLine = d3
      .line<{ time: number; value: number }>()
      .x((d) => xScale(d.time))
      .y((d) => tempScale!(d.value))
      .curve(d3.curveBasis)

    if (observed.length) {
      svg
        .append('path')
        .datum(observed)
        .attr('d', tempLine)
        .attr('class', 'temp-line')
        .attr('fill', 'none')
        .attr('stroke', '#b35900')
        .attr('stroke-width', 1.5)
        .attr('stroke-dasharray', '4,3')
        .attr('stroke-opacity', 0.85)
        .style('transition', 'stroke-width 0.15s, stroke-opacity 0.15s')
    }

    if (forecast.length) {
      const bridgeData = observed.length ? [observed[observed.length - 1], ...forecast] : forecast
      svg
        .append('path')
        .datum(bridgeData)
        .attr('d', tempLine)
        .attr('class', 'temp-line')
        .attr('fill', 'none')
        .attr('stroke', '#b35900')
        .attr('stroke-width', 1.5)
        .attr('stroke-dasharray', '2,4')
        .attr('stroke-opacity', 0.5)
        .style('transition', 'stroke-width 0.15s, stroke-opacity 0.15s')
    }

    tempAxisX = margin.left - (hasWind ? 35 : 0) - 35
    const tempAxis = d3
      .axisLeft(tempScale)
      .ticks(5)
      .tickFormat((d) => `${d}°`)
      .tickSize(4)

    svg
      .append('g')
      .attr('class', 'axis temp-axis')
      .attr('transform', `translate(${tempAxisX},0)`)
      .call(tempAxis)
      .call((g) => g.select('.domain').attr('stroke', '#b35900').attr('stroke-opacity', 0.3))
      .call((g) => g.selectAll('.tick line').attr('stroke', '#b35900').attr('stroke-opacity', 0.2))
      .call((g) => g.selectAll('.tick text').attr('fill', '#b35900').attr('font-size', '9px'))

    svg
      .append('text')
      .attr('x', tempAxisX)
      .attr('y', margin.top - 8)
      .attr('text-anchor', 'middle')
      .attr('class', 'mean-label')
      .attr('fill', '#b35900')
      .text('°F')
  }

  // --- Wind speed line ---
  let windScale: d3.ScaleLinear<number, number> | null = null
  let windAxisX = 0
  if (hasWind) {
    const windData = metData!.wind!
    const observedWind = windData.filter((d) => !d.forecast)
    const forecastWind = windData.filter((d) => d.forecast)
    let windMax = d3.max(windData, (d) => d.speed) || 1
    // Expand to include wind thresholds
    if (thresholds?.windMin != null && thresholds.windMin > windMax) windMax = thresholds.windMin
    if (thresholds?.windMax != null && thresholds.windMax > windMax) windMax = thresholds.windMax
    const windPad = windMax * 0.2 || 5

    windScale = d3
      .scaleLinear()
      .domain([0, windMax + windPad])
      .range([height - margin.bottom, margin.top])

    const windLine = d3
      .line<{ time: number; speed: number }>()
      .x((d) => xScale(d.time))
      .y((d) => windScale!(d.speed))
      .curve(d3.curveBasis)

    if (observedWind.length) {
      svg
        .append('path')
        .datum(observedWind)
        .attr('d', windLine)
        .attr('class', 'wind-line')
        .attr('fill', 'none')
        .attr('stroke', '#2a6b5a')
        .attr('stroke-width', 1.5)
        .attr('stroke-dasharray', '4,3')
        .attr('stroke-opacity', 0.85)
        .style('transition', 'stroke-width 0.15s, stroke-opacity 0.15s')
    }

    if (forecastWind.length) {
      const bridgeData = observedWind.length ? [observedWind[observedWind.length - 1], ...forecastWind] : forecastWind
      svg
        .append('path')
        .datum(bridgeData)
        .attr('d', windLine)
        .attr('class', 'wind-line')
        .attr('fill', 'none')
        .attr('stroke', '#2a6b5a')
        .attr('stroke-width', 1.5)
        .attr('stroke-dasharray', '2,4')
        .attr('stroke-opacity', 0.5)
        .style('transition', 'stroke-width 0.15s, stroke-opacity 0.15s')
    }

    windAxisX = margin.left - 35
    const windAxis = d3
      .axisLeft(windScale)
      .ticks(5)
      .tickFormat((d) => `${d}`)
      .tickSize(4)

    svg
      .append('g')
      .attr('class', 'axis wind-axis')
      .attr('transform', `translate(${windAxisX},0)`)
      .call(windAxis)
      .call((g) => g.select('.domain').attr('stroke', '#2a6b5a').attr('stroke-opacity', 0.3))
      .call((g) => g.selectAll('.tick line').attr('stroke', '#2a6b5a').attr('stroke-opacity', 0.2))
      .call((g) => g.selectAll('.tick text').attr('fill', '#2a6b5a').attr('font-size', '9px'))

    svg
      .append('text')
      .attr('x', windAxisX)
      .attr('y', margin.top - 8)
      .attr('text-anchor', 'middle')
      .attr('class', 'mean-label')
      .attr('fill', '#2a6b5a')
      .text('kn')

    // Wind direction arrows in top strip
    const windSampled = windData.filter((w, i) => w.forecast || i % 20 === 0)
    const maxSpeed = d3.max(windData, (d) => d.speed) || 1

    windSampled.forEach((w) => {
      const x = xScale(w.time)
      if (x < margin.left || x > width - margin.right) return
      const y = margin.top - 14
      const baseOpacity = 0.5 + 0.5 * (w.speed / maxSpeed)
      const opacity = w.forecast ? baseOpacity * 0.6 : baseOpacity

      svg
        .append('path')
        .attr('d', 'M0,-7 L2.5,3.5 L0,1.5 L-2.5,3.5 Z')
        .attr('transform', `translate(${x},${y}) rotate(${w.directionDeg})`)
        .attr('fill', '#6b5335')
        .attr('fill-opacity', opacity)

      svg
        .append('text')
        .attr('x', x)
        .attr('y', y + 12)
        .attr('text-anchor', 'middle')
        .attr('font-size', '7px')
        .attr('fill', '#6b5335')
        .attr('fill-opacity', w.forecast ? 0.45 : 0.7)
        .text(`${Math.round(w.speed)}`)
    })
  }

  // Axes
  const xAxis = d3
    .axisBottom(xScale)
    .ticks(d3.timeHour.every(6)!)
    .tickFormat((d) => d3.timeFormat('%-I %p')(d as Date))
    .tickSize(6)

  const xAxisDateFormat = d3.timeFormat('%a %b %-d')

  svg
    .append('g')
    .attr('class', 'axis x-axis')
    .attr('transform', `translate(0,${height - margin.bottom})`)
    .call(xAxis)
    .call((g) => g.select('.domain').attr('stroke', '#6b5335').attr('stroke-opacity', 0.6))
    .call((g) => g.selectAll('.tick line').attr('stroke', '#6b5335').attr('stroke-opacity', 0.4))
    .call((g) => g.selectAll('.tick text').attr('fill', '#5a4430'))

  // Date labels on x-axis
  const [domainStart, domainEnd] = xScale.domain()
  const dayStarts = d3.timeDay.range(domainStart, domainEnd)
  dayStarts.forEach((day) => {
    svg
      .append('text')
      .attr('x', xScale(day.getTime() + 12 * 60 * 60 * 1000))
      .attr('y', height - 6)
      .attr('text-anchor', 'middle')
      .attr('class', 'date-label')
      .text(xAxisDateFormat(day))
  })

  const yAxis = d3
    .axisLeft(yScale)
    .ticks(6)
    .tickFormat((d) => `${d} ft`)
    .tickSize(6)

  svg
    .append('g')
    .attr('class', 'axis y-axis')
    .attr('transform', `translate(${margin.left},0)`)
    .call(yAxis)
    .call((g) => g.select('.domain').attr('stroke', '#6b5335').attr('stroke-opacity', 0.6))
    .call((g) => g.selectAll('.tick line').attr('stroke', '#6b5335').attr('stroke-opacity', 0.4))
    .call((g) => g.selectAll('.tick text').attr('fill', '#5a4430'))

  return { tempScale, tempAxisX, windScale, windAxisX }
}

/** Append datum hover hit-targets and tooltip. Must be called AFTER
 *  setupInteractions so these sit above the crosshair rect in SVG z-order. */
export function setupDatumHover(ctx: ChartContext, datums: TideDatums) {
  const { svg, yScale, margin, width, height } = ctx

  const datumDefs: { value: number; label: string; fullName: string; color: string }[] = [
    { value: datums.mhhw, label: 'MHHW', fullName: 'Mean Higher High Water', color: '#2a5a7b' },
    { value: datums.mhw, label: 'MHW', fullName: 'Mean High Water', color: '#3a7ca5' },
    { value: datums.mlw, label: 'MLW', fullName: 'Mean Low Water', color: '#8b5e3c' },
    { value: datums.mllw, label: 'MLLW', fullName: 'Mean Lower Low Water', color: '#6b4226' },
  ]

  // Shared tooltip group
  const datumTooltip = svg.append('g').style('display', 'none')
  const tooltipBg = datumTooltip.append('rect')
    .attr('fill', 'rgba(240, 230, 211, 0.95)')
    .attr('stroke', '#8b7355')
    .attr('stroke-width', 0.5)
    .attr('rx', 4)
  const tooltipText = datumTooltip.append('text')
    .attr('fill', '#5a4430')
    .attr('font-size', '11px')
    .attr('class', 'datum-ref-label')

  datumDefs.forEach(({ value, label, fullName, color }) => {
    const y = yScale(value)
    if (y < margin.top || y > height - margin.bottom) return

    const datumLine = svg.select(`.datum-line-${label.toLowerCase()}`)

    svg.append('line')
      .attr('x1', margin.left)
      .attr('x2', width - margin.right)
      .attr('y1', y)
      .attr('y2', y)
      .attr('stroke', 'transparent')
      .attr('stroke-width', 14)
      .attr('pointer-events', 'stroke')
      .style('cursor', 'default')
      .on('mouseenter', () => {
        datumLine.attr('stroke-width', 2.5).attr('stroke-opacity', 0.8)
        const tipText = `${fullName} (${label}) — ${value.toFixed(2)} ft`
        tooltipText.text(tipText).attr('x', 8).attr('y', 15)
        const bbox = (tooltipText.node()! as SVGTextElement).getBBox()
        tooltipBg.attr('width', bbox.width + 16).attr('height', bbox.height + 10)
        datumTooltip.style('display', null)
      })
      .on('mousemove', (event: MouseEvent) => {
        const [mx] = d3.pointer(event)
        const bbox = tooltipBg.node()!.getBBox()
        const tx = mx + 12 + bbox.width > width - margin.right ? mx - bbox.width - 12 : mx + 12
        datumTooltip.attr('transform', `translate(${tx},${y - bbox.height - 8})`)
      })
      .on('mouseleave', () => {
        datumLine.attr('stroke-width', 1).attr('stroke-opacity', 0.5)
        datumTooltip.style('display', 'none')
      })
  })
}
