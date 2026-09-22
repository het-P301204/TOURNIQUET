/**
 * Action → evidence → consequence.
 *
 * The third way of reading the same relation, and the one that matches how
 * the question is actually asked out loud: *if I reboot this host, what
 * happens?*
 *
 * The matrix answers that too, but it answers it by making the reader scan a
 * column and decode a glyph per cell. This lays one action's whole footprint
 * out as a branching list, with the consequence spelled out per branch and
 * the rule that produced it one click away.
 *
 * Only harmful relationships are branches. An action that preserves
 * twenty-two artifacts and destroys five should draw five branches and count
 * the twenty-two, because "these five" is the finding and "the rest are
 * fine" is the background.
 */

import { useMemo, useState } from 'react'
import type { AnalysisResult, ImpactKind, ResolvedImpact } from '../domain/types.ts'
import { ACTION_CATEGORY_LABEL, IMPACT_LABEL, OUTCOME_LABEL } from '../domain/semantics.ts'
import { TIER_LABEL, VOLATILITY_RANK } from '../domain/volatility.ts'
import { formatDuration } from '../domain/time.ts'
import { FOCUS, IMPACT_STYLE, LABEL, OUTCOME_STYLE } from './tokens.ts'
import { CATEGORY_ICON, IMPACT_ICON, IconCapture, IconLink, OUTCOME_ICON } from './icons.tsx'
import { Button, ConfidenceMeter, DestructiveBadge, cx } from './primitives.tsx'

/** Worst first: the reason to read the list is the top of it. */
const IMPACT_ORDER: readonly ImpactKind[] = ['destroys', 'unknown', 'modifies', 'may_invalidate']

