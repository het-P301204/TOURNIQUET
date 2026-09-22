/**
 * The TOURNIQUET domain model.
 *
 * One chain runs through the whole product, and the types follow it exactly:
 *
 *   RemediationPlan
 *     -> PlannedStep[]            what the operator intends to do, in order
 *     -> ResolvedImpact[]         what each of those steps does to evidence
 *     -> ArtifactOutcome[]        what survives that, artifact by artifact
 *     -> SequenceStep[]           the order that would survive the most
 *     -> Feasibility              whether that order fits the deadline
 *     -> Conflict[]               where it does not, stated rather than solved
 *     -> AcceptedLoss[]           what a named human chose to give up
 *
 * Three rules are enforced by the shapes here rather than by convention.
 *
 * A duration is `number | null`, never `0`, when it is not known. Zero is a
 * claim that something is instantaneous; null is the absence of a claim, and
 * the two must not be summed as if they were the same.
 *
 * `unknown` is a member of every vocabulary that has one, and it is never the
 * fallback for "we did not write a rule". An action says what it does to
 * everything it was not asked about, in `default_effect`, and a well-understood
 * action and a vendor black box therefore produce different answers for the
 * same unlisted artifact.
 *
 * Nothing in here reads a clock. Every instant is an ISO 8601 string carried in
 * from the caller, so a plan analysed twice reads the same both times.
 */

/* ========================================================================== */
/* Vocabularies                                                               */
/* ========================================================================== */

/**
 * Asset types the evidence catalogue is scoped by.
 *
 * This list is not a claim to model every platform faithfully. It is a scoping
 * mechanism: it decides which artifacts are offered and which actions are
 * applicable, and each catalogue entry carries its own confidence.
 */
export type AssetType =
  | 'windows_workstation'
  | 'windows_server'
  | 'linux_server'
  | 'cloud_vm'
  | 'container'
  | 'kubernetes_workload'
  | 'database_server'
  | 'application_server'
  | 'network_appliance'
  | 'saas_identity'

/**
 * The order of volatility, as an explicit ladder rather than an implicit sort.
 *
 * The rank is what the sequencer uses; the names are what the reader sees. The
 * ladder is the product's one piece of received doctrine — evidence that
 * decays fastest is collected first — and it is represented as data so a team
 * with a different house order can change it in one place. See
 * `VOLATILITY_RANK` in `./volatility.ts`.
 */
export type VolatilityTier =
  | 'volatile_memory'
  | 'process_state'
  | 'network_state'
  | 'session_state'
  | 'runtime_artifact'
  | 'temporary_state'
  | 'disk_artifact'
  | 'long_term_record'

/** The three coarse bands the tiers group into, for headings and filters. */
export type VolatilityClass = 'volatile' | 'semi_volatile' | 'persistent'

/**
 * How much weight a mapping carries.
 *
 * `unknown` is not "low". Low confidence means a claim was made and is weakly
 * supported; unknown means no claim was made at all, and the two must produce
 * different outcomes downstream.
 */
export type Confidence = 'high' | 'medium' | 'low' | 'unknown'

/**
 * What an action does to one artifact.
 *
 * Deliberately five values rather than a boolean. The difference between
 * "this is gone" and "this is still there but I can no longer vouch for it"
 * is most of the professional judgement in a remediation, and collapsing it
 * to yes/no is what makes a tool like this useless.
 *
 *   destroys        the artifact ceases to exist
 *   modifies        it still exists, but the action changed it
 *   may_invalidate  it is unchanged, but its evidentiary value may not survive
 *   preserves       the action does not touch it
 *   unknown         nothing here supports any of the above
 */
export type ImpactKind = 'destroys' | 'modifies' | 'may_invalidate' | 'preserves' | 'unknown'

/** A summary of an action's overall footprint, for sorting and for badges. */
export type DestructiveLevel = 'none' | 'low' | 'moderate' | 'high' | 'unknown'

export type ActionCategory =
  | 'capture'
  | 'containment'
  | 'service'
  | 'process'
  | 'reboot'
  | 'replace'
  | 'patch'
  | 'credential'
  | 'session'
  | 'rebuild'
  | 'redeploy'
  | 'terminate'
  | 'firmware'
  | 'config'
  | 'verify'

/**
 * What happened to one artifact once the whole plan has run.
 *
 *   preserved       captured, and nothing had touched it beforehand
 *   degraded        captured, but something altered it first
 *   lost            destroyed before anything captured it
 *   retained        never captured, and nothing in the plan touches it: it is
 *                   still on the system and still collectable afterwards
 *   indeterminate   the only thing that reached it first had unknown impact
 *   accepted_loss   lost or indeterminate, and a named human signed for it
 *
 * `indeterminate` exists so that `unknown` never silently becomes `retained`.
 * An artifact nobody can vouch for is not an artifact that is fine.
 */
