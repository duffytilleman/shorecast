import { onMount, onCleanup, createSignal, createEffect } from 'solid-js'
import * as d3 from 'd3'
import { type Constituent, predictTide } from '../lib/tides'

interface DailyTideChartProps {
  constituents: Constituent[]
  meanSeaLevel: number
}

const DAYS = 90

function defaultTime(): string {
  const d = new Date()
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(Math.round(d.getMinutes() / 15) * 15 % 60).padStart(2, '0')
  return `${hh}:${mm}`
}

function parseTime(value: string): { hours: number; minutes: number } {
  const [h, m] = value.split(':').map(Number)
  return { hours: h || 0, minutes: m || 0 }
}

function formatTimeLabel(value: string): string {
  const { hours, minutes } = parseTime(value)
  const h12 = ((hours + 11) % 12) + 1
  const ampm = hours < 12 ? 'AM' : 'PM'
  const mm = String(minutes).padStart(2, '0')
  return `${h12}:${mm} ${ampm}`
}

export default function DailyTideChart(props: DailyTideChartProps) {
  let container!: HTMLDivElement
  const [timeValue, setTimeValue] = createSignal(defaultTime())

  onMount(() => {
    renderChart()
    const observer = new ResizeObserver(() => renderChart())
    observer.observe(container)
    onCleanup(() => observer.disconnect())
  })

  createEffect(() => {
    timeValue()
    if (container) renderChart()
  })

  function renderChart() {
    container.innerHTML = ''

    const rect = container.getBoundingClientRect()
    const width = Math.max(rect.width, 600)
    const height = Math.max(320, Math.min(rect.height || 540, 640))
    const margin = { top: 32, right: 28, bottom: 56, left: 56 }

    const { hours, minutes } = parseTime(timeValue())

    // Build data: tide level at chosen time on each of the next 90 days, anchored to local "today"
    const start = new Date()
    start.setHours(0, 0, 0, 0)

    const data: { date: Date; level: number }[] = []
    for (let i = 0; i < DAYS; i++) {
      const d = new Date(start)
      d.setDate(d.getDate() + i)
      d.setHours(hours, minutes, 0, 0)
      data.push({ date: new Date(d), level: predictTide(d.getTime(), props.constituents, props.meanSeaLevel) })
    }

    const xExtent = [data[0].date, data[data.length - 1].date] as [Date, Date]
    const yExtent = d3.extent(data, (d) => d.level) as [number, number]
    // Ensure MSL is always inside the y-domain so the relative shading reads correctly
    if (props.meanSeaLevel < yExtent[0]) yExtent[0] = props.meanSeaLevel
    if (props.meanSeaLevel > yExtent[1]) yExtent[1] = props.meanSeaLevel
    const yPad = Math.max((yExtent[1] - yExtent[0]) * 0.18, 0.5)

    const xScale = d3.scaleTime()
      .domain(xExtent)
      .range([margin.left, width - margin.right])

    const yScale = d3.scaleLinear()
      .domain([yExtent[0] - yPad, yExtent[1] + yPad])
      .range([height - margin.bottom, margin.top])

    const svg = d3.select(container).append('svg')
      .attr('width', width)
      .attr('height', height)
      .attr('class', 'tide-svg daily-tide-svg')

    // Gradient — same as main tide chart so shading matches
    const defs = svg.append('defs')
    const gradient = defs.append('linearGradient')
      .attr('id', 'daily-tide-area-gradient')
      .attr('x1', '0').attr('y1', '0').attr('x2', '0').attr('y2', '1')
    gradient.append('stop').attr('offset', '0%').attr('stop-color', '#2a5a7b').attr('stop-opacity', 0.35)
    gradient.append('stop').attr('offset', '100%').attr('stop-color', '#1a3a4a').attr('stop-opacity', 0.05)

    // Y grid — faint ledger lines
    const yTicks = yScale.ticks(6)
    svg.selectAll('.grid-line-y')
      .data(yTicks).enter().append('line')
      .attr('x1', margin.left).attr('x2', width - margin.right)
      .attr('y1', (d) => yScale(d)).attr('y2', (d) => yScale(d))
      .attr('stroke', '#8b7355')
      .attr('stroke-opacity', 0.15)
      .attr('stroke-width', 0.5)

    // X grid at week boundaries
    const xWeekTicks = xScale.ticks(d3.timeWeek.every(1)!)
    svg.selectAll('.grid-line-x')
      .data(xWeekTicks).enter().append('line')
      .attr('x1', (d) => xScale(d as Date)).attr('x2', (d) => xScale(d as Date))
      .attr('y1', margin.top).attr('y2', height - margin.bottom)
      .attr('stroke', '#8b7355')
      .attr('stroke-opacity', 0.12)
      .attr('stroke-width', 0.5)

    // Mean sea level reference line
    svg.append('line')
      .attr('x1', margin.left).attr('x2', width - margin.right)
      .attr('y1', yScale(props.meanSeaLevel)).attr('y2', yScale(props.meanSeaLevel))
      .attr('stroke', '#7d7d7d')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '8,4')
      .attr('stroke-opacity', 0.6)

    svg.append('text')
      .attr('x', width - margin.right - 4)
      .attr('y', yScale(props.meanSeaLevel) - 6)
      .attr('text-anchor', 'end')
      .attr('class', 'mean-label')
      .text('Mean Sea Level')

    // Area shaded relative to MSL — y0 anchored at MSL, y1 follows the curve.
    // Above MSL, fill renders between MSL line and curve at the upper portion of the gradient
    // (more saturated). Below MSL, fill renders downward into the lower, paler gradient stop.
    const area = d3.area<typeof data[number]>()
      .x((d) => xScale(d.date))
      .y0(yScale(props.meanSeaLevel))
      .y1((d) => yScale(d.level))
      .curve(d3.curveMonotoneX)

    svg.append('path')
      .datum(data)
      .attr('d', area)
      .attr('fill', 'url(#daily-tide-area-gradient)')

    // Tide line — same color/weight as main chart
    const line = d3.line<typeof data[number]>()
      .x((d) => xScale(d.date))
      .y((d) => yScale(d.level))
      .curve(d3.curveMonotoneX)

    svg.append('path')
      .datum(data)
      .attr('d', line)
      .attr('fill', 'none')
      .attr('stroke', '#1a3a5c')
      .attr('stroke-width', 2.5)
      .attr('stroke-linecap', 'round')

    // Min/max markers — ink/sepia like the main chart
    const minPoint = data.reduce((acc, d) => d.level < acc.level ? d : acc, data[0])
    const maxPoint = data.reduce((acc, d) => d.level > acc.level ? d : acc, data[0])
    const fmtExtremaDate = d3.timeFormat('%b %-d')

    for (const [point, type] of [[maxPoint, 'high'], [minPoint, 'low']] as const) {
      const cx = xScale(point.date)
      const cy = yScale(point.level)
      svg.append('circle')
        .attr('cx', cx).attr('cy', cy).attr('r', 3)
        .attr('fill', type === 'high' ? '#1a3a5c' : '#6b5335')
        .attr('stroke', '#f0e6d3')
        .attr('stroke-width', 1)
      svg.append('text').attr('class', 'extrema-label')
        .attr('x', cx).attr('y', type === 'high' ? cy - 12 : cy + 16)
        .attr('text-anchor', 'middle')
        .text(`${point.level.toFixed(1)} ft`)
      svg.append('text').attr('class', 'extrema-time')
        .attr('x', cx).attr('y', type === 'high' ? cy - 24 : cy + 28)
        .attr('text-anchor', 'middle')
        .text(fmtExtremaDate(point.date))
    }

    // X axis — date ticks
    const monthFormat = d3.timeFormat('%b %-d')
    svg.append('g')
      .attr('class', 'axis x-axis')
      .attr('transform', `translate(0,${height - margin.bottom})`)
      .call(
        d3.axisBottom(xScale)
          .tickValues(xWeekTicks)
          .tickFormat((d) => monthFormat(d as Date))
          .tickSize(6),
      )
      .call((g) => g.select('.domain').attr('stroke', '#6b5335').attr('stroke-opacity', 0.6))
      .call((g) => g.selectAll('.tick line').attr('stroke', '#6b5335').attr('stroke-opacity', 0.4))
      .call((g) => g.selectAll('.tick text').attr('fill', '#5a4430'))

    // Y axis
    svg.append('g')
      .attr('class', 'axis y-axis')
      .attr('transform', `translate(${margin.left},0)`)
      .call(d3.axisLeft(yScale).ticks(6).tickFormat((d) => `${d} ft`).tickSize(6))
      .call((g) => g.select('.domain').attr('stroke', '#6b5335').attr('stroke-opacity', 0.6))
      .call((g) => g.selectAll('.tick line').attr('stroke', '#6b5335').attr('stroke-opacity', 0.4))
      .call((g) => g.selectAll('.tick text').attr('fill', '#5a4430'))

    // --- Hover crosshair (mirrors main TideChart) ---
    const hoverGroup = svg.append('g').style('display', 'none')

    hoverGroup.append('line')
      .attr('class', 'hover-line')
      .attr('y1', margin.top).attr('y2', height - margin.bottom)
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

    const tooltipFmtDate = d3.timeFormat('%a %b %-d')
    const bisectDate = d3.bisector<typeof data[number], Date>((d) => d.date).left

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
        const t = xScale.invert(mx)
        const idx = Math.max(0, Math.min(data.length - 1, bisectDate(data, t)))
        const d0 = data[Math.max(0, idx - 1)]
        const d1 = data[idx]
        const point = !d0 || (t.getTime() - d0.date.getTime()) > (d1.date.getTime() - t.getTime()) ? d1 : d0

        const x = xScale(point.date)
        const y = yScale(point.level)

        hoverGroup.select('.hover-line').attr('x1', x).attr('x2', x)
        hoverDot.attr('cx', x).attr('cy', y)

        const lines = [
          tooltipFmtDate(point.date),
          `${point.level.toFixed(2)} ft`,
          `at ${formatTimeLabel(timeValue())}`,
        ]

        tooltipText.selectAll('tspan').remove()
        lines.forEach((text, i) => {
          tooltipText.append('tspan')
            .attr('x', 8)
            .attr('dy', i === 0 ? '1em' : '1.3em')
            .text(text)
        })

        const bbox = (tooltipText.node() as SVGTextElement).getBBox()
        const tooltipW = bbox.width + 16
        const tooltipH = bbox.height + 10

        const preferredX = x + 12
        const flip = preferredX + tooltipW > width - margin.right
        hoverTooltip.attr('transform', `translate(${flip ? x - tooltipW - 12 : preferredX},${Math.max(margin.top, y - tooltipH / 2)})`)

        tooltipBg.attr('width', tooltipW).attr('height', tooltipH)
      })
  }

  return (
    <div class="daily-tide-wrapper">
      <div class="daily-tide-controls">
        <label class="daily-tide-time-label">
          <span>Time of day</span>
          <input
            type="time"
            class="daily-tide-time-input"
            value={timeValue()}
            onInput={(e) => setTimeValue(e.currentTarget.value)}
          />
          <span class="daily-tide-time-display">{formatTimeLabel(timeValue())}</span>
        </label>
        <span class="daily-tide-range">Next {DAYS} days</span>
      </div>
      <div ref={container} class="daily-tide-container" />
    </div>
  )
}
