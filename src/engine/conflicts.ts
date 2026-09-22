/**
 * Where the plan cannot satisfy both obligations at once.
 *
 * Every conflict here carries `options` and none of them carries a choice.
 * That is the product's central manners rule: TOURNIQUET is allowed to say
 * "these two things do not both fit", and it is not allowed to decide which
 * one loses. Reducing collection scope, delaying remediation, and accepting
 * the loss of a named artifact are all legitimate answers, and which one is
 * right depends on things the tool cannot see — the business, the regulator,
 * the maintenance window, how badly somebody needs to know what happened.
 *
 * So each conflict states the incompatibility, names what it is about, lists
 * what a human could do, and stops.
 */

import type {
  ArtifactOutcome,
  Conflict,
  EvidenceArtifact,
  EvidenceSelection,
  Feasibility,
  UnknownImpact,
} from '../domain/types.ts'
import { formatDuration } from '../domain/time.ts'
import { resolveImpact } from './impact.ts'
import { listNames } from './outcomes.ts'
import { isCapture, type MaterialisedStep } from './steps.ts'

const SCOPE_OPTIONS: readonly string[] = [
  'Reduce the collection scope: drop optional artifacts and keep the required ones.',
  'Prioritise by volatility: keep the captures that cannot be repeated later and defer the ones that can.',
  'Delay remediation with an approved exception, so the window moves rather than the evidence.',
  'Change the collection method: a targeted process dump instead of a full memory image, a volume snapshot instead of a disk acquisition.',
  'Accept the loss of specific named artifacts and record who decided that.',
]

