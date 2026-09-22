/**
 * What every state in the vocabulary means, in words.
 *
 * Centralised because the same state has to read identically in a badge, a
 * table cell, a drawer, the command palette, the CLI and the report. Three
 * strings per state:
 *
 *   LABEL  the word on screen
 *   SHORT  the compact form for a badge or a dense column
 *   TEXT   the sentence a reader gets from a tooltip, an aria-label or the
 *          report — written so it stands alone with no surrounding UI
 *
 * The sentences are the product. A tool whose whole purpose is to stop people
 * confusing "destroyed" with "unverifiable" cannot afford to render either one
 * as a coloured dot.
 */

import type {
  ActionCategory,
  AssetType,
  Confidence,
  ConflictKind,
  CollectionPriority,
  DestructiveLevel,
  FeasibilityStatus,
  ImpactKind,
  PreservationOutcome,
  Severity,
} from './types.ts'

/* -------------------------------------------------------------------------- */
/* Impact                                                                     */
/* -------------------------------------------------------------------------- */

export const IMPACT_LABEL: Readonly<Record<ImpactKind, string>> = {
  destroys: 'Destroys',
  modifies: 'Modifies',
  may_invalidate: 'May invalidate',
  preserves: 'Preserves',
  unknown: 'Unknown',
}

export const IMPACT_SHORT: Readonly<Record<ImpactKind, string>> = {
  destroys: 'DEST',
  modifies: 'MOD',
  may_invalidate: 'RISK',
  preserves: 'KEEP',
  unknown: 'UNKN',
}

export const IMPACT_TEXT: Readonly<Record<ImpactKind, string>> = {
  destroys: 'The artifact ceases to exist. Nothing can recover it after this step.',
  modifies:
    'The artifact still exists, but this step changes it. What is collected afterwards is the post-action state, not the state at the time of the incident.',
  may_invalidate:
    'The artifact is not changed, but this step may undermine what can be concluded from it — a broken chain of custody, a timestamp that can no longer be trusted, a record whose context has gone.',
  preserves:
    'This step does not touch the artifact. Whatever state it was in before the step, it is in afterwards.',
  unknown:
    'Nothing in the action library says what this step does to the artifact. That is an open question, not a clean bill of health.',
}

/**
 * Whether an impact must be captured before, in one word.
 *
 * `may_invalidate` counts. An artifact whose evidentiary value is in doubt
 * afterwards is one that should have been collected beforehand.
 */
export const IMPACT_IS_HARMFUL: Readonly<Record<ImpactKind, boolean>> = {
  destroys: true,
  modifies: true,
  may_invalidate: true,
  preserves: false,
  unknown: true,
}

/* -------------------------------------------------------------------------- */
/* Outcome                                                                    */
/* -------------------------------------------------------------------------- */

export const OUTCOME_LABEL: Readonly<Record<PreservationOutcome, string>> = {
  preserved: 'Preserved',
  degraded: 'Degraded',
  lost: 'Lost',
  retained: 'Retained',
  indeterminate: 'Indeterminate',
  accepted_loss: 'Accepted loss',
}

export const OUTCOME_SHORT: Readonly<Record<PreservationOutcome, string>> = {
  preserved: 'KEPT',
  degraded: 'DEGR',
  lost: 'LOST',
  retained: 'ON HOST',
  indeterminate: 'UNKN',
  accepted_loss: 'SIGNED',
}

export const OUTCOME_TEXT: Readonly<Record<PreservationOutcome, string>> = {
  preserved: 'Captured, and nothing in the plan had touched it beforehand.',
  degraded:
    'A step in the plan alters it without destroying it. What can be collected is the altered state — usable, but no longer evidence of the moment you wanted.',
  lost: 'A step destroys it and nothing captures it first. After that step it does not exist.',
  retained:
    'Not captured, and nothing in this plan touches it. It is still on the system and can be collected after remediation.',
  indeterminate:
    'A step with unknown impact reaches it before anything captures it. Whether it survives cannot be stated from the plan as written.',
  accepted_loss:
    'Will not survive this plan, and a named person has recorded the decision to proceed anyway.',
}

/** The question each outcome leaves the reader with. Used in drawers. */
export const OUTCOME_FOLLOWUP: Readonly<Record<PreservationOutcome, string>> = {
  preserved: 'Nothing further is required for this artifact.',
  degraded: 'Decide whether the altered state answers the question you had.',
  lost: 'Either move a capture earlier, or record this as an accepted loss.',
  retained: 'Collect it after remediation if the investigation needs it.',
  indeterminate:
    'Characterise the unknown step, or treat the artifact as at risk and capture it first.',
  accepted_loss: 'Nothing further. The decision is on the record.',
}

/* -------------------------------------------------------------------------- */
/* Confidence                                                                 */
/* -------------------------------------------------------------------------- */

export const CONFIDENCE_LABEL: Readonly<Record<Confidence, string>> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  unknown: 'Unknown',
}

export const CONFIDENCE_TEXT: Readonly<Record<Confidence, string>> = {
  high: 'The relationship follows directly from how the platform works and is not in serious dispute.',
  medium:
    'The relationship holds in the common case. Configuration or platform differences could change it.',
  low: 'The relationship is plausible but thinly supported. Treat it as a prompt to check, not a finding.',
  unknown: 'No claim is made. This is not the same as low confidence in a claim that was made.',
}

