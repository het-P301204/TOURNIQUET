/**
 * The evidence map.
 *
 * Two views of the same relation, because two different questions get asked of
 * it. The matrix answers "which step reaches which artifact" at a glance, over
 * everything at once. The list answers "what happens to this artifact, and
 * why" for one row at a time, with the rule and the confidence that produced
 * each cell.
 *
 * The matrix is dense on purpose. Twenty-eight artifacts against eight steps
 * is two hundred and twenty-four cells, and the whole value of seeing them
 * together is that the pattern of a destructive step — a vertical stripe of
 * crosses through the volatile tiers — is legible before any individual cell
 * is read.
 */

import { useMemo, useState } from 'react'
import type {
  AnalysisResult,
  ArtifactOutcome,
  ImpactKind,
  PreservationOutcome,
} from '../domain/types.ts'
import { IMPACT_LABEL, IMPACT_TEXT, OUTCOME_LABEL } from '../domain/semantics.ts'
import { CLASS_LABEL, TIER_CLASS, TIER_LABEL, VOLATILITY_RANK } from '../domain/volatility.ts'
import { FOCUS, IMPACT_STYLE, LABEL, OUTCOME_STYLE } from '../ui/tokens.ts'
import {
  Button,
  ConfidenceMeter,
  Empty,
  OutcomeBadge,
  Panel,
  PanelHeader,
  PriorityBadge,
  TierTag,
  cx,
} from '../ui/primitives.tsx'
import { RelationshipView } from '../ui/RelationshipView.tsx'
import { StateStrip } from '../ui/StateStrip.tsx'
import type { Filters } from '../state.ts'

