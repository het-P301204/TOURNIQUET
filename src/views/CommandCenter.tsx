/**
 * The command centre.
 *
 * One screen that has to make a single idea land before the reader scrolls:
 * *before you fix this, here is what you will stop being able to know*.
 *
 * ## The composition
 *
 * The page is built in four bands, and the order is the argument:
 *
 *   1. THE VERDICT   the clock, the statement, the status. Four levels of
 *                    typographic weight and nothing else competing.
 *   2. THE SITUATION the whole causal chain in one diagram, plus the state
 *                    strip underneath it.
 *   3. THE PROOF     the loss boundary — where exactly it happens.
 *   4. WHAT REMAINS  conflicts and the asset, the things still to act on.
 *
 * A reader who stops after band one has the answer. A reader who stops after
 * band two knows where it comes from. Nothing below band two is required to
 * understand the result, which is what lets the page be this dense.
 *
 * ## What was removed
 *
 * The first version put six KPI tiles between the verdict and the diagram.
 * They showed the same six numbers the state strip now shows proportionally,
 * they occupied the most valuable band on the page, and they pushed the
 * signature visualisation below the fold. Counting tiles is what a generic
 * dashboard does with a row it has not thought about.
 */

import { useMemo } from 'react'
import type { AnalysisResult, PreservationOutcome } from '../domain/types.ts'
import {
  ASSET_TYPE_LABEL,
  FEASIBILITY_LABEL,
  FEASIBILITY_TEXT,
  SCOPE_STATEMENT,
} from '../domain/semantics.ts'
import { formatClock, formatDuration, formatInstant } from '../domain/time.ts'
import { headline } from '../engine/report.ts'
import { FEASIBILITY_STYLE, FOCUS, LABEL, OUTCOME_STYLE } from '../ui/tokens.ts'
import {
  Button,
  FeasibilityBadge,
  Panel,
  PanelHeader,
  SeverityBadge,
  cx,
} from '../ui/primitives.tsx'
import { LossBoundary, type BoundaryStep } from '../ui/LossBoundary.tsx'
import { SituationMap } from '../ui/SituationMap.tsx'
import { StateStrip } from '../ui/StateStrip.tsx'
import { IconBoundary, IconClock, IconConflict, IconDecision, IconLink } from '../ui/icons.tsx'
import type { ViewId } from '../state.ts'

