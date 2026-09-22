/**
 * Design tokens, as the class strings the components actually use.
 *
 * Centralised for one reason: a state has to mean the same thing in the badge,
 * the timeline bar, the matrix cell, the sequence row, the drawer and the
 * report. If a component picks its own red, the interface stops being readable
 * at a glance, which is the only thing that makes a dense table useful.
 *
 * Every state carries four things, and colour is only one of them:
 *
 *   glyph  a shape that survives greyscale and a colour-blind reader
 *   short  the word, always rendered somewhere
 *   text   the sentence a screen reader and a tooltip get
 *   fill   the treatment on a bar: solid, hatched, or severed
 *
 * The palette itself is in `src/index.css` as CSS custom properties, so light
 * and dark are two specifications rather than one inverted, and
 * `tokens.test.ts` asserts the contrast arithmetic off the same numbers.
 */

import type {
  Confidence,
  DestructiveLevel,
  FeasibilityStatus,
  ImpactKind,
  PreservationOutcome,
  CollectionPriority,
  Severity,
  VolatilityClass,
} from '../domain/types.ts'

export interface StateStyle {
  /** Foreground text. */
  readonly text: string
  /** Solid fill, for bars and meters. */
  readonly fill: string
  /** Faint background wash. */
  readonly wash: string
  /** 1px border. */
  readonly border: string
  /** Left rule on a row or panel. */
  readonly rule: string
  /** A shape, not a colour. Readable in greyscale and in a printed report. */
  readonly glyph: string
  /** Short uppercase label for compact spaces. */
  readonly short: string
}

/* -------------------------------------------------------------------------- */
/* Evidence outcome — the product's primary vocabulary                        */
/* -------------------------------------------------------------------------- */

export const OUTCOME_STYLE: Readonly<Record<PreservationOutcome, StateStyle>> = {
  preserved: {
    text: 'text-preserved',
    fill: 'bg-preserved',
    wash: 'bg-preserved/10',
    border: 'border-preserved/35',
    rule: 'bg-preserved',
    glyph: '●',
    short: 'KEPT',
  },
  degraded: {
    text: 'text-degraded',
    fill: 'bg-degraded',
    wash: 'bg-degraded/10',
    border: 'border-degraded/35',
    rule: 'bg-degraded',
    glyph: '◐',
    short: 'DEGRADED',
  },
  lost: {
    text: 'text-lost',
    fill: 'bg-lost',
    wash: 'bg-lost/10',
    border: 'border-lost/35',
    rule: 'bg-lost',
    glyph: '✕',
    short: 'LOST',
  },
  accepted_loss: {
    text: 'text-lost',
    fill: 'bg-lost',
    wash: 'bg-lost/10',
    border: 'border-lost/45',
    rule: 'bg-lost',
    // A signature rather than a cross: the artifact is gone and somebody put
    // their name to that, which is a different fact from simply losing it.
    glyph: '✎',
    short: 'SIGNED OFF',
  },
  indeterminate: {
    text: 'text-unknown',
    fill: 'bg-unknown',
    wash: 'bg-unknown/10',
    border: 'border-unknown/35',
    rule: 'bg-unknown',
    glyph: '?',
    short: 'UNKNOWN',
  },
  retained: {
    text: 'text-retained',
    fill: 'bg-retained',
    wash: 'bg-retained/10',
    border: 'border-retained/35',
    rule: 'bg-retained',
    glyph: '○',
    short: 'ON HOST',
  },
}

/** SVG-friendly `rgb(var(--x))` strings, for the timeline and diagrams. */
export const OUTCOME_RGB: Readonly<Record<PreservationOutcome, string>> = {
  preserved: 'rgb(var(--state-preserved))',
  degraded: 'rgb(var(--state-degraded))',
  lost: 'rgb(var(--state-lost))',
  accepted_loss: 'rgb(var(--state-lost))',
  indeterminate: 'rgb(var(--state-unknown))',
  retained: 'rgb(var(--state-retained))',
}

