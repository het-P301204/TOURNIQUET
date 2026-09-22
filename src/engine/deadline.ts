/**
 * Does the plan fit the window?
 *
 * The arithmetic is trivial. What matters is the handling of the two cases
 * where it would be easy to produce a confident wrong answer.
 *
 * **An unknown duration is not zero.** If any step in the plan has no
 * estimate, the total is not comparable against the window and the status is
 * `unknown` — not `feasible` with a slightly low total. A tool that quietly
 * treats "nobody has timed this" as "this is instant" tells a team the plan
 * fits, and the place they find out otherwise is halfway through a capture
 * they now have to abandon.
 *
 * **Zero slack is not comfort.** `total === available` means the plan fits
 * with nothing to spare, and that is `tight`, not `feasible`. Only `total >
 * available` is a conflict, because at that point the two obligations are
 * arithmetically incompatible and somebody has to choose.
 *
 * The one judgement call is `TIGHT_THRESHOLD`. At 75% of the window
 * consumed, a single slow capture or one failed restart puts the deadline at
 * risk, so the status changes even though the plan still fits. The number is
 * a convention, it is stated in the interface wherever the status appears,
 * and `deadline.test.ts` pins it.
 */

import type { Feasibility, FeasibilityStatus, RemediationPlan } from '../domain/types.ts'
import { formatDuration, minutesBetween, sumMinutes } from '../domain/time.ts'
import { isCapture, type MaterialisedStep } from './steps.ts'

/** Fraction of the window above which a plan is reported as tight. */
export const TIGHT_THRESHOLD = 0.75

export function assessDeadline(
  plan: RemediationPlan,
  steps: readonly MaterialisedStep[],
): Feasibility {
  const captureLegs = steps.filter(isCapture).map((s) => s.minutes)
  const remediationLegs = steps.filter((s) => !isCapture(s)).map((s) => s.minutes)

  const capture = sumMinutes(captureLegs)
  const remediate = sumMinutes(remediationLegs)
  const verification = plan.verification_minutes
  const buffer = plan.contingency_buffer_minutes

  const total = capture.known + remediate.known + verification + buffer
  const unknownCount = capture.unknown + remediate.unknown

  const available = minutesBetween(plan.deadline.plan_start, plan.deadline.due_at)
  const slack = available === null ? 0 : available - total
  const utilisation = available === null || available <= 0 || unknownCount > 0 ? null : total / available

  const status = classify(available, total, unknownCount)

  return {
    status,
    preservation_minutes: capture.known,
    remediation_minutes: remediate.known,
    verification_minutes: verification,
    buffer_minutes: buffer,
    total_minutes: total,
    available_minutes: available ?? 0,
    slack_minutes: slack,
    utilisation,
    unknown_duration_count: unknownCount,
    explanation: explain(status, available, total, slack, unknownCount, utilisation),
  }
}

function classify(
  available: number | null,
  total: number,
  unknownCount: number,
): FeasibilityStatus {
  if (available === null) return 'unknown'
  // Checked before the unknown-duration case: a window that has already closed
  // is a conflict whether or not the steps inside it have been timed.
  if (available <= 0) return 'conflict'
  if (unknownCount > 0) return 'unknown'
  if (total > available) return 'conflict'
  if (total / available >= TIGHT_THRESHOLD) return 'tight'
  return 'feasible'
}

function explain(
  status: FeasibilityStatus,
  available: number | null,
  total: number,
  slack: number,
  unknownCount: number,
  utilisation: number | null,
): string {
  if (available === null) {
    return 'The plan start or the deadline could not be read as a date, so no comparison is possible.'
  }
  if (available <= 0) {
    return `The deadline passed ${formatDuration(-available)} before this plan would start. Everything below is still worth reading — the evidence consequences do not change — but the window is not a constraint that can be met, it is one that has already been missed.`
  }

  const legs = `${formatDuration(total)} of work against a ${formatDuration(available)} window`
  const plus =
    unknownCount > 0
      ? ` — plus ${unknownCount} ${unknownCount === 1 ? 'step' : 'steps'} with no duration estimate, which is why no percentage is shown`
      : ''

  switch (status) {
    case 'unknown':
      return `At least ${legs}${plus}. The total is a floor, not an estimate: the untimed steps could be minutes or hours, and until somebody times them the plan cannot be called feasible.`
    case 'conflict':
      return `${legs}, which overruns by ${formatDuration(-slack)}. Preserving everything currently planned and meeting the stated deadline are not both possible. Something has to give, and choosing what is not a decision this tool makes.`
    case 'tight':
      return `${legs}${
        utilisation === null ? '' : `, using ${Math.round(utilisation * 100)}% of it`
      }. It fits, with ${formatDuration(slack)} to spare. One slow capture or one failed restart absorbs that margin.`
    case 'feasible':
      return `${legs}${
        utilisation === null ? '' : `, using ${Math.round(utilisation * 100)}% of it`
      }, leaving ${formatDuration(slack)}. Preservation and remediation both fit with room.`
  }
}
