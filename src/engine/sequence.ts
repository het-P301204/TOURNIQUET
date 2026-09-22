/**
 * The preserve-first sequencer.
 *
 * Deterministic, explainable, and narrower than it could be — deliberately.
 *
 * **It does not reorder remediation.** The relative order of the remediation
 * steps is an operational decision with dependencies the tool cannot see: you
 * stop the service before you replace the binary, you patch before you verify.
 * TOURNIQUET keeps that order exactly as written and decides only where the
 * captures go. A planner that shuffled remediation would be making operations
 * decisions on evidence grounds, which is the wrong way round.
 *
 * **It places captures in gates, not all at the front.** A capture of stored
 * evidence only has to precede the first step that harms what it collects. An
 * off-host log export does not need to happen before a service restart that
 * cannot reach off-host logs — and on a tight clock, that distinction is the
 * difference between a plan that fits the window and one that does not.
 * Captures that nothing in the plan threatens at all are placed after
 * remediation, because they can genuinely wait, and saying so is more useful
 * than front-loading everything out of caution.
 *
 * **Volatile evidence is exempt from that, and this is the correction that
 * matters.** The first version of this sequencer scheduled every capture
 * against the step that threatened it, and produced a plan where the memory
 * image came *after* the package upgrade — arithmetically defensible, because
 * a package upgrade does not touch RAM, and wrong. Volatile evidence decays
 * on its own. Connections close, processes exit, caches expire, and a capture
 * taken twenty minutes later is a capture of something else. So any capture
 * covering an artifact in the volatile class (tiers 1 to 4) is pulled to the
 * front regardless of what threatens it. That is what the order of volatility
 * has always meant, and a scheduler that only reasons about the operator's
 * own actions quietly loses it.
 *
 * **Within a gate, the order of volatility decides.** Most volatile first, by
 * `VOLATILITY_RANK` rather than by intuition; then collection priority, so a
 * required artifact beats an optional one at the same tier; then the shorter
 * capture, so a plan that runs out of time has spent it on more artifacts;
 * then the action id, so the output is stable.
 */

import type {
  EvidenceArtifact,
  EvidenceSelection,
  PreservationGate,
  PreservationSequence,
  SequenceStep,
} from '../domain/types.ts'
import { IMPACT_IS_HARMFUL, PRIORITY_RANK } from '../domain/semantics.ts'
import { VOLATILITY_RANK } from '../domain/volatility.ts'
import { resolveImpact } from './impact.ts'
import { lostAtStep, listNames } from './outcomes.ts'
import { isCapture, type MaterialisedStep } from './steps.ts'

interface CaptureInfo {
  readonly step: MaterialisedStep
  /** Artifacts it captures that are in scope and included. */
  readonly artifacts: readonly EvidenceArtifact[]
  /** Index into the remediation list it must precede, or null if it can wait. */
  readonly gate: number | null
  readonly tierRank: number
  readonly priorityRank: number
  /** True when the gate was pulled to the front because the evidence decays. */
  readonly forcedByVolatility: boolean
  /**
   * Whether the gate's own action actually harms anything this capture
   * collects.
   *
   * False for a capture that was pulled to the front purely because its
   * evidence decays. Without this the explanation said "'Apply package
   * upgrade' is the first step that reaches Physical memory image" — which is
   * plainly untrue, a package upgrade does not touch RAM, and it was the one
   * sentence in the flagship view that a reader who knew the domain would
   * catch immediately.
   */
  readonly threatenedByGate: boolean
}

/**
 * The boundary of the volatile class, as a rank rather than a list.
 *
 * Tiers 1 to 4 — memory, running state, network state, session state — are the
 * ones that change while you are reading about them. Kept here rather than
 * inlined so that a team who reorders `VOLATILITY_RANK` moves this with it.
 */
const VOLATILE_RANK_LIMIT = 4

