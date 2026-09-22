/**
 * The shell.
 *
 * A rail of views on the left, a header carrying the asset and the clock, and
 * the active view. The rail groups views by what they answer rather than
 * alphabetically, and every view's subtitle is the question it exists to
 * answer — which is the cheapest way to keep a dense technical interface
 * navigable without a manual.
 *
 * The analysis is recomputed on every render from `analyse(plan, now)`. `now`
 * is captured once when the app mounts and then held, so a decision record
 * created two minutes apart from another is timestamped differently but the
 * feasibility arithmetic — which is measured from the plan's own start, not
 * the wall clock — never moves under the reader.
 */

import { useCallback, useEffect, useMemo, useReducer, useState } from 'react'
import {
  DEFAULT_FILTERS,
  VIEWS,
  VIEW_BY_ID,
  filtersActive,
  initialState,
  reduce,
  type ViewId,
  type ViewSpec,
} from './state.ts'
import { analyse } from './engine/analyze.ts'
import { formatClock, formatDuration } from './domain/time.ts'
import { ASSET_TYPE_LABEL } from './domain/semantics.ts'
import { SCENARIOS } from './data/scenarios.ts'
import { FEASIBILITY_STYLE, FOCUS, OUTCOME_STYLE } from './ui/tokens.ts'
import { Button, FeasibilityBadge, cx } from './ui/primitives.tsx'
import { ErrorBoundary } from './ui/ErrorBoundary.tsx'
import { CommandPalette, type Command } from './ui/CommandPalette.tsx'
import { ArtifactDrawer, StepDrawer } from './ui/drawers.tsx'
import { CommandCenter } from './views/CommandCenter.tsx'
import { PlanView } from './views/PlanView.tsx'
import { EvidenceMap } from './views/EvidenceMap.tsx'
import { SequenceView } from './views/SequenceView.tsx'
import { TimelineView } from './views/TimelineView.tsx'
import { ConflictCenter } from './views/ConflictCenter.tsx'
import { LossesView } from './views/LossesView.tsx'
import { ReportView } from './views/ReportView.tsx'
import { CatalogueView } from './views/CatalogueView.tsx'

/* -------------------------------------------------------------------------- */
/* Theme                                                                      */
/* -------------------------------------------------------------------------- */

type Theme = 'dark' | 'light'

function currentTheme(): Theme {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'
}

/* -------------------------------------------------------------------------- */
/* Rail                                                                       */
/* -------------------------------------------------------------------------- */

const GROUPS: readonly ViewSpec['group'][] = ['Situation', 'The plan', 'Decisions', 'Output']

