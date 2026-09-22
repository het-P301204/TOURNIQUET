/**
 * Catalogue and data.
 *
 * The two things that do not fit anywhere else: the reference material the
 * analysis is built on, and the door in and out for your own plans.
 *
 * The catalogue is shown in full rather than summarised because the mappings
 * are the opinionated part of this tool. A reader who disagrees with one
 * should be able to find it, read the rationale and see the confidence — and
 * then go and change it in `src/data/actions.ts`, which is the honest answer
 * to "can I edit these".
 */

import { useMemo, useState } from 'react'
import type { AnalysisResult, EvidenceArtifact, RemediationAction } from '../domain/types.ts'
import {
  ACTION_CATEGORY_LABEL,
  ASSET_TYPE_LABEL,
  CONFIDENCE_TEXT,
  DESTRUCTIVE_TEXT,
  IMPACT_LABEL,
  PRIORITY_LABEL,
} from '../domain/semantics.ts'
import { CLASS_LABEL, TIER_CLASS, TIER_DECAY, TIER_LABEL, VOLATILITY_ORDER } from '../domain/volatility.ts'
import { formatDuration } from '../domain/time.ts'
import { SCENARIOS } from '../data/scenarios.ts'
import { FOCUS, IMPACT_STYLE, LABEL, PANEL_INSET } from '../ui/tokens.ts'
import {
  Button,
  Callout,
  ConfidenceMeter,
  DestructiveBadge,
  Disclosure,
  Field,
  Panel,
  PanelHeader,
  PriorityBadge,
  TextArea,
  cx,
} from '../ui/primitives.tsx'