export function findConflicts(
  steps: readonly MaterialisedStep[],
  artifacts: readonly EvidenceArtifact[],
  selections: ReadonlyMap<string, EvidenceSelection>,
  planOutcomes: readonly ArtifactOutcome[],
  recommendedOutcomes: readonly ArtifactOutcome[],
  feasibility: Feasibility,
): readonly Conflict[] {
  const out: Conflict[] = []
  const included = (id: string): boolean => selections.get(id)?.included ?? true
  const byId = new Map(artifacts.map((a) => [a.artifact_id, a]))
  const recByArtifact = new Map(recommendedOutcomes.map((o) => [o.artifact_id, o]))

  /* ---- 1. the window has already closed -------------------------------- */

  if (feasibility.available_minutes <= 0) {
    out.push({
      conflict_id: 'deadline_expired',
      kind: 'expired_deadline',
      severity: 'critical',
      title: 'The remediation deadline has already passed',
      detail: `The window closed ${formatDuration(
        -feasibility.available_minutes,
      )} before this plan would start. The evidence consequences below are unchanged — a reboot destroys memory whether or not the clock has run out — but the deadline is no longer something the sequence can be made to fit.`,
      options: [
        'Confirm the tier and the due date against the source that issued them.',
        'Escalate the overrun before executing, so the preservation sequence is a recorded decision rather than an unremarked delay.',
        'Proceed on the evidence merits alone and treat the deadline as already breached.',
      ],
      subject_ids: [],
      resolved_by: null,
    })
  }

  /* ---- 2. the plan does not fit ---------------------------------------- */

  if (feasibility.status === 'conflict' && feasibility.available_minutes > 0) {
    out.push({
      conflict_id: 'deadline_overrun',
      kind: 'deadline',
      severity: 'critical',
      title: 'Preservation and the deadline are incompatible',
      detail: `${formatDuration(
        feasibility.total_minutes,
      )} of preservation, remediation, verification and buffer against a ${formatDuration(
        feasibility.available_minutes,
      )} window: an overrun of ${formatDuration(
        -feasibility.slack_minutes,
      )}. Preserving everything currently planned and meeting the stated deadline are not both possible.`,
      options: SCOPE_OPTIONS,
      subject_ids: [],
      resolved_by: null,
    })
  } else if (feasibility.status === 'unknown' && feasibility.unknown_duration_count > 0) {
    out.push({
      conflict_id: 'deadline_untimed',
      kind: 'deadline',
      severity: 'medium',
      title: 'The plan cannot be timed',
      detail: `${feasibility.unknown_duration_count} ${
        feasibility.unknown_duration_count === 1 ? 'step has' : 'steps have'
      } no duration estimate, so the total is a floor rather than a figure. ${formatDuration(
        feasibility.total_minutes,
      )} is what the timed steps account for; the rest is unbounded.`,
      options: [
        'Time the unestimated steps, even roughly. A bad estimate is comparable against a window; an absent one is not.',
        'Treat the plan as infeasible until it can be timed, and escalate on that basis.',
      ],
      subject_ids: [],
      resolved_by: null,
    })
  }

  /* ---- 3. evidence the order costs, rather than the remediation -------- */
  //
  // Grouped into one conflict rather than one per artifact. They share a
  // single remedy — adopt the recommended sequence — and a wall of twelve
  // identical findings buries the three that need a different answer.

  const mislaid = planOutcomes.filter((o) => {
    if (!included(o.artifact_id)) return false
    const rec = recByArtifact.get(o.artifact_id)
    return rec !== undefined && isWorse(o, rec)
  })
  if (mislaid.length > 0) {
    const worst = mislaid.filter((o) => o.priority === 'required')
    out.push({
      conflict_id: 'ordering_cost',
      kind: 'ordering',
      severity: worst.length > 0 ? 'high' : 'medium',
      title: `${mislaid.length} ${
        mislaid.length === 1 ? 'artifact fares' : 'artifacts fare'
      } worse than the remediation requires`,
      detail: `${listNames(
        mislaid.map((o) => o.name),
        4,
      )} ${mislaid.length === 1 ? 'ends' : 'end'} up worse under the plan as written than under the recommended sequence. The steps are the same and the remediation is unchanged; only the order differs. ${
        worst.length > 0
          ? `${worst.length} of ${mislaid.length} ${worst.length === 1 ? 'is' : 'are'} marked required.`
          : 'None of them is marked required.'
      }`,
      options: [
        'Adopt the recommended sequence. It contains the same steps and the same remediation.',
        'Move the affected captures ahead of the steps that reach their artifacts.',
        'Keep the current order and record each loss as a decision, with a reason.',
      ],
      subject_ids: mislaid.map((o) => o.artifact_id),
      resolved_by: null,
    })
  }

  /* ---- 4. required evidence with no capture step at all ---------------- */

  const uncaptured = planOutcomes.filter(
    (o) =>
      included(o.artifact_id) &&
      o.priority === 'required' &&
      o.captured_at_index === null &&
      (o.outcome === 'lost' || o.outcome === 'indeterminate' || o.outcome === 'accepted_loss'),
  )
  if (uncaptured.length > 0) {
    const questions = uncaptured
      .map((o) => byId.get(o.artifact_id))
      .filter((a): a is EvidenceArtifact => a !== undefined)
      .slice(0, 3)
      .map((a) => `${a.name} — ${a.answers}`)
    out.push({
      conflict_id: 'uncaptured_required',
      kind: 'uncaptured_required',
      severity: 'high',
      title: `${uncaptured.length} required ${
        uncaptured.length === 1 ? 'artifact has' : 'artifacts have'
      } no capture step in this plan`,
      detail: `${listNames(
        uncaptured.map((o) => o.name),
        4,
      )} ${uncaptured.length === 1 ? 'is' : 'are'} marked required, and the plan contains a step that reaches ${
        uncaptured.length === 1 ? 'it' : 'them'
      }. Nothing in the plan collects ${
        uncaptured.length === 1 ? 'it' : 'them'
      } first. What goes unanswered: ${questions.join(' ')}`,
      options: [
        'Add the corresponding capture steps before the steps that reach them.',
        'Downgrade any artifact the investigation does not in fact need, so the plan stops claiming to require it.',
        'Record each loss as a decision, with a named owner and the residual risk.',
      ],
      subject_ids: uncaptured.map((o) => o.artifact_id),
      resolved_by: uncaptured.every((o) => o.accepted_loss_id !== null)
        ? (uncaptured[0]?.accepted_loss_id ?? null)
        : null,
    })
  }

  /* ---- 5. evidence that will be lost with nobody signing for it -------- */

  const undocumented = planOutcomes.filter(
    (o) =>
      included(o.artifact_id) &&
      (o.outcome === 'lost' || o.outcome === 'indeterminate') &&
      o.accepted_loss_id === null,
  )
  if (undocumented.length > 0) {
    const gone = undocumented.filter((o) => o.outcome === 'lost')
    const unclear = undocumented.filter((o) => o.outcome === 'indeterminate')
    const them = undocumented.length === 1 ? 'it' : 'them'

    // The title has to distinguish the two. Calling an indeterminate outcome
    // "will not survive" asserts exactly the thing the tool has just refused
    // to assert, which would undo the point of having the state at all.
    const title =
      gone.length === 0
        ? `${unclear.length} ${
            unclear.length === 1 ? 'artifact has' : 'artifacts have'
          } an undetermined outcome, and nobody has signed for ${them}`
        : unclear.length === 0
          ? `${gone.length} ${
              gone.length === 1 ? 'artifact' : 'artifacts'
            } will not survive this plan, and nobody has signed for ${them}`
          : `${gone.length} ${gone.length === 1 ? 'artifact' : 'artifacts'} will not survive this plan and ${unclear.length} may not, and nobody has signed for any of them`

    out.push({
      conflict_id: 'loss_undocumented',
      kind: 'undocumented_loss',
      severity: undocumented.some((o) => o.priority === 'required') ? 'high' : 'medium',
      title,
      detail: `${listNames(
        undocumented.map((o) => o.name),
        4,
      )}. ${
        gone.length > 0
          ? 'Losing evidence during remediation is frequently the right call. Losing it without a record of who decided and why is the part that becomes a problem six months later, when somebody asks what was known at the time.'
          : 'Proceeding into uncertainty is frequently the right call. Doing it without a record of who accepted the uncertainty is the part that becomes a problem six months later, when somebody asks what was known at the time.'
      }`,
      options: [
        'Record an accepted loss for each artifact, naming the decision owner and the residual risk.',
        'Reorder so the captures precede the destructive steps.',
        'Reduce the remediation to steps that do not destroy this evidence, if an equivalent mitigation exists.',
      ],
      subject_ids: undocumented.map((o) => o.artifact_id),
      resolved_by: null,
    })
  }

  /* ---- 6. a capture scheduled where it can no longer work -------------- */

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]
    if (!step || !isCapture(step)) continue
    const targets = step.action.captures
      .map((id) => byId.get(id))
      .filter((a): a is EvidenceArtifact => a !== undefined && included(a.artifact_id))
    if (targets.length === 0) continue

    const goneBefore = targets.filter((a) =>
      steps.slice(0, i).some((prior) => resolveImpact(prior.action, a).impact === 'destroys'),
    )
    if (goneBefore.length < targets.length) continue

    out.push({
      conflict_id: `unusable_${step.step_id}`,
      kind: 'unusable_capture',
      severity: 'high',
      title: `"${step.action.name}" cannot collect anything at that point`,
      detail: `Every artifact this step acquires — ${listNames(
        targets.map((a) => a.name),
      )} — has already been destroyed by an earlier step. The capture still takes ${formatDuration(
        step.minutes,
      )} off the clock and yields nothing.`,
      options: [
        'Move the capture before the step that destroys its artifacts.',
        'Remove the step, and record the loss instead.',
      ],
      subject_ids: targets.map((a) => a.artifact_id),
      resolved_by: null,
    })
  }

  /* ---- 7. steps whose blast radius is not characterised ---------------- */

  for (const u of findUnknowns(steps, artifacts, selections)) {
    const required = u.artifact_ids.filter(
      (id) => (selections.get(id)?.priority ?? byId.get(id)?.default_priority) === 'required',
    )
    out.push({
      conflict_id: `unknown_${u.step_id}`,
      kind: 'unknown_impact',
      severity: required.length > 0 ? 'high' : 'medium',
      title: `"${u.action_name}" has an uncharacterised effect on ${u.artifact_ids.length} ${
        u.artifact_ids.length === 1 ? 'artifact' : 'artifacts'
      }`,
      detail: `${u.reason} ${u.recommendation}`,
      options: [
        'Ask the vendor or platform owner what the procedure touches, and record the answer in the action library.',
        'Treat the affected artifacts as at risk and capture them beforehand — the conservative reading, at the cost of the capture time.',
        'Accept the uncertainty explicitly, so that "we did not know" is on the record rather than implied.',
      ],
      subject_ids: u.artifact_ids,
      resolved_by: null,
    })
  }

  // Stable, most-severe-first. The secondary key is the id rather than the
  // discovery order, so two runs of the same plan produce the same report.
  const rank = { critical: 0, high: 1, medium: 2, informational: 3 } as const
  return out.sort(
    (a, b) => rank[a.severity] - rank[b.severity] || a.conflict_id.localeCompare(b.conflict_id),
  )

  function isWorse(plan_: ArtifactOutcome, rec: ArtifactOutcome): boolean {
    const badness = {
      preserved: 0,
      retained: 1,
      degraded: 2,
      indeterminate: 3,
      accepted_loss: 4,
      lost: 5,
    } as const
    return badness[plan_.outcome] > badness[rec.outcome]
  }
}

