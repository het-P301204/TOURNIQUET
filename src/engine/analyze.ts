/**
 * The orchestrator.
 *
 * One entry point, one pass, no hidden state. It takes a plan and an instant
 * and returns everything every screen and the CLI need. There is no
 * incremental recomputation and no caching inside the engine: the whole
 * analysis of a realistic plan is a few thousand map lookups, and a cache
 * would buy microseconds in exchange for a class of bug where the interface
 * shows one thing and the report says another.
 *
 * The one structural decision worth naming: the engine simulates the plan
 * *twice*. Once in the order the operator wrote, and once in the order it
 * recommends. Everything the product says about the cost of a manual override
 * — and the whole "ordering" class of conflict — comes from comparing those
 * two results, not from a heuristic about whether an order looks wrong.
 */

import type {
  AnalysisResult,
  AnalysisSummary,
  ArtifactOutcome,
  EvidenceSelection,
  OutcomeCounts,
  RemediationPlan,
} from '../domain/types.ts'
import { ASSET_TYPE_LABEL } from '../domain/semantics.ts'
import { EVIDENCE_BY_ID } from '../data/evidence.ts'
import { ACTION_BY_ID } from '../data/actions.ts'
import { actionsFor, artifactsFor } from './scope.ts'
import { materialise, isCapture, type MaterialisedStep } from './steps.ts'
import { footprintsFor } from './footprint.ts'
import { simulate } from './outcomes.ts'
import { buildSequence } from './sequence.ts'
import { assessDeadline } from './deadline.ts'
import { findConflicts, findUnknowns } from './conflicts.ts'

/**
 * Bumped when the meaning of a field changes, not when a rule is added.
 *
 * A saved plan and a report carry it so that a reader who finds a report in a
 * ticket six months later can tell whether the words in it still mean what
 * they meant when it was written.
 */
export const ANALYSIS_VERSION = 'tourniquet/1'

export function analyse(plan: RemediationPlan, now: string): AnalysisResult {
  const type = plan.asset.type
  const artifacts = artifactsFor(type)
  const actions = actionsFor(type)

  const selections: ReadonlyMap<string, EvidenceSelection> = new Map(
    plan.evidence.map((e) => [e.artifact_id, e]),
  )

  const steps = materialise(plan, ACTION_BY_ID)
  const footprints = footprintsFor(steps, artifacts, EVIDENCE_BY_ID)

  // Simulation one: the order the operator wrote down.
  const outcomes = simulate(steps, artifacts, selections, plan.accepted_losses)

  // The recommended order, then simulation two against it.
  const sequence = buildSequence(steps, artifacts, selections)
  const byStepId = new Map(steps.map((s) => [s.step_id, s]))
  const recommendedSteps = sequence.order
    .map((id) => byStepId.get(id))
    .filter((s): s is MaterialisedStep => s !== undefined)
  const recommended = simulate(recommendedSteps, artifacts, selections, plan.accepted_losses)

  const feasibility = assessDeadline(plan, steps)
  const conflicts = findConflicts(
    steps,
    artifacts,
    selections,
    outcomes,
    recommended,
    feasibility,
  )
  const unknowns = findUnknowns(steps, artifacts, selections)

  const impacts = footprints.flatMap((f) => [
    ...f.destroys,
    ...f.modifies,
    ...f.may_invalidate,
    ...f.unknown,
    ...f.preserves,
  ])

  const summary: AnalysisSummary = {
    asset_name: plan.asset.name,
    asset_type: type,
    tier_label: plan.tier.label,
    deadline_label: plan.deadline.label,
    step_count: steps.length,
    capture_step_count: steps.filter(isCapture).length,
    harmful_step_count: footprints.filter((f) => f.harmful).length,
    artifact_count: artifacts.length,
    outcomes: count(outcomes),
    conflict_count: conflicts.length,
    unknown_impact_count: unknowns.length,
    accepted_loss_count: plan.accepted_losses.length,
    override_count: plan.overrides.length,
    feasibility: feasibility.status,
  }

  return {
    analysis_version: ANALYSIS_VERSION,
    analysed_at: now,
    plan,
    artifacts,
    actions,
    impacts,
    footprints,
    outcomes,
    recommended_outcomes: recommended,
    sequence,
    feasibility,
    conflicts,
    unknowns,
    summary,
    assumptions: assumptionsFor(plan, steps),
    limitations: LIMITATIONS,
  }
}

function count(outcomes: readonly ArtifactOutcome[]): OutcomeCounts {
  const c = {
    preserved: 0,
    degraded: 0,
    lost: 0,
    retained: 0,
    indeterminate: 0,
    accepted_loss: 0,
  }
  for (const o of outcomes) c[o.outcome] += 1
  return c
}

function assumptionsFor(
  plan: RemediationPlan,
  steps: readonly MaterialisedStep[],
): readonly string[] {
  const out: string[] = [
    'Steps run one after another on a single worker. Two captures that could genuinely run in parallel are counted twice against the clock, so the total is conservative.',
    `The evidence catalogue is scoped to ${ASSET_TYPE_LABEL[plan.asset.type].toLowerCase()}. Artifacts that do not apply to this asset type are not offered and are not counted as lost.`,
    'Durations are order-of-magnitude figures from the catalogue, adjusted by any per-step override in this plan. They are not measurements of your environment.',
    `Verification (${plan.verification_minutes} min) and contingency buffer (${plan.contingency_buffer_minutes} min) are counted against the window as stated in the plan.`,
    'The remediation tier and the deadline are inputs. TOURNIQUET does not assess how urgent this vulnerability is and cannot tell you whether the tier is right.',
  ]

  const synthetic = steps.filter((s) => s.synthetic)
  if (synthetic.length > 0) {
    out.push(
      `${synthetic.length} ${synthetic.length === 1 ? 'step names an action' : 'steps name actions'} that the library does not contain (${synthetic
        .map((s) => s.action.action_id)
        .join(', ')}). They are kept in the plan with unknown impact rather than dropped.`,
    )
  }

  const untimed = steps.filter((s) => s.minutes === null)
  if (untimed.length > 0) {
    out.push(
      `${untimed.length} ${untimed.length === 1 ? 'step has' : 'steps have'} no duration estimate. They are excluded from the total rather than counted as zero, so the total is a floor.`,
    )
  }

  return out
}

/**
 * What the tool does not do.
 *
 * Fixed text, carried into every report, because the honest limits of a
 * planning tool do not vary with the plan and a reader who only ever sees one
 * report should still see them.
 */
const LIMITATIONS: readonly string[] = [
  'TOURNIQUET plans an order. It does not acquire evidence, does not execute remediation, and has no connection to any system.',
  'The action-to-evidence mappings are a synthetic library written for this tool. They describe how these platforms generally behave; they are not vendor statements and they are not tested against your build.',
  'Confidence is declared per mapping and propagated. It is not derived from any corpus, and "high" means "follows from how the platform works", not "measured".',
  'An artifact reported as retained is retained under the plan as analysed. Anything not in the plan — a colleague restarting the service, an autoscaler replacing the node — is outside what this can see.',
  'Timestamps, package state and local logs are attacker-modifiable. Preserving them preserves what is there, which is not the same as preserving the truth.',
  'The tool cannot tell you whether an investigation is warranted. It tells you what a given remediation would cost you if one turned out to be.',
]
