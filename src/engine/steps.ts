/**
 * Turning the plan's step list into something the rest of the engine can walk.
 *
 * Two things happen here, and both are about refusing to lose information.
 *
 * A step naming an action the library has never heard of is not dropped. It
 * becomes a placeholder whose `default_effect` is `unknown`, so it still
 * occupies the timeline, still shows up as a step with an uncharacterised
 * blast radius, and still prevents every artifact behind it from being
 * reported as safe. Dropping it would have made the plan look cleaner and the
 * conclusions wrong — which is the specific failure this product exists to
 * catch, so it would be an embarrassing one to ship.
 *
 * A step's duration may be overridden per plan. The override wins, including
 * when it is `0`; only the *absence* of both an override and a library figure
 * yields `null`, and `null` propagates rather than being summed as zero.
 */

import type { PlannedStep, RemediationAction, RemediationPlan } from '../domain/types.ts'
import { ACTION_BY_ID } from '../data/actions.ts'

export interface MaterialisedStep {
  readonly step_id: string
  readonly index: number
  readonly action: RemediationAction
  readonly minutes: number | null
  readonly note: string | null
  /** True when the plan named an action the library does not have. */
  readonly synthetic: boolean
}

/**
 * A stand-in for an action id the library does not know.
 *
 * Every field is chosen so that nothing downstream can mistake it for a
 * characterised action: unknown impact on everything, unknown confidence, no
 * duration estimate, and `unknown_impact` set so it appears in the unknowns
 * list without any special-casing.
 */
export function unknownAction(action_id: string): RemediationAction {
  return {
    action_id,
    name: action_id,
    category: 'config',
    description:
      'This step names an action that is not in the library. Nothing is known about what it does.',
    estimated_minutes: null,
    destructive_level: 'unknown',
    reversible: 'unknown',
    applies_to: 'all',
    effects: [],
    default_effect: {
      impact: 'unknown',
      confidence: 'unknown',
      rationale:
        'The action is not in the library, so no claim can be made about what it does to any artifact. It is treated as an open question rather than as a no-op.',
    },
    captures: [],
    prerequisites: [],
    confidence: 'unknown',
    reference: null,
    unknown_impact: true,
    notes: null,
  }
}

function minutesFor(step: PlannedStep, action: RemediationAction): number | null {
  // `?? ` rather than `||`, so an operator who says a step takes zero minutes
  // is believed rather than silently overruled by the library's estimate.
  return step.override_minutes ?? action.estimated_minutes
}

export function materialise(
  plan: RemediationPlan,
  library: ReadonlyMap<string, RemediationAction> = ACTION_BY_ID,
): readonly MaterialisedStep[] {
  return plan.steps.map((step, index) => {
    const known = library.get(step.action_id)
    const action = known ?? unknownAction(step.action_id)
    return {
      step_id: step.step_id,
      index,
      action,
      minutes: minutesFor(step, action),
      note: step.note,
      synthetic: known === undefined,
    }
  })
}

/** A capture step is one that acquires something. Category alone is not enough. */
export function isCapture(step: MaterialisedStep): boolean {
  return step.action.category === 'capture' && step.action.captures.length > 0
}