/** Ordered weakest-first, so the engine can take the floor of a set. */
export const CONFIDENCE_RANK: Readonly<Record<Confidence, number>> = {
  unknown: 0,
  low: 1,
  medium: 2,
  high: 3,
}

/* -------------------------------------------------------------------------- */
/* Destructive level                                                          */
/* -------------------------------------------------------------------------- */

export const DESTRUCTIVE_LABEL: Readonly<Record<DestructiveLevel, string>> = {
  none: 'Non-destructive',
  low: 'Low',
  moderate: 'Moderate',
  high: 'High',
  unknown: 'Unknown',
}

export const DESTRUCTIVE_TEXT: Readonly<Record<DestructiveLevel, string>> = {
  none: 'Collects or verifies. Destroys nothing in the evidence catalogue.',
  low: 'Alters a small, bounded part of the system state.',
  moderate: 'Destroys or alters a meaningful amount of volatile state.',
  high: 'Destroys volatile state wholesale. Assume anything not already captured is gone.',
  unknown: 'The blast radius of this action is not characterised.',
}

/* -------------------------------------------------------------------------- */
/* Feasibility                                                                */
/* -------------------------------------------------------------------------- */

export const FEASIBILITY_LABEL: Readonly<Record<FeasibilityStatus, string>> = {
  feasible: 'Feasible',
  tight: 'Tight',
  conflict: 'Conflict',
  unknown: 'Unknown',
}

export const FEASIBILITY_TEXT: Readonly<Record<FeasibilityStatus, string>> = {
  feasible:
    'Preservation, remediation, verification and the contingency buffer all fit inside the window with room left.',
  tight:
    'The plan fits, but the margin is small enough that one slow capture or one failed restart puts the deadline at risk.',
  conflict:
    'The plan as written does not fit the window. Preserving everything planned and meeting the stated deadline are not both possible.',
  unknown:
    'At least one step in the plan has no duration estimate, so the total cannot be compared against the window.',
}

/* -------------------------------------------------------------------------- */
/* Conflicts                                                                  */
/* -------------------------------------------------------------------------- */

export const CONFLICT_LABEL: Readonly<Record<ConflictKind, string>> = {
  deadline: 'Deadline conflict',
  expired_deadline: 'Deadline already passed',
  ordering: 'Capture ordered too late',
  unknown_impact: 'Unknown blast radius',
  uncaptured_required: 'Required evidence not captured',
  undocumented_loss: 'Undocumented evidence loss',
  unusable_capture: 'Capture cannot run at that point',
}

export const SEVERITY_LABEL: Readonly<Record<Severity, string>> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  informational: 'Informational',
}

/* -------------------------------------------------------------------------- */
/* Priority                                                                   */
/* -------------------------------------------------------------------------- */

export const PRIORITY_LABEL: Readonly<Record<CollectionPriority, string>> = {
  required: 'Required',
  recommended: 'Recommended',
  optional: 'Optional',
}

export const PRIORITY_TEXT: Readonly<Record<CollectionPriority, string>> = {
  required:
    'Losing this would leave a question the investigation has to answer without an answer.',
  recommended: 'Losing this would narrow the investigation but not close it.',
  optional: 'Collect if the clock allows. Its loss is not expected to change a conclusion.',
}

/** Ordered most-important-first, for sorting within a preservation gate. */
export const PRIORITY_RANK: Readonly<Record<CollectionPriority, number>> = {
  required: 0,
  recommended: 1,
  optional: 2,
}

/* -------------------------------------------------------------------------- */
/* Actions and assets                                                         */
/* -------------------------------------------------------------------------- */

export const ACTION_CATEGORY_LABEL: Readonly<Record<ActionCategory, string>> = {
  capture: 'Capture',
  containment: 'Containment',
  service: 'Service',
  process: 'Process',
  reboot: 'Reboot',
  replace: 'Replace',
  patch: 'Patch',
  credential: 'Credential',
  session: 'Session',
  rebuild: 'Rebuild',
  redeploy: 'Redeploy',
  terminate: 'Terminate',
  firmware: 'Firmware',
  config: 'Configuration',
  verify: 'Verification',
}

export const ASSET_TYPE_LABEL: Readonly<Record<AssetType, string>> = {
  windows_workstation: 'Windows workstation',
  windows_server: 'Windows server',
  linux_server: 'Linux server',
  cloud_vm: 'Cloud VM',
  container: 'Container',
  kubernetes_workload: 'Kubernetes workload',
  database_server: 'Database server',
  application_server: 'Application server',
  network_appliance: 'Network appliance',
  saas_identity: 'SaaS identity system',
}

/* -------------------------------------------------------------------------- */
/* The product's own boundary, stated in one place                            */
/* -------------------------------------------------------------------------- */

/**
 * Rendered in the interface, in the CLI banner and in every report.
 *
 * It is here rather than typed into three components because the distinction
 * between prioritisation, acquisition and sequencing is the thing most likely
 * to be misread, and a version of it that drifts between surfaces is worse
 * than none.
 */
export const SCOPE_STATEMENT = {
  prioritisation: {
    question: 'How urgently must this be fixed?',
    answer: 'Answered elsewhere. TOURNIQUET consumes the tier; it does not compute one.',
  },
  forensics: {
    question: 'What evidence could actually be collected?',
    answer: 'Answered by your acquisition tooling and your team. TOURNIQUET collects nothing.',
  },
  tourniquet: {
    question: 'In what order must those two obligations be met?',
    answer: 'This is the only question TOURNIQUET answers.',
  },
} as const
