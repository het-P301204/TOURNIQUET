/**
 * The two detail drawers.
 *
 * `ArtifactDrawer` answers "what is this artifact, what would losing it cost
 * me, and what happens to it under this plan". `StepDrawer` answers "what
 * disappears if I do this" — the question a reader asks by pointing at a
 * button, which is the question the whole product exists for.
 *
 * Both are built from the analysis rather than from the catalogue alone, so
 * everything in them is about *this* plan: the same artifact reads differently
 * depending on what else is in the sequence, and a drawer that showed only
 * catalogue text would be a glossary rather than an answer.
 */

import type { AnalysisResult, ArtifactOutcome, ResolvedImpact } from '../domain/types.ts'
import {
  CONFIDENCE_TEXT,
  DESTRUCTIVE_LABEL,
  DESTRUCTIVE_TEXT,
  IMPACT_LABEL,
  OUTCOME_FOLLOWUP,
  OUTCOME_LABEL,
  PRIORITY_TEXT,
} from '../domain/semantics.ts'
import { TIER_DECAY, TIER_LABEL, VOLATILITY_RANK } from '../domain/volatility.ts'
import { formatDuration } from '../domain/time.ts'
import { FOCUS, IMPACT_STYLE, LABEL, PANEL_INSET } from './tokens.ts'
import {
  Callout,
  ConfidenceMeter,
  Drawer,
  ImpactBadge,
  Mono,
  OutcomeBadge,
  PriorityBadge,
  Row,
  DestructiveBadge,
  TierTag,
  cx,
} from './primitives.tsx'

/* ========================================================================== */
/* Artifact                                                                   */
/* ========================================================================== */

