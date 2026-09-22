/**
 * The report.
 *
 * Three formats, generated from the same analysis, with a preview so nobody
 * has to download a file to find out what is in it.
 *
 * Downloads are built from a blob and an object URL and nothing else — no
 * server, no upload, no round trip. The page's content security policy
 * forbids a network request outright, so this is enforced by the browser
 * rather than only promised here.
 */

import { useMemo, useState } from 'react'
import type { AnalysisResult } from '../domain/types.ts'
import { toHtml, toJson, toMarkdown, headline } from '../engine/report.ts'
import { FEASIBILITY_LABEL, OUTCOME_LABEL } from '../domain/semantics.ts'
import { formatDuration, formatInstant } from '../domain/time.ts'
import { FOCUS, LABEL, OUTCOME_STYLE } from '../ui/tokens.ts'
import {
  Button,
  Callout,
  FeasibilityBadge,
  Panel,
  PanelHeader,
  cx,
} from '../ui/primitives.tsx'

type Format = 'markdown' | 'html' | 'json'

const FORMATS: readonly { id: Format; label: string; ext: string; mime: string; blurb: string }[] = [
  {
    id: 'markdown',
    label: 'Markdown',
    ext: 'md',
    mime: 'text/markdown;charset=utf-8',
    blurb: 'For a ticket or a pull request. Operator-supplied text has its pipes and newlines escaped, so a hostname cannot forge a table column.',
  },
  {
    id: 'html',
    label: 'HTML',
    ext: 'html',
    mime: 'text/html;charset=utf-8',
    blurb: 'A single self-contained file with no scripts and no external references, laid out to print. For the people who will read it once and never open a terminal.',
  },
  {
    id: 'json',
    label: 'JSON',
    ext: 'json',
    mime: 'application/json;charset=utf-8',
    blurb: 'The whole analysis, the same object the screens render from. Reloadable in the Catalogue & data view.',
  },
]

