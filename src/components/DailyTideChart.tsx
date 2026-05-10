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

    // Y grid + axis
    const yTicks = yScale.ticks(6)
    svg.append('g').attr('class', 'grid')
      .selectAll('line').data(yTicks).join('line')
      .attr('x1', margin.left).attr('x2', width - margin.right)
      .attr('y1', (d) => yScale(d)).attr('y2', (d) => yScale(d))
      .attr('stroke', 'rgba(139, 115, 85, 0.18)')
      .attr('stroke-dasharray', '2,3')

    svg.append('g').attr('class', 'axis y-axis')
      .attr('transform', `translate(${margin.left},0)`)
      .call(d3.axisLeft(yScale).ticks(6).tickFormat((d) => `${(+d).toFixed(1)} ft`))
      .call((g) => g.select('.domain').remove())
      .call((g) => g.selectAll('.tick line').attr('stroke', 'rgba(139, 115, 85, 0.3)'))
      .call((g) => g.selectAll('.tick text').attr('fill', 'var(--muted)'))

    // X axis — month/day ticks
    const monthFormat = d3.timeFormat('%b %-d')
    const xTickValues = xScale.ticks(d3.timeWeek.every(1)!)
    svg.append('g').attr('class', 'axis x-axis')
      .attr('transform', `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(xScale).tickValues(xTickValues).tickFormat((d) => monthFormat(d as Date)))
      .call((g) => g.select('.domain').remove())
      .call((g) => g.selectAll('.tick line').attr('stroke', 'rgba(139, 115, 85, 0.3)'))
      .call((g) => g.selectAll('.tick text').attr('fill', 'var(--muted)'))

    // Mean sea level line
    svg.append('line')
      .attr('x1', margin.left).attr('x2', width - margin.right)
      .attr('y1', yScale(props.meanSeaLevel)).attr('y2', yScale(props.meanSeaLevel))
      .attr('stroke', 'rgba(26, 58, 92, 0.45)')
      .attr('stroke-dasharray', '4,3')
      .attr('stroke-width', 1)

    svg.append('text').attr('class', 'mean-label')
      .attr('x', width - margin.right - 4)
      .attr('y', yScale(props.meanSeaLevel) - 4)
      .attr('text-anchor', 'end')
      .text(`MSL ${props.meanSeaLevel.toFixed(2)} ft`)

    // Area fill under curve
    const area = d3.area<typeof data[number]>()
      .x((d) => xScale(d.date))
      .y0(yScale(yExtent[0] - yPad))
      .y1((d) => yScale(d.level))
      .curve(d3.curveMonotoneX)

    svg.append('path')
      .datum(data)
      .attr('fill', 'rgba(26, 58, 92, 0.12)')
      .attr('d', area)

    // Tide line
    const line = d3.line<typeof data[number]>()
      .x((d) => xScale(d.date))
      .y((d) => yScale(d.level))
      .curve(d3.curveMonotoneX)

    svg.append('path')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke', '#1a3a5c')
      .attr('stroke-width', 1.6)
      .attr('d', line)

    // Min/max markers
    const minPoint = data.reduce((acc, d) => d.level < acc.level ? d : acc, data[0])
    const maxPoint = data.reduce((acc, d) => d.level > acc.level ? d : acc, data[0])
    const fmtDate = d3.timeFormat('%b %-d')

    for (const [point, type] of [[maxPoint, 'high'], [minPoint, 'low']] as const) {
      const cx = xScale(point.date)
      const cy = yScale(point.level)
      const labelOffset = type === 'high' ? -10 : 16
      svg.append('circle')
        .attr('cx', cx).attr('cy', cy).attr('r', 3.5)
        .attr('fill', type === 'high' ? '#c0392b' : '#2a6a4a')
      svg.append('text').attr('class', 'extrema-label')
        .attr('x', cx).attr('y', cy + labelOffset)
        .attr('text-anchor', 'middle')
        .text(`${point.level.toFixed(2)} ft`)
      svg.append('text').attr('class', 'extrema-time')
        .attr('x', cx).attr('y', cy + labelOffset + 11)
        .attr('text-anchor', 'middle')
        .text(fmtDate(point.date))
    }

    // Hover line + tooltip
    const focus = svg.append('g').style('display', 'none')
    focus.append('line')
      .attr('class', 'focus-line')
      .attr('y1', margin.top).attr('y2', height - margin.bottom)
      .attr('stroke', 'rgba(192, 57, 43, 0.6)')
      .attr('stroke-width', 1)
    focus.append('circle').attr('r', 4).attr('fill', '#c0392b')

    const tooltipBg = focus.append('rect')
      .attr('fill', 'rgba(246, 239, 223, 0.96)')
      .attr('stroke', 'rgba(139, 115, 85, 0.4)')
      .attr('rx', 3)
    const tooltipText = focus.append('text')
      .attr('class', 'extrema-label')
      .attr('text-anchor', 'middle')

    const tooltipFmt = d3.timeFormat('%a %b %-d')

    svg.append('rect')
      .attr('x', margin.left).attr('y', margin.top)
      .attr('width', width - margin.left - margin.right)
      .attr('height', height - margin.top - margin.bottom)
      .attr('fill', 'transparent')
      .style('cursor', 'crosshair')
      .on('mouseenter', () => focus.style('display', null))
      .on('mouseleave', () => focus.style('display', 'none'))
      .on('mousemove', (event) => {
        const [mx] = d3.pointer(event)
        const t = xScale.invert(mx)
        const bisect = d3.bisector<typeof data[number], Date>((d) => d.date).left
        const idx = Math.max(0, Math.min(data.length - 1, bisect(data, t)))
        const d0 = data[Math.max(0, idx - 1)]
        const d1 = data[idx]
        const point = !d0 || (t.getTime() - d0.date.getTime()) > (d1.date.getTime() - t.getTime()) ? d1 : d0
        const cx = xScale(point.date)
        const cy = yScale(point.level)
        focus.select('.focus-line').attr('x1', cx).attr('x2', cx)
        focus.select('circle').attr('cx', cx).attr('cy', cy)
        const label = `${tooltipFmt(point.date)} — ${point.level.toFixed(2)} ft`
        tooltipText
          .attr('x', cx).attr('y', margin.top - 8)
          .text(label)
        const bbox = (tooltipText.node() as SVGTextElement).getBBox()
        tooltipBg
          .attr('x', bbox.x - 5).attr('y', bbox.y - 2)
          .attr('width', bbox.width + 10).attr('height', bbox.height + 4)
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