export function EvidenceMap({
  result,
  filters,
  onFilterOutcome,
  onFilterVolatility,
  onResetFilters,
  onSelectArtifact,
  onSelectStep,
  onSetIncluded,
}: {
  result: AnalysisResult
  filters: Filters
  onFilterOutcome: (o: PreservationOutcome) => void
  onFilterVolatility: (b: 'volatile' | 'semi_volatile' | 'persistent') => void
  onResetFilters: () => void
  onSelectArtifact: (id: string) => void
  onSelectStep: (id: string) => void
  onSetIncluded: (artifact_id: string, included: boolean) => void
}) {
  const [mode, setMode] = useState<'relationships' | 'matrix' | 'list'>('relationships')

  const selections = useMemo(
    () => new Map(result.plan.evidence.map((e) => [e.artifact_id, e])),
    [result.plan.evidence],
  )

  const rows = useMemo(() => {
    const q = filters.query.trim().toLowerCase()
    return [...result.outcomes]
      .filter((o) => {
        if (filters.outcomes.length > 0 && !filters.outcomes.includes(o.outcome)) return false
        if (filters.volatility.length > 0 && !filters.volatility.includes(TIER_CLASS[o.tier]))
          return false
        if (filters.priorities.length > 0 && !filters.priorities.includes(o.priority)) return false
        if (q === '') return true
        return (
          o.name.toLowerCase().includes(q) ||
          o.artifact_id.toLowerCase().includes(q) ||
          o.explanation.toLowerCase().includes(q)
        )
      })
      .sort(
        (a, b) =>
          VOLATILITY_RANK[a.tier] - VOLATILITY_RANK[b.tier] || a.name.localeCompare(b.name),
      )
  }, [result.outcomes, filters])

  // The full resolved grid, keyed for O(1) cell lookup.
  const cells = useMemo(() => {
    const m = new Map<string, { impact: ImpactKind; rationale: string; confidence: string }>()
    for (const f of result.footprints) {
      for (const i of [...f.destroys, ...f.modifies, ...f.may_invalidate, ...f.unknown, ...f.preserves]) {
        m.set(`${f.step_id}|${i.artifact_id}`, {
          impact: i.impact,
          rationale: i.rationale,
          confidence: i.confidence,
        })
      }
    }
    return m
  }, [result.footprints])

  const captureOf = useMemo(() => {
    const m = new Map<string, Set<string>>()
    for (const step of result.plan.steps) {
      const action = result.actions.find((a) => a.action_id === step.action_id)
      if (!action) continue
      m.set(step.step_id, new Set(action.captures))
    }
    return m
  }, [result.plan.steps, result.actions])

  return (
    <div className="space-y-5">
      {/* ---- filters ---------------------------------------------------- */}
      <Panel>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 px-5 py-3.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className={LABEL}>Outcome</span>
            {(
              ['preserved', 'degraded', 'lost', 'indeterminate', 'retained', 'accepted_loss'] as const
            ).map((o) => {
              const n = result.outcomes.filter((x) => x.outcome === o).length
              const active = filters.outcomes.includes(o)
              return (
                <button
                  key={o}
                  type="button"
                  onClick={() => onFilterOutcome(o)}
                  aria-pressed={active}
                  disabled={n === 0}
                  className={cx(
                    'tnum inline-flex items-center gap-1.5 rounded border px-1.5 py-0.5 text-2xs font-medium uppercase tracking-[0.08em] transition-colors duration-140 disabled:opacity-30',
                    active
                      ? cx(OUTCOME_STYLE[o].text, OUTCOME_STYLE[o].border, OUTCOME_STYLE[o].wash)
                      : 'border-line-2 text-ink-3 hover:text-ink-1',
                    FOCUS,
                  )}
                >
                  <span aria-hidden="true">{OUTCOME_STYLE[o].glyph}</span>
                  {OUTCOME_LABEL[o]}
                  <span className="font-mono">{n}</span>
                </button>
              )
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className={LABEL}>Volatility</span>
            {(['volatile', 'semi_volatile', 'persistent'] as const).map((b) => {
              const active = filters.volatility.includes(b)
              return (
                <button
                  key={b}
                  type="button"
                  onClick={() => onFilterVolatility(b)}
                  aria-pressed={active}
                  className={cx(
                    'rounded border px-1.5 py-0.5 text-2xs font-medium uppercase tracking-[0.08em] transition-colors duration-140',
                    active
                      ? 'border-accent/45 bg-accent/12 text-accent-strong'
                      : 'border-line-2 text-ink-3 hover:text-ink-1',
                    FOCUS,
                  )}
                >
                  {CLASS_LABEL[b]}
                </button>
              )
            })}
          </div>

          <div className="ml-auto flex items-center gap-2">
            {rows.length !== result.outcomes.length ? (
              <Button size="sm" variant="quiet" onClick={onResetFilters}>
                Clear ({rows.length}/{result.outcomes.length})
              </Button>
            ) : null}
            <div className="flex rounded border border-line-2">
              {(['relationships', 'matrix', 'list'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  aria-pressed={mode === m}
                  title={
                    m === 'relationships'
                      ? 'One action at a time, with what it does to each artifact'
                      : m === 'matrix'
                        ? 'Every step against every artifact, at once'
                        : 'One artifact at a time, with its outcome in a sentence'
                  }
                  className={cx(
                    'px-2.5 py-1 text-xs capitalize transition-colors duration-140 first:rounded-l last:rounded-r',
                    mode === m ? 'bg-surface-3 text-ink-0' : 'text-ink-3 hover:text-ink-1',
                    FOCUS,
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Panel>

      <Panel>
        <StateStrip
          counts={result.summary.outcomes}
          active={filters.outcomes}
          onToggle={onFilterOutcome}
        />
      </Panel>

      {mode === 'relationships' ? (
        <Panel>
          <PanelHeader
            title="Action, evidence, consequence"
            hint="Every step in the plan with the artifacts it reaches beneath it, and what happens to each. Destructive steps are expanded by default, because they are the reason to read this."
          />
          <RelationshipView
            result={result}
            onSelectArtifact={onSelectArtifact}
            onSelectStep={onSelectStep}
          />
        </Panel>
      ) : rows.length === 0 ? (
        <Panel>
          <Empty title="Nothing matches those filters">
            Clear them to see all {result.outcomes.length} artifacts in scope for this asset type.
          </Empty>
        </Panel>
      ) : mode === 'matrix' ? (
        <Panel>
          <PanelHeader
            title="Step × artifact"
            hint="Every resolved mapping. A column of crosses is a step that destroys a whole band of evidence; the row it lands on tells you which band. Hover any cell for the rule behind it."
          />
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full min-w-[48rem] border-collapse text-sm">
              <thead>
                <tr>
                  <th
                    scope="col"
                    className="sticky left-0 z-10 border-b border-line-2 bg-surface-1 px-5 py-2 text-left"
                  >
                    <span className={LABEL}>Artifact</span>
                  </th>
                  {result.footprints.map((f) => (
                    <th
                      key={f.step_id}
                      scope="col"
                      className="border-b border-line-2 px-1 py-2 align-bottom"
                    >
                      <button
                        type="button"
                        onClick={() => onSelectStep(f.step_id)}
                        title={`${f.index + 1}. ${f.name}`}
                        className={cx(
                          // Tall enough for the longest action name in the
                          // library rendered vertically; at h-24 every header
                          // was silently clipped mid-word.
                          'mx-auto flex h-40 w-7 items-end justify-center rounded transition-colors duration-140 hover:bg-surface-3',
                          FOCUS,
                        )}
                      >
                        <span
                          className={cx(
                            'whitespace-nowrap text-2xs',
                            f.destroys.length > 0 ? 'text-lost' : 'text-ink-2',
                          )}
                          style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                        >
                          {f.index + 1}. {f.name}
                        </span>
                      </button>
                    </th>
                  ))}
                  <th scope="col" className="border-b border-line-2 px-3 py-2 text-left">
                    <span className={LABEL}>Outcome</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => (
                  <tr
                    key={o.artifact_id}
                    className={cx(
                      'transition-colors duration-140 hover:bg-surface-2',
                      // Excluded from the preservation plan. Still shown, and
                      // still carrying an outcome, because an artifact that
                      // vanishes from the table is one nobody reconsiders.
                      selections.get(o.artifact_id)?.included === false && 'opacity-45',
                    )}
                  >
                    <th
                      scope="row"
                      className="sticky left-0 z-10 max-w-[18rem] border-b border-line-1 bg-surface-1 px-5 py-1.5 text-left font-normal"
                    >
                      <button
                        type="button"
                        onClick={() => onSelectArtifact(o.artifact_id)}
                        className={cx('group flex w-full min-w-0 items-center gap-2 rounded text-left', FOCUS)}
                      >
                        <span
                          aria-hidden="true"
                          className="tnum w-3 shrink-0 font-mono text-2xs text-ink-3"
                        >
                          {VOLATILITY_RANK[o.tier]}
                        </span>
                        <span className="min-w-0 truncate text-xs text-ink-1 group-hover:text-ink-0">
                          {o.name}
                        </span>
                      </button>
                    </th>
                    {result.footprints.map((f) => {
                      const cell = cells.get(`${f.step_id}|${o.artifact_id}`)
                      const captures = captureOf.get(f.step_id)?.has(o.artifact_id) ?? false
                      return (
                        <td
                          key={f.step_id}
                          className="border-b border-line-1 px-1 py-1.5 text-center"
                        >
                          <span
                            className={cx(
                              'mx-auto flex h-5 w-5 items-center justify-center rounded-sm text-2xs',
                              captures
                                ? 'border border-preserved/50 bg-preserved/15 text-preserved'
                                : cell && cell.impact !== 'preserves'
                                  ? cx(IMPACT_STYLE[cell.impact].wash, IMPACT_STYLE[cell.impact].text)
                                  : 'text-ink-3/40',
                            )}
                            title={
                              captures
                                ? `${f.name} acquires ${o.name}.`
                                : cell
                                  ? `${f.name} — ${IMPACT_LABEL[cell.impact]} ${o.name}. ${cell.rationale} (confidence: ${cell.confidence})`
                                  : undefined
                            }
                          >
                            {captures ? '↓' : cell ? IMPACT_STYLE[cell.impact].glyph : '·'}
                          </span>
                        </td>
                      )
                    })}
                    <td className="border-b border-line-1 px-3 py-1.5">
                      <OutcomeBadge outcome={o.outcome} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line-1 px-5 py-3">
            <span className="flex items-center gap-1.5 text-2xs text-ink-3">
              <span className="flex h-4 w-4 items-center justify-center rounded-sm border border-preserved/50 bg-preserved/15 text-2xs text-preserved">
                ↓
              </span>
              Acquired by this step
            </span>
            {(['destroys', 'modifies', 'may_invalidate', 'unknown'] as ImpactKind[]).map((k) => (
              <span
                key={k}
                className="flex items-center gap-1.5 text-2xs text-ink-3"
                title={IMPACT_TEXT[k]}
              >
                <span
                  className={cx(
                    'flex h-4 w-4 items-center justify-center rounded-sm text-2xs',
                    IMPACT_STYLE[k].wash,
                    IMPACT_STYLE[k].text,
                  )}
                >
                  {IMPACT_STYLE[k].glyph}
                </span>
                {IMPACT_LABEL[k]}
              </span>
            ))}
            <span className="flex items-center gap-1.5 text-2xs text-ink-3">
              <span className="flex h-4 w-4 items-center justify-center text-ink-3/40">·</span>
              Untouched
            </span>
          </div>
        </Panel>
      ) : (
        <Panel>
          <PanelHeader
            title={`${rows.length} ${rows.length === 1 ? 'artifact' : 'artifacts'}`}
            hint="Each row states its own outcome in a sentence. Unticking an artifact removes it from the preservation plan and from the deadline arithmetic — its outcome is still computed and still shown, so nothing disappears quietly."
          />
          <ul>
            {rows.map((o) => (
              <ArtifactRow
                key={o.artifact_id}
                outcome={o}
                included={selections.get(o.artifact_id)?.included !== false}
                recommended={result.recommended_outcomes.find((r) => r.artifact_id === o.artifact_id)}
                onSelect={() => onSelectArtifact(o.artifact_id)}
                onToggle={(v) => onSetIncluded(o.artifact_id, v)}
              />
            ))}
          </ul>
        </Panel>
      )}
    </div>
  )
}

function ArtifactRow({
  outcome,
  included,
  recommended,
  onSelect,
  onToggle,
}: {
  outcome: ArtifactOutcome
  included: boolean
  recommended: ArtifactOutcome | undefined
  onSelect: () => void
  onToggle: (v: boolean) => void
}) {
  const better = recommended !== undefined && recommended.outcome !== outcome.outcome
  return (
    <li className="border-b border-line-1 last:border-0">
      <div
        className={cx(
          'flex items-start gap-3 px-5 py-3.5 transition-colors duration-140 hover:bg-surface-2',
          !included && 'opacity-55',
        )}
      >
        <input
          type="checkbox"
          checked={included}
          onChange={(e) => onToggle(e.target.checked)}
          aria-label={`Include ${outcome.name} in the preservation plan`}
          className={cx('mt-1 h-3.5 w-3.5 shrink-0 accent-[rgb(var(--accent))]', FOCUS)}
        />
        <button type="button" onClick={onSelect} className={cx('min-w-0 flex-1 text-left', FOCUS)}>
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-ink-0">{outcome.name}</span>
            <OutcomeBadge outcome={outcome.outcome} />
            <PriorityBadge priority={outcome.priority} />
            <ConfidenceMeter confidence={outcome.confidence} />
          </span>
          <span className="mt-1.5 flex items-center gap-2">
            <TierTag tier={outcome.tier} />
          </span>
          <p className="mt-1.5 max-w-[84ch] text-xs leading-relaxed text-ink-2">
            {outcome.explanation}
          </p>
          {better ? (
            <p className="mt-1.5 text-xs text-accent">
              Under the recommended sequence: {OUTCOME_LABEL[recommended.outcome].toLowerCase()}.
            </p>
          ) : null}
        </button>
      </div>
    </li>
  )
}

/** Exported so the palette can reuse the tier label map without a new import. */
export { TIER_LABEL }