export type PreservationOutcome =
  | 'preserved'
  | 'degraded'
  | 'lost'
  | 'retained'
  | 'indeterminate'
  | 'accepted_loss'

export type FeasibilityStatus = 'feasible' | 'tight' | 'conflict' | 'unknown'

export type CollectionPriority = 'required' | 'recommended' | 'optional'

export type ConflictKind =
  | 'deadline'
  | 'expired_deadline'
  | 'ordering'
  | 'unknown_impact'
  | 'uncaptured_required'
  | 'undocumented_loss'
  | 'unusable_capture'

export type Severity = 'critical' | 'high' | 'medium' | 'informational'

/* ========================================================================== */
/* Catalogue: evidence                                                        */
/* ========================================================================== */

export interface CollectionMethod {
  /** How it is acquired, in the operator's words. Not a tool recommendation. */
  readonly label: string
  /** `null` when the catalogue does not estimate it. Never `0` to mean that. */
  readonly estimated_minutes: number | null
  /** If true, the host must still be running: a reboot ends the opportunity. */
  readonly requires_live_host: boolean
  /**
   * What the act of collecting costs.
   *
   * Live memory acquisition writes to the memory it is acquiring; a disk image
   * of a running system is inconsistent. Recording it here keeps the tool from
   * implying that capture is free.
   */
  readonly observer_effect: string | null
  readonly note: string | null
}

export interface EvidenceArtifact {
  readonly artifact_id: string
  readonly name: string
  readonly tier: VolatilityTier
  readonly description: string
  /** `'all'` rather than an exhaustive list, where the artifact is universal. */
  readonly applies_to: readonly AssetType[] | 'all'
  readonly collection: CollectionMethod
  readonly default_priority: CollectionPriority
  /** The investigative question this artifact is the answer to. */
  readonly answers: string
  /** Coarse labels an action can target without naming every artifact. */
  readonly tags: readonly string[]
  /** How well understood this catalogue entry itself is. */
  readonly confidence: Confidence
  readonly notes: string | null
}

/* ========================================================================== */
/* Catalogue: actions                                                         */
/* ========================================================================== */

/**
 * What an effect is written against.
 *
 * Three levels of specificity, resolved most-specific-first, so an action can
 * say "everything in volatile memory is gone" once and then carve out the one
 * artifact that is the exception.
 */
export type EffectTarget =
  | { readonly kind: 'artifact'; readonly artifact_id: string }
  | { readonly kind: 'tag'; readonly tag: string }
  | { readonly kind: 'tier'; readonly tier: VolatilityTier }

export interface ActionEffect {
  readonly target: EffectTarget
  readonly impact: ImpactKind
  readonly confidence: Confidence
  /** Why. Rendered verbatim in the explanation, so it is written for a reader. */
  readonly rationale: string
}

/**
 * The effect that applies to every artifact the action did not mention.
 *
 * Mandatory, and that is the point. A documented action states that it leaves
 * the rest alone; an undocumented vendor procedure states that it does not
 * know. Without this field the two would be indistinguishable, and the second
 * would quietly be treated as the first.
 */
export interface DefaultEffect {
  readonly impact: ImpactKind
  readonly confidence: Confidence
  readonly rationale: string
}

export interface RemediationAction {
  readonly action_id: string
  readonly name: string
  readonly category: ActionCategory
  readonly description: string
  readonly estimated_minutes: number | null
  readonly destructive_level: DestructiveLevel
  readonly reversible: boolean | 'unknown'
  readonly applies_to: readonly AssetType[] | 'all'
  readonly effects: readonly ActionEffect[]
  readonly default_effect: DefaultEffect
  /** Artifacts this action acquires. Non-empty only for `category: 'capture'`. */
  readonly captures: readonly string[]
  /** Action ids that must have run first for this one to make sense. */
  readonly prerequisites: readonly string[]
  readonly confidence: Confidence
  /** Where the mapping came from. Synthetic entries say so. */
  readonly reference: string | null
  /** Set when the action's blast radius is genuinely not characterised. */
  readonly unknown_impact: boolean
  readonly notes: string | null
}

/* ========================================================================== */
/* The plan                                                                   */
/* ========================================================================== */

export interface Asset {
  readonly asset_id: string
  readonly name: string
  readonly type: AssetType
  readonly environment: string
  readonly owner: string
  readonly description: string
  readonly notes: string | null
}

export interface VulnerabilityRef {
  readonly reference: string
  readonly title: string
  readonly summary: string
  /**
   * Whether an investigation is actually in progress.
   *
   * It changes what the tool says rather than what it computes: preserving
   * volatile evidence on a host nobody suspects is a different conversation
   * from preserving it on one that is probably compromised.
   */
  readonly suspected_compromise: boolean
  readonly notes: string | null
}

