/**
 * The command palette.
 *
 * Two kinds of entry share one list: commands, which do something, and
 * search results, which take you to a thing. Keeping them together means a
 * reader who types "memory" gets both "show destructive actions" and the
 * memory artifact itself, and does not have to know which of the two they
 * wanted before they started typing.
 *
 * Matching is a plain substring over a prepared haystack — no fuzzy scoring.
 * Fuzzy matching over a hundred entries produces confident nonsense for a
 * two-character query, and the entries here are short enough that substring
 * matching finds everything it should.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { AnalysisResult } from '../domain/types.ts'
import { OUTCOME_LABEL, ACTION_CATEGORY_LABEL } from '../domain/semantics.ts'
import { TIER_LABEL } from '../domain/volatility.ts'
import { FOCUS, OUTCOME_STYLE } from './tokens.ts'
import { cx } from './primitives.tsx'

export interface Command {
  readonly id: string
  readonly label: string
  readonly hint?: string
  readonly group: string
  readonly run: () => void
}

interface Entry extends Command {
  readonly haystack: string
}

export function CommandPalette({
  result,
  commands,
  onClose,
  onSelectArtifact,
  onSelectStep,
}: {
  result: AnalysisResult
  commands: readonly Command[]
  onClose: () => void
  onSelectArtifact: (id: string) => void
  onSelectStep: (id: string) => void
}) {
  const [query, setQuery] = useState('')
  // The cursor is derived from the query rather than reset by an effect: a
  // new query means a new result list, and a cursor pointing into the old one
  // is not state worth keeping. `lastQuery` is the render-time reset that an
  // effect would otherwise do a frame late, after a cascading re-render.
  const [cursor, setCursor] = useState(0)
  const [lastQuery, setLastQuery] = useState(query)
  if (lastQuery !== query) {
    setLastQuery(query)
    setCursor(0)
  }
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const entries: readonly Entry[] = useMemo(() => {
    const out: Entry[] = commands.map((c) => ({
      ...c,
      haystack: `${c.label} ${c.hint ?? ''} ${c.group}`.toLowerCase(),
    }))

    for (const o of result.outcomes) {
      out.push({
        id: `artifact:${o.artifact_id}`,
        label: o.name,
        hint: `${TIER_LABEL[o.tier]} · ${OUTCOME_LABEL[o.outcome]}`,
        group: 'Evidence',
        run: () => onSelectArtifact(o.artifact_id),
        haystack: `${o.name} ${o.artifact_id} ${TIER_LABEL[o.tier]} ${OUTCOME_LABEL[o.outcome]}`.toLowerCase(),
      })
    }

    for (const f of result.footprints) {
      out.push({
        id: `step:${f.step_id}`,
        label: `${f.index + 1}. ${f.name}`,
        hint: `${ACTION_CATEGORY_LABEL[f.category]}${
          f.destroys.length > 0 ? ` · destroys ${f.destroys.length}` : ''
        }`,
        group: 'Steps',
        run: () => onSelectStep(f.step_id),
        haystack: `${f.name} ${f.action_id} ${ACTION_CATEGORY_LABEL[f.category]}`.toLowerCase(),
      })
    }

    return out
  }, [commands, result, onSelectArtifact, onSelectStep])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q === '') return entries.filter((e) => e.group === 'Commands' || e.group === 'Go to').slice(0, 20)
    return entries.filter((e) => e.haystack.includes(q)).slice(0, 40)
  }, [entries, query])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${cursor}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  const run = (i: number): void => {
    const e = matches[i]
    if (!e) return
    e.run()
    onClose()
  }

  const onKey = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCursor((c) => Math.min(c + 1, matches.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCursor((c) => Math.max(c - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      run(cursor)
    } else if (e.key === 'Home') {
      e.preventDefault()
      setCursor(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      setCursor(Math.max(0, matches.length - 1))
    }
  }

  // Group headings, computed from the flat match list so the order the
  // matcher produced is preserved rather than re-sorted underneath it.
  const rendered: { heading: string | null; entry: Entry; index: number }[] = []
  let lastGroup: string | null = null
  matches.forEach((entry, index) => {
    rendered.push({ heading: entry.group === lastGroup ? null : entry.group, entry, index })
    lastGroup = entry.group
  })

  return (
    <>
      <div
        className="fixed inset-0 z-[60] animate-fade-in bg-surface-0/80 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="fixed left-1/2 top-[12vh] z-[61] w-[min(42rem,calc(100vw-2rem))] -translate-x-1/2 animate-pop-in overflow-hidden rounded-lg border border-line-2 bg-surface-1 shadow-pop"
      >
        <div className="border-b border-line-1 px-4 py-3">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
            placeholder="Search commands, evidence and steps…"
            aria-label="Search commands, evidence and steps"
            aria-controls="palette-list"
            aria-activedescendant={matches[cursor] ? `palette-${cursor}` : undefined}
            className="w-full bg-transparent text-md text-ink-0 outline-none placeholder:text-ink-3"
          />
        </div>

        <ul
          id="palette-list"
          ref={listRef}
          role="listbox"
          aria-label="Results"
          className="scroll-thin max-h-[52vh] overflow-y-auto py-1"
        >
          {matches.length === 0 ? (
            <li className="px-4 py-8 text-center text-sm text-ink-3">
              Nothing matches "{query}".
            </li>
          ) : (
            rendered.map(({ heading, entry, index }) => (
              <li key={entry.id}>
                {heading ? (
                  <p className="px-4 pb-1 pt-3 text-2xs font-medium uppercase tracking-[0.12em] text-ink-3">
                    {heading}
                  </p>
                ) : null}
                <button
                  type="button"
                  id={`palette-${index}`}
                  data-index={index}
                  role="option"
                  aria-selected={index === cursor}
                  onMouseMove={() => setCursor(index)}
                  onClick={() => run(index)}
                  className={cx(
                    'flex w-full items-center gap-3 px-4 py-2 text-left transition-colors duration-90',
                    index === cursor ? 'bg-surface-3' : 'hover:bg-surface-2',
                    FOCUS,
                  )}
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-ink-0">{entry.label}</span>
                  {entry.hint ? (
                    <span className="shrink-0 truncate text-2xs text-ink-3">{entry.hint}</span>
                  ) : null}
                </button>
              </li>
            ))
          )}
        </ul>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line-1 px-4 py-2 text-2xs text-ink-3">
          <span>
            <kbd className="font-mono">↑↓</kbd> move
          </span>
          <span>
            <kbd className="font-mono">↵</kbd> run
          </span>
          <span>
            <kbd className="font-mono">esc</kbd> close
          </span>
          <span className="ml-auto flex items-center gap-1.5">
            <span aria-hidden="true" className={OUTCOME_STYLE.lost.text}>
              {OUTCOME_STYLE.lost.glyph}
            </span>
            {result.summary.outcomes.lost + result.summary.outcomes.accepted_loss} lost in this plan
          </span>
        </div>
      </div>
    </>
  )
}
