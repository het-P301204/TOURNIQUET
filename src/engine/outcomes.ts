/**
 * Walking an order and recording what survives it.
 *
 * This is the simulation the whole interface is a view of. Given a list of
 * steps in a specific order, it answers — for every artifact in scope — the
 * question the product is named after: after this, what can no longer be
 * known?
 *
 * The walk is a single pass per artifact. For each one it finds the first step
 * that captures it and the first step that harms it, and the relationship
 * between those two indices decides the outcome. Everything else is about
 * saying so in a sentence a reader can act on.
 *
 * Two rules are worth stating plainly because they are where a naive
 * implementation goes wrong.
 *
 * **A capture that runs after the destruction captures nothing.** The step is
 * still in the plan, it still consumes the clock, and the artifact is still
 * lost. An implementation that treats "there is a capture step" as "the
 * artifact is preserved" produces a plan that looks complete and is not — and
 * that is precisely the sequencing error the tool exists to find.
 *
 * **Unknown never resolves to safe.** If the first thing to reach an artifact
 * has uncharacterised impact, the outcome is `indeterminate`. Not `retained`,
 * which would assert it is fine; not `lost`, which would assert it is gone.
 * The plan does not support either claim, so neither is made.
 */

import type {
  AcceptedLoss,
  ArtifactOutcome,
  Confidence,
  EvidenceArtifact,
  EvidenceSelection,
  HarmPoint,
  ImpactKind,
  PreservationOutcome,
  ResolvedImpact,
} from '../domain/types.ts'
import { CONFIDENCE_RANK, IMPACT_IS_HARMFUL } from '../domain/semantics.ts'
import { resolveImpact } from './impact.ts'
import type { MaterialisedStep } from './steps.ts'

/** A harm event located in a specific order. */
interface Harm extends HarmPoint {
  readonly order: number
}

function listNames(names: readonly string[], limit = 3): string {
  if (names.length === 0) return 'nothing'
  if (names.length <= limit) {
    if (names.length === 1) return names[0] ?? ''
    return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
  }
  const rest = names.length - limit
  return `${names.slice(0, limit).join(', ')} and ${rest} ${rest === 1 ? 'other' : 'others'}`
}

/**
 * Outcomes for one ordering of one plan.
 *
 * `order` is the executed order — the steps as they will actually run, which
 * is either what the operator wrote or what the sequencer recommends. Calling
 * it twice with the two orders and comparing the results is how the tool
 * shows what a manual override costs.
 */
export function simulate(
  order: readonly MaterialisedStep[],
  artifacts: readonly EvidenceArtifact[],
  selections: ReadonlyMap<string, EvidenceSelection>,
  accepted: readonly AcceptedLoss[],
): readonly ArtifactOutcome[] {
  const acceptedFor = new Map<string, string>()
  for (const loss of accepted) {
    for (const id of loss.artifact_ids) {
      if (!acceptedFor.has(id)) acceptedFor.set(id, loss.loss_id)
    }
  }

  return artifacts.map((artifact) => {
    const selection = selections.get(artifact.artifact_id)
    const priority = selection?.priority ?? artifact.default_priority

    let capturedAt: number | null = null
    const harms: Harm[] = []
    const all: ResolvedImpact[] = []

    for (let i = 0; i < order.length; i++) {
      const step = order[i]
      if (!step) continue

      if (capturedAt === null && step.action.captures.includes(artifact.artifact_id)) {
        capturedAt = i
      }

      const impact = resolveImpact(step.action, artifact)
      all.push(impact)
      if (IMPACT_IS_HARMFUL[impact.impact]) {
        harms.push({
          order: i,
          step_id: step.step_id,
          action_id: step.action.action_id,
          action_name: step.action.name,
          index: step.index,
          impact: impact.impact,
          confidence: impact.confidence,
          rationale: impact.rationale,
        })
      }
    }

    const firstHarm = harms[0] ?? null
    const before = capturedAt === null ? harms : harms.filter((h) => h.order < capturedAt)
    const outcome = classify(capturedAt, before, harms)
    const deciding = decidingHarm(outcome, before, harms)

    const lossId = acceptedFor.get(artifact.artifact_id) ?? null
    // The decision record applies to evidence that will not survive. Recording
    // an accepted loss against something the plan actually preserves is stale
    // paperwork rather than a decision, so the id is kept (the report shows
    // the record) but the outcome is not rewritten to match it.
    const final: PreservationOutcome =
      lossId !== null && (outcome === 'lost' || outcome === 'indeterminate')
        ? 'accepted_loss'
        : outcome

    return {
      artifact_id: artifact.artifact_id,
      name: artifact.name,
      tier: artifact.tier,
      priority,
      outcome: final,
      captured_at_index: capturedAt,
      first_harm: firstHarm === null ? null : stripOrder(firstHarm),
      explanation: explain(artifact, outcome, final, capturedAt, deciding, order, lossId),
      confidence: confidenceFor(outcome, deciding, all),
      accepted_loss_id: lossId,
    }
  })
}

function stripOrder(h: Harm): HarmPoint {
  return {
    step_id: h.step_id,
    action_id: h.action_id,
    action_name: h.action_name,
    index: h.index,
    impact: h.impact,
    confidence: h.confidence,
    rationale: h.rationale,
  }
}