export function ReportView({ result }: { result: AnalysisResult }) {
  const [format, setFormat] = useState<Format>('markdown')

  const rendered = useMemo(() => {
    switch (format) {
      case 'markdown':
        return toMarkdown(result)
      case 'html':
        return toHtml(result)
      case 'json':
        return toJson(result)
    }
  }, [format, result])

  const spec = FORMATS.find((f) => f.id === format)
  const slug =
    result.plan.asset.asset_id.replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 48) || 'plan'
  const filename = `tourniquet-${slug}.${spec?.ext ?? 'txt'}`

  const download = (): void => {
    if (!spec) return
    const blob = new Blob([rendered], { type: spec.mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const copy = (): void => {
    void navigator.clipboard?.writeText(rendered)
  }

  const o = result.summary.outcomes

  return (
    <div className="space-y-5">
      {/* ---- the top of the report, on screen --------------------------- */}
      <Panel>
        <div className="border-b border-line-1 px-5 py-5">
          <p className="font-display text-sm font-semibold uppercase tracking-[0.22em] text-accent">
            Tourniquet
          </p>
          <p className="mt-0.5 text-xs text-ink-3">Remediation evidence preservation report</p>
          <h2 className="mt-3 max-w-[70ch] font-display text-xl font-medium leading-snug tracking-[-0.015em] text-ink-0">
            {result.plan.name}
          </h2>
          <p className="mt-2.5 max-w-[80ch] text-md leading-relaxed text-ink-1">
            {headline(result)}
          </p>
        </div>

        <dl className="grid gap-px bg-line-1 sm:grid-cols-2 lg:grid-cols-4">
          {(
            [
              ['Asset', result.plan.asset.name],
              ['Vulnerability', result.plan.vulnerability.reference],
              ['Priority', `${result.plan.tier.label} (external)`],
              ['Deadline', formatInstant(result.plan.deadline.due_at)],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="bg-surface-1 px-5 py-3.5">
              <dt className={LABEL}>{k}</dt>
              <dd className="ident mt-1 text-sm text-ink-0">{v}</dd>
            </div>
          ))}
        </dl>

        <div className="grid gap-px border-t border-line-1 bg-line-1 sm:grid-cols-2 lg:grid-cols-4">
          <div className="bg-surface-1 px-5 py-3.5">
            <dt className={LABEL}>Preservation status</dt>
            <dd className="mt-1.5">
              <FeasibilityBadge status={result.feasibility.status} />
            </dd>
          </div>
          <div className="bg-surface-1 px-5 py-3.5">
            <dt className={LABEL}>Evidence at risk</dt>
            <dd className="tnum mt-1 text-sm text-ink-0">
              {o.lost + o.indeterminate + o.accepted_loss} of {result.summary.artifact_count}
            </dd>
          </div>
          <div className="bg-surface-1 px-5 py-3.5">
            <dt className={LABEL}>Accepted loss</dt>
            <dd className="tnum mt-1 text-sm text-ink-0">
              {result.summary.accepted_loss_count}{' '}
              {result.summary.accepted_loss_count === 1 ? 'record' : 'records'}
            </dd>
          </div>
          <div className="bg-surface-1 px-5 py-3.5">
            <dt className={LABEL}>Conflicts</dt>
            <dd className="tnum mt-1 text-sm text-ink-0">{result.summary.conflict_count}</dd>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line-1 px-5 py-3">
          {(
            ['preserved', 'degraded', 'lost', 'accepted_loss', 'indeterminate', 'retained'] as const
          ).map((k) => (
            <span key={k} className="flex items-center gap-1.5 text-2xs text-ink-3">
              <span aria-hidden="true" className={OUTCOME_STYLE[k].text}>
                {OUTCOME_STYLE[k].glyph}
              </span>
              <span className="tnum text-ink-1">{o[k]}</span>
              {OUTCOME_LABEL[k]}
            </span>
          ))}
        </div>
      </Panel>

      {/* ---- export ------------------------------------------------------ */}
      <Panel>
        <PanelHeader
          title="Export"
          hint="Generated in this page. Nothing is uploaded — the page's content security policy forbids a network request, so the claim is enforced by the browser rather than only made here."
          right={
            <div className="flex rounded border border-line-2">
              {FORMATS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFormat(f.id)}
                  aria-pressed={format === f.id}
                  className={cx(
                    'px-3 py-1 text-xs transition-colors duration-140 first:rounded-l last:rounded-r',
                    format === f.id ? 'bg-surface-3 text-ink-0' : 'text-ink-3 hover:text-ink-1',
                    FOCUS,
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          }
        />

        <div className="flex flex-wrap items-center gap-3 border-b border-line-1 px-5 py-3.5">
          <Button variant="primary" onClick={download}>
            Download {filename}
          </Button>
          <Button variant="quiet" onClick={copy}>
            Copy to clipboard
          </Button>
          <span className="tnum text-2xs text-ink-3">
            {rendered.length.toLocaleString('en-GB')} characters
          </span>
        </div>

        <p className="border-b border-line-1 px-5 py-3 text-xs leading-relaxed text-ink-2">
          {spec?.blurb}
        </p>

        <div className="scroll-thin max-h-[36rem] overflow-auto bg-surface-inset">
          <pre className="px-5 py-4 font-mono text-xs leading-relaxed text-ink-1">
            <code>{rendered}</code>
          </pre>
        </div>
      </Panel>

      {/* ---- what the report says about itself --------------------------- */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel>
          <PanelHeader
            title="Assumptions"
            hint="Carried into every report, because a number without its assumptions is a number somebody will quote out of context."
          />
          <ul className="space-y-2.5 px-5 py-4">
            {result.assumptions.map((a) => (
              <li key={a} className="flex items-baseline gap-2.5 text-sm leading-relaxed text-ink-2">
                <span aria-hidden="true" className="shrink-0 text-ink-3">
                  —
                </span>
                <span className="min-w-0">{a}</span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel>
          <PanelHeader title="Limitations" hint="What this tool does not do, and cannot tell you." />
          <ul className="space-y-2.5 px-5 py-4">
            {result.limitations.map((l) => (
              <li key={l} className="flex items-baseline gap-2.5 text-sm leading-relaxed text-ink-2">
                <span aria-hidden="true" className="shrink-0 text-ink-3">
                  —
                </span>
                <span className="min-w-0">{l}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Callout tone="neutral" title="Who this report is for">
        The first three sections are written so an incident commander can read them and stop.
        Everything after that is for the analyst who has to execute the sequence. Neither group
        should need to understand the source to trust the document, which is why every section
        states what it is claiming — and the last two state what the tool cannot know. Feasibility
        is {FEASIBILITY_LABEL[result.feasibility.status].toLowerCase()} and the whole plan totals{' '}
        {formatDuration(result.feasibility.total_minutes)} against a{' '}
        {formatDuration(result.feasibility.available_minutes)} window.
      </Callout>
    </div>
  )
}