export function CatalogueView({
  result,
  source,
  loadError,
  onLoadJson,
  onDismissError,
  onScenario,
  onSelectArtifact,
}: {
  result: AnalysisResult
  source: string
  loadError: string | null
  onLoadJson: (text: string) => void
  onDismissError: () => void
  onScenario: (id: string) => void
  onSelectArtifact: (id: string) => void
}) {
  const [pasted, setPasted] = useState('')

  const grouped = useMemo(
    () =>
      VOLATILITY_ORDER.map((tier) => ({
        tier,
        artifacts: result.artifacts.filter((a) => a.tier === tier),
      })).filter((g) => g.artifacts.length > 0),
    [result.artifacts],
  )

  const exportPlan = (): void => {
    const blob = new Blob([JSON.stringify(result.plan, null, 2)], {
      type: 'application/json;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `tourniquet-plan-${result.plan.plan_id}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-5">
      {/* ---- scenarios ---------------------------------------------------- */}
      <Panel>
        <PanelHeader
          title="Demonstration scenarios"
          hint="All synthetic. The hostnames, vulnerabilities, people and timestamps are invented; no vendor advisory, CVE record or real incident is reproduced. Each is built around one thing that is hard to see without the tool."
        />
        <ul className="grid gap-px bg-line-1 sm:grid-cols-2">
          {SCENARIOS.map((s) => {
            const active = source === s.id
            return (
              <li key={s.id} className="bg-surface-1">
                <button
                  type="button"
                  onClick={() => onScenario(s.id)}
                  aria-current={active ? 'true' : undefined}
                  className={cx(
                    'h-full w-full px-5 py-4 text-left transition-colors duration-140 hover:bg-surface-2',
                    active && 'bg-surface-2',
                    FOCUS,
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className={cx(
                        'h-1.5 w-1.5 shrink-0 rounded-full',
                        active ? 'bg-accent' : 'bg-line-3',
                      )}
                    />
                    <span className="text-sm font-medium text-ink-0">{s.label}</span>
                  </span>
                  <span className="mt-1.5 block max-w-[64ch] text-xs leading-relaxed text-ink-2">
                    {s.teaches}
                  </span>
                  <span className="mt-2 block text-2xs text-ink-3">
                    {ASSET_TYPE_LABEL[s.plan.asset.type]} · {s.plan.steps.length} steps ·{' '}
                    {s.plan.tier.label}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
        {source === 'custom' ? (
          <div className="border-t border-line-1 px-5 py-3">
            <p className="text-xs text-ink-3">
              You are looking at a plan you have edited or loaded. Choosing a scenario above
              replaces it.
            </p>
          </div>
        ) : null}
      </Panel>

      {/* ---- load and export ----------------------------------------------- */}
      <Panel>
        <PanelHeader
          title="Your own plan"
          hint="Analysed in this page. Nothing is uploaded and nothing is stored: reload the tab and it is gone."
          right={
            <Button size="sm" onClick={exportPlan}>
              Export this plan as JSON
            </Button>
          }
        />
        <div className="space-y-4 px-5 py-4">
          {loadError ? (
            <Callout tone="bad" title="That plan could not be loaded">
              <p>{loadError}</p>
              <Button size="sm" variant="quiet" className="mt-2" onClick={onDismissError}>
                Dismiss
              </Button>
            </Callout>
          ) : null}

          <Field
            label="Paste a plan, or a report export"
            hint="Either shape works: a bare plan object, or the JSON report, which has the plan nested inside it. A step naming an action the library does not know is kept, not rejected — the engine represents it as an uncharacterised step, which is more useful than refusing the file."
          >
            {(id) => (
              <TextArea
                id={id}
                value={pasted}
                onChange={setPasted}
                rows={6}
                placeholder='{ "asset": { "name": "…", "type": "linux_server" }, "deadline": { … }, "steps": [ … ] }'
              />
            )}
          </Field>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              disabled={pasted.trim() === ''}
              onClick={() => onLoadJson(pasted)}
            >
              Analyse it
            </Button>
            <Button variant="quiet" disabled={pasted === ''} onClick={() => setPasted('')}>
              Clear
            </Button>
          </div>
        </div>
      </Panel>

      {/* ---- the evidence catalogue --------------------------------------- */}
      <Panel>
        <PanelHeader
          title={`Evidence catalogue — ${result.artifacts.length} artifacts in scope`}
          hint={`Scoped to ${ASSET_TYPE_LABEL[result.plan.asset.type].toLowerCase()}. Artifacts that do not apply to this asset type are not offered and are not counted as lost. Ordered by the volatility ladder: rank one decays fastest.`}
        />
        <div>
          {grouped.map((g) => (
            <Disclosure
              key={g.tier}
              count={g.artifacts.length}
              summary={
                <span className="flex flex-wrap items-baseline gap-2">
                  <span className="tnum rounded-sm border border-line-2 bg-surface-2 px-1 font-mono text-2xs text-ink-2">
                    {VOLATILITY_ORDER.indexOf(g.tier) + 1}
                  </span>
                  <span className="font-medium text-ink-0">{TIER_LABEL[g.tier]}</span>
                  <span className={LABEL}>{CLASS_LABEL[TIER_CLASS[g.tier]]}</span>
                  <span className="text-xs text-ink-3">{TIER_DECAY[g.tier]}</span>
                </span>
              }
            >
              <ul className="space-y-2.5">
                {g.artifacts.map((a) => (
                  <ArtifactCard key={a.artifact_id} artifact={a} onSelect={onSelectArtifact} />
                ))}
              </ul>
            </Disclosure>
          ))}
        </div>
      </Panel>

      {/* ---- the action library -------------------------------------------- */}
      <Panel>
        <PanelHeader
          title={`Action library — ${result.actions.length} actions in scope`}
          hint="The opinionated part of this tool. Each action states what it does to the artifacts it names, and — in `default_effect` — what it does to everything it does not. That last field is what separates a bounded action from a black box."
        />
        <div>
          {[...result.actions]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((a) => (
              <Disclosure
                key={a.action_id}
                count={a.effects.length}
                summary={
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-ink-0">{a.name}</span>
                    <DestructiveBadge level={a.destructive_level} />
                    <span className={LABEL}>{ACTION_CATEGORY_LABEL[a.category]}</span>
                    <span className="tnum text-2xs text-ink-3">
                      {formatDuration(a.estimated_minutes)}
                    </span>
                  </span>
                }
              >
                <ActionDetail action={a} />
              </Disclosure>
            ))}
        </div>
      </Panel>

      {/* ---- how to change it ---------------------------------------------- */}
      <Panel>
        <PanelHeader title="Editing the catalogue" />
        <div className="space-y-3 px-5 py-4 text-sm leading-relaxed text-ink-2">
          <p className="max-w-[84ch]">
            The catalogue and the library are plain TypeScript data in{' '}
            <code className="font-mono text-xs text-ink-1">src/data/evidence.ts</code> and{' '}
            <code className="font-mono text-xs text-ink-1">src/data/actions.ts</code>. Adding an
            artifact, changing a duration or correcting a mapping is an edit to one of those
            files — there is no hidden model and no configuration layer.
          </p>
          <p className="max-w-[84ch]">
            The test suite checks the result is internally coherent: every tag an action targets
            exists on some artifact, every capture names a real artifact, every declared
            destructive level agrees with the rules underneath it, and no asset type is offered an
            artifact it has no way to collect. What it cannot check is whether a mapping is true
            of your build.
          </p>
        </div>
      </Panel>
    </div>
  )
}

function ArtifactCard({
  artifact,
  onSelect,
}: {
  artifact: EvidenceArtifact
  onSelect: (id: string) => void
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(artifact.artifact_id)}
        className={cx(
          PANEL_INSET,
          'w-full px-4 py-3 text-left transition-colors duration-140 hover:bg-surface-2',
          FOCUS,
        )}
      >
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-ink-0">{artifact.name}</span>
          <PriorityBadge priority={artifact.default_priority} />
          <ConfidenceMeter confidence={artifact.confidence} />
        </span>
        <p className="mt-1.5 max-w-[84ch] text-xs leading-relaxed text-ink-2">
          {artifact.description}
        </p>
        <p className="mt-1.5 max-w-[84ch] text-xs leading-relaxed text-ink-1">
          <span className={LABEL}>Answers </span>
          {artifact.answers}
        </p>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-ink-3">
          <span>{artifact.collection.label}</span>
          <span className="tnum">{formatDuration(artifact.collection.estimated_minutes)}</span>
          {artifact.collection.requires_live_host ? (
            <span className="text-degraded">needs a live host</span>
          ) : null}
          <span className="ident font-mono">{artifact.artifact_id}</span>
        </p>
        {artifact.collection.observer_effect ? (
          <p className="mt-1.5 max-w-[84ch] text-2xs leading-relaxed text-degraded">
            Cost of collecting: {artifact.collection.observer_effect}
          </p>
        ) : null}
        {artifact.notes ? (
          <p className="mt-1.5 max-w-[84ch] text-2xs leading-relaxed text-ink-3">
            {artifact.notes}
          </p>
        ) : null}
      </button>
    </li>
  )
}

function ActionDetail({ action }: { action: RemediationAction }) {
  return (
    <div className="space-y-3">
      <p className="max-w-[84ch] text-sm leading-relaxed text-ink-2">{action.description}</p>

      <div className={cx(PANEL_INSET, 'px-4 py-3')}>
        <p className="flex flex-wrap items-center gap-2">
          <span className={LABEL}>Default effect</span>
          <span
            className={cx(
              'rounded border px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-[0.08em]',
              IMPACT_STYLE[action.default_effect.impact].text,
              IMPACT_STYLE[action.default_effect.impact].border,
              IMPACT_STYLE[action.default_effect.impact].wash,
            )}
          >
            {IMPACT_LABEL[action.default_effect.impact]}
          </span>
          <ConfidenceMeter confidence={action.default_effect.confidence} />
        </p>
        <p className="mt-1.5 max-w-[84ch] text-xs leading-relaxed text-ink-2">
          {action.default_effect.rationale}
        </p>
      </div>

      {action.effects.length > 0 ? (
        <div>
          <p className={cx(LABEL, 'mb-2')}>
            {action.effects.length} explicit {action.effects.length === 1 ? 'rule' : 'rules'}
          </p>
          <ul className="space-y-1.5">
            {action.effects.map((e, i) => (
              <li key={i} className="flex items-baseline gap-2.5 text-xs leading-relaxed">
                <span
                  aria-hidden="true"
                  className={cx('shrink-0', IMPACT_STYLE[e.impact].text)}
                  title={IMPACT_LABEL[e.impact]}
                >
                  {IMPACT_STYLE[e.impact].glyph}
                </span>
                <span className="min-w-0">
                  <span className="ident font-mono text-ink-1">
                    {e.target.kind === 'artifact'
                      ? e.target.artifact_id
                      : e.target.kind === 'tag'
                        ? `#${e.target.tag}`
                        : `tier:${e.target.tier}`}
                  </span>
                  <span className="text-ink-3"> — {IMPACT_LABEL[e.impact].toLowerCase()}, </span>
                  <span className="text-ink-3">{e.confidence} confidence. </span>
                  <span className="text-ink-2">{e.rationale}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {action.captures.length > 0 ? (
        <p className="text-xs text-ink-2">
          <span className={LABEL}>Acquires </span>
          <span className="ident font-mono">{action.captures.join(', ')}</span>
        </p>
      ) : null}

      <dl className="grid gap-x-6 gap-y-1.5 text-xs sm:grid-cols-2">
        <div className="flex gap-2">
          <dt className={LABEL}>Reversible</dt>
          <dd className="text-ink-2">
            {action.reversible === 'unknown' ? 'Unknown' : action.reversible ? 'Yes' : 'No'}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className={LABEL}>Level</dt>
          <dd className="text-ink-2">{DESTRUCTIVE_TEXT[action.destructive_level]}</dd>
        </div>
        <div className="flex gap-2">
          <dt className={LABEL}>Confidence</dt>
          <dd className="text-ink-2">{CONFIDENCE_TEXT[action.confidence]}</dd>
        </div>
        <div className="flex gap-2">
          <dt className={LABEL}>Id</dt>
          <dd className="ident font-mono text-ink-2">{action.action_id}</dd>
        </div>
      </dl>

      {action.reference ? (
        <p className="max-w-[84ch] text-2xs leading-relaxed text-ink-3">
          <span className={LABEL}>Source </span>
          {action.reference}
        </p>
      ) : null}
      {action.notes ? (
        <p className="max-w-[84ch] text-2xs leading-relaxed text-ink-3">{action.notes}</p>
      ) : null}
    </div>
  )
}

/** Re-exported for the palette's priority labels. */
export { PRIORITY_LABEL }