export function CommandCenter({
  result,
  boundary,
  onBoundary,
  onSelectArtifact,
  onSelectStep,
  onSelectConflict,
  onFilterOutcome,
  activeOutcomes,
  onNavigate,
}: {
  result: AnalysisResult
  boundary: number
  onBoundary: (i: number) => void
  onSelectArtifact: (id: string) => void
  onSelectStep: (id: string) => void
  onSelectConflict: (id: string) => void
  onFilterOutcome: (o: PreservationOutcome) => void
  activeOutcomes: readonly PreservationOutcome[]
  onNavigate: (v: ViewId) => void
}) {
  const { plan, feasibility, summary } = result

  // The boundary scrubs through the plan as the operator wrote it, not the
  // recommended order. The whole point is to show what *this* plan does.
  const steps: readonly BoundaryStep[] = useMemo(
    () =>
      result.footprints.map((f) => ({
        step_id: f.step_id,
        action_id: f.action_id,
        name: f.name,
        kind: f.category === 'capture' ? ('capture' as const) : ('remediation' as const),
        destructive: f.destroys.length > 0,
        uncharacterised: f.unknown.length > 0 && f.destroys.length === 0,
        minutes: f.estimated_minutes,
      })),
    [result.footprints],
  )

  const o = summary.outcomes
  const atRisk = o.lost + o.accepted_loss + o.indeterminate
  const fStyle = FEASIBILITY_STYLE[feasibility.status]
  const overrun = feasibility.slack_minutes < 0

  return (
    <div className="space-y-5">
      {/* ================================================================== */}
      {/* 1. THE VERDICT                                                     */}
      {/* ================================================================== */}
      <Panel className="overflow-hidden">
        <div className="grid lg:grid-cols-[19rem_1fr]">
          {/* The clock. Its own tonal ground, because time is the constraint
              everything else is measured against and it earns its own field. */}
          <div
            className={cx(
              'relative border-b border-line-1 bg-surface-inset px-5 py-5 lg:border-b-0 lg:border-r',
            )}
          >
            <p className={cx(LABEL, 'flex items-center gap-1.5 text-time')}>
              <IconClock size={12} />
              Remediation window
            </p>
            <p
              className={cx(
                'tnum mt-2 font-display text-clock font-medium leading-none',
                overrun || feasibility.available_minutes <= 0 ? 'text-lost' : 'text-ink-0',
              )}
            >
              {feasibility.available_minutes <= 0
                ? '00:00:00'
                : formatClock(feasibility.available_minutes)}
            </p>

            {/* The window, drawn. Work against capacity, in one bar. */}
            <div className="mt-4">
              <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-surface-3">
                <div
                  className={cx('h-full rounded-full transition-[width] duration-380 ease-out', fStyle.fill)}
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
              <p className="tnum mt-1.5 flex items-baseline justify-between text-2xs">
                <span className="text-ink-3">{formatDuration(feasibility.total_minutes)} of work</span>
                <span className={overrun ? 'text-lost' : 'text-preserved'}>
                  {overrun
                    ? `${formatDuration(-feasibility.slack_minutes)} over`
                    : `${formatDuration(feasibility.slack_minutes)} spare`}
                </span>
              </p>
            </div>

            <dl className="mt-5 space-y-2.5 border-t border-line-1 pt-4">
              <div>
                <dt className={LABEL}>Priority tier</dt>
                <dd className="mt-0.5 flex flex-wrap items-center gap-1.5">
                  <span className="text-sm text-ink-1">{plan.tier.label}</span>
                  <span className="rounded border border-line-2 bg-surface-2 px-1.5 py-px text-2xs uppercase tracking-[0.08em] text-ink-3">
                    External
                  </span>
                </dd>
                <dd className="mt-1 text-2xs leading-relaxed text-ink-3">
                  Set by {plan.tier.source}. TOURNIQUET consumes it and does not compute one.
                </dd>
              </div>
              <div>
                <dt className={LABEL}>Window</dt>
                <dd className="tnum mt-0.5 font-mono text-2xs leading-relaxed text-ink-2">
                  {formatInstant(plan.deadline.plan_start)}
                  <br />
                  {formatInstant(plan.deadline.due_at)}
                </dd>
              </div>
            </dl>
          </div>

          {/* The statement. Four deliberate levels of weight. */}
          <div className="min-w-0 px-5 py-5 lg:px-6">
            <h2 className="max-w-[24ch] font-display text-2xl font-medium leading-[1.15] tracking-[-0.022em] text-ink-0">
              Before you fix it,
              <br />
              know what you will lose.
            </h2>

            <div className="mt-4 flex flex-wrap items-center gap-2.5">
              <FeasibilityBadge status={feasibility.status} />
              <span className={cx('text-sm font-medium', fStyle.text)}>
                {FEASIBILITY_LABEL[feasibility.status]}
              </span>
              <span className="text-xs text-ink-3">{FEASIBILITY_TEXT[feasibility.status]}</span>
            </div>

            <p className="mt-4 max-w-[78ch] text-md leading-relaxed text-ink-1">
              {headline(result)}
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              {!result.sequence.matches_plan_order ? (
                <Button variant="primary" onClick={() => onNavigate('sequence')}>
                  <IconLink size={13} />
                  See the recommended order
                </Button>
              ) : null}
              {result.conflicts.length > 0 ? (
                <Button onClick={() => onNavigate('conflicts')}>
                  <IconConflict size={13} />
                  {result.conflicts.length}{' '}
                  {result.conflicts.length === 1 ? 'decision' : 'decisions'} outstanding
                </Button>
              ) : null}
              <Button variant="quiet" onClick={() => onNavigate('report')}>
                Report
              </Button>
            </div>
          </div>
        </div>
      </Panel>

      {/* ================================================================== */}
      {/* 2. THE SITUATION                                                   */}
      {/* ================================================================== */}
      <Panel>
        <PanelHeader
          title="Situation map"
          hint="The whole chain, left to right: the clock you were given, the preservation the plan attempts, the step where most of the evidence stops existing, and what is left afterwards. Click a step or a band to open it."
          right={
            <span className="flex items-center gap-1.5 text-2xs text-ink-3">
              <span className="text-link">
                <IconLink size={12} />
              </span>
              causal flow
            </span>
          }
        />
        <div className="grid-field border-b border-line-1 bg-surface-inset/40 px-2 py-2">
          <SituationMap
            result={result}
            activeOutcomes={activeOutcomes}
            onSelectOutcome={(k) => {
              onFilterOutcome(k)
              onNavigate('evidence')
            }}
            onSelectStep={onSelectStep}
          />
        </div>
        <StateStrip
          counts={o}
          active={activeOutcomes}
          onToggle={(k) => {
            onFilterOutcome(k)
            onNavigate('evidence')
          }}
          label="Evidence state after this plan"
        />
      </Panel>

      {/* ================================================================== */}
      {/* 3. THE PROOF                                                       */}
      {/* ================================================================== */}
      <Panel>
        <PanelHeader
          title={
            <span className="flex items-center gap-2">
              <span className="text-lost">
                <IconBoundary size={15} />
              </span>
              What disappears, and when
            </span>
          }
          hint="Each bar is an artifact, drawn from the start of the plan to the moment it stops existing. Drag the boundary through the steps: to its left is what has already happened, to its right is what has not."
          right={
            <Button size="sm" variant="quiet" onClick={() => onNavigate('timeline')}>
              Time-scaled view
            </Button>
          }
        />
        <LossBoundary
          result={result}
          steps={steps}
          boundary={boundary}
          onBoundary={onBoundary}
          onSelectArtifact={onSelectArtifact}
          onSelectStep={onSelectStep}
        />
      </Panel>

      {/* ================================================================== */}
      {/* 4. WHAT REMAINS                                                    */}
      {/* ================================================================== */}
      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <Panel>
          <PanelHeader
            title={
              <span className="flex items-center gap-2">
                <span className={result.conflicts.length > 0 ? 'text-lost' : 'text-preserved'}>
                  <IconConflict size={15} />
                </span>
                {result.conflicts.length === 0
                  ? 'No conflicts'
                  : `${result.conflicts.length} ${result.conflicts.length === 1 ? 'conflict' : 'conflicts'} need a human decision`}
              </span>
            }
            hint="TOURNIQUET states the incompatibility and lists what could be done about it. Choosing is not something it does."
            right={
              result.conflicts.length > 0 ? (
                <Button size="sm" onClick={() => onNavigate('conflicts')}>
                  Open
                </Button>
              ) : null
            }
          />
          {result.conflicts.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-ink-3">
              The plan as written preserves everything it sets out to preserve, inside the window.
            </p>
          ) : (
            <ul>
              {result.conflicts.slice(0, 3).map((c) => (
                <li key={c.conflict_id} className="border-b border-line-1 last:border-0">
                  <button
                    type="button"
                    onClick={() => {
                      onSelectConflict(c.conflict_id)
                      onNavigate('conflicts')
                    }}
                    className={cx(
                      'w-full border-l-2 px-5 py-3.5 text-left transition-colors duration-140 hover:bg-surface-2',
                      c.severity === 'critical' || c.severity === 'high'
                        ? 'border-l-lost'
                        : 'border-l-degraded',
                      FOCUS,
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <SeverityBadge severity={c.severity} />
                      <span className="min-w-0 flex-1 text-sm font-medium text-ink-0">
                        {c.title}
                      </span>
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-ink-2">
                      {c.detail}
                    </p>
                  </button>
                </li>
              ))}
              {result.conflicts.length > 3 ? (
                <li className="px-5 py-3 text-xs text-ink-3">
                  and {result.conflicts.length - 3} more.
                </li>
              ) : null}
            </ul>
          )}
        </Panel>

        <div className="space-y-5">
          <Panel>
            <PanelHeader title="Asset" />
            <dl className="divide-y divide-line-1">
              {(
                [
                  ['Host', <span key="h" className="ident font-mono text-xs">{plan.asset.name}</span>],
                  ['Type', ASSET_TYPE_LABEL[plan.asset.type]],
                  ['Environment', `${plan.asset.environment} · ${plan.asset.owner}`],
                  ['Vulnerability', plan.vulnerability.title],
                  [
                    'Reference',
                    <span key="r" className="ident font-mono text-xs">
                      {plan.vulnerability.reference}
                    </span>,
                  ],
                  [
                    'Investigation',
                    plan.vulnerability.suspected_compromise ? (
                      <span key="i" className="text-degraded">Compromise suspected</span>
                    ) : (
                      'No confirmed compromise'
                    ),
                  ],
                ] as const
              ).map(([k, v]) => (
                <div key={k} className="grid grid-cols-[7.5rem_1fr] gap-3 px-5 py-2.5">
                  <dt className={LABEL}>{k}</dt>
                  <dd className="min-w-0 text-sm text-ink-1">{v}</dd>
                </div>
              ))}
            </dl>
          </Panel>

          {atRisk > 0 ? (
            <Panel
              className={cx(
                'border-l-2',
                o.lost > 0 ? 'border-l-lost' : 'border-l-unknown',
              )}
            >
              <div className="px-5 py-4">
                <p className="flex items-center gap-2 font-display text-md font-medium text-ink-0">
                  <span className={o.lost > 0 ? 'text-lost' : 'text-unknown'}>
                    <IconDecision size={15} />
                  </span>
                  {atRisk} {atRisk === 1 ? 'artifact needs' : 'artifacts need'} a decision
                </p>
                <ul className="mt-2.5 space-y-1 text-xs leading-relaxed text-ink-2">
                  {o.lost > 0 ? (
                    <li className="flex items-baseline gap-2">
                      <span className={OUTCOME_STYLE.lost.text}>{o.lost}</span>
                      destroyed before anything captures them
                    </li>
                  ) : null}
                  {o.indeterminate > 0 ? (
                    <li className="flex items-baseline gap-2">
                      <span className={OUTCOME_STYLE.indeterminate.text}>{o.indeterminate}</span>
                      reached by a step nobody has characterised
                    </li>
                  ) : null}
                  {o.accepted_loss > 0 ? (
                    <li className="flex items-baseline gap-2">
                      <span className={OUTCOME_STYLE.accepted_loss.text}>{o.accepted_loss}</span>
                      already signed for
                    </li>
                  ) : null}
                </ul>
                <Button size="sm" className="mt-3" onClick={() => onNavigate('losses')}>
                  Record a decision
                </Button>
              </div>
            </Panel>
          ) : null}
        </div>
      </div>

      {/* ---- what this tool is ------------------------------------------ */}
      <Panel>
        <PanelHeader
          title="What this analysis is, and what it is not"
          hint="Three different questions get confused with each other constantly. TOURNIQUET answers one of them."
        />
        <div className="grid gap-px bg-line-1 sm:grid-cols-3">
          {(
            [
              ['Prioritisation', SCOPE_STATEMENT.prioritisation, false],
              ['Forensic acquisition', SCOPE_STATEMENT.forensics, false],
              ['Sequencing', SCOPE_STATEMENT.tourniquet, true],
            ] as const
          ).map(([name, s, ours]) => (
            <div
              key={name}
              className={cx('relative p-5', ours ? 'bg-surface-2' : 'bg-surface-1')}
            >
              {ours ? (
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 top-0 h-0.5 bg-accent"
                />
              ) : null}
              <p className={cx(LABEL, ours && 'text-accent')}>{name}</p>
              <p className="mt-1.5 text-sm font-medium leading-snug text-ink-0">{s.question}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-ink-2">{s.answer}</p>
            </div>
          ))}
        </div>
        <div className="border-t border-line-1 px-5 py-3">
          <p className="text-2xs leading-relaxed text-ink-3">
            TOURNIQUET does not scan, acquire, patch or execute anything. It reads a plan you
            wrote and tells you what order would preserve the most. The action-to-evidence
            mappings are a synthetic library written for this tool — they describe how these
            platforms generally behave and are not vendor statements about your build.
          </p>
        </div>
      </Panel>
    </div>
  )
}