export function buildSequence(
  steps: readonly MaterialisedStep[],
  artifacts: readonly EvidenceArtifact[],
  selections: ReadonlyMap<string, EvidenceSelection>,
): PreservationSequence {
  const byId = new Map(artifacts.map((a) => [a.artifact_id, a]))
  const included = (id: string): boolean => selections.get(id)?.included ?? true

  const captures = steps.filter(isCapture)
  const remediation = steps.filter((s) => !isCapture(s))

  /* ---- which remediation step first harms each artifact ---------------- */

  const firstHarmIndex = new Map<string, number>()
  for (let r = 0; r < remediation.length; r++) {
    const step = remediation[r]
    if (!step) continue
    for (const artifact of artifacts) {
      if (firstHarmIndex.has(artifact.artifact_id)) continue
      const impact = resolveImpact(step.action, artifact)
      if (IMPACT_IS_HARMFUL[impact.impact]) firstHarmIndex.set(artifact.artifact_id, r)
    }
  }

  /* ---- assign each capture to a gate ----------------------------------- */

  const infos: CaptureInfo[] = captures.map((step) => {
    const covered = step.action.captures
      .map((id) => byId.get(id))
      .filter((a): a is EvidenceArtifact => a !== undefined && included(a.artifact_id))

    let gate: number | null = null
    for (const a of covered) {
      const h = firstHarmIndex.get(a.artifact_id)
      if (h === undefined) continue
      gate = gate === null ? h : Math.min(gate, h)
    }

    // Volatile evidence decays without anybody's help. A capture covering any
    // of it goes to the front whatever the plan does or does not threaten.
    //
    // Guarded on there being a remediation step to go in front of. A gate is
    // an index into the remediation list, so forcing one on a plan that is
    // captures-only produced a gate nothing would ever emit, and the step
    // vanished from the sequence. Steps must not disappear; see the
    // reconciliation below, which is the second half of the same fix.
    const volatileClass = covered.some((a) => VOLATILITY_RANK[a.tier] <= VOLATILE_RANK_LIMIT)
    const threatened = gate
    if (volatileClass && covered.length > 0 && remediation.length > 0) gate = 0

    const tierRank = covered.length
      ? Math.min(...covered.map((a) => VOLATILITY_RANK[a.tier]))
      : Number.MAX_SAFE_INTEGER
    const priorityRank = covered.length
      ? Math.min(
          ...covered.map((a) => PRIORITY_RANK[selections.get(a.artifact_id)?.priority ?? a.default_priority]),
        )
      : Number.MAX_SAFE_INTEGER

    return {
      step,
      artifacts: covered,
      gate,
      tierRank,
      priorityRank,
      forcedByVolatility: volatileClass,
      threatenedByGate: threatened !== null && threatened === gate,
    }
  })

  const withinGate = (a: CaptureInfo, b: CaptureInfo): number =>
    a.tierRank - b.tierRank ||
    a.priorityRank - b.priorityRank ||
    durationRank(a.step.minutes) - durationRank(b.step.minutes) ||
    a.step.action.action_id.localeCompare(b.step.action.action_id)

  /* ---- interleave ------------------------------------------------------ */

  const ordered: MaterialisedStep[] = []
  const gates: PreservationGate[] = []

  for (let r = 0; r < remediation.length; r++) {
    const inGate = infos.filter((i) => i.gate === r).sort(withinGate)
    const target = remediation[r]
    if (inGate.length > 0 && target) {
      gates.push({
        gate: gates.length,
        before_step_id: target.step_id,
        before_action_id: target.action.action_id,
        before_action_name: target.action.name,
        artifact_ids: inGate.flatMap((i) => i.artifacts.map((a) => a.artifact_id)),
        reason: gateReason(target.action.name, inGate),
      })
    }
    for (const i of inGate) ordered.push(i.step)
    if (target) ordered.push(target)
  }

  // Captures nothing in the plan threatens. They go last, and the sequence
  // says why: not because they are unimportant, but because nothing here is
  // racing them.
  const deferred = infos.filter((i) => i.gate === null).sort(withinGate)
  for (const i of deferred) ordered.push(i.step)

  // A sequence that omits a step is worse than no sequence: the reader would
  // execute a plan that silently lost one, and the outcome simulation would
  // then be computed over a plan nobody is going to run. Nothing above should
  // be able to drop one, but "should" is not a guarantee, so anything left
  // over is appended in its original relative position rather than lost.
  if (ordered.length !== steps.length) {
    const emitted = new Set(ordered.map((s) => s.step_id))
    for (const s of steps) if (!emitted.has(s.step_id)) ordered.push(s)
  }

  /* ---- annotate -------------------------------------------------------- */

  const infoByStep = new Map(infos.map((i) => [i.step.step_id, i]))
  const seq: SequenceStep[] = ordered.map((step, idx) => {
    const info = infoByStep.get(step.step_id)
    const capture = info !== undefined
    const gateIdx = capture ? info.gate : null
    const gateRec = gateIdx === null ? undefined : gates.find((g) => g.before_step_id === remediation[gateIdx]?.step_id)

    return {
      order: idx + 1,
      kind: capture ? 'capture' : 'remediation',
      step_id: step.step_id,
      action_id: step.action.action_id,
      name: step.action.name,
      artifact_ids: capture ? info.artifacts.map((a) => a.artifact_id) : [],
      estimated_minutes: step.minutes,
      offset_minutes: null,
      why_now: whyNow(step, info, gateRec, ordered, idx, artifacts),
      at_risk: capture ? info.artifacts.map((a) => a.name) : [],
      enables: gateRec?.before_action_name ?? null,
      lost_after: capture ? [] : lostAtStep(ordered, idx, artifacts.filter((a) => included(a.artifact_id))),
      confidence: step.action.confidence,
      gate: gateRec?.gate ?? null,
    }
  })

  const withOffsets = applyOffsets(seq)
  const order = ordered.map((s) => s.step_id)

  return {
    steps: withOffsets,
    gates,
    order,
    matches_plan_order: order.length === steps.length && order.every((id, i) => steps[i]?.step_id === id),
  }
}

