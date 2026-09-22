/**
 * What one step does, grouped by what it does.
 *
 * The footprint is the answer to the question a reader asks by pointing at a
 * button: "what disappears if I do this?" Everything else in the engine is
 * built on top of it.
 *
 * `destructive_level` is recomputed here rather than taken from the library.
 * The library declares a level for display and for sorting the catalogue, but
 * a declared level and a resolved footprint can drift — a rule added to an
 * action without updating its level, an asset type where the destructive part
 * of the footprint is out of scope entirely. The computed level is the one
 * that follows from the rules actually in force for *this* asset, and
 * `footprint.test.ts` asserts that the library's declarations agree with it
 * where the whole catalogue is in scope.
 */

import type {
  ActionFootprint,
  Confidence,
  DestructiveLevel,
  EvidenceArtifact,
  ResolvedImpact,
} from '../domain/types.ts'
import { CONFIDENCE_RANK } from '../domain/semantics.ts'
import { VOLATILITY_RANK } from '../domain/volatility.ts'
import { resolveAll } from './impact.ts'
import type { MaterialisedStep } from './steps.ts'

/**
 * How many distinct volatile tiers an action has to destroy before "high"
 * stops being an exaggeration.
 *
 * Three. A reboot destroys memory, running state, network state and session
 * state — four of the four — and a service restart destroys memory and
 * running state belonging to one process. Both are destructive; describing
 * them with the same word would make the word useless, and the first version
 * of this function did exactly that by grading on "destroys anything
 * volatile".
 */
const WHOLESALE_TIERS = 3

/**
 * The level that follows from a resolved footprint.
 *
 *   unknown   the action's uncharacterised remainder *is* the action
 *   high      it destroys volatile state across most of the volatile tiers
 *   moderate  it destroys some volatile state, bounded to part of the host
 *   low       it destroys only stored state, or merely alters things
 *   none      it touches nothing in the catalogue
 *
 * `unknown` is keyed to the action's default effect rather than to the mere
 * presence of an unknown mapping. An action that characterises almost
 * everything and has one honest gap is not a black box, and grading it as one
 * would bury the actions that genuinely are.
 */
export function computeDestructiveLevel(
  impacts: readonly ResolvedImpact[],
  byId: ReadonlyMap<string, EvidenceArtifact>,
  defaultIsUnknown = false,
): DestructiveLevel {
  if (defaultIsUnknown) return 'unknown'

  const destroys = impacts.filter((i) => i.impact === 'destroys')
  const alters = impacts.filter(
    (i) => i.impact === 'modifies' || i.impact === 'may_invalidate' || i.impact === 'unknown',
  )

  const volatileTiers = new Set<number>()
  for (const i of destroys) {
    const a = byId.get(i.artifact_id)
    if (a === undefined) continue
    const rank = VOLATILITY_RANK[a.tier]
    if (rank <= VOLATILE_RANK_LIMIT) volatileTiers.add(rank)
  }

  if (volatileTiers.size >= WHOLESALE_TIERS) return 'high'
  if (volatileTiers.size > 0) return 'moderate'
  if (destroys.length > 0) return 'low'
  if (alters.length > 0) return 'low'
  return 'none'
}

/** The volatile class, by rank. Mirrors the sequencer's boundary. */
const VOLATILE_RANK_LIMIT = 4

/** The weakest confidence among the claims that matter. */
function floorConfidence(impacts: readonly ResolvedImpact[]): Confidence {
  const harmful = impacts.filter((i) => i.impact !== 'preserves')
  const pool = harmful.length > 0 ? harmful : impacts
  let worst: Confidence = 'high'
  for (const i of pool) {
    if (CONFIDENCE_RANK[i.confidence] < CONFIDENCE_RANK[worst]) worst = i.confidence
  }
  return worst
}

export function footprintFor(
  step: MaterialisedStep,
  artifacts: readonly EvidenceArtifact[],
  byId: ReadonlyMap<string, EvidenceArtifact>,
): ActionFootprint {
  const impacts = resolveAll(step.action, artifacts)
  const pick = (k: ResolvedImpact['impact']): readonly ResolvedImpact[] =>
    impacts.filter((i) => i.impact === k)

  const destroys = pick('destroys')
  const modifies = pick('modifies')
  const may_invalidate = pick('may_invalidate')
  const preserves = pick('preserves')
  const unknown = pick('unknown')

  return {
    step_id: step.step_id,
    action_id: step.action.action_id,
    index: step.index,
    name: step.action.name,
    category: step.action.category,
    destroys,
    modifies,
    may_invalidate,
    preserves,
    unknown,
    harmful:
      destroys.length > 0 ||
      modifies.length > 0 ||
      may_invalidate.length > 0 ||
      unknown.length > 0,
    destructive_level: computeDestructiveLevel(
      impacts,
      byId,
      step.action.default_effect.impact === 'unknown',
    ),
    estimated_minutes: step.minutes,
    reversible: step.action.reversible,
    confidence: floorConfidence(impacts),
  }
}

export function footprintsFor(
  steps: readonly MaterialisedStep[],
  artifacts: readonly EvidenceArtifact[],
  byId: ReadonlyMap<string, EvidenceArtifact>,
): readonly ActionFootprint[] {
  return steps.map((s) => footprintFor(s, artifacts, byId))
}
