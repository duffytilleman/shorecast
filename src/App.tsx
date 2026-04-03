import './App.css'
import TideChart from './components/TideChart'
import HarmonicCircles from './components/HarmonicCircles'
import { constituents } from './lib/berkeleyConstituents'

function App() {
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
      <TideChart constituents={constituents} />
      <section class="harmonic-section">
        <h2 class="harmonic-title">Harmonic Constituents</h2>
        <p class="harmonic-subtitle">Eight largest constituents chained as epicycles &mdash; the endpoint traces the predicted tide</p>
        <HarmonicCircles constituents={constituents} />
      </section>
      <footer class="footer">
        <p>Harmonic tide predictions based on 37 constituents &bull; Heights relative to mean water level</p>
      </footer>
    </main>
  )
}

export default App
