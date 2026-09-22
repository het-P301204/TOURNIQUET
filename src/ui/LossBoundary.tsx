/**
 * The loss boundary.
 *
 * The product's one signature visual, and the only screen element worth
 * describing at length.
 *
 * The horizontal axis is the executed plan, step by step. Above the axis is
 * the remediation line: a tick per step, capture steps hollow, remediation
 * steps solid, and the destructive ones carrying a mark that points down into
 * the evidence. Below the axis is one row per artifact, drawn as a bar that
 * runs from the start of the plan to the moment the artifact stops existing —
 * or all the way across, if nothing in the plan reaches it.
 *
 * Between the two is the boundary: a thin vertical rule the reader drags
 * through the plan. To its left is what has already happened. To its right is
 * what has not. As it passes a destructive step, the bars of everything that
 * step destroys stop, and a strike is drawn across them.
 *
 * Three decisions that are easy to get wrong and matter:
 *
 * **A lost bar is severed, not faded out.** Fading says "less important" or
 * "disabled". The artifact did not become less visible; it stopped existing.
 * So the bar runs at full strength and then stops dead, with a hard cap drawn
 * at the exact step that ended it.
 *
 * **An unknown bar is hatched and never resolves.** It does not stop at the
 * uncharacterised step, because that would assert destruction, and it does
 * not continue cleanly, because that would assert survival. It continues as
 * a pattern, which is the visual form of "nobody here knows".
 *
 * **The axis is steps, not minutes.** The boundary is a thing the reader
 * moves through a sequence of decisions, and spacing the ticks by duration
 * would make a forty-five-minute memory capture eleven times wider than the
 * restart that destroys everything — burying the moment that matters under
 * the step that merely takes a while. The Timeline view is the time-scaled
 * companion to this, and it exists precisely because these are two different
 * questions.
 */

import { useMemo } from 'react'
import type { AnalysisResult, ArtifactOutcome, PreservationOutcome } from '../domain/types.ts'
import { OUTCOME_LABEL, OUTCOME_TEXT } from '../domain/semantics.ts'
import { CLASS_LABEL, TIER_CLASS, VOLATILITY_RANK } from '../domain/volatility.ts'
import { formatDuration } from '../domain/time.ts'
import { BAR_STYLE, FOCUS, LABEL, OUTCOME_STYLE } from './tokens.ts'
import { cx } from './primitives.tsx'

export interface BoundaryStep {
  readonly step_id: string
  readonly action_id: string
  readonly name: string
  readonly kind: 'capture' | 'remediation'
  readonly destructive: boolean
  readonly uncharacterised: boolean
  readonly minutes: number | null
}

/** Where an artifact's bar stops, and how it is drawn. */
interface Track {
  readonly outcome: ArtifactOutcome
  /** Step index at which the bar ends, or `null` to run the full width. */
  readonly endsAt: number | null
  /** Step index at which it was captured, or `null`. */
  readonly capturedAt: number | null
}

function buildTracks(
  outcomes: readonly ArtifactOutcome[],
  order: readonly string[],
): readonly Track[] {
  const position = new Map(order.map((id, i) => [id, i]))
  return outcomes.map((outcome) => {
    const harm = outcome.first_harm
    const harmAt = harm === null ? null : (position.get(harm.step_id) ?? null)
    // Only destruction ends a bar. A modification leaves the artifact in
    // existence and is carried by the bar's colour instead, because a bar
    // that stopped at every alteration would say the artifact was destroyed.
    const endsAt = harm !== null && harm.impact === 'destroys' && outcome.outcome !== 'preserved' ? harmAt : null
    return { outcome, endsAt, capturedAt: outcome.captured_at_index }
  })
}

/** What the reader can still know, at a given point in the plan. */
export interface BoundaryTally {
  readonly gone: number
  readonly captured: number
  readonly stillThere: number
  readonly unclear: number
}

/**
 * The state of the evidence at a point in the plan.
 *
 * The ordering of the branches is the whole correctness argument, and the
 * first version got it wrong: it counted any capture before the boundary as a
 * save, so an artifact destroyed at step one and captured at step six was
 * tallied as secured. A capture that runs after the destruction collects
 * nothing, and the tally therefore disagreed with the outcome counts sitting
 * directly above it on the same screen.
 *
 * `capturedFirst` is the test, not `captured`. At the end of the plan these
 * numbers reconcile with `summary.outcomes` by construction.
 */
