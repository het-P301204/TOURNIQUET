/**
 * The conflict centre.
 *
 * Where the tool says "these two obligations do not both fit" and then stops.
 *
 * Every conflict here carries options and none of them carries a default.
 * That is deliberate and it is the product's central manners rule: reducing
 * collection scope, delaying remediation under an exception, and accepting
 * the loss of a named artifact are all legitimate answers, and which one is
 * right depends on the business, the regulator, the maintenance window and
 * how badly somebody needs to know what happened — none of which is visible
 * from here.
 *
 * The options are rendered as prose rather than as buttons for the same
 * reason. A button implies the tool can carry the decision out; most of these
 * are conversations with a change board.
 */

import { useMemo } from 'react'
import type { AnalysisResult, Conflict, Severity } from '../domain/types.ts'
import { CONFLICT_LABEL, SEVERITY_LABEL } from '../domain/semantics.ts'
import { FOCUS, LABEL, OUTCOME_STYLE, SEVERITY_STYLE } from '../ui/tokens.ts'
import {
  Button,
  Callout,
  Empty,
  Panel,
  PanelHeader,
  SeverityBadge,
  cx,
} from '../ui/primitives.tsx'
import { ConflictScale } from '../ui/ConflictScale.tsx'
import { IconConflict, IconUnknown } from '../ui/icons.tsx'
import type { ViewId } from '../state.ts'

