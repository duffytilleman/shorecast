## Project

SolidJS + D3 web app for visualizing NOAA tide predictions, weather overlays (wind/temperature), and tidal harmonic constituents for US coastal stations.

## Key files

- `src/App.tsx` — routing and top-level layout
- `src/components/TideChart.tsx` — main D3 tide/weather chart
- `src/components/HarmonicCircles.tsx` — harmonic constituent visualizer
- `src/components/StationSearch.tsx` — station picker
- `src/lib/noaa.ts` — NOAA API data fetching
- `src/lib/tides.ts` — tide prediction math

## Commands

- **Test:** `pnpm test`
- **Build:** `pnpm build`

## Version control

Use jj (Jujutsu), not git, for all version control operations.

- `jj log --limit 10` — view recent changes
- `jj show --git` — inspect working copy
- `jj show --git $CHANGEID` — inspect a change
- `jj commit -m $MESSAGE` — commit the working copy
- `jj commit -m $MESSAGE $file1 $file2` — partial commit
- `jj describe -m $MESSAGE $CHANGEID` — edit an existing change's description