/**
 * How an evidence bar is drawn once it has reached its outcome.
 *
 * The product's visual argument, specified once. A preserved artifact is a
 * solid bar. A degraded one is solid but dimmed, because it exists and is
 * worth less. An indeterminate one is hatched, because hatching survives
 * greyscale and reads as "not established" rather than "off". A lost one is
 * drawn at full strength and simply stops, with a hard cap at the step that
 * ended it: it did not become harder to see, it stopped existing, and a faded
 * bar would say the wrong thing.
 */
export interface BarStyle {
  readonly opacity: number
  readonly hatched: boolean
  /** Draw a hard end-cap at the point of destruction. */
  readonly severed: boolean
}

export const BAR_STYLE: Readonly<Record<PreservationOutcome, BarStyle>> = {
  preserved: { opacity: 1, hatched: false, severed: false },
  degraded: { opacity: 0.75, hatched: false, severed: false },
  // Full opacity, not faded. A destroyed artifact did not become harder to
  // see - it stopped existing, and the bar says that by ending, not by
  // dimming. Fading reads as "de-emphasised", which is the wrong idea.
  lost: { opacity: 1, hatched: false, severed: true },
  accepted_loss: { opacity: 1, hatched: false, severed: true },
  indeterminate: { opacity: 0.85, hatched: true, severed: false },
  retained: { opacity: 0.5, hatched: false, severed: false },
}

/* -------------------------------------------------------------------------- */
/* Impact — what one action does to one artifact                              */
/* -------------------------------------------------------------------------- */

export const IMPACT_STYLE: Readonly<Record<ImpactKind, StateStyle>> = {
  destroys: { ...OUTCOME_STYLE.lost, glyph: '✕', short: 'DESTROYS' },
  modifies: { ...OUTCOME_STYLE.degraded, glyph: '≈', short: 'MODIFIES' },
  may_invalidate: { ...OUTCOME_STYLE.degraded, glyph: '!', short: 'MAY INVALIDATE' },
  unknown: { ...OUTCOME_STYLE.indeterminate, glyph: '?', short: 'UNKNOWN' },
  preserves: { ...OUTCOME_STYLE.preserved, glyph: '·', short: 'PRESERVES' },
}

/* -------------------------------------------------------------------------- */
/* Feasibility                                                                */
/* -------------------------------------------------------------------------- */

export const FEASIBILITY_STYLE: Readonly<Record<FeasibilityStatus, StateStyle>> = {
  feasible: { ...OUTCOME_STYLE.preserved, glyph: '●', short: 'FEASIBLE' },
  tight: { ...OUTCOME_STYLE.degraded, glyph: '◐', short: 'TIGHT' },
  conflict: { ...OUTCOME_STYLE.lost, glyph: '✕', short: 'CONFLICT' },
  unknown: { ...OUTCOME_STYLE.indeterminate, glyph: '?', short: 'UNKNOWN' },
}

/* -------------------------------------------------------------------------- */
/* Destructive level and severity                                             */
/* -------------------------------------------------------------------------- */

export const DESTRUCTIVE_STYLE: Readonly<Record<DestructiveLevel, StateStyle>> = {
  high: { ...OUTCOME_STYLE.lost, glyph: '▲', short: 'HIGH' },
  moderate: { ...OUTCOME_STYLE.degraded, glyph: '▲', short: 'MODERATE' },
  low: {
    text: 'text-ink-2',
    fill: 'bg-ink-3',
    wash: 'bg-surface-3',
    border: 'border-line-2',
    rule: 'bg-line-3',
    glyph: '△',
    short: 'LOW',
  },
  none: {
    text: 'text-ink-3',
    fill: 'bg-line-3',
    wash: 'bg-surface-2',
    border: 'border-line-1',
    rule: 'bg-line-2',
    glyph: '·',
    short: 'NON-DESTRUCTIVE',
  },
  unknown: { ...OUTCOME_STYLE.indeterminate, glyph: '?', short: 'UNKNOWN' },
}

export const SEVERITY_STYLE: Readonly<Record<Severity, StateStyle>> = {
  critical: { ...OUTCOME_STYLE.lost, glyph: '▲', short: 'CRITICAL' },
  high: { ...OUTCOME_STYLE.lost, glyph: '▲', short: 'HIGH' },
  medium: { ...OUTCOME_STYLE.degraded, glyph: '△', short: 'MEDIUM' },
  informational: {
    text: 'text-ink-3',
    fill: 'bg-line-3',
    wash: 'bg-surface-2',
    border: 'border-line-1',
    rule: 'bg-line-2',
    glyph: '·',
    short: 'INFO',
  },
}

