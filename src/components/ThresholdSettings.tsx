import { createSignal } from 'solid-js'
import type { HighlightThresholds, TideReference } from '../lib/preferences'
import { DEFAULT_THRESHOLDS } from '../lib/preferences'

interface Props {
  thresholds: HighlightThresholds
  meanSeaLevel: number
  onSave: (t: HighlightThresholds) => void
  onClose: () => void
}

function NumberInput(props: {
  label: string
  unit: string
  value: number | null
  onChange: (v: number | null) => void
  step?: number
}) {
  const enabled = () => props.value !== null
  return (
    <div class="threshold-field">
      <label class="threshold-label">
        <input
          type="checkbox"
          checked={enabled()}
          onChange={(e) => props.onChange(e.currentTarget.checked ? 0 : null)}
        />
        <span>{props.label}</span>
      </label>
      <div class="threshold-input-wrap">
        <input
          type="number"
          class="threshold-input"
          value={enabled() ? props.value! : ''}
          disabled={!enabled()}
          step={props.step ?? 1}
          onInput={(e) => {
            const v = parseFloat(e.currentTarget.value)
            if (!isNaN(v)) props.onChange(v)
          }}
        />
        <span class="threshold-unit">{props.unit}</span>
      </div>
    </div>
  )
}

export default function ThresholdSettings(props: Props) {
  const [draft, setDraft] = createSignal<HighlightThresholds>({ ...props.thresholds })

  const update = (key: keyof HighlightThresholds, value: number | null) => {
    setDraft((prev) => ({ ...prev, [key]: value }))
  }

  const handleSave = () => {
    props.onSave(draft())
    props.onClose()
  }

  const handleReset = () => {
    setDraft({ ...DEFAULT_THRESHOLDS })
  }

  const switchReference = (to: TideReference) => {
    setDraft((prev) => {
      if (prev.tideReference === to) return prev
      const msl = props.meanSeaLevel
      // MSL→MLLW: add MSL offset; MLLW→MSL: subtract MSL offset
      const delta = to === 'mllw' ? msl : -msl
      const convert = (v: number | null) => v != null ? Math.round((v + delta) * 100) / 100 : null
      return { ...prev, tideReference: to, tideMin: convert(prev.tideMin), tideMax: convert(prev.tideMax) }
    })
  }

  return (
    <div class="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) props.onClose() }}>
      <div class="modal-content">
        <h2 class="modal-title">Highlight Thresholds</h2>
        <p class="modal-desc">
          Configure when chart sections are highlighted. Regions are shaded where
          all enabled conditions are met simultaneously.
        </p>

        <div class="threshold-section">
          <h3 class="threshold-section-title">Tide Level</h3>
          <div class="tide-reference-toggle">
            <span class="toggle-label">Relative to:</span>
            <button
              class="toggle-btn"
              classList={{ 'toggle-btn-active': draft().tideReference === 'msl' }}
              onClick={() => switchReference('msl')}
            >Mean Sea Level</button>
            <button
              class="toggle-btn"
              classList={{ 'toggle-btn-active': draft().tideReference === 'mllw' }}
              onClick={() => switchReference('mllw')}
            >MLLW Datum</button>
          </div>
          <div class="threshold-row">
            <NumberInput label="Min" unit="ft" value={draft().tideMin} step={0.1}
              onChange={(v) => update('tideMin', v)} />
            <NumberInput label="Max" unit="ft" value={draft().tideMax} step={0.1}
              onChange={(v) => update('tideMax', v)} />
          </div>
        </div>

        <div class="threshold-section">
          <h3 class="threshold-section-title">Temperature</h3>
          <div class="threshold-row">
            <NumberInput label="Min" unit="°F" value={draft().tempMin}
              onChange={(v) => update('tempMin', v)} />
            <NumberInput label="Max" unit="°F" value={draft().tempMax}
              onChange={(v) => update('tempMax', v)} />
          </div>
        </div>

        <div class="threshold-section">
          <h3 class="threshold-section-title">Wind Speed</h3>
          <div class="threshold-row">
            <NumberInput label="Min" unit="kn" value={draft().windMin}
              onChange={(v) => update('windMin', v)} />
            <NumberInput label="Max" unit="kn" value={draft().windMax}
              onChange={(v) => update('windMax', v)} />
          </div>
        </div>

        <div class="modal-actions">
          <button class="modal-btn modal-btn-secondary" onClick={handleReset}>Reset Defaults</button>
          <div class="modal-actions-right">
            <button class="modal-btn modal-btn-secondary" onClick={props.onClose}>Cancel</button>
            <button class="modal-btn modal-btn-primary" onClick={handleSave}>Save</button>
          </div>
        </div>
      </div>
    </div>
  )
}