function Rail({
  view,
  counts,
  onSelect,
}: {
  view: ViewId
  counts: Partial<Record<ViewId, { value: number; tone: string }>>
  onSelect: (v: ViewId) => void
}) {
  return (
    <nav aria-label="Views" className="space-y-5">
      {GROUPS.map((group) => (
        <div key={group}>
          <p className="mb-1.5 px-3 text-2xs font-medium uppercase tracking-[0.12em] text-ink-3">
            {group}
          </p>
          <ul>
            {VIEWS.filter((v) => v.group === group).map((v) => {
              const active = view === v.id
              const badge = counts[v.id]
              return (
                <li key={v.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(v.id)}
                    aria-current={active ? 'page' : undefined}
                    className={cx(
                      'flex w-full items-center gap-2 rounded px-3 py-1.5 text-left text-sm transition-colors duration-140',
                      active
                        ? 'bg-surface-3 font-medium text-ink-0'
                        : 'text-ink-2 hover:bg-surface-2 hover:text-ink-0',
                      FOCUS,
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cx(
                        'h-3.5 w-0.5 shrink-0 rounded-sm transition-colors duration-140',
                        active ? 'bg-accent' : 'bg-transparent',
                      )}
                    />
                    <span className="min-w-0 flex-1 truncate">{v.label}</span>
                    {badge && badge.value > 0 ? (
                      <span className={cx('tnum shrink-0 font-mono text-2xs', badge.tone)}>
                        {badge.value}
                      </span>
                    ) : null}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}

/* -------------------------------------------------------------------------- */
/* App                                                                        */
/* -------------------------------------------------------------------------- */

export default function App() {
  const [state, dispatch] = useReducer(reduce, undefined, initialState)
  const [theme, setThemeState] = useState<Theme>(currentTheme)
  const [railOpen, setRailOpen] = useState(false)

  /**
   * One instant for the whole session.
   *
   * Captured on mount and never refreshed. Every screen and every generated
   * record therefore agrees about "now", and the report a reader downloads
   * says the same thing the screen did — which a ticking clock would quietly
   * break.
   */
  const [now] = useState(() => new Date().toISOString())

  const result = useMemo(() => analyse(state.plan, now), [state.plan, now])
  const spec = VIEW_BY_ID.get(state.view) ?? VIEWS[0]!

  const setTheme = useCallback((t: Theme): void => {
    document.documentElement.setAttribute('data-theme', t)
    try {
      localStorage.setItem('tourniquet-theme', t)
    } catch {
      // A browser with storage disabled still gets the theme for this session.
    }
    setThemeState(t)
  }, [])

  const navigate = useCallback((v: ViewId): void => {
    dispatch({ type: 'view', view: v })
    setRailOpen(false)
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [])

  /* ---- keyboard ---------------------------------------------------- */

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        dispatch({ type: 'palette', open: true })
        return
      }
      // A bare "/" focuses search only when the reader is not already typing.
      const t = e.target
      const typing =
        t instanceof HTMLInputElement ||
        t instanceof HTMLTextAreaElement ||
        t instanceof HTMLSelectElement
      if (!typing && e.key === '/') {
        e.preventDefault()
        dispatch({ type: 'palette', open: true })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  /* ---- commands ----------------------------------------------------- */

  const commands: readonly Command[] = useMemo(() => {
    const out: Command[] = VIEWS.map((v) => ({
      id: `view:${v.id}`,
      label: `Go to ${v.label}`,
      hint: v.question.slice(0, 64),
      group: 'Go to',
      run: () => navigate(v.id),
    }))

    out.push(
      {
        id: 'cmd:adopt',
        label: 'Adopt the recommended preservation sequence',
        hint: result.sequence.matches_plan_order ? 'already in that order' : 'reorders the plan',
        group: 'Commands',
        run: () => {
          dispatch({ type: 'adopt-sequence', order: result.sequence.order })
          navigate('sequence')
        },
      },
      {
        id: 'cmd:destructive',
        label: 'Show the destructive steps',
        hint: `${result.footprints.filter((f) => f.destroys.length > 0).length} of ${result.footprints.length}`,
        group: 'Commands',
        run: () => {
          const first = result.footprints.find((f) => f.destroys.length > 0)
          if (first) dispatch({ type: 'select-step', id: first.step_id })
          navigate('plan')
        },
      },
      {
        id: 'cmd:conflicts',
        label: 'Show conflicts',
        hint: `${result.conflicts.length}`,
        group: 'Commands',
        run: () => navigate('conflicts'),
      },
      {
        id: 'cmd:losses',
        label: 'Record an accepted loss',
        group: 'Commands',
        run: () => navigate('losses'),
      },
      {
        id: 'cmd:report',
        label: 'Generate the report',
        group: 'Commands',
        run: () => navigate('report'),
      },
      {
        id: 'cmd:boundary-start',
        label: 'Move the loss boundary to the start',
        group: 'Commands',
        run: () => {
          dispatch({ type: 'boundary', index: 0 })
          navigate('command')
        },
      },
      {
        id: 'cmd:boundary-end',
        label: 'Move the loss boundary to the end',
        group: 'Commands',
        run: () => {
          dispatch({ type: 'boundary', index: result.plan.steps.length })
          navigate('command')
        },
      },
      {
        id: 'cmd:theme',
        label: `Switch to the ${theme === 'dark' ? 'light' : 'dark'} theme`,
        group: 'Commands',
        run: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
      },
      {
        id: 'cmd:reset',
        label: 'Reset to the first demonstration scenario',
        group: 'Commands',
        run: () => dispatch({ type: 'scenario', id: SCENARIOS[0]!.id }),
      },
    )

    for (const s of SCENARIOS) {
      out.push({
        id: `scenario:${s.id}`,
        label: `Load ${s.label}`,
        hint: ASSET_TYPE_LABEL[s.plan.asset.type],
        group: 'Scenarios',
        run: () => {
          dispatch({ type: 'scenario', id: s.id })
          navigate('command')
        },
      })
    }

    return out
  }, [result, navigate, theme, setTheme])

  /* ---- rail badges --------------------------------------------------- */

  const railCounts = useMemo(
    () => ({
      conflicts: { value: result.conflicts.length, tone: OUTCOME_STYLE.lost.text },
      losses: {
        value: result.plan.accepted_losses.length,
        tone: OUTCOME_STYLE.accepted_loss.text,
      },
      evidence: {
        value: result.summary.outcomes.lost + result.summary.outcomes.indeterminate,
        tone: OUTCOME_STYLE.lost.text,
      },
      plan: {
        value: result.sequence.matches_plan_order ? 0 : 1,
        tone: OUTCOME_STYLE.degraded.text,
      },
    }),
    [result],
  )

  /* ---- body ---------------------------------------------------------- */

  const body = ((): React.ReactNode => {
    switch (state.view) {
      case 'command':
        return (
          <CommandCenter
            result={result}
            boundary={state.boundary}
            onBoundary={(i) => dispatch({ type: 'boundary', index: i })}
            onSelectArtifact={(id) => dispatch({ type: 'select-artifact', id })}
            onSelectStep={(id) => dispatch({ type: 'select-step', id })}
            onSelectConflict={(id) => dispatch({ type: 'select-conflict', id })}
            onFilterOutcome={(outcome) => dispatch({ type: 'filter-outcome', outcome })}
            activeOutcomes={state.filters.outcomes}
            onNavigate={navigate}
          />
        )
      case 'plan':
        return (
          <PlanView
            result={result}
            pendingOverride={state.pendingOverride}
            onMove={(step_id, direction) =>
              dispatch({ type: 'move-step', step_id, direction, recommended: result.sequence.order })
            }
            onRemove={(step_id) => dispatch({ type: 'remove-step', step_id })}
            onAdd={(action_id) => dispatch({ type: 'add-step', action_id })}
            onRetime={(step_id, minutes) => dispatch({ type: 'set-step-minutes', step_id, minutes })}
            onAdopt={(order) => dispatch({ type: 'adopt-sequence', order })}
            onRecordOverride={(override) => dispatch({ type: 'record-override', override })}
            onDismissOverride={() => dispatch({ type: 'dismiss-override' })}
            onRemoveOverride={(id) => dispatch({ type: 'remove-override', override_id: id })}
            onSelectStep={(id) => dispatch({ type: 'select-step', id })}
            onSetBuffer={(m) => dispatch({ type: 'set-buffer', minutes: m })}
            onSetVerification={(m) => dispatch({ type: 'set-verification', minutes: m })}
            onNavigate={navigate}
          />
        )
      case 'evidence':
        return (
          <EvidenceMap
            result={result}
            filters={state.filters}
            onFilterOutcome={(outcome) => dispatch({ type: 'filter-outcome', outcome })}
            onFilterVolatility={(band) => dispatch({ type: 'filter-volatility', band })}
            onResetFilters={() => dispatch({ type: 'reset-filters' })}
            onSelectArtifact={(id) => dispatch({ type: 'select-artifact', id })}
            onSelectStep={(id) => dispatch({ type: 'select-step', id })}
            onSetIncluded={(artifact_id, included) =>
              dispatch({ type: 'set-included', artifact_id, included })
            }
          />
        )
      case 'sequence':
        return (
          <SequenceView
            result={result}
            onAdopt={(order) => dispatch({ type: 'adopt-sequence', order })}
            onSelectStep={(id) => dispatch({ type: 'select-step', id })}
            onSelectArtifact={(id) => dispatch({ type: 'select-artifact', id })}
            onNavigate={navigate}
          />
        )
      case 'timeline':
        return (
          <TimelineView result={result} onSelectStep={(id) => dispatch({ type: 'select-step', id })} />
        )
      case 'conflicts':
        return (
          <ConflictCenter
            result={result}
            selected={state.selectedConflict}
            onSelect={(id) => dispatch({ type: 'select-conflict', id })}
            onSelectArtifact={(id) => dispatch({ type: 'select-artifact', id })}
            onAdopt={(order) => dispatch({ type: 'adopt-sequence', order })}
            onNavigate={navigate}
          />
        )
      case 'losses':
        return (
          <LossesView
            result={result}
            onAdd={(loss) => dispatch({ type: 'add-loss', loss })}
            onRemove={(id) => dispatch({ type: 'remove-loss', loss_id: id })}
            onSelectArtifact={(id) => dispatch({ type: 'select-artifact', id })}
          />
        )
      case 'report':
        return <ReportView result={result} />
      case 'catalogue':
        return (
          <CatalogueView
            result={result}
            source={state.source}
            loadError={state.loadError}
            onLoadJson={(text) => dispatch({ type: 'load-json', text })}
            onDismissError={() => dispatch({ type: 'dismiss-load-error' })}
            onScenario={(id) => dispatch({ type: 'scenario', id })}
            onSelectArtifact={(id) => dispatch({ type: 'select-artifact', id })}
          />
        )
    }
  })()

  const fStyle = FEASIBILITY_STYLE[result.feasibility.status]
  const scenario = SCENARIOS.find((s) => s.id === state.source)

  return (
    <div className="min-h-screen">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[70] focus:rounded focus:bg-surface-2 focus:px-3 focus:py-2 focus:text-sm focus:text-ink-0"
      >
        Skip to the analysis
      </a>

      {/* ---- header ------------------------------------------------------ */}
      <header className="sticky top-0 z-30 border-b border-line-1 bg-surface-0/95 backdrop-blur">
        <div className="mx-auto flex max-w-[110rem] flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:gap-6 lg:px-6">
          <div className="flex items-center gap-3">
            <Button
              variant="quiet"
              size="sm"
              className="lg:hidden"
              onClick={() => setRailOpen((v) => !v)}
              ariaLabel={railOpen ? 'Hide the view list' : 'Show the view list'}
            >
              <span aria-hidden="true">{railOpen ? '✕' : '≡'}</span>
            </Button>
            <div className="min-w-0">
              <p className="font-display text-sm font-semibold uppercase tracking-[0.22em] text-accent">
                Tourniquet
              </p>
              <p className="truncate text-2xs text-ink-3">
                Fix the vulnerability without destroying the evidence.
              </p>
            </div>
          </div>

          <div className="hidden min-w-0 flex-1 border-l border-line-1 pl-6 lg:block">
            <p className="ident truncate text-sm text-ink-1" title={result.plan.asset.name}>
              {result.plan.asset.name}
            </p>
            <p className="truncate text-2xs text-ink-3">
              {ASSET_TYPE_LABEL[result.plan.asset.type]} {'·'} {result.summary.step_count} steps{' '}
              {'·'} {result.summary.artifact_count} artifacts {'·'}{' '}
              {result.summary.outcomes.lost + result.summary.outcomes.accepted_loss} lost,{' '}
              {result.summary.outcomes.indeterminate} undetermined
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-2xs uppercase tracking-[0.08em] text-ink-3">Window</p>
              <p
                className={cx(
                  'tnum font-mono text-sm leading-tight',
                  result.feasibility.available_minutes <= 0 ? 'text-lost' : 'text-ink-0',
                )}
              >
                {formatClock(Math.max(0, result.feasibility.available_minutes))}
              </p>
            </div>
            <span className={cx('hidden h-8 w-px bg-line-1 sm:block')} />
            <FeasibilityBadge status={result.feasibility.status} />
            <Button
              size="sm"
              onClick={() => dispatch({ type: 'palette', open: true })}
              ariaLabel="Open the command palette"
            >
              <span className="hidden sm:inline">Commands</span>
              <kbd className="rounded border border-line-2 bg-surface-1 px-1 font-mono text-2xs text-ink-3">
                {'⌘'}K
              </kbd>
            </Button>
            <Button
              size="sm"
              variant="quiet"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              ariaLabel={`Switch to the ${theme === 'dark' ? 'light' : 'dark'} theme`}
            >
              <span aria-hidden="true">{theme === 'dark' ? '◑' : '◐'}</span>
            </Button>
          </div>
        </div>
      </header>

      {/* On a narrow viewport the rail stacks above the content in normal
          flow rather than floating over it. A fixed overlay has to know the
          height of the header to offset itself, and the header is two rows
          tall on a phone and one on a laptop. */}
      <div className="mx-auto flex max-w-[110rem] flex-col gap-6 px-4 py-5 lg:flex-row lg:px-6">
        <aside
          className={cx(
            'shrink-0 lg:block lg:w-56',
            railOpen ? 'animate-fade-in border-b border-line-1 pb-5 lg:border-0 lg:pb-0' : 'hidden',
          )}
        >
          <div className="lg:sticky lg:top-[5.5rem]">
            <Rail view={state.view} counts={railCounts} onSelect={navigate} />

            <div className="mt-6 space-y-2 border-t border-line-1 px-3 pt-4">
              <p className="text-2xs leading-relaxed text-ink-3">
                {scenario
                  ? `Demonstration: ${scenario.label}. Synthetic data; no real incident is reproduced.`
                  : 'Your own plan. Analysed in this page; nothing was uploaded.'}
              </p>
              <p className="text-2xs leading-relaxed text-ink-3">
                {formatDuration(result.feasibility.total_minutes)} of work against a{' '}
                {formatDuration(result.feasibility.available_minutes)} window.
              </p>
              {!scenario ? (
                <Button
                  size="sm"
                  variant="quiet"
                  onClick={() => dispatch({ type: 'scenario', id: SCENARIOS[0]!.id })}
                >
                  Reset to the demo
                </Button>
              ) : null}
            </div>
          </div>
        </aside>

        {/* ---- main ---------------------------------------------------- */}
        <main id="main" className="min-w-0 flex-1">
          <div className="mb-5">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h1 className="font-display text-2xl font-medium leading-tight tracking-[-0.02em] text-ink-0">
                {spec.label}
              </h1>
              {state.view === 'command' ? (
                <span className={cx('text-sm', fStyle.text)}>
                  {fStyle.short.toLowerCase()}
                </span>
              ) : null}
            </div>
            <p className="mt-1.5 max-w-[88ch] text-sm leading-relaxed text-ink-2">
              {spec.question}
            </p>
            {filtersActive(state.filters) && state.view === 'evidence' ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-2xs uppercase tracking-[0.1em] text-ink-3">Filtered</span>
                <Button size="sm" variant="quiet" onClick={() => dispatch({ type: 'reset-filters' })}>
                  Clear
                </Button>
              </div>
            ) : null}
          </div>

          <ErrorBoundary
            key={state.view}
            label={spec.label}
            onReset={() => dispatch({ type: 'scenario', id: SCENARIOS[0]!.id })}
          >
            {body}
          </ErrorBoundary>

          <footer className="mt-10 border-t border-line-1 pt-5">
            <p className="max-w-[92ch] text-2xs leading-relaxed text-ink-3">
              TOURNIQUET plans the order in which evidence should be preserved around a
              remediation you have already decided on. It does not scan, prioritise, acquire,
              patch or execute anything, and it has no connection to any system — the analysis
              runs in this page. The remediation tier and deadline are inputs it consumes, not
              judgements it makes. The action-to-evidence mappings are a synthetic library
              written for this tool: they describe how these platforms generally behave and are
              not vendor statements about your build. Analysis contract{' '}
              {result.analysis_version}.
            </p>
          </footer>
        </main>
      </div>

      {/* ---- overlays ----------------------------------------------------- */}
      {state.selectedArtifact ? (
        <ArtifactDrawer
          result={result}
          artifactId={state.selectedArtifact}
          onClose={() => dispatch({ type: 'select-artifact', id: null })}
          onSelectStep={(id) => {
            dispatch({ type: 'select-artifact', id: null })
            dispatch({ type: 'select-step', id })
          }}
        />
      ) : null}

      {state.selectedStep ? (
        <StepDrawer
          result={result}
          stepId={state.selectedStep}
          onClose={() => dispatch({ type: 'select-step', id: null })}
          onSelectArtifact={(id) => {
            dispatch({ type: 'select-step', id: null })
            dispatch({ type: 'select-artifact', id })
          }}
        />
      ) : null}

      {/* Mounted only while open, so the palette's query and cursor reset by
          unmounting rather than by an effect. */}
      {state.paletteOpen ? (
        <CommandPalette
          result={result}
          commands={commands}
          onClose={() => dispatch({ type: 'palette', open: false })}
          onSelectArtifact={(id) => dispatch({ type: 'select-artifact', id })}
          onSelectStep={(id) => dispatch({ type: 'select-step', id })}
        />
      ) : null}
    </div>
  )
}

/** Re-exported for the error boundary's fallback shell. */
export { DEFAULT_FILTERS }
