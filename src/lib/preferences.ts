import { storageGet, storageSet } from './storage'

export type TideReference = 'msl' | 'mllw'

export interface HighlightThresholds {
  tideMin: number | null   // ft — interpreted per tideReference
  tideMax: number | null
  tideReference: TideReference  // 'msl' = relative to mean sea level, 'mllw' = relative to datum
  tempMin: number | null   // °F
  tempMax: number | null
  windMin: number | null   // knots
  windMax: number | null
}

export const DEFAULT_THRESHOLDS: HighlightThresholds = {
  tideMin: 0,             // 0 ft relative to MSL = above mean sea level
  tideMax: null,
  tideReference: 'msl',
  tempMin: 70,            // was: hardcoded 70°F
  tempMax: null,
  windMin: null,
  windMax: null,
}

const STORAGE_KEY = 'highlight-thresholds'

export function loadThresholds(): HighlightThresholds {
  const saved = storageGet<Partial<HighlightThresholds>>(STORAGE_KEY)
  return saved ? { ...DEFAULT_THRESHOLDS, ...saved } : { ...DEFAULT_THRESHOLDS }
}

export function saveThresholds(t: HighlightThresholds) {
  storageSet(STORAGE_KEY, t)
}
