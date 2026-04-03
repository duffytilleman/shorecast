import type { Constituent } from './tides'
import { storageGet, storageSet } from './storage'

const MDAPI = 'https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi'
const COOPS_API = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter'

export interface WindObservation {
  time: number
  speed: number
  direction: string
  directionDeg: number
  gust: number
  forecast?: boolean
}

export interface TempObservation {
  time: number
  value: number
  forecast?: boolean
}

export interface MetData {
  wind: WindObservation[] | null
  temperature: TempObservation[] | null
}

export interface Station {
  id: string
  name: string
  state: string
  lat: number
  lng: number
}

export interface StationData {
  constituents: Constituent[]
  meanSeaLevel: number
  stationName: string
  lat: number
  lng: number
}

export function getLastStation(): string | null {
  return storageGet<string>('lastStation')
}

export function setLastStation(id: string) {
  storageSet('lastStation', id)
}

// --- Station list ---

let stationsPromise: Promise<Station[]> | null = null

export function fetchStations(): Promise<Station[]> {
  if (stationsPromise) return stationsPromise

  const cached = storageGet<Station[]>('stations')

  stationsPromise = fetch(`${MDAPI}/stations.json?type=harcon`)
    .then((r) => r.json())
    .then((data) => {
      const stations: Station[] = (data.stations ?? [])
        .filter((s: any) => s.id && s.name)
        .map((s: any) => ({
          id: s.id,
          name: s.name,
          state: s.state ?? '',
          lat: s.lat,
          lng: s.lng,
        }))
      storageSet('stations', stations)
      return stations
    })
    .catch(() => {
      if (cached) return cached
      throw new Error('Failed to fetch station list')
    })

  // Return cached data immediately if available, but the promise above
  // will update localStorage in the background
  if (cached) {
    return Promise.resolve(cached)
  }

  return stationsPromise
}

// --- Station data (constituents + datums) ---

const stationDataCache = new Map<string, StationData>()

export async function fetchStationData(stationId: string): Promise<StationData> {
  const cached = stationDataCache.get(stationId)
  if (cached) return cached

  const lsCached = storageGet<StationData>(`station:${stationId}`)
  if (lsCached && lsCached.lat != null) {
    stationDataCache.set(stationId, lsCached)
    // Refresh in background
    fetchStationDataFromApi(stationId).then((fresh) => {
      stationDataCache.set(stationId, fresh)
      storageSet(`station:${stationId}`, fresh)
    }).catch(() => {})
    return lsCached
  }

  const data = await fetchStationDataFromApi(stationId)
  stationDataCache.set(stationId, data)
  storageSet(`station:${stationId}`, data)
  return data
}

async function fetchStationDataFromApi(stationId: string): Promise<StationData> {
  const [harconRes, datumsRes, stationRes] = await Promise.all([
    fetch(`${MDAPI}/stations/${stationId}/harcon.json?units=english`),
    fetch(`${MDAPI}/stations/${stationId}/datums.json?units=english`),
    fetch(`${MDAPI}/stations/${stationId}.json`),
  ])

  if (!harconRes.ok) throw new Error(`Failed to fetch constituents for station ${stationId}`)
  if (!datumsRes.ok) throw new Error(`Failed to fetch datums for station ${stationId}`)

  const harconData = await harconRes.json()
  const datumsData = await datumsRes.json()
  const stationInfo = stationRes.ok ? await stationRes.json() : null

  const constituents: Constituent[] = (harconData.HarmonicConstituents ?? []).map((h: any) => ({
    name: h.name,
    amplitude: h.amplitude,
    phase: h.phase_GMT,
    speed: h.speed,
    description: h.description,
  }))

  const msl = datumsData.datums?.find((d: any) => d.name === 'MSL')?.value ?? 0
  const mllw = datumsData.datums?.find((d: any) => d.name === 'MLLW')?.value ?? 0
  const meanSeaLevel = msl - mllw

  const stationName = stationInfo?.stations?.[0]?.name ?? stationId
  const lat = stationInfo?.stations?.[0]?.lat ?? 0
  const lng = stationInfo?.stations?.[0]?.lng ?? 0

  return { constituents, meanSeaLevel, stationName, lat, lng }
}

// --- Meteorological data (wind + temperature) ---

const metCache = new Map<string, { data: MetData; fetchedAt: number }>()
const MET_CACHE_TTL = 5 * 60 * 1000