/* -------------------------------------------------------------------------- */
/* Confidence and priority                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Confidence is not a severity, so it is not coloured like one.
 *
 * `high` and `low` are both legitimate readings of the world; the distinction
 * is how well supported a claim is, not how bad the news is. Neutral tones
 * throughout, except `unknown`, which matches the violet it means everywhere
 * else in the product.
 */
export const CONFIDENCE_STYLE: Readonly<Record<Confidence, { cls: string; glyph: string }>> = {
  high: { cls: 'text-ink-1 border-line-3 bg-surface-3', glyph: '▮▮▮' },
  medium: { cls: 'text-ink-2 border-line-2 bg-surface-2', glyph: '▮▮▯' },
  low: { cls: 'text-ink-3 border-line-2 bg-surface-2', glyph: '▮▯▯' },
  unknown: { cls: 'text-unknown border-unknown/35 bg-unknown/10', glyph: '▯▯▯' },
}

export const PRIORITY_STYLE: Readonly<Record<CollectionPriority, { cls: string; glyph: string }>> = {
  required: { cls: 'text-accent-strong border-accent/40 bg-accent/10', glyph: '★' },
  recommended: { cls: 'text-ink-1 border-line-3 bg-surface-3', glyph: '☆' },
  optional: { cls: 'text-ink-3 border-line-2 bg-surface-2', glyph: '·' },
}

/* -------------------------------------------------------------------------- */
/* Volatility                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The three bands, by how fast they decay rather than by how bad losing them
 * is. Deliberately not the semantic hues: volatility is a property of the
 * evidence and outcome is a property of the plan, and colouring both with the
 * same palette would make the two impossible to read at once.
 */
export const CLASS_STYLE: Readonly<Record<VolatilityClass, { cls: string; bar: string }>> = {
  volatile: { cls: 'text-ink-0', bar: 'bg-ink-1' },
  semi_volatile: { cls: 'text-ink-1', bar: 'bg-ink-2' },
  persistent: { cls: 'text-ink-2', bar: 'bg-ink-3' },
}

/* -------------------------------------------------------------------------- */
/* Shared class strings                                                       */
/* -------------------------------------------------------------------------- */

/**
 * `min-w-0` is load-bearing, not tidiness.
 *
 * A grid or flex item defaults to `min-width: auto`, which means a `1fr` track
 * cannot shrink below its content's intrinsic width. A panel containing a wide
 * table or an unbroken hostname therefore pushes its own track wider and takes
 * the whole page into horizontal scroll — which is exactly what a plan with
 * hundred-character asset names did to the evidence map before this was here.
 */
export const PANEL = 'min-w-0 rounded-lg border border-line-1 bg-surface-1 shadow-panel'
export const PANEL_INSET = 'rounded border border-line-1 bg-surface-inset'
export const ROW_HOVER = 'transition-colors duration-140 hover:bg-surface-3'
export const LABEL = 'text-2xs font-medium uppercase tracking-[0.1em] text-ink-3'
export const MONO = 'font-mono text-xs'
export const FOCUS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0'

/* -------------------------------------------------------------------------- */
/* Contrast arithmetic                                                        */
/* -------------------------------------------------------------------------- */

/**
 * WCAG relative luminance and contrast, over the triplets in `index.css`.
 *
 * Exported so `tokens.test.ts` can assert the palette rather than hope. A
 * colour choice that fails contrast should fail the test run, not ship and
 * wait for somebody to squint at it — and the first hand-tuned pass of this
 * palette had two of the five states 1.14:1 apart, which is to say identical.
 */
export function luminance([r, g, b]: readonly [number, number, number]): number {
  const f = (v: number): number => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

export function contrast(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): number {
  const la = luminance(a)
  const lb = luminance(b)
  const hi = Math.max(la, lb)
  const lo = Math.min(la, lb)
  return (hi + 0.05) / (lo + 0.05)
}