/**
 * The remediation deadline, as an input.
 *
 * `external: true` is not decoration. TOURNIQUET does not prioritise
 * vulnerabilities and must not look as though it does; the tier arrives from
 * somewhere else and the type refuses to represent one that did not.
 */
export interface PriorityTier {
  readonly label: string
  /** Who set it: a directive, an SSVC decision, an internal standard. */
  readonly source: string
  readonly window_hours: number | null
  readonly external: true
  readonly notes: string | null
}

export interface DeadlineInput {
  /** When the clock started. ISO 8601. */
  readonly issued_at: string
  /** When remediation must be complete. ISO 8601. */
  readonly due_at: string
  /** When this plan would begin executing. ISO 8601. */
  readonly plan_start: string
  readonly label: string
}

export interface PlannedStep {
  readonly step_id: string
  readonly action_id: string
  /** Operator estimate for this plan only; overrides the library's. */
  readonly override_minutes: number | null
  readonly note: string | null
}

export interface EvidenceSelection {
  readonly artifact_id: string
  readonly priority: CollectionPriority
  readonly included: boolean
  readonly override_minutes: number | null
}

/**
 * A decision record for evidence the team chose not to keep.
 *
 * Every field is something a reviewer six months later will ask for. None of
 * it is legal or compliance language, because the tool has no standing to
 * generate any: it records what a named person decided and why.
 */
export interface AcceptedLoss {
  readonly loss_id: string
  readonly artifact_ids: readonly string[]
  readonly what_is_lost: string
  readonly reason_category: 'operational' | 'technical' | 'deadline' | 'scope' | 'other'
  readonly why_necessary: string
  readonly alternative_considered: string
  readonly residual_risk: string
  readonly accepted_by: string
  readonly role: string
  readonly decided_at: string
  readonly tier_label: string
}

/**
 * A manual reordering, kept alongside what the engine had recommended.
 *
 * The tool plans; it does not decide. But an order that departs from the
 * recommendation should depart on the record, with a reason, and with the
 * evidence that the departure costs spelled out.
 */
export interface OverrideRecord {
  readonly override_id: string
  readonly recorded_at: string
  readonly reason: string
  readonly recommended_order: readonly string[]
  readonly chosen_order: readonly string[]
  readonly newly_lost_artifact_ids: readonly string[]
}

export interface RemediationPlan {
  readonly plan_id: string
  readonly name: string
  readonly asset: Asset
  readonly vulnerability: VulnerabilityRef
  readonly tier: PriorityTier
  readonly deadline: DeadlineInput
  readonly steps: readonly PlannedStep[]
  readonly evidence: readonly EvidenceSelection[]
  readonly accepted_losses: readonly AcceptedLoss[]
  readonly overrides: readonly OverrideRecord[]
  /** Slack the team holds back for the unexpected. Counted against the clock. */
  readonly contingency_buffer_minutes: number
  /** Post-remediation validation. Counted against the clock. */
  readonly verification_minutes: number
  readonly notes: string | null
}

/* ========================================================================== */
/* Analysis output                                                            */
/* ========================================================================== */

/** How an effect was matched, so the explanation can name its own rule. */
export type MatchBasis = 'artifact' | 'tag' | 'tier' | 'action_default'

export interface ResolvedImpact {
  readonly action_id: string
  readonly artifact_id: string
  readonly impact: ImpactKind
  readonly confidence: Confidence
  readonly rationale: string
  readonly matched_by: MatchBasis
  /** The tag or tier the rule was written against, when it was not the id. */
  readonly matched_on: string | null
}

/** Everything one step in the plan does, grouped by what it does. */
export interface ActionFootprint {
  readonly step_id: string
  readonly action_id: string
  readonly index: number
  readonly name: string
  readonly category: ActionCategory
  readonly destroys: readonly ResolvedImpact[]
  readonly modifies: readonly ResolvedImpact[]
  readonly may_invalidate: readonly ResolvedImpact[]
  readonly preserves: readonly ResolvedImpact[]
  readonly unknown: readonly ResolvedImpact[]
  /** True when the step does anything other than preserve. */
  readonly harmful: boolean
  readonly destructive_level: DestructiveLevel
  readonly estimated_minutes: number | null
  readonly reversible: boolean | 'unknown'
  readonly confidence: Confidence
}

/** The point in the plan after which a given artifact no longer exists. */
export interface HarmPoint {
  readonly step_id: string
  readonly action_id: string
  readonly action_name: string
  readonly index: number
  readonly impact: ImpactKind
  readonly confidence: Confidence
  readonly rationale: string
}

