import { createSignal, onCleanup, onMount } from 'solid-js'
import './App.css'
import TideChart from './components/TideChart'
import HarmonicCircles from './components/HarmonicCircles'
import { constituents } from './lib/berkeleyConstituents'

type Page = 'home' | 'harmonics'

function getPageFromHash(): Page {
  return window.location.hash === '#/harmonics' ? 'harmonics' : 'home'
}

function App() {
  const [page, setPage] = createSignal<Page>(getPageFromHash())

  onMount(() => {
    const syncPage = () => setPage(getPageFromHash())
    window.addEventListener('hashchange', syncPage)
    onCleanup(() => window.removeEventListener('hashchange', syncPage))
  })

  return (
    <main class="app">
      <header class="header">
        <div class="header-ornament">&#x2699;</div>
        <h1 class="title">Berkeley Tides</h1>
        <p class="subtitle">Station 9414816 &mdash; San Francisco Bay</p>
        <div class="header-rule">
          <span class="rule-ornament">&#x2767;</span>
        </div>
      </header>

      <section
        class="graph-shell"
        classList={{ 'graph-shell-plain': true }}
        aria-label={page() === 'home' ? 'Main tide chart' : 'Harmonic constituents'}
      >
        <div class="tab-panel-frame">
          {page() === 'home' ? (
            <section class="tab-panel">
              <TideChart constituents={constituents} />
            </section>
          ) : (
            <section class="tab-panel">
              <HarmonicCircles constituents={constituents} />
            </section>
          )}
        </div>
      </section>

      <footer class="footer">
        <p>Harmonic tide predictions based on 37 constituents &bull; Heights relative to mean water level</p>
      </footer>

      <a
        href={page() === 'home' ? '#/harmonics' : '#/'}
        class="page-switch-link"
      >
        {page() === 'home' ? 'Harmonic Constituents' : 'Main Tide Chart'}
      </a>
    </main>
  )
}

export default App