/**
 * Why a gate exists, stated without overclaiming.
 *
 * A gate collects two kinds of capture: the ones the gate's action would
 * actually destroy, and the ones pulled forward because their evidence decays
 * on its own. Saying the action "reaches" both would be false about the
 * second kind, so the two are named separately or not at all.
 */
function gateReason(actionName: string, inGate: readonly CaptureInfo[]): string {
  const threatened = inGate.filter((i) => i.threatenedByGate).flatMap((i) => i.artifacts.map((a) => a.name))
  const decaying = inGate.filter((i) => !i.threatenedByGate).flatMap((i) => i.artifacts.map((a) => a.name))

  const parts: string[] = []
  if (threatened.length > 0) {
    parts.push(
      `"${actionName}" is the first step in this plan that reaches ${listNames(threatened, 4)}.`,
    )
  }
  if (decaying.length > 0) {
    parts.push(
      `${listNames(decaying, 4)} ${decaying.length === 1 ? 'is' : 'are'} here because ${
        decaying.length === 1 ? 'it decays' : 'they decay'
      } without anybody's help, not because this step touches ${decaying.length === 1 ? 'it' : 'them'}.`,
    )
  }
  parts.push('Everything in this gate has to be collected before the step below it runs.')
  return parts.join(' ')
}

/** Unknown durations sort last: a step nobody has timed is not a quick win. */
function durationRank(m: number | null): number {
  return m === null ? Number.MAX_SAFE_INTEGER : m
}

/**
 * Offsets from plan start.
 *
 * Once a step with no estimate is reached, every offset after it is `null`.
 * Carrying on with the running total would produce a timeline that looks
 * precise and is arithmetically wrong, which is worse than a timeline that
 * admits where it stops knowing.
 */
function applyOffsets(steps: readonly SequenceStep[]): readonly SequenceStep[] {
  let clock: number | null = 0
  return steps.map((s) => {
    const at = clock
    if (clock !== null && s.estimated_minutes !== null) clock += s.estimated_minutes
    else clock = null
    return { ...s, offset_minutes: at }
  })
}

function whyNow(
  step: MaterialisedStep,
  info: CaptureInfo | undefined,
  gate: PreservationGate | undefined,
  ordered: readonly MaterialisedStep[],
  idx: number,
  artifacts: readonly EvidenceArtifact[],
): string {
  if (info !== undefined) {
    if (info.artifacts.length === 0) {
      return 'This capture collects nothing that is in scope for this asset type, or nothing that is still selected. It can be removed from the plan.'
    }
    if (gate === undefined) {
      return `Nothing in this plan reaches ${listNames(
        info.artifacts.map((a) => a.name),
      )}, so this capture is not racing anything. It is placed after remediation so it does not spend time on the clock before the fix. Platform retention, not this plan, is what bounds it.`
    }
    const names = listNames(info.artifacts.map((a) => a.name))
    if (info.forcedByVolatility && !info.threatenedByGate) {
      return `${names} decay on their own — connections close, processes exit, caches expire — so this runs before the remediation begins. Nothing in this plan destroys them; the clock does.`
    }
    const threat = `"${gate.before_action_name}" is the first step in this plan that reaches them; after it, this capture would collect nothing.`
    if (info.forcedByVolatility) {
      return `${names} decay on their own — connections close, processes exit, caches expire — so this runs first regardless of what the plan does. ${threat}`
    }
    return `${names} must exist when this runs. ${threat}`
  }

  const lost = lostAtStep(ordered, idx, artifacts)
  if (lost.length === 0) {
    return 'A remediation step. Nothing in the evidence catalogue is lost at this point.'
  }
  return `A remediation step. ${listNames(lost)} ${
    lost.length === 1 ? 'stops' : 'stop'
  } existing here, which is why everything above it had to run first.`
}