export function ArtifactDrawer({
  result,
  artifactId,
  onClose,
  onSelectStep,
}: {
  result: AnalysisResult
  artifactId: string | null
  onClose: () => void
  onSelectStep: (id: string) => void
}) {
  const artifact = result.artifacts.find((a) => a.artifact_id === artifactId)
  const outcome = result.outcomes.find((o) => o.artifact_id === artifactId)
  const recommended = result.recommended_outcomes.find((o) => o.artifact_id === artifactId)
  if (!artifact || !outcome) return <Drawer open={false} onClose={onClose} title=""><span /></Drawer>

  // Every step that reaches this artifact, in plan order, with what it does.
  const touching = result.footprints
    .map((f) => {
      const impact = [...f.destroys, ...f.modifies, ...f.may_invalidate, ...f.unknown].find(
        (i) => i.artifact_id === artifact.artifact_id,
      )
      return impact ? { f, impact } : null
    })
    .filter((x): x is { f: (typeof result.footprints)[number]; impact: ResolvedImpact } => x !== null)

  const collectors = result.actions.filter((a) => a.captures.includes(artifact.artifact_id))
  const loss = result.plan.accepted_losses.find((l) => l.loss_id === outcome.accepted_loss_id)

  return (
    <Drawer
      open
      onClose={onClose}
      eyebrow={
        <div className="flex flex-wrap items-center gap-2">
          <OutcomeBadge outcome={outcome.outcome} />
          <TierTag tier={artifact.tier} />
        </div>
      }
      title={artifact.name}
    >
      <div className="space-y-5">
        <p className="text-sm leading-relaxed text-ink-1">{artifact.description}</p>

        <Callout tone={toneFor(outcome)} title={`${OUTCOME_LABEL[outcome.outcome]} under this plan`}>
          <p>{outcome.explanation}</p>
          <p className="mt-2 text-ink-2">{OUTCOME_FOLLOWUP[outcome.outcome]}</p>
          {recommended && recommended.outcome !== outcome.outcome ? (
            <p className="mt-2 text-ink-2">
              Under the recommended sequence it would be{' '}
              <span className="font-medium text-ink-0">
                {OUTCOME_LABEL[recommended.outcome].toLowerCase()}
              </span>
              .
            </p>
          ) : null}
        </Callout>

        <section>
          <p className={cx(LABEL, 'mb-2')}>What it answers</p>
          <p className="text-sm leading-relaxed text-ink-1">{artifact.answers}</p>
        </section>

        <dl>
          <Row label="Volatility">
            Tier {VOLATILITY_RANK[artifact.tier]} of 8 — {TIER_LABEL[artifact.tier]}.{' '}
            <span className="text-ink-2">{TIER_DECAY[artifact.tier]}</span>
          </Row>
          <Row label="Priority">
            <div className="flex flex-wrap items-center gap-2">
              <PriorityBadge priority={outcome.priority} />
              <span className="text-xs text-ink-2">{PRIORITY_TEXT[outcome.priority]}</span>
            </div>
          </Row>
          <Row label="Collection">
            {artifact.collection.label}
            <span className="ml-1.5 text-ink-3">
              ({formatDuration(artifact.collection.estimated_minutes)})
            </span>
            {artifact.collection.requires_live_host ? (
              <span className="mt-1 block text-xs text-degraded">
                Requires a live host. Anything that powers the system off ends the opportunity.
              </span>
            ) : null}
            {artifact.collection.note ? (
              <span className="mt-1 block text-xs text-ink-3">{artifact.collection.note}</span>
            ) : null}
          </Row>
          {artifact.collection.observer_effect ? (
            <Row label="Cost of collecting">
              <span className="text-ink-2">{artifact.collection.observer_effect}</span>
            </Row>
          ) : null}
          <Row label="Catalogue confidence">
            <div className="flex flex-wrap items-center gap-2">
              <ConfidenceMeter confidence={artifact.confidence} />
              <span className="text-xs text-ink-2">{CONFIDENCE_TEXT[artifact.confidence]}</span>
            </div>
          </Row>
          {artifact.notes ? (
            <Row label="Notes">
              <span className="text-ink-2">{artifact.notes}</span>
            </Row>
          ) : null}
          <Row label="Identifier">
            <Mono>{artifact.artifact_id}</Mono>
          </Row>
        </dl>

        <section>
          <p className={cx(LABEL, 'mb-2')}>
            Steps in this plan that reach it ({touching.length})
          </p>
          {touching.length === 0 ? (
            <p className="text-sm text-ink-3">
              None. No step in this plan destroys, alters or may invalidate it.
            </p>
          ) : (
            <ul className="space-y-2">
              {touching.map(({ f, impact }) => (
                <li key={f.step_id}>
                  <button
                    type="button"
                    onClick={() => onSelectStep(f.step_id)}
                    className={cx(
                      PANEL_INSET,
                      'w-full px-3 py-2.5 text-left transition-colors duration-140 hover:bg-surface-2',
                      FOCUS,
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="tnum font-mono text-2xs text-ink-3">
                        Step {f.index + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm text-ink-0">{f.name}</span>
                      <ImpactBadge impact={impact.impact} />
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-ink-2">{impact.rationale}</p>
                    <p className="mt-1.5 text-2xs text-ink-3">
                      Matched by {matchWords(impact)} · confidence{' '}
                      {impact.confidence}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <p className={cx(LABEL, 'mb-2')}>How it is collected</p>
          {collectors.length === 0 ? (
            <p className="text-sm text-ink-3">
              No action in the library collects this artifact for this asset type.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {collectors.map((c) => {
                const inPlan = result.plan.steps.some((s) => s.action_id === c.action_id)
                return (
                  <li key={c.action_id} className="flex items-baseline gap-2 text-sm">
                    <span aria-hidden="true" className={inPlan ? 'text-preserved' : 'text-ink-3'}>
                      {inPlan ? '●' : '○'}
                    </span>
                    <span className="min-w-0 flex-1 text-ink-1">{c.name}</span>
                    <span className="tnum shrink-0 font-mono text-2xs text-ink-3">
                      {formatDuration(c.estimated_minutes)}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
          <p className="mt-2 text-2xs leading-relaxed text-ink-3">
            A filled marker means the step is in this plan. TOURNIQUET does not perform any of
            these; it decides where they go.
          </p>
        </section>

        {loss ? (
          <Callout tone="bad" title={`Accepted loss ${loss.loss_id}`}>
            <p>{loss.what_is_lost}</p>
            <p className="mt-2 text-ink-2">
              Accepted by {loss.accepted_by} ({loss.role}). {loss.why_necessary}
            </p>
            <p className="mt-2 text-ink-2">
              <span className="font-medium text-ink-1">Residual risk: </span>
              {loss.residual_risk}
            </p>
          </Callout>
        ) : null}
      </div>
    </Drawer>
  )
}

function toneFor(o: ArtifactOutcome): 'good' | 'warn' | 'bad' | 'unknown' | 'neutral' {
  switch (o.outcome) {
    case 'preserved':
      return 'good'
    case 'degraded':
      return 'warn'
    case 'lost':
    case 'accepted_loss':
      return 'bad'
    case 'indeterminate':
      return 'unknown'
    case 'retained':
      return 'neutral'
  }
}

function matchWords(i: ResolvedImpact): string {
  switch (i.matched_by) {
    case 'artifact':
      return 'a rule written for this artifact'
    case 'tag':
      return `a rule for everything tagged "${i.matched_on ?? ''}"`
    case 'tier':
      return `a rule for the whole "${i.matched_on ?? ''}" tier`
    case 'action_default':
      return "the action's default effect"
  }
}

/* ========================================================================== */
/* Step                                                                       */
/* ========================================================================== */

export function StepDrawer({
  result,
  stepId,
  onClose,
  onSelectArtifact,
}: {
  result: AnalysisResult
  stepId: string | null
  onClose: () => void
  onSelectArtifact: (id: string) => void
}) {
  const footprint = result.footprints.find((f) => f.step_id === stepId)
  const planStep = result.plan.steps.find((s) => s.step_id === stepId)
  const action = result.actions.find((a) => a.action_id === footprint?.action_id)
  if (!footprint) return <Drawer open={false} onClose={onClose} title=""><span /></Drawer>

  const byId = new Map(result.artifacts.map((a) => [a.artifact_id, a]))
  const seqStep = result.sequence.steps.find((s) => s.step_id === stepId)

  // Which artifacts this step destroys that nothing has captured yet, in the
  // plan as written. This is the list a reader needs before pressing go.
  const mustCapture = footprint.destroys
    .map((d) => result.outcomes.find((o) => o.artifact_id === d.artifact_id))
    .filter(
      (o): o is ArtifactOutcome =>
        o !== undefined &&
        (o.outcome === 'lost' || o.outcome === 'accepted_loss') &&
        o.first_harm?.step_id === footprint.step_id,
    )

  return (
    <Drawer
      open
      onClose={onClose}
      eyebrow={
        <div className="flex flex-wrap items-center gap-2">
          <span className="tnum font-mono text-2xs text-ink-3">Step {footprint.index + 1}</span>
          <DestructiveBadge level={footprint.destructive_level} />
          {footprint.category === 'capture' ? (
            <span className="rounded border border-preserved/35 bg-preserved/10 px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-[0.08em] text-preserved">
              Capture
            </span>
          ) : null}
        </div>
      }
      title={footprint.name}
    >
      <div className="space-y-5">
        {action ? <p className="text-sm leading-relaxed text-ink-1">{action.description}</p> : null}

        {mustCapture.length > 0 ? (
          <Callout tone="bad" title="Capture before this step, or lose it">
            <ul className="mt-1 space-y-1">
              {mustCapture.map((o) => (
                <li key={o.artifact_id} className="flex items-baseline gap-2">
                  <span aria-hidden="true" className="text-lost">
                    ✕
                  </span>
                  <span>
                    {o.name}
                    <span className="text-ink-2">
                      {' '}
                      — {byId.get(o.artifact_id)?.answers ?? ''}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </Callout>
        ) : footprint.harmful ? null : (
          <Callout tone="good" title="Nothing is lost at this step">
            It destroys, alters and invalidates nothing in the evidence catalogue for this asset.
          </Callout>
        )}

        <dl>
          <Row label="Destructive level">
            {DESTRUCTIVE_LABEL[footprint.destructive_level]} —{' '}
            <span className="text-ink-2">{DESTRUCTIVE_TEXT[footprint.destructive_level]}</span>
          </Row>
          <Row label="Reversible">
            {footprint.reversible === 'unknown'
              ? 'Unknown'
              : footprint.reversible
                ? 'Yes'
                : 'No — once this runs it cannot be undone'}
          </Row>
          <Row label="Estimated time">
            {formatDuration(footprint.estimated_minutes)}
            {planStep?.override_minutes !== null && planStep?.override_minutes !== undefined ? (
              <span className="ml-1.5 text-ink-3">(set for this plan)</span>
            ) : action?.estimated_minutes === null ? (
              <span className="ml-1.5 text-degraded">
                (no library estimate; excluded from the total rather than counted as zero)
              </span>
            ) : null}
          </Row>
          <Row label="Confidence">
            <ConfidenceMeter confidence={footprint.confidence} />
          </Row>
          {seqStep ? (
            <Row label="Why it sits there">
              <span className="text-ink-2">{seqStep.why_now}</span>
            </Row>
          ) : null}
          {action?.reference ? (
            <Row label="Source">
              <span className="text-ink-2">{action.reference}</span>
            </Row>
          ) : null}
          {action?.notes ? (
            <Row label="Notes">
              <span className="text-ink-2">{action.notes}</span>
            </Row>
          ) : null}
          {planStep?.note ? (
            <Row label="Plan note">
              <span className="text-ink-2">{planStep.note}</span>
            </Row>
          ) : null}
          <Row label="Identifier">
            <Mono>{footprint.action_id}</Mono>
          </Row>
        </dl>

        {(
          [
            ['destroys', footprint.destroys],
            ['modifies', footprint.modifies],
            ['may_invalidate', footprint.may_invalidate],
            ['unknown', footprint.unknown],
            ['preserves', footprint.preserves],
          ] as const
        ).map(([kind, list]) =>
          list.length === 0 ? null : (
            <section key={kind}>
              <div className="mb-2 flex items-center gap-2">
                <ImpactBadge impact={kind} />
                <span className={LABEL}>
                  {list.length} {list.length === 1 ? 'artifact' : 'artifacts'}
                </span>
              </div>
              {kind === 'preserves' ? (
                <p className="text-xs leading-relaxed text-ink-3">
                  {list
                    .map((i) => byId.get(i.artifact_id)?.name ?? i.artifact_id)
                    .join(', ')}
                  .
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {list.map((i) => (
                    <li key={i.artifact_id}>
                      <button
                        type="button"
                        onClick={() => onSelectArtifact(i.artifact_id)}
                        className={cx(
                          'w-full rounded px-2 py-1.5 text-left transition-colors duration-140 hover:bg-surface-2',
                          FOCUS,
                        )}
                      >
                        <div className="flex items-baseline gap-2">
                          <span
                            aria-hidden="true"
                            className={cx('shrink-0 text-2xs', IMPACT_STYLE[kind].text)}
                          >
                            {IMPACT_STYLE[kind].glyph}
                          </span>
                          <span className="min-w-0 flex-1 text-sm text-ink-0">
                            {byId.get(i.artifact_id)?.name ?? i.artifact_id}
                          </span>
                          <span className="shrink-0 text-2xs uppercase tracking-[0.08em] text-ink-3">
                            {i.confidence}
                          </span>
                        </div>
                        <p className="mt-1 pl-5 text-xs leading-relaxed text-ink-2">
                          {i.rationale}
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ),
        )}

        {action && action.captures.length > 0 ? (
          <section>
            <p className={cx(LABEL, 'mb-2')}>What this step acquires</p>
            <ul className="space-y-1">
              {action.captures.map((id) => {
                const a = byId.get(id)
                return (
                  <li key={id} className="flex items-baseline gap-2 text-sm">
                    <span aria-hidden="true" className={a ? 'text-preserved' : 'text-ink-3'}>
                      {a ? '●' : '○'}
                    </span>
                    <span className={a ? 'text-ink-1' : 'text-ink-3'}>
                      {a?.name ?? id}
                      {a ? null : ' — out of scope for this asset type'}
                    </span>
                  </li>
                )
              })}
            </ul>
          </section>
        ) : null}

        <p className="border-t border-line-1 pt-4 text-2xs leading-relaxed text-ink-3">
          {IMPACT_LABEL.unknown} does not mean safe and does not mean destroyed. TOURNIQUET plans
          the order of these steps; it does not execute any of them.
        </p>
      </div>
    </Drawer>
  )
}
