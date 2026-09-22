/**
 * The timeline.
 *
 * The time-scaled companion to the loss boundary. Where that view spaces the
 * plan by decision, this one spaces it by minutes, which makes a different
 * set of facts obvious: that the memory image is most of the preservation
 * budget, that the buffer is larger than the remediation, that an
 * eight-minute change window cannot hold a plan that takes fifty-seven.
 *
 * **There are two scales here, and that is deliberate.** The band at the top
 * draws the plan against the whole window, which is the answer to "does this
 * fit". The rows below draw the plan against *itself*, which is the answer to
 * "where does the time go". Drawing both at window scale — which the first
 * version did — produced a screen where a three-hour plan inside a fifty-four
 * hour window rendered as eight identical slivers against a mile of empty
 * track: arithmetically honest and completely unreadable. Two scales, each
 * labelled with what it is measuring, beats one scale that answers only half
 * the question.
 *
 * The loss boundary and this view are likewise both necessary. A step-spaced
 * axis hides that one capture takes eleven times as long as everything around
 * it; a time-spaced axis compresses four consecutive quick steps into a smear
 * and hides the moment that matters.
 */

import { useMemo } from 'react'
import type { AnalysisResult } from '../domain/types.ts'
import { FEASIBILITY_LABEL, FEASIBILITY_TEXT } from '../domain/semantics.ts'
import { addMinutes, formatDuration, formatInstant } from '../domain/time.ts'
import { FEASIBILITY_STYLE, FOCUS, LABEL, OUTCOME_STYLE, PANEL_INSET } from '../ui/tokens.ts'
import {
  Callout,
  Empty,
  FeasibilityBadge,
  Panel,
  PanelHeader,
  cx,
} from '../ui/primitives.tsx'