export function RelationshipView({
  result,
  onSelectArtifact,
  onSelectStep,
}: {
  result: AnalysisResult
  onSelectArtifact: (id: string) => void
  onSelectStep: (id: string) => void
}) {
  const [open, setOpen] = useState<readonly string[]>(() =>
    // Open the destructive steps by default; they are why anybody is here.
    result.footprints.filter((f) => f.destroys.length > 0).map((f) => f.step_id),
  )

  const byArtifact = useMemo(
    () => new Map(result.artifacts.map((a) => [a.artifact_id, a])),
    [result.artifacts],
  )
  const outcomeOf = useMemo(
    () => new Map(result.outcomes.map((o) => [o.artifact_id, o])),
    [result.outcomes],
  )
  const captureOf = useMemo(() => {
    const m = new Map<string, readonly string[]>()
    for (const step of result.plan.steps) {
      const a = result.actions.find((x) => x.action_id === step.action_id)
      if (a) m.set(step.step_id, a.captures)
    }
    return m
  }, [result.plan.steps, result.actions])

  const toggle = (id: string): void =>
    setOpen((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]))

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-1 px-5 py-2.5">
        <span className="flex items-center gap-1.5 text-2xs text-ink-3">
          <span className="text-link">
            <IconLink size={12} />
          </span>
          Each branch is one action reaching one artifact, with what it does to it
        </span>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="quiet"
            onClick={() => setOpen(result.footprints.map((f) => f.step_id))}
          >
            Expand all
          </Button>
          <Button size="sm" variant="quiet" onClick={() => setOpen([])}>
            Collapse all
          </Button>
        </div>
      </div>

      <ol>
        {result.footprints.map((f) => {
          const branches: readonly ResolvedImpact[] = IMPACT_ORDER.flatMap((k) =>
            [...pick(f, k)].sort((a, b) => {
              const ra = byArtifact.get(a.artifact_id)
              const rb = byArtifact.get(b.artifact_id)
              if (!ra || !rb) return 0
              return VOLATILITY_RANK[ra.tier] - VOLATILITY_RANK[rb.tier]
            }),
          )
          const captures = captureOf.get(f.step_id) ?? []
          const capturedInScope = captures.filter((id) => byArtifact.has(id))
          const expanded = open.includes(f.step_id)
          const CatIcon = CATEGORY_ICON[f.category]

          return (
            <li key={f.step_id} className="border-b border-line-1 last:border-0">
              <button
                type="button"
                onClick={() => toggle(f.step_id)}
                aria-expanded={expanded}
                className={cx(
                  'flex w-full items-start gap-3 border-l-2 px-5 py-3.5 text-left transition-colors duration-140 hover:bg-surface-2',
                  f.destroys.length > 0
                    ? 'border-l-lost'
                    : f.unknown.length > 0
                      ? 'border-l-unknown'
                      : f.category === 'capture'
                        ? 'border-l-preserved'
                        : 'border-l-transparent',
                  FOCUS,
                )}
              >
                <span className="tnum mt-0.5 w-5 shrink-0 text-right font-mono text-xs text-ink-3">
                  {f.index + 1}
                </span>
                <span
                  className={cx(
                    'mt-0.5 shrink-0',
                    f.category === 'capture'
                      ? 'text-preserved'
                      : f.destroys.length > 0
                        ? 'text-lost'
                        : 'text-ink-3',
                  )}
                >
                  <CatIcon size={15} />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-ink-0">{f.name}</span>
                    <span className={LABEL}>{ACTION_CATEGORY_LABEL[f.category]}</span>
                    <DestructiveBadge level={f.destructive_level} />
                    <span className="tnum text-2xs text-ink-3">
                      {formatDuration(f.estimated_minutes)}
                    </span>
                  </span>

                  <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs">
                    {capturedInScope.length > 0 ? (
                      <span className="flex items-center gap-1 text-preserved">
                        <IconCapture size={11} />
                        acquires {capturedInScope.length}
                      </span>
                    ) : null}
                    {(['destroys', 'modifies', 'may_invalidate', 'unknown'] as ImpactKind[]).map(
                      (k) => {
                        const n = pick(f, k).length
                        if (n === 0) return null
                        const Icon = IMPACT_ICON[k]
                        return (
                          <span
                            key={k}
                            className={cx('flex items-center gap-1', IMPACT_STYLE[k].text)}
                          >
                            <Icon size={11} />
                            {IMPACT_LABEL[k].toLowerCase()} {n}
                          </span>
                        )
                      },
                    )}
                    <span className="text-ink-3">preserves {f.preserves.length}</span>
                  </span>
                </span>

                <span
                  aria-hidden="true"
                  className={cx(
                    'mt-1 shrink-0 text-2xs text-ink-3 transition-transform duration-140',
                    expanded && 'rotate-90',
                  )}
                >
                  ▶
                </span>
              </button>

              {expanded ? (
                <div className="animate-fade-in pb-4 pl-[3.4rem] pr-5">
                  {branches.length === 0 && capturedInScope.length === 0 ? (
                    <p className="text-xs text-ink-3">
                      This step reaches nothing in the evidence catalogue for this asset type.
                    </p>
                  ) : null}

                  {/* What it acquires. */}
                  {capturedInScope.length > 0 ? (
                    <ul className="mb-2 space-y-px">
                      {capturedInScope.map((id) => (
                        <Branch
                          key={id}
                          tone="text-preserved"
                          icon={<IconCapture size={12} />}
                          name={byArtifact.get(id)?.name ?? id}
                          tier={byArtifact.get(id)?.tier}
                          verb="acquires"
                          detail={byArtifact.get(id)?.answers ?? ''}
                          outcome={outcomeOf.get(id)?.outcome}
                          confidence={undefined}
                          onClick={() => onSelectArtifact(id)}
                        />
                      ))}
                    </ul>
                  ) : null}

                  {/* What it does to everything else. */}
                  <ul className="space-y-px">
                    {branches.map((b) => {
                      const a = byArtifact.get(b.artifact_id)
                      const Icon = IMPACT_ICON[b.impact]
                      return (
                        <Branch
                          key={`${b.impact}-${b.artifact_id}`}
                          tone={IMPACT_STYLE[b.impact].text}
                          icon={<Icon size={12} />}
                          name={a?.name ?? b.artifact_id}
                          tier={a?.tier}
                          verb={IMPACT_LABEL[b.impact].toLowerCase()}
                          detail={b.rationale}
                          outcome={outcomeOf.get(b.artifact_id)?.outcome}
                          confidence={b.confidence}
                          onClick={() => onSelectArtifact(b.artifact_id)}
                        />
                      )
                    })}
                  </ul>

                  <Button
                    size="sm"
                    variant="quiet"
                    className="mt-2"
                    onClick={() => onSelectStep(f.step_id)}
                  >
                    Full footprint for this step
                  </Button>
                </div>
              ) : null}
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function pick(
  f: AnalysisResult['footprints'][number],
  k: ImpactKind,
): readonly ResolvedImpact[] {
  switch (k) {
    case 'destroys':
      return f.destroys
    case 'modifies':
      return f.modifies
    case 'may_invalidate':
      return f.may_invalidate
    case 'unknown':
      return f.unknown
    case 'preserves':
      return f.preserves
  }
}

function Branch({
  tone,
  icon,
  name,
  tier,
  verb,
  detail,
  outcome,
  confidence,
  onClick,
}: {
  tone: string
  icon: React.ReactNode
  name: string
  tier: AnalysisResult['artifacts'][number]['tier'] | undefined
  verb: string
  detail: string
  outcome: AnalysisResult['outcomes'][number]['outcome'] | undefined
  confidence: AnalysisResult['impacts'][number]['confidence'] | undefined
  onClick: () => void
}) {
  const OutIcon = outcome ? OUTCOME_ICON[outcome] : null
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={cx(
          'group grid w-full grid-cols-[1.1rem_1fr] gap-x-2 rounded px-2 py-1.5 text-left transition-colors duration-140 hover:bg-surface-2',
          FOCUS,
        )}
      >
        {/* The branch line, drawn rather than indented, so the tree reads. */}
        <span
          aria-hidden="true"
          className="relative mt-0.5 h-full border-l border-line-2 pl-2"
        >
          <span className="absolute -left-px top-[0.45rem] block h-px w-2 bg-line-2" />
        </span>

        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2">
            <span className={cx('shrink-0', tone)}>{icon}</span>
            <span className="text-xs font-medium text-ink-0">{name}</span>
            {tier ? (
              <span className="tnum shrink-0 rounded-sm border border-line-2 bg-surface-2 px-1 font-mono text-2xs text-ink-3">
                {VOLATILITY_RANK[tier]} {TIER_LABEL[tier]}
              </span>
            ) : null}
            <span className={cx('text-2xs uppercase tracking-[0.08em]', tone)}>{verb}</span>
            {outcome && OutIcon ? (
              <span
                className={cx('flex items-center gap-1 text-2xs', OUTCOME_STYLE[outcome].text)}
                title={`Outcome under this plan: ${OUTCOME_LABEL[outcome]}`}
              >
                <span aria-hidden="true">→</span>
                <OutIcon size={11} />
                {OUTCOME_LABEL[outcome]}
              </span>
            ) : null}
            {confidence ? <ConfidenceMeter confidence={confidence} /> : null}
          </span>
          <span className="mt-1 block max-w-[92ch] text-2xs leading-relaxed text-ink-2">
            {detail}
          </span>
        </span>
      </button>
    </li>
  )
}
