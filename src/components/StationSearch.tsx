import { createSignal, onMount, For, Show } from 'solid-js'
import { fetchStations, getRecentStations, type Station } from '../lib/noaa'

const MAX_RESULTS = 50

export default function StationSearch() {
  const [query, setQuery] = createSignal('')
  const [stations, setStations] = createSignal<Station[]>([])
  const [loading, setLoading] = createSignal(true)

  onMount(async () => {
    try {
      setStations(await fetchStations())
    } catch {
      // stations stays empty
    }
    setLoading(false)
  })

  const recents = () => {
    const recentIds = getRecentStations()
    if (!recentIds.length) return []
    const stationMap = new Map(stations().map((s) => [s.id, s]))
    return recentIds.map((id) => stationMap.get(id)).filter((s): s is Station => !!s)
  }

  const filtered = () => {
    const q = query().toLowerCase().trim()
    if (!q) return recents()
    return stations()
      .filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.state.toLowerCase().includes(q) ||
          s.id.includes(q),
      )
      .slice(0, MAX_RESULTS)
  }

  return (
    <div class="station-search">
      <div class="search-prompt">
        <p class="search-heading">Select a Tide Station</p>
        <p class="search-subtext">Search NOAA water level stations by name, state, or ID</p>
      </div>

      <div class="search-input-wrap">
        <input
          type="text"
          class="search-input"
          placeholder="e.g. San Francisco, CA, or 9414290"
          value={query()}
          onInput={(e) => setQuery(e.currentTarget.value)}
          autofocus
        />
      </div>

      <Show when={loading()}>
        <p class="search-loading">Loading stations&hellip;</p>
      </Show>

      <Show when={!loading()}>
        <div class="search-results">
          <Show when={!query().trim() && recents().length > 0}>
            <p class="search-empty" style="opacity: 0.6; font-style: italic">Recent stations</p>
          </Show>
          <For each={filtered()}>
            {(station) => (
              <a href={`#/${station.id}`} class="search-result">
                <span class="result-name">{station.name}</span>
                <span class="result-meta">
                  {station.state ? `${station.state} — ` : ''}
                  {station.id}
                </span>
              </a>
            )}
          </For>
          <Show when={filtered().length === 0 && query().trim()}>
            <p class="search-empty">No stations found</p>
          </Show>
        </div>
      </Show>
    </div>
  )
}