export function tallyAt(tracks: readonly Track[], boundary: number): BoundaryTally {
  let gone = 0
  let captured = 0
  let stillThere = 0
  let unclear = 0
  for (const t of tracks) {
    const destroyedYet = t.endsAt !== null && t.endsAt < boundary
    const capturedFirst = t.capturedAt !== null && (t.endsAt === null || t.capturedAt < t.endsAt)
    const capturedYet = capturedFirst && t.capturedAt !== null && t.capturedAt < boundary

    if (t.outcome.outcome === 'indeterminate') unclear += 1
    else if (capturedYet) captured += 1
    else if (destroyedYet) gone += 1
    else stillThere += 1
  }
  return { gone, captured, stillThere, unclear }
}

/* -------------------------------------------------------------------------- */

export function LossBoundary({
  result,
  steps,
  boundary,
  onBoundary,
  onSelectArtifact,
  onSelectStep,
  compact = false,
}: {
  result: AnalysisResult
  steps: readonly BoundaryStep[]
  boundary: number
  onBoundary: (i: number) => void
  onSelectArtifact: (id: string) => void
  onSelectStep: (id: string) => void
  compact?: boolean
}) {
  const n = steps.length
  const order = useMemo(() => steps.map((s) => s.step_id), [steps])

  const included = useMemo(() => {
    const sel = new Map(result.plan.evidence.map((e) => [e.artifact_id, e]))
    return result.outcomes.filter((o) => sel.get(o.artifact_id)?.included !== false)
  }, [result])

  // The counts above this diagram cover every artifact in scope; the diagram
  // covers only the ones still in the preservation plan. Saying so is cheaper
  // than making two numbers agree by hiding one of them.
  const excluded = result.outcomes.length - included.length

  const tracks = useMemo(() => buildTracks(included, order), [included, order])
  const tally = useMemo(() => tallyAt(tracks, boundary), [tracks, boundary])

  const sorted = useMemo(
    () =>
      [...tracks].sort(
        (a, b) =>
          VOLATILITY_RANK[a.outcome.tier] - VOLATILITY_RANK[b.outcome.tier] ||
          a.outcome.name.localeCompare(b.outcome.name),
      ),
    [tracks],
  )

  if (n === 0) {
    return (
      <div className="px-5 py-12 text-center text-sm text-ink-3">
        This plan has no steps, so there is nothing for a boundary to move through.
      </div>
    )
  }

  // Centre of step i, and the edge after step i, as percentages of the track.
  const centre = (i: number): number => ((i + 0.5) / n) * 100
  const edge = (i: number): number => (i / n) * 100

  const currentStep = boundary > 0 ? steps[boundary - 1] : null
  const nextStep = boundary < n ? steps[boundary] : null

  return (
    <div className="min-w-0">
      {/* ---- scrubber ---------------------------------------------------- */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line-1 px-5 py-4">
        <div className="min-w-0">
          <p className={LABEL}>Loss boundary</p>
          <p className="mt-1 max-w-[62ch] text-sm leading-relaxed text-ink-1">
            {boundary === 0 ? (
              <>Nothing has run yet. Everything below still exists.</>
            ) : (
              <>
                After step {boundary},{' '}
                <span className="font-medium text-ink-0">{currentStep?.name}</span>:{' '}
                <span className="text-preserved">{tally.captured} captured</span>
                {' · '}
                <span className="text-lost">{tally.gone} gone</span>
                {' · '}
                <span className="text-retained">{tally.stillThere} still on the system</span>
                {tally.unclear > 0 ? (
                  <>
                    {' · '}
                    <span className="text-unknown">{tally.unclear} undetermined</span>
                  </>
                ) : null}
              </>
            )}
          </p>
          {nextStep?.destructive ? (
            <p className="mt-1.5 text-xs text-lost">
              Next: {nextStep.name}. Anything not captured by then is gone.
            </p>
          ) : null}
          {excluded > 0 ? (
            <p className="mt-1.5 text-2xs text-ink-3">
              {excluded} {excluded === 1 ? 'artifact is' : 'artifacts are'} excluded from the
              preservation plan and not drawn here. They still appear in the counts above and in
              the evidence map, because nothing should disappear quietly.
            </p>
          ) : null}
        </div>

        <div className="flex min-w-[14rem] flex-1 items-center gap-3 sm:max-w-sm">
          <button
            type="button"
            onClick={() => onBoundary(Math.max(0, boundary - 1))}
            disabled={boundary === 0}
            aria-label="Move the boundary back one step"
            className={cx(
              'shrink-0 rounded border border-line-2 px-2 py-1 text-xs text-ink-2 transition-colors duration-140 hover:bg-surface-3 disabled:opacity-30',
              FOCUS,
            )}
          >
            <span aria-hidden="true">◀</span>
          </button>
          <input
            type="range"
            min={0}
            max={n}
            step={1}
            value={boundary}
            onChange={(e) => onBoundary(Number(e.target.value))}
            aria-label="Loss boundary position in the plan"
            aria-valuetext={
              boundary === 0
                ? 'Before the plan starts'
                : `After step ${boundary}, ${currentStep?.name ?? ''}`
            }
            className={cx('h-1 min-w-0 flex-1 cursor-pointer accent-[rgb(var(--state-lost))]', FOCUS)}
          />
          <button
            type="button"
            onClick={() => onBoundary(Math.min(n, boundary + 1))}
            disabled={boundary === n}
            aria-label="Move the boundary forward one step"
            className={cx(
              'shrink-0 rounded border border-line-2 px-2 py-1 text-xs text-ink-2 transition-colors duration-140 hover:bg-surface-3 disabled:opacity-30',
              FOCUS,
            )}
          >
            <span aria-hidden="true">▶</span>
          </button>
        </div>
      </div>

      {/* ---- the diagram ------------------------------------------------- */}
      <div className="scroll-thin overflow-x-auto">
        <div className="min-w-[44rem] px-5 py-4">
          {/* remediation line */}
          <div className="grid grid-cols-[14rem_1fr] gap-x-4">
            <p className={cx(LABEL, 'self-end pb-2')}>Remediation</p>
            <div className="relative h-16">
              {/* the line itself */}
              <div className="absolute inset-x-0 bottom-3 h-px bg-line-3" aria-hidden="true" />
              {steps.map((s, i) => (
                <button
                  key={s.step_id}
                  type="button"
                  onClick={() => {
                    onSelectStep(s.step_id)
                    onBoundary(i + 1)
                  }}
                  title={`${i + 1}. ${s.name} — ${formatDuration(s.minutes)}`}
                  aria-label={`Step ${i + 1}, ${s.name}. ${
                    s.destructive ? 'Destroys evidence. ' : ''
                  }Move the boundary here.`}
                  className={cx(
                    'group absolute bottom-0 flex -translate-x-1/2 flex-col items-center gap-1 rounded px-1 pb-1',
                    FOCUS,
                  )}
                  style={{ left: `${centre(i)}%` }}
                >
                  <span
                    className={cx(
                      'tnum font-mono text-2xs transition-colors duration-140',
                      i < boundary ? 'text-ink-3' : 'text-ink-2',
                      s.destructive && 'text-lost',
                    )}
                  >
                    {i + 1}
                  </span>
                  {s.destructive ? (
                    <span aria-hidden="true" className="text-2xs leading-none text-lost">
                      ▼
                    </span>
                  ) : (
                    <span aria-hidden="true" className="h-[0.5rem]" />
                  )}
                  <span
                    aria-hidden="true"
                    className={cx(
                      'block h-2.5 w-2.5 rounded-full border transition-all duration-140 group-hover:scale-125',
                      s.kind === 'capture'
                        ? 'border-preserved bg-surface-0'
                        : s.uncharacterised
                          ? 'border-unknown bg-unknown/40'
                          : s.destructive
                            ? 'border-lost bg-lost'
                            : 'border-line-3 bg-surface-2',
                    )}
                  />
                </button>
              ))}
            </div>
          </div>

          {/* evidence rows */}
          <div className="relative mt-1">
            {/* The boundary, drawn over the whole evidence block.
                Laid out with the same grid as the rows rather than positioned
                by arithmetic, so the rule lands on the track column exactly
                and stays there at any width. */}
            <div
              className="pointer-events-none absolute inset-0 z-20 grid grid-cols-[14rem_1fr] gap-x-4"
              aria-hidden="true"
            >
              <div />
              <div className="relative">
                {/* The part of the plan that has not run yet. Neutral, not the
                    loss hue: what is ahead of the boundary has not been lost,
                    it simply has not happened. */}
                <div
                  className="future absolute inset-y-0 right-0 transition-[left] duration-220 ease-out"
                  style={{ left: `${edge(boundary)}%` }}
                />
                <div
                  className="loss-boundary absolute inset-y-0 w-px transition-[left] duration-220 ease-out"
                  style={{ left: `${edge(boundary)}%` }}
                />
              </div>
            </div>

            {groupRows(sorted).map((group) => (
              <div key={group.band} className="mt-3 first:mt-0">
                <div className="grid grid-cols-[14rem_1fr] items-center gap-x-4">
                  <p className={cx(LABEL, 'truncate')}>{CLASS_LABEL[group.band]}</p>
                  <div className="h-px bg-line-1" />
                </div>
                {group.rows.map((t) => (
                  <ArtifactRow
                    key={t.outcome.artifact_id}
                    track={t}
                    boundary={boundary}
                    centre={centre}
                    edge={edge}
                    onSelect={onSelectArtifact}
                    compact={compact}
                  />
                ))}
              </div>
            ))}
          </div>

          {/* legend */}
          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line-1 pt-3">
            {(
              ['preserved', 'degraded', 'lost', 'indeterminate', 'retained'] as PreservationOutcome[]
            ).map((o) => (
              <span
                key={o}
                className="flex items-center gap-1.5 text-2xs text-ink-3"
                title={OUTCOME_TEXT[o]}
              >
                <span
                  aria-hidden="true"
                  className={cx(
                    'h-1.5 w-6 rounded-full',
                    OUTCOME_STYLE[o].fill,
                    BAR_STYLE[o].hatched && 'hatch',
                  )}
                  style={{ opacity: BAR_STYLE[o].opacity }}
                />
                {OUTCOME_LABEL[o]}
              </span>
            ))}
            <span className="flex items-center gap-1.5 text-2xs text-ink-3">
              <span aria-hidden="true" className="loss-boundary h-3 w-px" />
              Loss boundary
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

function groupRows(
  tracks: readonly Track[],
): readonly { band: 'volatile' | 'semi_volatile' | 'persistent'; rows: readonly Track[] }[] {
  const bands = ['volatile', 'semi_volatile', 'persistent'] as const
  return bands
    .map((band) => ({ band, rows: tracks.filter((t) => TIER_CLASS[t.outcome.tier] === band) }))
    .filter((g) => g.rows.length > 0)
}

function ArtifactRow({
  track,
  boundary,
  centre,
  edge,
  onSelect,
  compact,
}: {
  track: Track
  boundary: number
  centre: (i: number) => number
  edge: (i: number) => number
  onSelect: (id: string) => void
  compact: boolean
}) {
  const { outcome, endsAt, capturedAt } = track
  const style = OUTCOME_STYLE[outcome.outcome]
  const bar = BAR_STYLE[outcome.outcome]

  // The bar covers the span in which the artifact exists. A destroyed one
  // stops at the destroying step; everything else runs the full width.
  //
  // Floored at a visible sliver. An artifact destroyed by the very first step
  // has `edge(0) === 0`, and a zero-width bar renders as nothing at all - the
  // reader sees an empty row and concludes the artifact was never there,
  // which is the opposite of the finding.
  const width = endsAt === null ? 100 : Math.max(edge(endsAt), 1.2)
  // Severed only once the boundary has actually passed the destruction:
  // before that, the artifact is still there and the diagram must not say
  // otherwise.
  const severed = bar.severed && endsAt !== null && endsAt < boundary
  const securedYet = capturedAt !== null && capturedAt < boundary

  return (
    <div className={cx('grid grid-cols-[14rem_1fr] items-center gap-x-4', compact ? 'py-0.5' : 'py-1')}>
      <button
        type="button"
        onClick={() => onSelect(outcome.artifact_id)}
        className={cx(
          'group flex min-w-0 items-center gap-1.5 rounded py-0.5 text-left transition-colors duration-140',
          FOCUS,
        )}
        title={`${outcome.name} — ${OUTCOME_LABEL[outcome.outcome]}. ${outcome.explanation}`}
      >
        <span aria-hidden="true" className={cx('shrink-0 text-2xs leading-none', style.text)}>
          {style.glyph}
        </span>
        <span className="min-w-0 truncate text-xs text-ink-2 group-hover:text-ink-0">
          {outcome.name}
        </span>
      </button>

      <div className="relative h-4">
        {/* the track the bar sits in */}
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-surface-3" />
        {/* the artifact's existence */}
        <div
          className={cx(
            'absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full transition-[width,opacity] duration-220 ease-out',
            style.fill,
            bar.hatched && 'hatch unresolved',
          )}
          style={{ width: `${width}%`, opacity: bar.opacity }}
          aria-hidden="true"
        />
        {/* the moment it was secured */}
        {capturedAt !== null ? (
          <span
            aria-hidden="true"
            className={cx(
              'absolute top-1/2 z-10 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 transition-colors duration-220',
              securedYet ? 'border-preserved bg-surface-0' : 'border-line-3 bg-surface-1',
            )}
            style={{ left: `${centre(capturedAt)}%` }}
            title="Captured here"
          />
        ) : null}
        {/* The severed end. The signature mark of the whole diagram: the
            artifact does not fade out, it stops, and the cut is drawn at the
            exact step that made it stop. */}
        {endsAt !== null ? (
          <span
            aria-hidden="true"
            className={cx(
              'absolute top-1/2 w-[2px] -translate-y-1/2 rounded-full transition-all duration-220',
              style.fill,
              severed ? 'h-3.5' : 'h-2 opacity-60',
            )}
            style={{ left: `calc(${width}% - 1px)` }}
          />
        ) : null}
      </div>
    </div>
  )
}
