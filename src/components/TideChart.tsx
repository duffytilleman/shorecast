import { onMount, onCleanup, createEffect, on } from 'solid-js'
import * as d3 from 'd3'
import { type Constituent, predictTide } from '../lib/tides'
import type { MetData } from '../lib/noaa'

interface TideChartProps {
  constituents: Constituent[]
  meanSeaLevel: number
  metData?: MetData | null
}

function findHighLowTides(
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

  function renderChart() {
    // Preserve scroll position across re-renders (except initial)
    const prevScrollLeft = container.querySelector('.tide-scroll')?.scrollLeft
    container.innerHTML = ''

    const rect = container.getBoundingClientRect()
    const containerWidth = Math.max(rect.width, 600)
    const height = Math.max(540, Math.min(860, containerWidth * 0.58))
    const hasTemp = props.metData?.temperature?.length
    const hasWind = props.metData?.wind?.length
    const margin = { top: hasWind ? 56 : 26, right: hasTemp ? 55 : 20, bottom: 52, left: 50 }

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

    const data: { time: number; level: number }[] = []
    for (let t = startTime; t <= endTime; t += step) {
      data.push({ time: t, level: predictTide(t, props.constituents, props.meanSeaLevel) })
    }

    const currentLevel = predictTide(now, props.constituents, props.meanSeaLevel)
    const recentLevel = predictTide(now - 6 * 60 * 1000, props.constituents, props.meanSeaLevel)
    const rising = currentLevel > recentLevel

    const extremes = findHighLowTides(data)

    const yExtent = d3.extent(data, (d) => d.level) as [number, number]
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

    // Chart background with paper texture
    svg
      .append('rect')
      .attr('x', margin.left)
      .attr('y', margin.top)
      .attr('width', width - margin.left - margin.right)
      .attr('height', height - margin.top - margin.bottom)
      .attr('fill', '#f0e6d3')
      .attr('filter', 'url(#paper-grain)')
      .attr('opacity', 0.3)

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
      .attr('y1', yScale(props.meanSeaLevel))
      .attr('y2', yScale(props.meanSeaLevel))
      .attr('stroke', '#7d7d7d')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '8,4')
      .attr('stroke-opacity', 0.6)

    svg
      .append('text')
      .attr('x', width - margin.right - 4)
      .attr('y', yScale(props.meanSeaLevel) - 6)
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

    // Area fill
    const area = d3
      .area<{ time: number; level: number }>()
      .x((d) => xScale(d.time))
      .y0(yScale(props.meanSeaLevel))
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
    if (hasTemp) {
      const tempData = props.metData!.temperature!
      const observed = tempData.filter((d) => !d.forecast)
      const forecast = tempData.filter((d) => d.forecast)
      const tempExtent = d3.extent(tempData, (d) => d.value) as [number, number]
      const tempPad = (tempExtent[1] - tempExtent[0]) * 0.2 || 5

      const tempScale = d3
        .scaleLinear()
        .domain([tempExtent[0] - tempPad, tempExtent[1] + tempPad])
        .range([height - margin.bottom, margin.top])

      const tempLine = d3
        .line<{ time: number; value: number }>()
        .x((d) => xScale(d.time))
        .y((d) => tempScale(d.value))
        .curve(d3.curveBasis)

      if (observed.length) {
        svg
          .append('path')
          .datum(observed)
          .attr('d', tempLine)
          .attr('fill', 'none')
          .attr('stroke', '#b35900')
          .attr('stroke-width', 1.5)
          .attr('stroke-dasharray', '4,3')
          .attr('stroke-opacity', 0.6)
      }

      if (forecast.length) {
        // Bridge: last observed + first forecast for continuity
        const bridgeData = observed.length ? [observed[observed.length - 1], ...forecast] : forecast
        svg
          .append('path')
          .datum(bridgeData)
          .attr('d', tempLine)
          .attr('fill', 'none')
          .attr('stroke', '#b35900')
          .attr('stroke-width', 1.5)
          .attr('stroke-dasharray', '2,4')
          .attr('stroke-opacity', 0.35)
      }

      const tempAxis = d3
        .axisRight(tempScale)
        .ticks(5)
        .tickFormat((d) => `${d}°`)
        .tickSize(4)

      svg
        .append('g')
        .attr('class', 'axis temp-axis')
        .attr('transform', `translate(${width - margin.right},0)`)
        .call(tempAxis)
        .call((g) => g.select('.domain').attr('stroke', '#b35900').attr('stroke-opacity', 0.3))
        .call((g) => g.selectAll('.tick line').attr('stroke', '#b35900').attr('stroke-opacity', 0.2))
        .call((g) => g.selectAll('.tick text').attr('fill', '#b35900').attr('font-size', '9px'))

      svg
        .append('text')
        .attr('x', width - margin.right + 4)
        .attr('y', margin.top - 8)
        .attr('text-anchor', 'start')
        .attr('class', 'mean-label')
        .attr('fill', '#b35900')
        .text('°F')
    }

    // --- Wind annotation strip ---
    if (hasWind) {
      const windData = props.metData!.wind!
      // Sample observed data (6-min intervals) every ~2h, forecast (hourly) every entry
      const windSampled = windData.filter((w, i) => w.forecast || i % 20 === 0)
      const maxSpeed = d3.max(windData, (d) => d.speed) || 1

      windSampled.forEach((w) => {
        const x = xScale(w.time)
        if (x < margin.left || x > width - margin.right) return
        const y = margin.top - 14
        const baseOpacity = 0.3 + 0.5 * (w.speed / maxSpeed)
        const opacity = w.forecast ? baseOpacity * 0.5 : baseOpacity

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
          .attr('fill-opacity', w.forecast ? 0.3 : 0.5)
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
    const dayStarts = d3.timeDay.range(new Date(startTime), new Date(endTime))
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

    // Find nearest weather observation/forecast for a given time
    function findNearest<T extends { time: number }>(arr: T[], time: number): T | null {
      if (!arr.length) return null
      let best = arr[0]
      let bestDist = Math.abs(arr[0].time - time)
      for (let i = 1; i < arr.length; i++) {
        const dist = Math.abs(arr[i].time - time)
        if (dist < bestDist) { best = arr[i]; bestDist = dist }
        else break // sorted, so once distance increases we're past the closest
      }
      // Only match within 1 hour
      return bestDist < 60 * 60 * 1000 ? best : null
    }

    svg.append('rect')
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
        const hoverTime = xScale.invert(mx).getTime()
        const level = predictTide(hoverTime, props.constituents, props.meanSeaLevel)
        const x = xScale(hoverTime)
        const y = yScale(level)

        hoverGroup.select('.hover-line')
          .attr('x1', x).attr('x2', x)

        hoverDot.attr('cx', x).attr('cy', y)

        // Build tooltip lines
        const timeStr = d3.timeFormat('%a %-I:%M %p')(new Date(hoverTime))
        const lines: string[] = [timeStr, `${level.toFixed(2)} ft`]

        if (props.metData?.temperature?.length) {
          const temp = findNearest(props.metData.temperature, hoverTime)
          if (temp) lines.push(`${temp.value.toFixed(0)}°F`)
        }
        if (props.metData?.wind?.length) {
          const wind = findNearest(props.metData.wind, hoverTime)
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
      })

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

    if (hasTemp) {
      const latest = props.metData!.temperature![props.metData!.temperature!.length - 1]
      info.append('div').attr('class', 'tide-reading').html(`
        <span class="reading-value">${latest.value.toFixed(0)}°F</span>
        <span class="reading-label">Air Temp</span>
      `)
    }

    if (hasWind) {
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
  }

  return <div ref={container} class="tide-chart-container" />
}