export function TimelineView({
  result,
  onSelectStep,
}: {
  result: AnalysisResult
  onSelectStep: (id: string) => void
}) {
  const { feasibility, sequence, plan } = result

  /**
   * The scale.
   *
   * The axis runs from plan start to whichever is later: the deadline, or the
   * end of the plan. An overrunning plan that was clipped at the deadline
   * would be drawn as though it fitted, which is the one thing this view must
   * not do.
   */
  const span = Math.max(
    feasibility.available_minutes > 0 ? feasibility.available_minutes : 0,
    feasibility.total_minutes,
    1,
  )
  const pct = (m: number): number => Math.max(0, Math.min(100, (m / span) * 100))

  /**
   * The second scale: the plan measured against itself.
   *
   * Only used for the step rows. Without it, a plan that comfortably fits its
   * window has no internal structure on screen at all.
   */
  const planSpan = Math.max(feasibility.total_minutes, 1)
  const ppct = (m: number): number => Math.max(0, Math.min(100, (m / planSpan) * 100))
  const compressed = feasibility.available_minutes > 0 && planSpan / span < 0.6

  const bars = useMemo(() => {
    let cursor = 0
    const out: {
      step_id: string
      name: string
      kind: 'capture' | 'remediation'
      from: number
      minutes: number | null
      destructive: boolean
    }[] = []
    for (const s of sequence.steps) {
      const minutes = s.estimated_minutes
      out.push({
        step_id: s.step_id,
        name: s.name,
        kind: s.kind,
        from: cursor,
        minutes,
        destructive: s.lost_after.length > 0,
      })
      cursor += minutes ?? 0
    }
    return out
  }, [sequence.steps])

  const stepsEnd = feasibility.preservation_minutes + feasibility.remediation_minutes
  const verifyEnd = stepsEnd + feasibility.verification_minutes
  const bufferEnd = verifyEnd + feasibility.buffer_minutes

  if (sequence.steps.length === 0) {
    return (
      <Panel>
        <Empty title="No steps to lay out">
          Add steps to the plan and they will appear here against the clock.
        </Empty>
      </Panel>
    )
  }

  return (
    <div className="space-y-5">
      <Panel>
        <PanelHeader
          title="The plan against the clock"
          hint="Laid out in the recommended order, scaled by minutes. The marks below the axis are where evidence stops existing."
          right={<FeasibilityBadge status={feasibility.status} />}
        />

        <div className="scroll-thin overflow-x-auto">
          <div className="min-w-[46rem] px-5 py-5">
            {/* ---- the ruler -------------------------------------------- */}
            <div className="relative mb-2 h-6">
              {ticksFor(span).map((t) => (
                <div
                  key={t}
                  className="absolute top-0 -translate-x-1/2 text-center"
                  style={{ left: `${pct(t)}%` }}
                >
                  <span className="tnum block font-mono text-2xs text-ink-3">
                    {formatDuration(t)}
                  </span>
                </div>
              ))}
            </div>
            <div className="relative h-px bg-line-2">
              {ticksFor(span).map((t) => (
                <div
                  key={t}
                  className="absolute top-0 h-1.5 w-px bg-line-3"
                  style={{ left: `${pct(t)}%` }}
                  aria-hidden="true"
                />
              ))}
            </div>

            {/* ---- the legs, against the whole window -------------------- */}
            <p className={cx(LABEL, 'mt-4')}>The plan against the window</p>
            <div className="relative mt-2 h-8 rounded bg-surface-inset">
              <Leg from={0} to={feasibility.preservation_minutes} pct={pct} tone="bg-preserved/35" label={`Preservation ${formatDuration(feasibility.preservation_minutes)}`} />
              <Leg from={feasibility.preservation_minutes} to={stepsEnd} pct={pct} tone="bg-accent/30" label={`Remediation ${formatDuration(feasibility.remediation_minutes)}`} />
              <Leg from={stepsEnd} to={verifyEnd} pct={pct} tone="bg-retained/35" label={`Verification ${formatDuration(feasibility.verification_minutes)}`} />
              <Leg from={verifyEnd} to={bufferEnd} pct={pct} tone="bg-line-2" label={`Buffer ${formatDuration(feasibility.buffer_minutes)}`} />

              {/* the deadline */}
              {feasibility.available_minutes > 0 ? (
                <div
                  className="absolute -top-3 bottom-[-0.75rem] w-px bg-ink-0"
                  style={{ left: `${pct(feasibility.available_minutes)}%` }}
                  aria-hidden="true"
                >
                  {/* Anchored to the right of the rule when the deadline sits
                      at the end of the track, which it does whenever the plan
                      fits. Left-anchored, the word ran off the panel. */}
                  <span
                    className={cx(
                      'absolute -top-1 whitespace-nowrap text-2xs font-semibold uppercase tracking-[0.08em] text-ink-0',
                      pct(feasibility.available_minutes) > 80 ? 'right-1.5' : 'left-1.5',
                    )}
                  >
                    Deadline
                  </span>
                </div>
              ) : null}

              {/* the overrun */}
              {feasibility.slack_minutes < 0 && feasibility.available_minutes > 0 ? (
                <div
                  className="absolute inset-y-0 hatch text-lost"
                  style={{
                    left: `${pct(feasibility.available_minutes)}%`,
                    width: `${pct(bufferEnd) - pct(feasibility.available_minutes)}%`,
                  }}
                  title={`Overruns by ${formatDuration(-feasibility.slack_minutes)}`}
                  aria-hidden="true"
                />
              ) : null}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1">
              {(
                [
                  ['Preservation', 'bg-preserved/35', feasibility.preservation_minutes],
                  ['Remediation', 'bg-accent/30', feasibility.remediation_minutes],
                  ['Verification', 'bg-retained/35', feasibility.verification_minutes],
                  ['Buffer', 'bg-line-2', feasibility.buffer_minutes],
                ] as const
              ).map(([name, tone, m]) => (
                <span key={name} className="flex items-center gap-1.5 text-2xs text-ink-3">
                  <span aria-hidden="true" className={cx('h-2 w-4 rounded-sm', tone)} />
                  {name} <span className="tnum">{formatDuration(m)}</span>
                </span>
              ))}
            </div>

            {/* ---- the steps, at the plan's own scale ------------------- */}
            <div className="mt-7 flex flex-wrap items-baseline justify-between gap-2 border-t border-line-1 pt-4">
              <p className={LABEL}>
                The plan, at its own scale{compressed ? ' — expanded' : ''}
              </p>
              <p className="tnum text-2xs text-ink-3">
                0 to {formatDuration(planSpan)}
                {compressed
                  ? ` · ${Math.round((planSpan / span) * 100)}% of the window above`
                  : ''}
              </p>
            </div>
            {compressed ? (
              <p className="mb-3 max-w-[80ch] text-2xs leading-relaxed text-ink-3">
                Drawn against the plan's own duration rather than the window, because at window
                scale the whole plan is a sliver and none of its structure is visible. The band
                above is the one that answers whether it fits.
              </p>
            ) : null}

            <div className="relative mb-2 mt-2 h-4">
              {ticksFor(planSpan).map((t) => (
                <div
                  key={t}
                  className="absolute top-0 -translate-x-1/2 text-center"
                  style={{ left: `${ppct(t)}%` }}
                >
                  <span className="tnum block font-mono text-2xs text-ink-3">
                    {formatDuration(t)}
                  </span>
                </div>
              ))}
            </div>
            <div className="relative h-px bg-line-1">
              {ticksFor(planSpan).map((t) => (
                <div
                  key={t}
                  className="absolute top-0 h-1.5 w-px bg-line-2"
                  style={{ left: `${ppct(t)}%` }}
                  aria-hidden="true"
                />
              ))}
            </div>

            <div className="mt-3 space-y-1">
              {bars.map((b) => {
                const width = b.minutes === null ? null : ppct(b.from + b.minutes) - ppct(b.from)
                return (
                  <button
                    key={b.step_id}
                    type="button"
                    onClick={() => onSelectStep(b.step_id)}
                    className={cx('group relative block h-6 w-full text-left', FOCUS)}
                    title={`${b.name} — ${formatDuration(b.minutes)} starting at +${formatDuration(b.from)}`}
                  >
                    {width === null ? (
                      <span
                        className="absolute top-1 flex h-4 items-center gap-1.5 rounded border border-dashed border-degraded/60 bg-degraded/10 px-1.5"
                        style={{ left: `${ppct(b.from)}%` }}
                      >
                        <span className="whitespace-nowrap text-2xs text-degraded">
                          {b.name} — untimed
                        </span>
                      </span>
                    ) : (
                      <>
                        <span
                          className={cx(
                            'absolute top-1 h-4 rounded-sm opacity-80 transition-opacity duration-140 group-hover:opacity-100',
                            b.kind === 'capture'
                              ? 'bg-preserved/70'
                              : b.destructive
                                ? 'bg-lost/70'
                                : 'bg-accent/50',
                          )}
                          style={{
                            left: `${ppct(b.from)}%`,
                            width: `${Math.max(width, 0.6)}%`,
                          }}
                          aria-hidden="true"
                        />
                        <span
                          className={cx(
                            'absolute top-0.5 whitespace-nowrap text-2xs text-ink-2 group-hover:text-ink-0',
                            // Past two-thirds of the track the label would run
                            // off the panel, so it flips inside the bar's left.
                            ppct(b.from) > 66 ? 'text-right' : '',
                          )}
                          style={
                            ppct(b.from) > 66
                              ? { right: `calc(${100 - ppct(b.from)}% + 0.5rem)` }
                              : { left: `calc(${ppct(b.from)}% + ${Math.max(width, 0.6)}% + 0.5rem)` }
                          }
                        >
                          {b.name}
                          {b.destructive ? (
                            <span className="ml-1.5 text-lost">▼ evidence lost</span>
                          ) : null}
                        </span>
                      </>
                    )}
                  </button>
                )
              })}

              {/* The two legs that are not steps. Without them the chart
                  stops at the last step and the reader is left wondering
                  why it does not reach the end of its own scale. */}
              {(
                [
                  ['Verification beyond the steps', stepsEnd, feasibility.verification_minutes],
                  ['Contingency buffer', verifyEnd, feasibility.buffer_minutes],
                ] as const
              )
                .filter(([, , m]) => m > 0)
                .map(([name, from, m]) => (
                  <div key={name} className="relative h-6">
                    <span
                      className="absolute top-1 h-4 rounded-sm border border-dashed border-line-3"
                      style={{ left: `${ppct(from)}%`, width: `${Math.max(ppct(from + m) - ppct(from), 0.6)}%` }}
                      aria-hidden="true"
                    />
                    <span
                      className="absolute top-0.5 whitespace-nowrap text-2xs text-ink-3"
                      style={{
                        left: `calc(${ppct(from)}% + ${Math.max(ppct(from + m) - ppct(from), 0.6)}% + 0.5rem)`,
                      }}
                    >
                      {name} — {formatDuration(m)}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        </div>

        <div className="border-t border-line-1 px-5 py-4">
          <p className="max-w-[84ch] text-sm leading-relaxed text-ink-1">
            {feasibility.explanation}
          </p>
        </div>
      </Panel>

      {/* ---- the arithmetic ---------------------------------------------- */}
      <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <Panel>
          <PanelHeader title="The arithmetic" />
          <dl className="px-5 py-4">
            {(
              [
                ['Plan start', formatInstant(plan.deadline.plan_start)],
                ['Deadline', formatInstant(plan.deadline.due_at)],
                ['Window', formatDuration(feasibility.available_minutes)],
                ['Preservation', formatDuration(feasibility.preservation_minutes)],
                ['Remediation', formatDuration(feasibility.remediation_minutes)],
                ['Verification', formatDuration(feasibility.verification_minutes)],
                ['Contingency buffer', formatDuration(feasibility.buffer_minutes)],
                ['Total', formatDuration(feasibility.total_minutes)],
                [
                  'Slack',
                  feasibility.slack_minutes >= 0
                    ? formatDuration(feasibility.slack_minutes)
                    : `${formatDuration(-feasibility.slack_minutes)} over`,
                ],
                [
                  'Projected finish',
                  addMinutes(plan.deadline.plan_start, feasibility.total_minutes) === null
                    ? 'unknown'
                    : formatInstant(
                        addMinutes(plan.deadline.plan_start, feasibility.total_minutes) ?? '',
                      ),
                ],
              ] as const
            ).map(([k, v], i, arr) => (
              <div
                key={k}
                className={cx(
                  'flex items-baseline justify-between gap-4 py-1.5',
                  i === arr.length - 3 && 'border-t border-line-2 pt-2.5 font-medium',
                )}
              >
                <dt className={LABEL}>{k}</dt>
                <dd
                  className={cx(
                    'tnum font-mono text-xs',
                    k === 'Slack' && feasibility.slack_minutes < 0 ? 'text-lost' : 'text-ink-1',
                  )}
                >
                  {v}
                </dd>
              </div>
            ))}
          </dl>
          {feasibility.unknown_duration_count > 0 ? (
            <div className={cx(PANEL_INSET, 'mx-5 mb-5 px-4 py-3')}>
              <p className="text-2xs leading-relaxed text-degraded">
                {feasibility.unknown_duration_count}{' '}
                {feasibility.unknown_duration_count === 1 ? 'step has' : 'steps have'} no duration
                estimate. They are excluded from the total rather than counted as zero, so every
                figure above is a floor.
              </p>
            </div>
          ) : null}
        </Panel>

        <Panel>
          <PanelHeader title={`Status: ${FEASIBILITY_LABEL[feasibility.status]}`} />
          <div className="space-y-4 px-5 py-4">
            <p className="text-sm leading-relaxed text-ink-1">
              {FEASIBILITY_TEXT[feasibility.status]}
            </p>
            <div>
              <p className={cx(LABEL, 'mb-1.5')}>Window used</p>
              <div className="h-3 w-full overflow-hidden rounded bg-surface-3">
                <div
                  className={cx('h-full transition-[width] duration-380 ease-out', FEASIBILITY_STYLE[feasibility.status].fill)}
                  style={{
                    width: `${Math.min(
                      100,
                      feasibility.available_minutes > 0
                        ? (feasibility.total_minutes / feasibility.available_minutes) * 100
                        : 100,
                    )}%`,
                  }}
                />
              </div>
              <p className="tnum mt-1.5 text-2xs text-ink-3">
                {feasibility.utilisation === null
                  ? 'No percentage: the plan contains untimed steps, or the window has already closed.'
                  : `${Math.round(feasibility.utilisation * 100)}% of the window.`}
              </p>
            </div>

            {feasibility.status === 'conflict' ? (
              <Callout tone="bad" title="What this does not do">
                It does not pick something to drop. Preserving everything planned and meeting the
                stated deadline are not both possible, and which obligation gives way is a
                decision with a name attached to it — see the conflict centre.
              </Callout>
            ) : null}

            <div>
              <p className={cx(LABEL, 'mb-2')}>Where the preservation time goes</p>
              <ul className="space-y-1.5">
                {sequence.steps
                  .filter((s) => s.kind === 'capture')
                  .sort((a, b) => (b.estimated_minutes ?? 0) - (a.estimated_minutes ?? 0))
                  .map((s) => (
                    <li key={s.step_id} className="flex items-center gap-3">
                      <span className="min-w-0 flex-1 truncate text-xs text-ink-2">{s.name}</span>
                      <span className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-surface-3">
                        <span
                          className={cx('block h-full rounded-full', OUTCOME_STYLE.preserved.fill)}
                          style={{
                            width: `${
                              feasibility.preservation_minutes > 0
                                ? ((s.estimated_minutes ?? 0) / feasibility.preservation_minutes) * 100
                                : 0
                            }%`,
                          }}
                        />
                      </span>
                      <span className="tnum w-14 shrink-0 text-right font-mono text-2xs text-ink-3">
                        {formatDuration(s.estimated_minutes)}
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  )
}

function Leg({
  from,
  to,
  pct,
  tone,
  label,
}: {
  from: number
  to: number
  pct: (m: number) => number
  tone: string
  label: string
}) {
  if (to <= from) return null
  return (
    <div
      className={cx('absolute inset-y-1 rounded-sm', tone)}
      style={{ left: `${pct(from)}%`, width: `${pct(to) - pct(from)}%` }}
      title={label}
      aria-label={label}
      role="img"
    />
  )
}

/**
 * Ruler marks at a round interval.
 *
 * Chosen so there are between four and eight of them at any span, because a
 * ruler with two marks tells you nothing and one with twenty is a texture.
 */
function ticksFor(span: number): readonly number[] {
  const candidates = [5, 10, 15, 30, 60, 120, 180, 360, 720, 1440, 2880, 10080]
  const step = candidates.find((c) => span / c <= 8) ?? candidates[candidates.length - 1] ?? 1440
  const out: number[] = []
  for (let t = 0; t <= span; t += step) out.push(t)
  return out
}
