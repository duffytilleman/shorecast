import type { Constituent } from './tides'
import { storageGet, storageSet } from './storage'

const MDAPI = 'https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi'

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
  if (lsCached) {
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

  return { constituents, meanSeaLevel, stationName }
}
