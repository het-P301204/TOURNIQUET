/**
 * The situation map.
 *
 * One view that carries the whole argument, left to right:
 *
 *   VULNERABILITY → PLAN → THE MOMENT → EVIDENCE STATE → DECISIONS
 *
 * Everything else in the product is a way of drilling into one column of
 * this. If a reader looks at nothing else, they should still come away
 * knowing what is happening, what it costs, when the cost falls, and what is
 * left for a human to decide.
 *
 * ## Why it is drawn this way
 *
 * **It is a flow, not a dashboard row.** Five KPI tiles in a line say "here
 * are five numbers"; a flow says "this causes this". The causal claim is the
 * product, so the layout has to make it.
 *
 * **The middle column is a single moment, not a list of steps.** The plan may
 * have eight steps, but only one of them is where most of the evidence stops
 * existing. Naming that step — and putting it at the centre of the diagram —
 * is more useful than drawing all eight at equal weight.
 *
 * **Evidence is grouped by fate, not by tier.** The tier view lives in the
 * evidence map. Here the question is "how much of it survives", so the
 * grouping is by outcome and the bar heights are proportional to counts.
 *
 * **The connectors carry the `link` hue.** Cyan means "a relationship between
 * two objects" everywhere in this product, and these are the most important
 * relationships it draws.
 *
 * Rendered as SVG at a fixed viewBox and scaled, so the geometry is written
 * once and behaves the same at any width. Every figure in it is also present
 * as text, because a diagram is not an accessible interface on its own.
 */

import { useMemo } from 'react'
import type { AnalysisResult, PreservationOutcome } from '../domain/types.ts'
import { OUTCOME_LABEL, OUTCOME_TEXT } from '../domain/semantics.ts'
import { formatDuration } from '../domain/time.ts'
import { OUTCOME_RGB } from './tokens.ts'
import { cx } from './primitives.tsx'

const W = 1000
const H = 296

/** Column x-positions. Named because the geometry is read more than edited. */
const COL = { vuln: 96, plan: 316, moment: 542, state: 792 }

interface Band {
  readonly outcome: PreservationOutcome
  readonly count: number
  readonly y: number
  readonly h: number
}

