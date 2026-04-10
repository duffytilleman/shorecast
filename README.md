# Shorecast

Tide predictions and weather for US coastal stations. Computes tides from NOAA harmonic constituents and overlays wind and temperature data from NWS forecasts.

Tide heights are computed client-side using [@neaps/tide-predictor](https://github.com/neaps/tide-predictor) with harmonic constituents fetched via the [NOAA CO-OPS API](https://tidesandcurrents.noaa.gov/api/). Weather data (wind, temperature) comes from the [NWS API](https://www.weather.gov/documentation/services-web-api).

Built with SolidJS and D3. Deployed on Cloudflare Pages.

## Routing

The app uses real pathname routing (e.g. `/9414290`, `/9414290/harmonics`) via the History API rather than hash fragments. A lightweight global click interceptor in `App.tsx` handles SPA navigation without needing `@solidjs/router`. Cloudflare Pages serves the SPA shell for all paths via `public/_redirects`; Vite's dev server does this by default.

## Dev scripts

```bash
pnpm dev        # start dev server
pnpm build      # production build
pnpm preview    # preview production build
pnpm test       # run tests
pnpm typecheck  # type-check with tsc
```
