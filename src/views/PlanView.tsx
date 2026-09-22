/**
 * The remediation plan.
 *
 * The editable surface: reorder, remove, add, retime. Every row carries the
 * evidence cost of the step it describes, so the consequence of a move is
 * visible in the same place the move is made rather than two screens away.
 *
 * Reordering is where the tool's manners matter most. It will not stop you,
 * it will not silently "fix" your order, and it will not let the departure go
 * unrecorded: the moment an order diverges from the recommendation, a banner
 * asks for a reason, and the reason becomes part of the plan.
 */

import { useMemo, useState } from 'react'
import type { AnalysisResult, OverrideRecord, RemediationAction } from '../domain/types.ts'
import { ACTION_CATEGORY_LABEL, DESTRUCTIVE_LABEL } from '../domain/semantics.ts'
import { formatDuration } from '../domain/time.ts'
import { FOCUS, LABEL } from '../ui/tokens.ts'
import {
  Button,
  Callout,
  DestructiveBadge,
  Field,
  Panel,
  PanelHeader,
  Select,
  TextArea,
  TextInput,
  cx,
} from '../ui/primitives.tsx'
import type { ViewId } from '../state.ts'

export function PlanView({
  result,
  pendingOverride,
  onMove,
  onRemove,
  onAdd,
  onRetime,
  onAdopt,
  onRecordOverride,
  onDismissOverride,
  onRemoveOverride,
  onSelectStep,
  onSetBuffer,
  onSetVerification,
  onNavigate,
}: {
  result: AnalysisResult
  pendingOverride: { readonly recommended: readonly string[] } | null
  onMove: (step_id: string, direction: -1 | 1) => void
  onRemove: (step_id: string) => void
  onAdd: (action_id: string) => void
  onRetime: (step_id: string, minutes: number | null) => void
  onAdopt: (order: readonly string[]) => void
  onRecordOverride: (o: OverrideRecord) => void
  onDismissOverride: () => void
  onRemoveOverride: (id: string) => void
  onSelectStep: (id: string) => void
  onSetBuffer: (m: number) => void
  onSetVerification: (m: number) => void
  onNavigate: (v: ViewId) => void
}) {
  const { plan, sequence, feasibility } = result
  const [adding, setAdding] = useState<string>('')

  const available = useMemo(
    () =>
      [...result.actions]
        .filter((a) => !plan.steps.some((s) => s.action_id === a.action_id))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [result.actions, plan.steps],
  )

  const byId = new Map(result.artifacts.map((a) => [a.artifact_id, a]))
  const lostByStep = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const o of result.outcomes) {
      const h = o.first_harm
      if (!h) continue
      if (o.outcome !== 'lost' && o.outcome !== 'accepted_loss') continue
      const list = m.get(h.step_id) ?? []
      list.push(o.name)
      m.set(h.step_id, list)
    }
    return m
  }, [result.outcomes])

  return (
    <div className="space-y-5">
      {pendingOverride ? (
        <OverrideForm
          result={result}
          recommended={pendingOverride.recommended}
          onRecord={onRecordOverride}
          onDismiss={onDismissOverride}
          onAdopt={() => onAdopt(sequence.order)}
        />
      ) : null}

      {!sequence.matches_plan_order && !pendingOverride ? (
        <Callout tone="warn" title="This is not the recommended order">
          <p>
            The recommended sequence contains the same steps and the same remediation. Only the
            order differs, and under it {countBetter(result)}{' '}
            {countBetter(result) === 1 ? 'artifact ends' : 'artifacts end'} up better.
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <Button size="sm" variant="primary" onClick={() => onAdopt(sequence.order)}>
              Adopt the recommended order
            </Button>
            <Button size="sm" variant="quiet" onClick={() => onNavigate('sequence')}>
              See why, step by step
            </Button>
          </div>
        </Callout>
      ) : null}

      <Panel>
        <PanelHeader
          title="Planned steps, in the order you wrote them"
          hint="The order here is what the analysis is computed against. Reordering asks for a reason, because an order that departs from the recommendation should depart on the record."
          right={
            <span className="tnum text-xs text-ink-3">
              {plan.steps.length} {plan.steps.length === 1 ? 'step' : 'steps'} ·{' '}
              {formatDuration(feasibility.preservation_minutes + feasibility.remediation_minutes)}
            </span>
          }
        />

        {plan.steps.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-ink-3">
            No steps yet. Add one below, or load a demo scenario.
          </p>
        ) : (
          <ol>
            {result.footprints.map((f, i) => {
              const step = plan.steps[i]
              const lost = lostByStep.get(f.step_id) ?? []
              const isCapture = f.category === 'capture'
              return (
                <li
                  key={f.step_id}
                  className="border-b border-line-1 last:border-0"
                >
                  <div className="flex items-start gap-3 px-5 py-3.5 transition-colors duration-140 hover:bg-surface-2">
                    <span className="tnum mt-0.5 w-5 shrink-0 text-right font-mono text-xs text-ink-3">
                      {i + 1}
                    </span>

                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => onSelectStep(f.step_id)}
                        className={cx('block w-full text-left', FOCUS)}
                      >
                        <span className="flex flex-wrap items-center gap-2">
                          <span
                            aria-hidden="true"
                            className={cx(
                              'inline-block h-2 w-2 shrink-0 rounded-full border',
                              isCapture
                                ? 'border-preserved bg-surface-0'
                                : f.destroys.length > 0
                                  ? 'border-lost bg-lost'
                                  : f.unknown.length > 0
                                    ? 'border-unknown bg-unknown/40'
                                    : 'border-line-3 bg-surface-2',
                            )}
                          />
                          <span className="text-sm font-medium text-ink-0">{f.name}</span>
                          <span className={cx(LABEL, 'shrink-0')}>
                            {ACTION_CATEGORY_LABEL[f.category]}
                          </span>
                        </span>
                      </button>

                      <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-ink-3">
                        <span className="tnum">{formatDuration(f.estimated_minutes)}</span>
                        <span>
                          {f.reversible === 'unknown'
                            ? 'Reversibility unknown'
                            : f.reversible
                              ? 'Reversible'
                              : 'Irreversible'}
                        </span>
                        {f.destroys.length > 0 ? (
                          <span className="text-lost">destroys {f.destroys.length}</span>
                        ) : null}
                        {f.modifies.length + f.may_invalidate.length > 0 ? (
                          <span className="text-degraded">
                            alters {f.modifies.length + f.may_invalidate.length}
                          </span>
                        ) : null}
                        {f.unknown.length > 0 ? (
                          <span className="text-unknown">unknown on {f.unknown.length}</span>
                        ) : null}
                      </p>

                      {lost.length > 0 ? (
                        <p className="mt-2 text-xs leading-relaxed text-lost">
                          <span aria-hidden="true">✕ </span>
                          Lost here:{' '}
                          <span className="text-ink-1">{lost.join(', ')}</span>
                        </p>
                      ) : null}

                      {isCapture ? (
                        <p className="mt-2 text-xs leading-relaxed text-preserved">
                          <span aria-hidden="true">● </span>
                          Acquires:{' '}
                          <span className="text-ink-1">
                            {(result.actions.find((a) => a.action_id === f.action_id)?.captures ?? [])
                              .map((id) => byId.get(id)?.name)
                              .filter(Boolean)
                              .join(', ') || 'nothing in scope for this asset type'}
                          </span>
                        </p>
                      ) : null}
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <DestructiveBadge level={f.destructive_level} />
                      <div className="ml-1 flex flex-col">
                        <button
                          type="button"
                          onClick={() => onMove(f.step_id, -1)}
                          disabled={i === 0}
                          aria-label={`Move ${f.name} earlier`}
                          className={cx(
                            'rounded px-1.5 text-2xs leading-4 text-ink-3 transition-colors duration-140 hover:bg-surface-3 hover:text-ink-0 disabled:opacity-25',
                            FOCUS,
                          )}
                        >
                          <span aria-hidden="true">▲</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onMove(f.step_id, 1)}
                          disabled={i === plan.steps.length - 1}
                          aria-label={`Move ${f.name} later`}
                          className={cx(
                            'rounded px-1.5 text-2xs leading-4 text-ink-3 transition-colors duration-140 hover:bg-surface-3 hover:text-ink-0 disabled:opacity-25',
                            FOCUS,
                          )}
                        >
                          <span aria-hidden="true">▼</span>
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => onRemove(f.step_id)}
                        aria-label={`Remove ${f.name} from the plan`}
                        className={cx(
                          'rounded px-1.5 py-1 text-xs text-ink-3 transition-colors duration-140 hover:bg-lost/15 hover:text-lost',
                          FOCUS,
                        )}
                      >
                        <span aria-hidden="true">✕</span>
                      </button>
                    </div>
                  </div>

                  {step ? (
                    <div className="flex flex-wrap items-center gap-2 px-5 pb-3 pl-[2.75rem]">
                      <label
                        htmlFor={`min-${f.step_id}`}
                        className="text-2xs uppercase tracking-[0.08em] text-ink-3"
                      >
                        Minutes for this plan
                      </label>
                      <input
                        id={`min-${f.step_id}`}
                        type="number"
                        min={0}
                        value={step.override_minutes ?? ''}
                        placeholder={
                          result.actions.find((a) => a.action_id === f.action_id)?.estimated_minutes?.toString() ??
                          'not estimated'
                        }
                        onChange={(e) =>
                          onRetime(f.step_id, e.target.value === '' ? null : Number(e.target.value))
                        }
                        className={cx(
                          'tnum w-28 rounded border border-line-2 bg-surface-3 px-2 py-0.5 text-xs text-ink-0 placeholder:text-ink-3',
                          FOCUS,
                        )}
                      />
                      {step.override_minutes !== null ? (
                        <button
                          type="button"
                          onClick={() => onRetime(f.step_id, null)}
                          className={cx('rounded px-1 text-2xs text-ink-3 hover:text-ink-0', FOCUS)}
                        >
                          reset to library
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ol>
        )}

        <div className="flex flex-wrap items-end gap-3 border-t border-line-1 px-5 py-4">
          <div className="min-w-[16rem] flex-1">
            <Field label="Add a step from the action library">
              {(id) => (
                <Select
                  id={id}
                  value={adding}
                  onChange={setAdding}
                  options={[
                    { value: '', label: available.length ? 'Choose an action…' : 'Every action is already in the plan' },
                    ...available.map((a) => ({
                      value: a.action_id,
                      label: `${a.name} — ${DESTRUCTIVE_LABEL[a.destructive_level].toLowerCase()}, ${formatDuration(a.estimated_minutes)}`,
                    })),
                  ]}
                />
              )}
            </Field>
          </div>
          <Button
            disabled={adding === ''}
            onClick={() => {
              if (adding === '') return
              onAdd(adding)
              setAdding('')
            }}
          >
            Add to plan
          </Button>
        </div>
      </Panel>

      {/* ---- clock legs -------------------------------------------------- */}
      <Panel>
        <PanelHeader
          title="Other time against the clock"
          hint="Work that is real but is not a step: soak monitoring after the change, and the slack the team holds back. Both count against the window."
        />
        <div className="grid gap-4 px-5 py-4 sm:grid-cols-2">
          <Field
            label="Verification beyond the steps"
            hint="Post-change monitoring or sign-off. Counted separately from any verification step in the list above, so the two are not double counted."
          >
            {(id) => (
              <input
                id={id}
                type="number"
                min={0}
                value={plan.verification_minutes}
                onChange={(e) => onSetVerification(Number(e.target.value) || 0)}
                className={cx(
                  'tnum w-full rounded border border-line-2 bg-surface-3 px-2.5 py-1.5 text-sm text-ink-0',
                  FOCUS,
                )}
              />
            )}
          </Field>
          <Field
            label="Contingency buffer"
            hint="Slack held back for the unexpected. Counted as spent, because a buffer you plan to use is time you do not have."
          >
            {(id) => (
              <input
                id={id}
                type="number"
                min={0}
                value={plan.contingency_buffer_minutes}
                onChange={(e) => onSetBuffer(Number(e.target.value) || 0)}
                className={cx(
                  'tnum w-full rounded border border-line-2 bg-surface-3 px-2.5 py-1.5 text-sm text-ink-0',
                  FOCUS,
                )}
              />
            )}
          </Field>
        </div>
      </Panel>

      {/* ---- recorded overrides ------------------------------------------ */}
      {plan.overrides.length > 0 ? (
        <Panel>
          <PanelHeader
            title={`${plan.overrides.length} recorded ${plan.overrides.length === 1 ? 'override' : 'overrides'}`}
            hint="A departure from the recommended order, with the reason given at the time. These travel with the plan and into the report."
          />
          <ul>
            {plan.overrides.map((o) => (
              <li key={o.override_id} className="border-b border-line-1 px-5 py-4 last:border-0">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-mono text-xs text-ink-2">{o.override_id}</span>
                  <Button size="sm" variant="quiet" onClick={() => onRemoveOverride(o.override_id)}>
                    Remove
                  </Button>
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-1">{o.reason}</p>
                {o.newly_lost_artifact_ids.length > 0 ? (
                  <p className="mt-2 text-xs text-lost">
                    Additional evidence lost as a result:{' '}
                    {o.newly_lost_artifact_ids
                      .map((id) => byId.get(id)?.name ?? id)
                      .join(', ')}
                    .
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-ink-3">
                    No additional evidence was lost by this change.
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {/* ---- library ------------------------------------------------------ */}
      <Panel>
        <PanelHeader
          title="Action library"
          hint={`${result.actions.length} actions applicable to this asset type. Each one's evidence footprint is what the analysis above is computed from.`}
        />
        <div className="scroll-thin max-h-96 overflow-y-auto">
          <ul className="divide-y divide-line-1">
            {[...result.actions]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((a) => (
                <ActionRow key={a.action_id} action={a} inPlan={plan.steps.some((s) => s.action_id === a.action_id)} onAdd={onAdd} />
              ))}
          </ul>
        </div>
      </Panel>
    </div>
  )
}

function ActionRow({
  action,
  inPlan,
  onAdd,
}: {
  action: RemediationAction
  inPlan: boolean
  onAdd: (id: string) => void
}) {
  return (
    <li className="flex items-start gap-3 px-5 py-3">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-ink-0">{action.name}</span>
          <DestructiveBadge level={action.destructive_level} />
        </p>
        <p className="mt-1 max-w-[76ch] text-xs leading-relaxed text-ink-2">{action.description}</p>
        <p className="tnum mt-1 text-2xs text-ink-3">
          {formatDuration(action.estimated_minutes)} ·{' '}
          {ACTION_CATEGORY_LABEL[action.category]} ·{' '}
          {action.effects.length} explicit{' '}
          {action.effects.length === 1 ? 'rule' : 'rules'} · default:{' '}
          {action.default_effect.impact}
        </p>
      </div>
      <Button size="sm" variant="quiet" disabled={inPlan} onClick={() => onAdd(action.action_id)}>
        {inPlan ? 'In plan' : 'Add'}
      </Button>
    </li>
  )
}

function countBetter(result: AnalysisResult): number {
  const badness = {
    preserved: 0,
    retained: 1,
    degraded: 2,
    indeterminate: 3,
    accepted_loss: 4,
    lost: 5,
  } as const
  const rec = new Map(result.recommended_outcomes.map((o) => [o.artifact_id, o]))
  return result.outcomes.filter((o) => {
    const r = rec.get(o.artifact_id)
    return r !== undefined && badness[o.outcome] > badness[r.outcome]
  }).length
}

/* -------------------------------------------------------------------------- */
/* Override capture                                                           */
/* -------------------------------------------------------------------------- */

/**
 * The form that appears the moment somebody reorders by hand.
 *
 * It does not block the change — the plan has already been reordered and the
 * analysis has already updated. What it does is refuse to let the reason go
 * unrecorded, and show the cost of the departure in the same breath as asking
 * for it.
 */
function OverrideForm({
  result,
  recommended,
  onRecord,
  onDismiss,
  onAdopt,
}: {
  result: AnalysisResult
  recommended: readonly string[]
  onRecord: (o: OverrideRecord) => void
  onDismiss: () => void
  onAdopt: () => void
}) {
  const [reason, setReason] = useState('')
  const [touched, setTouched] = useState(false)

  const newlyLost = useMemo(() => {
    const rec = new Map(result.recommended_outcomes.map((o) => [o.artifact_id, o.outcome]))
    return result.outcomes
      .filter(
        (o) =>
          (o.outcome === 'lost' || o.outcome === 'indeterminate') &&
          rec.get(o.artifact_id) !== o.outcome,
      )
      .map((o) => o.artifact_id)
  }, [result])

  const names = newlyLost
    .map((id) => result.artifacts.find((a) => a.artifact_id === id)?.name ?? id)

  const valid = reason.trim().length >= 12

  return (
    <div className="animate-stage-in rounded-lg border border-degraded/40 bg-degraded/8 p-5">
      <p className="font-display text-md font-medium text-ink-0">
        You have changed the order by hand
      </p>
      <p className="mt-1.5 max-w-[80ch] text-sm leading-relaxed text-ink-1">
        That is allowed and often correct — an operational dependency the tool cannot see is a
        perfectly good reason. Record what it was, so the departure is a decision on the record
        rather than something a reviewer has to reconstruct later.
      </p>

      {names.length > 0 ? (
        <p className="mt-3 text-sm text-lost">
          Under your order, {names.length}{' '}
          {names.length === 1 ? 'artifact does' : 'artifacts do'} not survive that would have
          under the recommendation: <span className="text-ink-1">{names.join(', ')}</span>.
        </p>
      ) : (
        <p className="mt-3 text-sm text-ink-2">
          Your order costs no additional evidence.
        </p>
      )}

      <div className="mt-4 max-w-[56rem]">
        <Field
          label="Reason for the override"
          hint="At least a sentence. This goes into the plan, the report and the JSON export."
        >
          {(id) => (
            <TextArea
              id={id}
              value={reason}
              onChange={(v) => {
                setReason(v)
                setTouched(true)
              }}
              rows={2}
              placeholder="Business-critical production restart cannot be delayed past the approved window."
              invalid={touched && !valid}
            />
          )}
        </Field>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          variant="primary"
          disabled={!valid}
          onClick={() =>
            onRecord({
              override_id: `OV-${String(result.plan.overrides.length + 1).padStart(4, '0')}`,
              recorded_at: result.analysed_at,
              reason: reason.trim(),
              recommended_order: recommended,
              chosen_order: result.plan.steps.map((s) => s.step_id),
              newly_lost_artifact_ids: newlyLost,
            })
          }
        >
          Record the override
        </Button>
        <Button variant="quiet" onClick={onAdopt}>
          Never mind — use the recommended order
        </Button>
        <Button variant="quiet" onClick={onDismiss}>
          Not now
        </Button>
      </div>
    </div>
  )
}

/** Exported for the catalogue view's plan editor. */
export { TextInput }