export function ConflictCenter({
  result,
  selected,
  onSelect,
  onSelectArtifact,
  onAdopt,
  onNavigate,
}: {
  result: AnalysisResult
  selected: string | null
  onSelect: (id: string | null) => void
  onSelectArtifact: (id: string) => void
  onAdopt: (order: readonly string[]) => void
  onNavigate: (v: ViewId) => void
}) {
  const byArtifact = useMemo(
    () => new Map(result.artifacts.map((a) => [a.artifact_id, a])),
    [result.artifacts],
  )

  const counts = useMemo(() => {
    const c: Record<Severity, number> = { critical: 0, high: 0, medium: 0, informational: 0 }
    for (const x of result.conflicts) c[x.severity] += 1
    return c
  }, [result.conflicts])

  if (result.conflicts.length === 0) {
    return (
      <div className="space-y-5">
        <Panel>
          <Empty title="No conflicts">
            The plan as written preserves everything it sets out to preserve, inside the window,
            with no uncharacterised steps reaching anything in scope. That is a real result rather
            than an empty state — but it is a result about this plan and this catalogue, not a
            guarantee about the host.
          </Empty>
        </Panel>
        <UnknownsPanel result={result} onSelectArtifact={onSelectArtifact} />
      </div>
    )
  }

  const clockConflict = result.conflicts.find(
    (c) => c.kind === 'deadline' || c.kind === 'expired_deadline',
  )

  return (
    <div className="space-y-5">
      {/* The clock conflict is the one worth drawing: it is two quantities
          that will not both fit, and two bars say that faster than a
          sentence can. */}
      {clockConflict ? (
        <Panel className="border-l-2 border-l-lost">
          <PanelHeader
            title={
              <span className="flex items-center gap-2">
                <span className="text-lost">
                  <IconConflict size={15} />
                </span>
                {clockConflict.title}
              </span>
            }
            hint={clockConflict.detail}
          />
          <div className="px-5 py-4">
            <ConflictScale
              preservationMinutes={result.feasibility.preservation_minutes}
              remediationMinutes={result.feasibility.remediation_minutes}
              verificationMinutes={result.feasibility.verification_minutes}
              bufferMinutes={result.feasibility.buffer_minutes}
              windowMinutes={Math.max(0, result.feasibility.available_minutes)}
              untimedSteps={result.feasibility.unknown_duration_count}
            />
            <div className="mt-4 border-t border-line-1 pt-4">
              <p className={cx(LABEL, 'mb-2')}>Options for human review</p>
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {clockConflict.options.map((o) => (
                  <li
                    key={o}
                    className="flex items-baseline gap-2 rounded border border-line-1 bg-surface-2 px-3 py-2 text-xs leading-relaxed text-ink-1"
                  >
                    <span aria-hidden="true" className="shrink-0 text-ink-3">
                      —
                    </span>
                    <span className="min-w-0">{o}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-2xs text-ink-3">
                None of these has been chosen. Which obligation gives way is a decision with a
                name attached to it, and this tool has no name.
              </p>
            </div>
          </div>
        </Panel>
      ) : null}

      <Panel>
        <PanelHeader
          title={`${result.conflicts.length} ${result.conflicts.length === 1 ? 'conflict' : 'conflicts'}`}
          hint="Each one states an incompatibility and lists what a human could do about it. None of them has been resolved here, and the tool will not resolve one on your behalf."
          right={
            <div className="flex flex-wrap items-center gap-1.5">
              {(['critical', 'high', 'medium', 'informational'] as const)
                .filter((s) => counts[s] > 0)
                .map((s) => (
                  <span
                    key={s}
                    className={cx(
                      'tnum rounded border px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-[0.08em]',
                      SEVERITY_STYLE[s].text,
                      SEVERITY_STYLE[s].border,
                      SEVERITY_STYLE[s].wash,
                    )}
                  >
                    {counts[s]} {SEVERITY_LABEL[s]}
                  </span>
                ))}
            </div>
          }
        />
        <ul>
          {result.conflicts.map((c) => (
            <ConflictRow
              key={c.conflict_id}
              conflict={c}
              expanded={selected === c.conflict_id}
              onToggle={() => onSelect(selected === c.conflict_id ? null : c.conflict_id)}
              names={c.subject_ids.map((id) => ({
                id,
                name: byArtifact.get(id)?.name ?? id,
              }))}
              onSelectArtifact={onSelectArtifact}
              action={
                c.kind === 'ordering' && !result.sequence.matches_plan_order ? (
                  <Button size="sm" variant="primary" onClick={() => onAdopt(result.sequence.order)}>
                    Adopt the recommended order
                  </Button>
                ) : c.kind === 'undocumented_loss' || c.kind === 'uncaptured_required' ? (
                  <Button size="sm" onClick={() => onNavigate('losses')}>
                    Record a decision
                  </Button>
                ) : c.kind === 'deadline' || c.kind === 'expired_deadline' ? (
                  <Button size="sm" variant="quiet" onClick={() => onNavigate('timeline')}>
                    See the arithmetic
                  </Button>
                ) : c.kind === 'unusable_capture' ? (
                  <Button size="sm" variant="quiet" onClick={() => onNavigate('plan')}>
                    Edit the plan
                  </Button>
                ) : null
              }
            />
          ))}
        </ul>
      </Panel>

      <UnknownsPanel result={result} onSelectArtifact={onSelectArtifact} />
    </div>
  )
}

function ConflictRow({
  conflict,
  expanded,
  onToggle,
  names,
  onSelectArtifact,
  action,
}: {
  conflict: Conflict
  expanded: boolean
  onToggle: () => void
  names: readonly { id: string; name: string }[]
  onSelectArtifact: (id: string) => void
  action: React.ReactNode
}) {
  return (
    <li
      className={cx(
        'border-b border-line-1 last:border-0',
        conflict.severity === 'critical' && 'border-l-2 border-l-lost',
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className={cx(
          'w-full px-5 py-4 text-left transition-colors duration-140 hover:bg-surface-2',
          FOCUS,
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          <SeverityBadge severity={conflict.severity} />
          <span className="min-w-0 flex-1 text-sm font-medium text-ink-0">{conflict.title}</span>
          <span className={cx(LABEL, 'shrink-0')}>{CONFLICT_LABEL[conflict.kind]}</span>
          <span
            aria-hidden="true"
            className={cx(
              'shrink-0 text-2xs text-ink-3 transition-transform duration-140',
              expanded && 'rotate-90',
            )}
          >
            ▶
          </span>
        </div>
        <p
          className={cx(
            'mt-1.5 max-w-[92ch] text-xs leading-relaxed text-ink-2',
            !expanded && 'line-clamp-2',
          )}
        >
          {conflict.detail}
        </p>
      </button>

      {expanded ? (
        <div className="animate-fade-in space-y-4 px-5 pb-5">
          {names.length > 0 ? (
            <div>
              <p className={cx(LABEL, 'mb-2')}>
                {names.length} {names.length === 1 ? 'artifact' : 'artifacts'}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {names.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => onSelectArtifact(n.id)}
                    className={cx(
                      'rounded border border-line-2 bg-surface-inset px-2 py-0.5 text-2xs text-ink-2 transition-colors duration-140 hover:border-line-3 hover:text-ink-0',
                      FOCUS,
                    )}
                  >
                    {n.name}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div>
            <p className={cx(LABEL, 'mb-2')}>Options for human review</p>
            <ul className="space-y-1.5">
              {conflict.options.map((o) => (
                <li key={o} className="flex items-baseline gap-2.5 text-sm leading-relaxed text-ink-1">
                  <span aria-hidden="true" className="shrink-0 text-ink-3">
                    —
                  </span>
                  <span className="min-w-0">{o}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-2xs text-ink-3">
              None of these has been chosen. Which obligation gives way is a decision with a name
              attached to it, and this tool has no name.
            </p>
          </div>

          {conflict.resolved_by ? (
            <Callout tone="neutral" title="A decision is already on record">
              <span className="font-mono text-xs">{conflict.resolved_by}</span>
            </Callout>
          ) : null}

          {action ? <div className="flex flex-wrap gap-2">{action}</div> : null}
        </div>
      ) : null}
    </li>
  )
}

function UnknownsPanel({
  result,
  onSelectArtifact,
}: {
  result: AnalysisResult
  onSelectArtifact: (id: string) => void
}) {
  const byId = new Map(result.artifacts.map((a) => [a.artifact_id, a]))
  return (
    <Panel>
      <PanelHeader
        title={
          <span className="flex items-center gap-2">
            <span className={result.unknowns.length === 0 ? 'text-preserved' : 'text-unknown'}>
              <IconUnknown size={15} />
            </span>
            {result.unknowns.length === 0
              ? 'No unknown blast radius'
              : `${result.unknowns.length} ${result.unknowns.length === 1 ? 'step' : 'steps'} with an uncharacterised effect`}
          </span>
        }
        hint="Unknown is a state of its own here. It is not converted into safe and it is not converted into destroyed, and nothing downstream reports these artifacts as either."
      />
      {result.unknowns.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-ink-3">
          Every step in this plan has a characterised relationship to every artifact in scope for
          this asset type.
        </p>
      ) : (
        <ul>
          {result.unknowns.map((u) => (
            <li
              key={u.step_id}
              className="border-b border-l-2 border-line-1 border-l-unknown px-5 py-4 last:border-b-0"
            >
              <p className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-ink-0">{u.action_name}</span>
                <span className="rounded border border-unknown/35 bg-unknown/10 px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-[0.08em] text-unknown">
                  ? Unknown
                </span>
              </p>
              <p className="mt-1.5 max-w-[92ch] text-xs leading-relaxed text-ink-2">{u.reason}</p>
              <p className="mt-1.5 max-w-[92ch] text-xs leading-relaxed text-ink-1">
                {u.recommendation}
              </p>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {u.artifact_ids.map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onSelectArtifact(id)}
                    className={cx(
                      'hatch rounded border border-unknown/30 px-2 py-0.5 text-2xs text-unknown transition-colors duration-140 hover:border-unknown/60',
                      FOCUS,
                    )}
                  >
                    <span className="bg-surface-1 px-1">{byId.get(id)?.name ?? id}</span>
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="border-t border-line-1 px-5 py-3">
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs text-ink-3">
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className={cx('h-2 w-4 rounded-sm', OUTCOME_STYLE.indeterminate.fill)} />
            An indeterminate outcome is an open question about your own remediation, not the
            absence of one.
          </span>
        </p>
      </div>
    </Panel>
  )
}
