/**
 * The evidence state strip.
 *
 * One horizontal bar, segmented by outcome and proportional to counts, that
 * answers "how much of this survives" before any number is read. Clicking a
 * segment filters the evidence map to it.
 *
 * Deliberately not six KPI tiles in a row. Six tiles show six numbers and
 * leave the reader to do the arithmetic; one bar shows the *proportions*,
 * which is the thing that actually lands — that two thirds of the evidence
 * comes through, or that almost none of it does.
 *
 * The counts are still rendered, inside the segments where they fit and in
 * the legend beneath where they do not. A proportional bar without figures is
 * a decoration.
 */

import type { OutcomeCounts, PreservationOutcome } from '../domain/types.ts'
import { OUTCOME_LABEL, OUTCOME_TEXT } from '../domain/semantics.ts'
import { FOCUS, LABEL, OUTCOME_STYLE } from './tokens.ts'
import { OUTCOME_ICON } from './icons.tsx'
import { cx } from './primitives.tsx'

/** Worst last, so the eye ends on the bad news. */
const ORDER: readonly PreservationOutcome[] = [
  'preserved',
  'degraded',
  'retained',
  'indeterminate',
  'accepted_loss',
  'lost',
]

export function StateStrip({
  counts,
  active,
  onToggle,
  label = 'Evidence state',
}: {
  counts: OutcomeCounts
  active: readonly PreservationOutcome[]
  onToggle: (o: PreservationOutcome) => void
  label?: string
}) {
  const present = ORDER.filter((k) => counts[k] > 0)
  const total = present.reduce((n, k) => n + counts[k], 0)

  if (total === 0) {
    return (
      <div className="px-5 py-4 text-sm text-ink-3">
        No artifacts are in scope for this asset type.
      </div>
    )
  }

  return (
    <div className="px-5 py-4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <span className={LABEL}>{label}</span>
        <span className="tnum text-2xs text-ink-3">
          {total} artifacts
          {active.length > 0 ? ` · filtered to ${active.length}` : ''}
        </span>
      </div>

      {/* The bar. `flex` with per-segment grow keeps the proportions exact
          while letting a one-artifact segment stay wide enough to hit. */}
      <div
        className="flex h-9 w-full gap-[2px] overflow-hidden rounded"
        role="group"
        aria-label={`${label}: ${present.map((k) => `${counts[k]} ${OUTCOME_LABEL[k].toLowerCase()}`).join(', ')}`}
      >
        {present.map((k) => {
          const share = counts[k] / total
          const on = active.length === 0 || active.includes(k)
          const Icon = OUTCOME_ICON[k]
          return (
            <button
              key={k}
              type="button"
              onClick={() => onToggle(k)}
              aria-pressed={active.includes(k)}
              title={`${counts[k]} ${OUTCOME_LABEL[k].toLowerCase()} — ${OUTCOME_TEXT[k]}`}
              className={cx(
                'group relative flex min-w-[2.75rem] items-center justify-center overflow-hidden rounded-sm transition-opacity duration-220',
                OUTCOME_STYLE[k].fill,
                on ? 'opacity-95 hover:opacity-100' : 'opacity-25 hover:opacity-50',
                k === 'indeterminate' && 'hatch',
                FOCUS,
              )}
              style={{ flexGrow: Math.max(share, 0.04), flexBasis: 0 }}
            >
              <span className="tnum flex items-center gap-1.5 px-1 text-surface-0">
                <Icon size={13} />
                <span className="text-xs font-semibold">{counts[k]}</span>
              </span>
            </button>
          )
        })}
      </div>

      {/* Legend. Colour is never the only signal: every entry carries the
          icon, the word and the count. */}
      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {present.map((k) => {
          const Icon = OUTCOME_ICON[k]
          const on = active.includes(k)
          return (
            <button
              key={k}
              type="button"
              onClick={() => onToggle(k)}
              aria-pressed={on}
              className={cx(
                'flex items-center gap-1.5 rounded px-1 py-0.5 text-2xs transition-colors duration-140',
                on ? OUTCOME_STYLE[k].text : 'text-ink-3 hover:text-ink-1',
                FOCUS,
              )}
            >
              <span className={OUTCOME_STYLE[k].text}>
                <Icon size={12} />
              </span>
              <span className="tnum font-medium">{counts[k]}</span>
              <span>{OUTCOME_LABEL[k]}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
