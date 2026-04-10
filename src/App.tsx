import { createSignal, createResource, createEffect, onCleanup, onMount, Show } from 'solid-js'
import './App.css'
import TideChart from './components/TideChart'
import HarmonicCircles from './components/HarmonicCircles'
import StationSearch from './components/StationSearch'
import ThresholdSettings from './components/ThresholdSettings'
import { fetchStationData, fetchMetData, getLastStation, setLastStation } from './lib/noaa'
import { loadThresholds, saveThresholds, type HighlightThresholds } from './lib/preferences'

type Route =
  | { page: 'search' }
  | { page: 'chart'; stationId: string }
  | { page: 'harmonics'; stationId: string }

function parseRoute(): Route {
  const hash = window.location.hash.replace(/^#\/?/, '')
  if (!hash || hash === 'search') return { page: 'search' }

  const parts = hash.split('/')
  const stationId = parts[0]
  if (parts[1] === 'harmonics') return { page: 'harmonics', stationId }
  return { page: 'chart', stationId }
}

function App() {
  // On first load, redirect #/ to last station if saved
  if (!window.location.hash || window.location.hash === '#/' || window.location.hash === '#') {
    const last = getLastStation()
    if (last) {
      window.location.hash = `#/${last}`
    }
  }

  const [route, setRoute] = createSignal<Route>(parseRoute())
  const [thresholds, setThresholds] = createSignal<HighlightThresholds>(loadThresholds())
  const [showSettings, setShowSettings] = createSignal(false)

  const handleSaveThresholds = (t: HighlightThresholds) => {
    setThresholds(t)
    saveThresholds(t)
  }

  onMount(() => {
    const sync = () => setRoute(parseRoute())
    window.addEventListener('hashchange', sync)
    onCleanup(() => window.removeEventListener('hashchange', sync))
  })

  const stationId = () => {
    const r = route()
    return r.page === 'search' ? null : r.stationId
  }

  const [stationData] = createResource(stationId, async (id) => {
    const data = await fetchStationData(id)
    setLastStation(id)
    return data
  })

  const metParams = () => {
    const d = stationData()
    const id = stationId()
    return d && id ? { id, lat: d.lat, lng: d.lng } : null
  }

  const [metData] = createResource(metParams, async (params) => {
    try {
      return await fetchMetData(params.id, params.lat, params.lng)
    } catch {
      return null
    }
  })

  const stationName = () => {
    const data = stationData()
    if (!data) return null
    // stationName from API is just the ID fallback; get a proper name from stations list if needed
    return data.stationName !== stationId() ? data.stationName : null
  }

  createEffect(() => {
    const name = stationName()
    document.title = name ? `${name} — Shorecast` : 'Shorecast'
  })

  return (
    <main class="app">
      <header class="header">
        <Show when={stationId()} fallback={<h1 class="title">Shorecast</h1>}>
          <h1 class="title">
            {stationName() ?? 'Shorecast'}
            <a href="#/search" class="change-station-link" title="Change station">&#x21C6;</a>
          </h1>
          <p class="subtitle">Station {stationId()}</p>
        </Show>
        <div class="header-rule">
          <span class="rule-ornament">&#x2767;</span>
        </div>
      </header>

      <Show when={showSettings()}>
        <ThresholdSettings
          thresholds={thresholds()}
          meanSeaLevel={stationData()?.meanSeaLevel ?? 0}
          onSave={handleSaveThresholds}
          onClose={() => setShowSettings(false)}
        />
      </Show>

      <Show when={route().page === 'search'}>
        <StationSearch />
      </Show>

      <Show when={route().page !== 'search'}>
        <Show when={stationData.loading}>
          <p class="loading-message">Loading station data&hellip;</p>
        </Show>

        <Show when={stationData.error}>
          <p class="error-message">Failed to load station data. Check the station ID and try again.</p>
        </Show>

        <Show when={stationData()}>
          {(data) => (
            <section
              class="graph-shell"
              classList={{ 'graph-shell-plain': true }}
              aria-label={route().page === 'chart' ? 'Main tide chart' : 'Harmonic constituents'}
            >
              <div class="tab-panel-frame">
                <Show when={route().page === 'chart'}>
                  <section class="tab-panel">
                    <TideChart constituents={data().constituents} meanSeaLevel={data().meanSeaLevel} metData={metData()} thresholds={thresholds()} onOpenSettings={() => setShowSettings(true)} />
                  </section>
                </Show>
                <Show when={route().page === 'harmonics'}>
                  <section class="tab-panel">
                    <HarmonicCircles constituents={data().constituents} meanSeaLevel={data().meanSeaLevel} />
                  </section>
                </Show>
              </div>
            </section>
          )}
        </Show>

        <Show when={stationData()}>
          <footer class="footer">
            <p>
              <Show when={route().page === 'chart'} fallback={
                <>Harmonic tide predictions based on {stationData()!.constituents.length} constituents &bull; <a href={`#/${stationId()}`} class="footer-link">Back to tide chart</a></>
              }>
                Harmonic tide predictions based on <a href={`#/${stationId()}/harmonics`} class="footer-link">{stationData()!.constituents.length} constituents</a> &bull; Heights relative to mean water level
              </Show>
            </p>
          </footer>
        </Show>
      </Show>
    </main>
  )
}

export default App
