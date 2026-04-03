import { onMount, onCleanup } from 'solid-js'
import * as d3 from 'd3'
import { BERKELEY_MEAN_SEA_LEVEL_FEET, type Constituent, predictTide } from '../lib/tides'

interface TideChartProps {
  constituents: Constituent[]
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

  onMount(() => {
    renderChart()
    const interval = setInterval(renderChart, 60_000)
    onCleanup(() => clearInterval(interval))

    const observer = new ResizeObserver(() => renderChart())
    observer.observe(container)
    onCleanup(() => observer.disconnect())
  })

  function renderChart() {
    container.innerHTML = ''

    const rect = container.getBoundingClientRect()
    const width = Math.max(rect.width, 600)
    const height = 420
    const margin = { top: 30, right: 30, bottom: 50, left: 60 }

    const now = Date.now()
    const startTime = now - 24 * 60 * 60 * 1000
    const endTime = now + 24 * 60 * 60 * 1000
    const step = 6 * 60 * 1000 // 6 minutes

    const data: { time: number; level: number }[] = []
    for (let t = startTime; t <= endTime; t += step) {
      data.push({ time: t, level: predictTide(t, props.constituents) })
    }

    const currentLevel = predictTide(now, props.constituents)
    const recentLevel = predictTide(now - 6 * 60 * 1000, props.constituents)
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

    const svg = d3
      .select(container)
      .append('svg')
      .attr('viewBox', `0 0 ${width} ${height}`)
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
      .attr('y1', yScale(BERKELEY_MEAN_SEA_LEVEL_FEET))
      .attr('y2', yScale(BERKELEY_MEAN_SEA_LEVEL_FEET))
      .attr('stroke', '#7d7d7d')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '8,4')
      .attr('stroke-opacity', 0.6)

    svg
      .append('text')
      .attr('x', width - margin.right - 4)
      .attr('y', yScale(BERKELEY_MEAN_SEA_LEVEL_FEET) - 6)
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
      .y0(yScale(BERKELEY_MEAN_SEA_LEVEL_FEET))
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

    const nextExtreme = extremes.find((e) => e.time > now)
    if (nextExtreme) {
      const timeStr = d3.timeFormat('%-I:%M %p')(new Date(nextExtreme.time))
      info.append('div').attr('class', 'tide-next').html(`
        <span class="next-label">Next ${nextExtreme.type === 'high' ? 'High' : 'Low'} Tide</span>
        <span class="next-value">${nextExtreme.level.toFixed(1)} ft at ${timeStr}</span>
      `)
    }
  }

  return <div ref={container} class="tide-chart-container" />
}