/** Every step that reaches an in-scope artifact without characterising what it does. */
export function findUnknowns(
  steps: readonly MaterialisedStep[],
  artifacts: readonly EvidenceArtifact[],
  selections: ReadonlyMap<string, EvidenceSelection>,
): readonly UnknownImpact[] {
  const included = (id: string): boolean => selections.get(id)?.included ?? true
  const out: UnknownImpact[] = []

  for (const step of steps) {
    const affected = artifacts
      .filter((a) => included(a.artifact_id))
      .filter((a) => resolveImpact(step.action, a).impact === 'unknown')
    if (affected.length === 0) continue

    const wholesale = step.action.default_effect.impact === 'unknown'
    out.push({
      action_id: step.action.action_id,
      action_name: step.action.name,
      step_id: step.step_id,
      artifact_ids: affected.map((a) => a.artifact_id),
      reason: wholesale
        ? `${step.action.default_effect.rationale} That leaves ${listNames(
            affected.map((a) => a.name),
            4,
          )} with no stated relationship to this step.`
        : `The library characterises most of what this step does, but not its effect on ${listNames(
            affected.map((a) => a.name),
            4,
          )}.`,
      recommendation:
        'Unknown is not safe and it is not destroyed. Nothing downstream will report these artifacts as preserved or as lost, and the decision about how to treat them belongs to a human who can find out.',
    })
  }
  return out
}
