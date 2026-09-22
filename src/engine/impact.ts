/**
 * Resolving one action against one artifact.
 *
 * The rule is specificity, then severity.
 *
 * **Specificity.** An effect written against an artifact id beats one written
 * against a tag, which beats one written against a volatility tier. That is
 * what lets `host_reboot` say "everything in `volatile_memory` is destroyed"
 * in one line and then carve out the artifact where the honest answer is "it
 * depends on your restart policy".
 *
 * **Severity, but only as a tie-break.** Two effects at the *same* specificity
 * can disagree — an artifact carrying two tags the action wrote different
 * rules for. The more severe wins, and the resolved rationale says that it
 * did, because a silent pick between contradictory rules is a bug that never
 * announces itself.
 *
 * The severity order is `destroys > modifies > may_invalidate > unknown >
 * preserves`. Two placements in it are deliberate:
 *
 *   `unknown` beats `preserves`, because an absence of knowledge must never
 *   resolve to an assurance of safety. This is the single rule the whole
 *   product rests on.
 *
 *   `may_invalidate` beats `unknown`, because an affirmative statement that
 *   something is at risk carries more information than the absence of any
 *   statement, and the reader should see the one that tells them something.
 *
 * When nothing matches, the action's `default_effect` applies. That field is
 * mandatory on every action precisely so that this branch is a decision the
 * library author made rather than a hole the resolver had to paper over.
 */

import type {
  ActionEffect,
  EvidenceArtifact,
  ImpactKind,
  MatchBasis,
  RemediationAction,
  ResolvedImpact,
} from '../domain/types.ts'

/** Higher is more severe. Used only to break ties at equal specificity. */
const SEVERITY: Readonly<Record<ImpactKind, number>> = {
  destroys: 4,
  modifies: 3,
  may_invalidate: 2,
  unknown: 1,
  preserves: 0,
}

const SPECIFICITY: Readonly<Record<'artifact' | 'tag' | 'tier', number>> = {
  artifact: 3,
  tag: 2,
  tier: 1,
}

function targetMatches(effect: ActionEffect, artifact: EvidenceArtifact): boolean {
  const t = effect.target
  switch (t.kind) {
    case 'artifact':
      return t.artifact_id === artifact.artifact_id
    case 'tag':
      return artifact.tags.includes(t.tag)
    case 'tier':
      return artifact.tier === t.tier
  }
}

function targetLabel(effect: ActionEffect): string | null {
  const t = effect.target
  switch (t.kind) {
    case 'artifact':
      return null
    case 'tag':
      return t.tag
    case 'tier':
      return t.tier
  }
}

export function resolveImpact(
  action: RemediationAction,
  artifact: EvidenceArtifact,
): ResolvedImpact {
  const matches = action.effects.filter((e) => targetMatches(e, artifact))

  if (matches.length === 0) {
    return {
      action_id: action.action_id,
      artifact_id: artifact.artifact_id,
      impact: action.default_effect.impact,
      confidence: action.default_effect.confidence,
      rationale: action.default_effect.rationale,
      matched_by: 'action_default',
      matched_on: null,
    }
  }

  let bestSpecificity = -1
  for (const m of matches) bestSpecificity = Math.max(bestSpecificity, SPECIFICITY[m.target.kind])
  const contenders = matches.filter((m) => SPECIFICITY[m.target.kind] === bestSpecificity)

  let winner = contenders[0]
  if (!winner) throw new Error('unreachable: contenders is non-empty')
  for (const c of contenders) {
    if (SEVERITY[c.impact] > SEVERITY[winner.impact]) winner = c
  }

  // Two rules at the same specificity that disagree. Say so in the output
  // rather than picking quietly: the reader should know the library contains
  // a contradiction about their artifact, because the resolution is arbitrary
  // beyond "take the worse one".
  const disagreed = contenders.some((c) => c.impact !== winner.impact)
  const others = disagreed
    ? contenders
        .filter((c) => c !== winner)
        .map((c) => `${c.impact} (${targetLabel(c) ?? 'artifact rule'})`)
        .join(', ')
    : null

  return {
    action_id: action.action_id,
    artifact_id: artifact.artifact_id,
    impact: winner.impact,
    confidence: winner.confidence,
    rationale: disagreed
      ? `${winner.rationale} The library also carries a conflicting rule of equal specificity for this artifact — ${others} — and the more severe reading was taken.`
      : winner.rationale,
    matched_by: winner.target.kind satisfies MatchBasis,
    matched_on: targetLabel(winner),
  }
}

/** Every artifact this action touches, in catalogue order. */
export function resolveAll(
  action: RemediationAction,
  artifacts: readonly EvidenceArtifact[],
): readonly ResolvedImpact[] {
  return artifacts.map((a) => resolveImpact(action, a))
}

export { SEVERITY as IMPACT_SEVERITY }
