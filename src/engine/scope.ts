/**
 * Scoping the catalogues to one asset.
 *
 * A container has no physical memory of its own. A SaaS identity tenant has no
 * host artifacts at all. Offering either would not be a harmless extra row —
 * it would put an artifact in the preservation plan that nobody can collect,
 * and the deadline arithmetic would then be wrong in the optimistic direction.
 *
 * Scoping is deliberately shallow. `applies_to` is a membership test, not a
 * platform model, and every catalogue entry carries its own `confidence` for
 * the cases where membership is true but the details differ.
 */

import type { AssetType, EvidenceArtifact, RemediationAction } from '../domain/types.ts'
import { EVIDENCE_CATALOGUE } from '../data/evidence.ts'
import { ACTION_LIBRARY } from '../data/actions.ts'

function inScope(applies: readonly AssetType[] | 'all', type: AssetType): boolean {
  return applies === 'all' || applies.includes(type)
}

export function artifactsFor(
  type: AssetType,
  catalogue: readonly EvidenceArtifact[] = EVIDENCE_CATALOGUE,
): readonly EvidenceArtifact[] {
  return catalogue.filter((a) => inScope(a.applies_to, type))
}

export function actionsFor(
  type: AssetType,
  library: readonly RemediationAction[] = ACTION_LIBRARY,
): readonly RemediationAction[] {
  return library.filter((a) => inScope(a.applies_to, type))
}

/**
 * Whether an action is applicable to an asset type.
 *
 * Exported separately because a plan may already contain a step that is out of
 * scope — an operator loading a saved plan against a different asset type, or
 * a hand-edited file. The analyser keeps the step and says so rather than
 * silently dropping it, because a dropped step is a step whose evidence cost
 * stops being counted.
 */
export function actionApplies(action: RemediationAction, type: AssetType): boolean {
  return inScope(action.applies_to, type)
}

export function artifactApplies(artifact: EvidenceArtifact, type: AssetType): boolean {
  return inScope(artifact.applies_to, type)
}