function formatCoopsDate(ms: number): string {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

const NWS_API = 'https://api.weather.gov'
const NWS_HEADERS = { 'User-Agent': 'tides-app (github.com)' }
const FORECAST_CACHE_TTL = 30 * 60 * 1000

const compassToDeg: Record<string, number> = {
  N: 0, NNE: 22.5, NE: 45, ENE: 67.5, E: 90, ESE: 112.5, SE: 135, SSE: 157.5,
  S: 180, SSW: 202.5, SW: 225, WSW: 247.5, W: 270, WNW: 292.5, NW: 315, NNW: 337.5,
}

// Cache /points responses permanently (grid doesn't change)
const pointsCache = new Map<string, string>()
const forecastCache = new Map<string, { data: MetData; fetchedAt: number }>()

async function fetchForecast(lat: number, lng: number): Promise<MetData> {
  const pointsKey = `${lat.toFixed(4)},${lng.toFixed(4)}`

  const cached = forecastCache.get(pointsKey)
  if (cached && Date.now() - cached.fetchedAt < FORECAST_CACHE_TTL) {
    console.debug(`[met] forecast cache hit, age ${Math.round((Date.now() - cached.fetchedAt) / 1000)}s`)
    return cached.data
  }

  let forecastUrl = pointsCache.get(pointsKey)
  if (!forecastUrl) {
    console.debug(`[met] fetching NWS grid for ${pointsKey}`)
    const pointsRes = await fetch(`${NWS_API}/points/${pointsKey}`, { headers: NWS_HEADERS })
    if (!pointsRes.ok) throw new Error(`NWS /points failed: ${pointsRes.status}`)
    const pointsData = await pointsRes.json()
    forecastUrl = pointsData.properties?.forecastHourly
    if (!forecastUrl) throw new Error('No forecastHourly URL in NWS response')
    pointsCache.set(pointsKey, forecastUrl)
  }

  console.debug(`[met] fetching NWS hourly forecast`)
  const forecastRes = await fetch(forecastUrl, { headers: NWS_HEADERS })
  if (!forecastRes.ok) throw new Error(`NWS forecast failed: ${forecastRes.status}`)
  const forecastData = await forecastRes.json()

  const periods = forecastData.properties?.periods ?? []
  const now = Date.now()
  const cutoff = now + 72 * 60 * 60 * 1000

  const wind: WindObservation[] = []
  const temperature: TempObservation[] = []

  for (const p of periods) {
    const time = new Date(p.startTime).getTime()
    if (time < now || time > cutoff) continue

    temperature.push({ time, value: p.temperature, forecast: true })

    const speedMatch = String(p.windSpeed).match(/(\d+)/)
    const speedMph = speedMatch ? parseFloat(speedMatch[1]) : 0
    const speedKnots = speedMph / 1.151

    wind.push({
      time,
      speed: Math.round(speedKnots * 10) / 10,
      direction: p.windDirection ?? '',
      directionDeg: compassToDeg[p.windDirection] ?? 0,
      gust: 0,
      forecast: true,
    })
  }

  console.debug(`[met] forecast: ${temperature.length} temp periods, ${wind.length} wind periods`)

  const data: MetData = {
    wind: wind.length ? wind : null,
    temperature: temperature.length ? temperature : null,
  }
  forecastCache.set(pointsKey, { data, fetchedAt: Date.now() })
  return data
}

export async function fetchMetData(stationId: string, lat: number, lng: number): Promise<MetData> {
  const cached = metCache.get(stationId)
  if (cached && Date.now() - cached.fetchedAt < MET_CACHE_TTL) {
    console.debug(`[met] cache hit for station ${stationId}, age ${Math.round((Date.now() - cached.fetchedAt) / 1000)}s`)
    return cached.data
  }

  const now = Date.now()
  const beginMs = now - 12 * 60 * 60 * 1000
  const base = `${COOPS_API}?begin_date=${encodeURIComponent(formatCoopsDate(beginMs))}&end_date=${encodeURIComponent(formatCoopsDate(now))}&station=${stationId}&units=english&time_zone=gmt&format=json`

  console.debug(`[met] fetching wind + temperature for station ${stationId}`)

  const [windResult, tempResult, forecast] = await Promise.all([
    fetch(`${base}&product=wind`).then((r) => r.json()).catch((e) => { console.debug('[met] wind fetch failed:', e); return null }),
    fetch(`${base}&product=air_temperature`).then((r) => r.json()).catch((e) => { console.debug('[met] temperature fetch failed:', e); return null }),
    fetchForecast(lat, lng).catch((e) => { console.debug('[met] forecast fetch failed:', e); return null }),
  ])

  let wind: WindObservation[] | null = null
  if (windResult?.data && !windResult.error) {
    wind = windResult.data.map((d: any) => ({
      time: new Date(d.t + ' UTC').getTime(),
      speed: parseFloat(d.s),
      direction: d.dr,
      directionDeg: parseFloat(d.d),
      gust: parseFloat(d.g),
    }))
    console.debug(`[met] wind: ${wind.length} observations`)
  } else {
    console.debug(`[met] wind: unavailable`, windResult?.error?.message ?? 'no data')
  }

  let temperature: TempObservation[] | null = null
  if (tempResult?.data && !tempResult.error) {
    temperature = tempResult.data.map((d: any) => ({
      time: new Date(d.t + ' UTC').getTime(),
      value: parseFloat(d.v),
    }))
    console.debug(`[met] temperature: ${temperature.length} observations`)
  } else {
    console.debug(`[met] temperature: unavailable`, tempResult?.error?.message ?? 'no data')
  }

  // Merge forecast data
  if (forecast?.temperature?.length) {
    temperature = [...(temperature ?? []), ...forecast.temperature]
  }
  if (forecast?.wind?.length) {
    wind = [...(wind ?? []), ...forecast.wind]
  }

  const data: MetData = { wind, temperature }
  metCache.set(stationId, { data, fetchedAt: Date.now() })
  return data
}