export function SituationMap({
  result,
  onSelectOutcome,
  onSelectStep,
  activeOutcomes,
}: {
  result: AnalysisResult
  onSelectOutcome: (o: PreservationOutcome) => void
  onSelectStep: (id: string) => void
  activeOutcomes: readonly PreservationOutcome[]
}) {
  const { plan, feasibility, summary } = result
  const o = summary.outcomes

  /**
   * The step where the most evidence stops existing.
   *
   * Ties break towards the earlier step: if two steps destroy the same
   * amount, the first one is the moment that matters, because by the second
   * the evidence is already gone.
   */
  const moment = useMemo(() => {
    let best: { id: string; name: string; lost: number; index: number; elsewhere: number } | null =
      null
    const byStep = new Map<string, number>()
    for (const outcome of result.outcomes) {
      const h = outcome.first_harm
      if (!h || (outcome.outcome !== 'lost' && outcome.outcome !== 'accepted_loss')) continue
      byStep.set(h.step_id, (byStep.get(h.step_id) ?? 0) + 1)
    }
    let totalLost = 0
    for (const n of byStep.values()) totalLost += n
    for (const f of result.footprints) {
      const lost = byStep.get(f.step_id) ?? 0
      if (lost === 0) continue
      if (best === null || lost > best.lost) {
        best = { id: f.step_id, name: f.name, lost, index: f.index, elsewhere: 0 }
      }
    }
    // The centre of the diagram is the single worst step, not the total. If
    // other steps also destroy things, the figure shown here will not match
    // the Lost band beside it, so the difference is stated rather than left
    // for the reader to notice and distrust.
    return best === null ? null : { ...best, elsewhere: totalLost - best.lost }
  }, [result])

  const captures = result.footprints.filter((f) => f.category === 'capture')
  const total = Math.max(1, result.outcomes.length)

  const bands: readonly Band[] = useMemo(() => {
    const order: readonly PreservationOutcome[] = [
      'preserved',
      'degraded',
      'retained',
      'indeterminate',
      'accepted_loss',
      'lost',
    ]
    const top = 54
    const height = 196
    let y = top
    const out: Band[] = []
    for (const k of order) {
      const count = o[k]
      if (count === 0) continue
      // A floor of six pixels: a single artifact in a band of thirty-eight
      // would otherwise be a two-pixel sliver nobody can click or see.
      const h = Math.max(6, (count / total) * height)
      out.push({ outcome: k, count, y, h })
      y += h + 3
    }
    // Rescale if the floors pushed it past the available height.
    const used = y - top - 3
    if (used > height) {
      const k = height / used
      let cursor = top
      return out.map((b) => {
        const h = b.h * k
        const band = { ...b, y: cursor, h }
        cursor += h + 3 * k
        return band
      })
    }
    return out
  }, [o, total])

  const surviving = o.preserved + o.degraded + o.retained
  const goneOrUnclear = o.lost + o.accepted_loss + o.indeterminate

  return (
    <figure className="m-0">
      <div className="scroll-thin overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block h-auto w-full min-w-[54rem]"
          role="img"
          aria-label={summaryText(result, moment?.name ?? null)}
        >
          <defs>
            <marker
              id="sm-arrow"
              viewBox="0 0 8 8"
              refX="6.4"
              refY="4"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M1 1 L6.5 4 L1 7" fill="none" stroke="rgb(var(--link))" strokeWidth="1.3" />
            </marker>
            <linearGradient id="sm-flow" x1="0" x2="1">
              <stop offset="0" stopColor="rgb(var(--link))" stopOpacity="0.15" />
              <stop offset="1" stopColor="rgb(var(--link))" stopOpacity="0.55" />
            </linearGradient>
          </defs>

          {/* ---- column headings ---------------------------------------- */}
          {(
            [
              [COL.vuln, 'Vulnerability'],
              [COL.plan, 'The plan'],
              [COL.moment, 'The moment'],
              [COL.state, 'Evidence state'],
            ] as const
          ).map(([x, label]) => (
            <text
              key={label}
              x={x}
              y={22}
              textAnchor="middle"
              className="fill-[rgb(var(--ink-3))] text-[11px] font-medium uppercase"
              style={{ letterSpacing: '0.12em' }}
            >
              {label}
            </text>
          ))}

          {/* ---- connectors --------------------------------------------- */}
          <path
            d={`M${COL.vuln + 62} 152 H${COL.plan - 95}`}
            stroke="url(#sm-flow)"
            strokeWidth="2"
            fill="none"
            markerEnd="url(#sm-arrow)"
          />
          <path
            d={`M${COL.plan + 95} 152 H${COL.moment - 85}`}
            stroke="url(#sm-flow)"
            strokeWidth="2"
            fill="none"
            markerEnd="url(#sm-arrow)"
          />
          <path
            d={`M${COL.moment + 85} 152 H${COL.state - 116}`}
            stroke="url(#sm-flow)"
            strokeWidth="2"
            fill="none"
            markerEnd="url(#sm-arrow)"
          />

          {/* ---- 1. vulnerability and the clock ------------------------- */}
          <g>
            <rect
              x={COL.vuln - 62}
              y={62}
              width={124}
              height={180}
              rx={8}
              className="fill-[rgb(var(--surface-2))] stroke-[rgb(var(--line-2))]"
              strokeWidth="1"
            />
            <text
              x={COL.vuln}
              y={92}
              textAnchor="middle"
              className="fill-[rgb(var(--ink-2))] text-[10px] uppercase"
              style={{ letterSpacing: '0.1em' }}
            >
              External tier
            </text>
            <text
              x={COL.vuln}
              y={112}
              textAnchor="middle"
              className="fill-[rgb(var(--ink-0))] text-[12px] font-medium"
            >
              {truncate(plan.tier.label, 18)}
            </text>

            <line
              x1={COL.vuln - 42}
              y1={128}
              x2={COL.vuln + 42}
              y2={128}
              className="stroke-[rgb(var(--line-2))]"
            />

            <text
              x={COL.vuln}
              y={152}
              textAnchor="middle"
              className="fill-[rgb(var(--ink-3))] text-[10px] uppercase"
              style={{ letterSpacing: '0.1em' }}
            >
              Window
            </text>
            <text
              x={COL.vuln}
              y={180}
              textAnchor="middle"
              className="fill-[rgb(var(--time))] font-mono text-[22px] font-medium"
            >
              {formatDuration(feasibility.available_minutes)}
            </text>
            <text
              x={COL.vuln}
              y={204}
              textAnchor="middle"
              className={cx(
                'font-mono text-[11px]',
                feasibility.slack_minutes < 0
                  ? 'fill-[rgb(var(--state-lost))]'
                  : 'fill-[rgb(var(--ink-3))]',
              )}
            >
              {feasibility.slack_minutes < 0
                ? `${formatDuration(-feasibility.slack_minutes)} over`
                : `${formatDuration(feasibility.slack_minutes)} spare`}
            </text>
            <text
              x={COL.vuln}
              y={226}
              textAnchor="middle"
              className="fill-[rgb(var(--ink-3))] text-[10px]"
            >
              {formatDuration(feasibility.total_minutes)} of work
            </text>
          </g>

          {/* ---- 2. the plan -------------------------------------------- */}
          <g>
            <rect
              x={COL.plan - 95}
              y={62}
              width={190}
              height={180}
              rx={8}
              className="fill-[rgb(var(--surface-2))] stroke-[rgb(var(--line-2))]"
              strokeWidth="1"
            />
            <text
              x={COL.plan}
              y={90}
              textAnchor="middle"
              className="fill-[rgb(var(--ink-2))] text-[10px] uppercase"
              style={{ letterSpacing: '0.1em' }}
            >
              {summary.step_count} steps
            </text>

            {/* capture steps, stacked; the plan's preservation effort */}
            {captures.slice(0, 5).map((f, i) => (
              <g key={f.step_id} onClick={() => onSelectStep(f.step_id)} className="cursor-pointer">
                <rect
                  x={COL.plan - 82}
                  y={104 + i * 22}
                  width={164}
                  height={17}
                  rx={3}
                  className="fill-[rgb(var(--state-preserved))] opacity-[0.16] hover:opacity-30"
                />
                <rect
                  x={COL.plan - 82}
                  y={104 + i * 22}
                  width={3}
                  height={17}
                  rx={1.5}
                  className="fill-[rgb(var(--state-preserved))]"
                />
                <text
                  x={COL.plan - 72}
                  y={116 + i * 22}
                  className="pointer-events-none fill-[rgb(var(--ink-1))] text-[10.5px]"
                >
                  {truncate(f.name, 26)}
                </text>
              </g>
            ))}
            {captures.length === 0 ? (
              <text
                x={COL.plan}
                y={140}
                textAnchor="middle"
                className="fill-[rgb(var(--state-lost))] text-[11px]"
              >
                No capture steps
              </text>
            ) : null}
            {captures.length > 5 ? (
              <text
                x={COL.plan}
                y={228}
                textAnchor="middle"
                className="fill-[rgb(var(--ink-3))] text-[10px]"
              >
                + {captures.length - 5} more captures
              </text>
            ) : null}
          </g>

          {/* ---- 3. the moment ------------------------------------------ */}
          <g>
            {moment ? (
              <g onClick={() => onSelectStep(moment.id)} className="cursor-pointer">
                <rect
                  x={COL.moment - 85}
                  y={62}
                  width={170}
                  height={180}
                  rx={8}
                  className="fill-[rgb(var(--state-lost))] stroke-[rgb(var(--state-lost))] opacity-[0.1]"
                />
                <rect
                  x={COL.moment - 85}
                  y={62}
                  width={170}
                  height={180}
                  rx={8}
                  fill="none"
                  className="stroke-[rgb(var(--state-lost))]"
                  strokeWidth="1"
                  strokeOpacity="0.45"
                />
                {/* the boundary itself, running the full height */}
                <line
                  x1={COL.moment}
                  y1={54}
                  x2={COL.moment}
                  y2={252}
                  className="stroke-[rgb(var(--state-lost))]"
                  strokeWidth="1.5"
                />
                <text
                  x={COL.moment}
                  y={92}
                  textAnchor="middle"
                  className="fill-[rgb(var(--ink-3))] text-[10px] uppercase"
                  style={{ letterSpacing: '0.1em' }}
                >
                  Step {moment.index + 1}
                </text>
                <text
                  x={COL.moment}
                  y={118}
                  textAnchor="middle"
                  className="fill-[rgb(var(--ink-0))] text-[12.5px] font-medium"
                >
                  {truncate(moment.name, 24)}
                </text>
                <text
                  x={COL.moment}
                  y={168}
                  textAnchor="middle"
                  className="fill-[rgb(var(--state-lost))] font-mono text-[30px] font-medium"
                >
                  {moment.lost}
                </text>
                <text
                  x={COL.moment}
                  y={190}
                  textAnchor="middle"
                  className="fill-[rgb(var(--state-lost))] text-[11px]"
                >
                  {moment.lost === 1 ? 'artifact stops' : 'artifacts stop'}
                </text>
                <text
                  x={COL.moment}
                  y={206}
                  textAnchor="middle"
                  className="fill-[rgb(var(--state-lost))] text-[11px]"
                >
                  existing here
                </text>
                <text
                  x={COL.moment}
                  y={224}
                  textAnchor="middle"
                  className="fill-[rgb(var(--ink-3))] text-[10px]"
                >
                  loss boundary
                </text>
                {moment.elsewhere > 0 ? (
                  <text
                    x={COL.moment}
                    y={238}
                    textAnchor="middle"
                    className="fill-[rgb(var(--ink-3))] text-[9.5px]"
                  >
                    + {moment.elsewhere} at other steps
                  </text>
                ) : null}
              </g>
            ) : (
              <g>
                <rect
                  x={COL.moment - 85}
                  y={62}
                  width={170}
                  height={180}
                  rx={8}
                  className="fill-[rgb(var(--surface-2))] stroke-[rgb(var(--state-preserved))]"
                  strokeWidth="1"
                  strokeOpacity="0.4"
                />
                <text
                  x={COL.moment}
                  y={146}
                  textAnchor="middle"
                  className="fill-[rgb(var(--state-preserved))] text-[12px] font-medium"
                >
                  Nothing is destroyed
                </text>
                <text
                  x={COL.moment}
                  y={166}
                  textAnchor="middle"
                  className="fill-[rgb(var(--ink-3))] text-[10.5px]"
                >
                  by this plan
                </text>
              </g>
            )}
          </g>

          {/* ---- 4. evidence state -------------------------------------- */}
          <g>
            <text
              x={COL.state - 116}
              y={46}
              className="fill-[rgb(var(--ink-3))] text-[10px]"
            >
              {result.outcomes.length} artifacts in scope
            </text>
            {bands.map((b) => {
              const active = activeOutcomes.length === 0 || activeOutcomes.includes(b.outcome)
              return (
                <g
                  key={b.outcome}
                  onClick={() => onSelectOutcome(b.outcome)}
                  className="cursor-pointer"
                >
                  <title>
                    {b.count} {OUTCOME_LABEL[b.outcome].toLowerCase()} — {OUTCOME_TEXT[b.outcome]}
                  </title>
                  <rect
                    x={COL.state - 116}
                    y={b.y}
                    width={188}
                    height={b.h}
                    rx={3}
                    fill={OUTCOME_RGB[b.outcome]}
                    opacity={active ? 0.9 : 0.3}
                  />
                  {b.h >= 16 ? (
                    <>
                      <text
                        x={COL.state - 106}
                        y={b.y + b.h / 2 + 4}
                        className="pointer-events-none fill-[rgb(var(--surface-0))] text-[11px] font-semibold"
                      >
                        {b.count}
                      </text>
                      <text
                        x={COL.state - 84}
                        y={b.y + b.h / 2 + 4}
                        className="pointer-events-none fill-[rgb(var(--surface-0))] text-[10.5px] font-medium"
                      >
                        {OUTCOME_LABEL[b.outcome]}
                      </text>
                    </>
                  ) : (
                    <text
                      x={COL.state + 80}
                      y={b.y + b.h / 2 + 3.5}
                      className="pointer-events-none fill-[rgb(var(--ink-3))] text-[9.5px]"
                    >
                      {b.count} {OUTCOME_LABEL[b.outcome].toLowerCase()}
                    </text>
                  )}
                </g>
              )
            })}
          </g>

          {/* ---- the summary rail --------------------------------------- */}
          <line
            x1={COL.state - 116}
            y1={266}
            x2={COL.state + 72}
            y2={266}
            className="stroke-[rgb(var(--line-2))]"
          />
          <text
            x={COL.state - 116}
            y={284}
            className="fill-[rgb(var(--state-preserved))] text-[10.5px]"
          >
            {surviving} still knowable
          </text>
          <text
            x={COL.state + 72}
            y={284}
            textAnchor="end"
            className="fill-[rgb(var(--state-lost))] text-[10.5px]"
          >
            {goneOrUnclear} not
          </text>
        </svg>
      </div>

      {/* The same statement in text. A diagram is not an accessible interface
          on its own, and this is also the sentence people paste into tickets. */}
      <figcaption className="border-t border-line-1 px-5 py-3 text-xs leading-relaxed text-ink-2">
        {summaryText(result, moment?.name ?? null)}
      </figcaption>
    </figure>
  )
}

function summaryText(result: AnalysisResult, momentName: string | null): string {
  const o = result.summary.outcomes
  const f = result.feasibility
  const surviving = o.preserved + o.degraded + o.retained
  return [
    `${result.plan.tier.label} tier, a ${formatDuration(f.available_minutes)} window, and ${formatDuration(f.total_minutes)} of planned work.`,
    momentName === null
      ? 'No step in this plan destroys anything in the evidence catalogue.'
      : `"${momentName}" is where the most evidence stops existing.`,
    `Of ${result.outcomes.length} artifacts in scope, ${surviving} remain knowable afterwards: ${o.preserved} preserved, ${o.degraded} degraded, ${o.retained} retained.`,
    `${o.lost} lost, ${o.accepted_loss} signed off, ${o.indeterminate} undetermined.`,
  ].join(' ')
}

/** Truncate for a fixed-width SVG label, without splitting a surrogate pair. */
function truncate(s: string, max: number): string {
  const chars = [...s]
  return chars.length <= max ? s : `${chars.slice(0, max - 1).join('')}…`
}