export interface ArtifactOutcome {
  readonly artifact_id: string
  readonly name: string
  readonly tier: VolatilityTier
  readonly priority: CollectionPriority
  readonly outcome: PreservationOutcome
  /** Index in the executed order of the step that captured it, if any. */
  readonly captured_at_index: number | null
  /** The first step that destroys, modifies or may invalidate it. */
  readonly first_harm: HarmPoint | null
  /** Written for a reader, naming the action and the artifact. */
  readonly explanation: string
  readonly confidence: Confidence
  readonly accepted_loss_id: string | null
}

/**
 * A preservation gate: the captures that must happen before one harmful step.
 *
 * Gates are why the recommended sequence is not simply "capture everything,
 * then remediate". A disk-log capture does not need to precede a service
 * restart that cannot touch disk logs, and on a tight clock that distinction
 * is the difference between a plan that fits and one that does not.
 */
export interface PreservationGate {
  readonly gate: number
  readonly before_step_id: string
  readonly before_action_id: string
  readonly before_action_name: string
  readonly artifact_ids: readonly string[]
  readonly reason: string
}

export interface SequenceStep {
  readonly order: number
  readonly kind: 'capture' | 'remediation'
  readonly step_id: string
  readonly action_id: string
  readonly name: string
  /** Artifacts acquired by this step. Empty for remediation steps. */
  readonly artifact_ids: readonly string[]
  readonly estimated_minutes: number | null
  /** Minutes from plan start. Steps with unknown duration stop the clock. */
  readonly offset_minutes: number | null
  readonly why_now: string
  readonly at_risk: readonly string[]
  /** The harmful step this capture exists to precede. */
  readonly enables: string | null
  readonly lost_after: readonly string[]
  readonly confidence: Confidence
  readonly gate: number | null
}

export interface PreservationSequence {
  readonly steps: readonly SequenceStep[]
  readonly gates: readonly PreservationGate[]
  /** Step ids in recommended order, for comparing against the operator's. */
  readonly order: readonly string[]
  readonly matches_plan_order: boolean
}

export interface Feasibility {
  readonly status: FeasibilityStatus
  readonly preservation_minutes: number
  readonly remediation_minutes: number
  readonly verification_minutes: number
  readonly buffer_minutes: number
  readonly total_minutes: number
  /** Plan start to deadline. Negative when the deadline has already passed. */
  readonly available_minutes: number
  readonly slack_minutes: number
  /** `null` when a duration in the plan is unknown, so the ratio is not real. */
  readonly utilisation: number | null
  readonly unknown_duration_count: number
  readonly explanation: string
}

export interface Conflict {
  readonly conflict_id: string
  readonly kind: ConflictKind
  readonly severity: Severity
  readonly title: string
  readonly detail: string
  /**
   * What a human could do about it. Presented, never chosen: picking one of
   * these is the decision the tool exists to hand over rather than take.
   */
  readonly options: readonly string[]
  readonly subject_ids: readonly string[]
  readonly resolved_by: string | null
}

export interface UnknownImpact {
  readonly action_id: string
  readonly action_name: string
  readonly step_id: string
  readonly artifact_ids: readonly string[]
  readonly reason: string
  readonly recommendation: string
}

export interface OutcomeCounts {
  readonly preserved: number
  readonly degraded: number
  readonly lost: number
  readonly retained: number
  readonly indeterminate: number
  readonly accepted_loss: number
}

export interface AnalysisSummary {
  readonly asset_name: string
  readonly asset_type: AssetType
  readonly tier_label: string
  readonly deadline_label: string
  readonly step_count: number
  readonly capture_step_count: number
  readonly harmful_step_count: number
  readonly artifact_count: number
  readonly outcomes: OutcomeCounts
  readonly conflict_count: number
  readonly unknown_impact_count: number
  readonly accepted_loss_count: number
  readonly override_count: number
  readonly feasibility: FeasibilityStatus
}

export interface AnalysisResult {
  /** Bumped when the meaning of a field changes, so a saved plan is readable. */
  readonly analysis_version: string
  /** The instant the caller supplied. The engine never reads a clock itself. */
  readonly analysed_at: string
  readonly plan: RemediationPlan
  /** The catalogue entries actually in scope for this asset type. */
  readonly artifacts: readonly EvidenceArtifact[]
  readonly actions: readonly RemediationAction[]
  readonly impacts: readonly ResolvedImpact[]
  readonly footprints: readonly ActionFootprint[]
  /** Outcomes under the order the operator actually wrote down. */
  readonly outcomes: readonly ArtifactOutcome[]
  /** Outcomes under the order the engine recommends, for comparison. */
  readonly recommended_outcomes: readonly ArtifactOutcome[]
  readonly sequence: PreservationSequence
  readonly feasibility: Feasibility
  readonly conflicts: readonly Conflict[]
  readonly unknowns: readonly UnknownImpact[]
  readonly summary: AnalysisSummary
  readonly assumptions: readonly string[]
  readonly limitations: readonly string[]
}