/** The single harm that determined the outcome, for the explanation. */
function decidingHarm(
  outcome: PreservationOutcome,
  before: readonly Harm[],
  all: readonly Harm[],
): Harm | null {
  const pool = outcome === 'preserved' ? [] : before.length > 0 ? before : all
  const rank: Readonly<Record<ImpactKind, number>> = {
    destroys: 4,
    unknown: 3,
    modifies: 2,
    may_invalidate: 1,
    preserves: 0,
  }
  let best: Harm | null = null
  for (const h of pool) {
    if (best === null || rank[h.impact] > rank[best.impact]) best = h
  }
  return best
}

function classify(
  capturedAt: number | null,
  before: readonly Harm[],
  all: readonly Harm[],
): PreservationOutcome {
  if (capturedAt !== null && before.length === 0) return 'preserved'

  const pool = capturedAt !== null ? before : all
  if (pool.length === 0) return 'retained'

  if (pool.some((h) => h.impact === 'destroys')) return 'lost'
  // Checked before the alteration cases: if something uncharacterised reached
  // the artifact first, no statement about degradation is supportable either.
  if (pool.some((h) => h.impact === 'unknown')) return 'indeterminate'
  return 'degraded'
}

function confidenceFor(
  outcome: PreservationOutcome,
  deciding: Harm | null,
  all: readonly ResolvedImpact[],
): Confidence {
  switch (outcome) {
    case 'preserved':
      // Structural rather than a claim about impact: the capture ran before
      // anything harmful under every reading of the rules.
      return 'high'
    case 'indeterminate':
      return 'unknown'
    case 'retained': {
      // The floor of every claim that this artifact is untouched. If the only
      // thing saying so is a medium-confidence rule, "retained" is medium.
      let worst: Confidence = 'high'
      for (const i of all) {
        if (CONFIDENCE_RANK[i.confidence] < CONFIDENCE_RANK[worst]) worst = i.confidence
      }
      return worst
    }
    default:
      return deciding?.confidence ?? 'unknown'
  }
}

function explain(
  artifact: EvidenceArtifact,
  outcome: PreservationOutcome,
  final: PreservationOutcome,
  capturedAt: number | null,
  deciding: Harm | null,
  order: readonly MaterialisedStep[],
  lossId: string | null,
): string {
  const capturedBy = capturedAt === null ? null : order[capturedAt]
  const pos = (i: number): string => `step ${i + 1}`

  const core = ((): string => {
    switch (outcome) {
      case 'preserved':
        return capturedBy
          ? `Captured at ${pos(capturedAt ?? 0)} by "${capturedBy.action.name}", before anything in this plan touches it.`
          : 'Captured before anything in this plan touches it.'

      case 'retained':
        return `No step in this plan captures it, and no step touches it. It stays on the system and can be collected after remediation.`

      case 'lost': {
        if (!deciding) return 'Destroyed by a step in this plan before anything captured it.'
        const late =
          capturedAt !== null
            ? ` The capture at ${pos(capturedAt)} runs after that point, so it collects nothing — the step still costs time on the clock and still yields no evidence.`
            : ' No step captures it first.'
        return `${pos(deciding.order)}, "${deciding.action_name}", destroys it.${late} ${deciding.rationale}`
      }

      case 'indeterminate': {
        if (!deciding) return 'Reached by a step whose impact is not characterised.'
        return `${pos(deciding.order)}, "${deciding.action_name}", reaches it with uncharacterised impact${
          capturedAt !== null ? `, before the capture at ${pos(capturedAt)}` : ' and nothing captures it first'
        }. Whether it survives cannot be stated from this plan. ${deciding.rationale}`
      }

      case 'degraded': {
        if (!deciding) return 'Altered by a step in this plan.'
        const where =
          capturedAt !== null
            ? `The capture at ${pos(capturedAt)} therefore collects the altered state rather than the state at the time of the incident.`
            : 'Nothing captures it, so what remains collectable is the altered state.'
        return `${pos(deciding.order)}, "${deciding.action_name}", alters it. ${where} ${deciding.rationale}`
      }

      case 'accepted_loss':
        return 'Recorded as an accepted loss.'
    }
  })()

  if (final === 'accepted_loss' && lossId !== null) {
    return `${core} A decision record (${lossId}) accepts this loss.`
  }
  if (lossId !== null && final !== 'accepted_loss') {
    return `${core} A decision record (${lossId}) accepts the loss of this artifact, but under this order it is not lost — the record is stale.`
  }
  return core
}

/** Artifacts this step will cause to become lost, given the order so far. */
export function lostAtStep(
  order: readonly MaterialisedStep[],
  atIndex: number,
  artifacts: readonly EvidenceArtifact[],
): readonly string[] {
  const step = order[atIndex]
  if (!step) return []
  const lost: string[] = []
  for (const artifact of artifacts) {
    const impact = resolveImpact(step.action, artifact)
    if (impact.impact !== 'destroys') continue
    let capturedEarlier = false
    let alreadyGone = false
    for (let i = 0; i < atIndex; i++) {
      const prior = order[i]
      if (!prior) continue
      if (prior.action.captures.includes(artifact.artifact_id)) capturedEarlier = true
      if (resolveImpact(prior.action, artifact).impact === 'destroys') alreadyGone = true
    }
    if (!capturedEarlier && !alreadyGone) lost.push(artifact.name)
  }
  return lost
}

export { listNames }
