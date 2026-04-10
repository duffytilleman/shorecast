/** Convert a raw NOAA station name to title case with proper comma spacing. */
export function formatStationName(raw: string): string {
  return raw
    .replace(/,\s*/g, ', ')
    .replace(/\S+/g, (word) =>
      word
        .split('.')
        .map((seg) => seg.charAt(0).toUpperCase() + seg.slice(1).toLowerCase())
        .join('.'),
    )
}
