/**
 * Instants and durations.
 *
 * This is the only module permitted to touch `Date`, and only to convert an
 * instant it was handed. It never calls `Date.now()`. Everything upstream
 * takes the current time as an argument, which is what lets the same plan
 * analysed twice produce byte-identical output — the property the fixture
 * check in `scripts/make-fixtures.ts` depends on.
 *
 * Durations are minutes throughout, as `number | null`. `null` means the
 * estimate does not exist; `0` means the step genuinely takes no measurable
 * time. Summing the two as if they were the same is the specific mistake
 * `addMinutes` and `sumMinutes` exist to prevent.
 */

/** Parse an ISO 8601 instant to epoch milliseconds, or `null` if unparseable. */
export function parseInstant(iso: string): number | null {
  const ms = Date.parse(iso)
  return Number.isFinite(ms) ? ms : null
}

/** Whole minutes from `from` to `to`. `null` if either instant is unparseable. */
export function minutesBetween(from: string, to: string): number | null {
  const a = parseInstant(from)
  const b = parseInstant(to)
  if (a === null || b === null) return null
  return Math.round((b - a) / 60_000)
}

/** `iso` advanced by `minutes`, as ISO 8601. `null` if `iso` is unparseable. */
export function addMinutes(iso: string, minutes: number): string | null {
  const t = parseInstant(iso)
  if (t === null) return null
  return new Date(t + minutes * 60_000).toISOString()
}

/**
 * Sum durations, propagating the absence of one.
 *
 * A total that silently treats an unknown leg as zero is a total that
 * understates the plan, which is the direction that gets somebody to start a
 * capture they cannot finish. The count of unknown legs is returned alongside
 * so the caller can say "at least 84 minutes, plus two steps nobody has
 * timed" rather than "84 minutes".
 */
export function sumMinutes(values: readonly (number | null)[]): {
  known: number
  unknown: number
} {
  let known = 0
  let unknown = 0
  for (const v of values) {
    if (v === null) unknown += 1
    else known += v
  }
  return { known, unknown }
}

/**
 * A duration as a person would say it: `4h 25m`, `18m`, `3d 6h`.
 *
 * Days are used above 48 hours only. Below that, an incident responder thinks
 * in hours, and "1d 3h" is harder to compare against a 36-hour window than
 * "27h" is.
 */
export function formatDuration(minutes: number | null): string {
  if (minutes === null) return 'not estimated'
  const sign = minutes < 0 ? '-' : ''
  const m = Math.abs(Math.round(minutes))
  if (m === 0) return '0m'
  if (m < 60) return `${sign}${m}m`
  const hours = Math.floor(m / 60)
  const rem = m % 60
  if (hours < 48) return rem === 0 ? `${sign}${hours}h` : `${sign}${hours}h ${rem}m`
  const days = Math.floor(hours / 24)
  const hrem = hours % 24
  return hrem === 0 ? `${sign}${days}d` : `${sign}${days}d ${hrem}h`
}

/** A countdown as `HH:MM:SS`, clamped at zero and never abbreviated. */
export function formatClock(minutes: number | null): string {
  if (minutes === null) return '--:--:--'
  if (minutes <= 0) return '00:00:00'
  const total = Math.round(minutes * 60)
  const h = Math.floor(total / 3600)
  const mm = Math.floor((total % 3600) / 60)
  const ss = total % 60
  const pad = (n: number, w = 2): string => String(n).padStart(w, '0')
  return `${pad(h, h >= 100 ? 3 : 2)}:${pad(mm)}:${pad(ss)}`
}

/**
 * An instant in a form that reads the same in every timezone.
 *
 * Deliberately UTC. An incident timeline that renders in the reader's local
 * zone means two people comparing the same report see different times, and the
 * suffix is there so nobody has to guess which one they are looking at.
 */
export function formatInstant(iso: string): string {
  const t = parseInstant(iso)
  if (t === null) return iso
  return `${new Date(t).toISOString().slice(0, 16).replace('T', ' ')}Z`
}

/** Date only, for decision records where the hour is noise. */
export function formatDate(iso: string): string {
  const t = parseInstant(iso)
  if (t === null) return iso
  return new Date(t).toISOString().slice(0, 10)
}
