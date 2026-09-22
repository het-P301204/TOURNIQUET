/**
 * Shared interface primitives.
 *
 * Two rules run through all of them.
 *
 * A state is never rendered as colour alone. Every badge emits the glyph, the
 * word and an `aria-label` carrying the full sentence, so the same information
 * reaches a reader who cannot separate the hues, a reader using a screen
 * reader, and a reader looking at a printout.
 *
 * Nothing here holds application state. These are presentational, which is
 * what lets the views stay short enough to read.
 */

import type { ReactNode } from 'react'
import { useEffect, useId, useRef, useState } from 'react'
import type {
  Confidence,
  DestructiveLevel,
  FeasibilityStatus,
  ImpactKind,
  PreservationOutcome,
  CollectionPriority,
  Severity,
  VolatilityTier,
} from '../domain/types.ts'
import {
  CONFIDENCE_LABEL,
  CONFIDENCE_TEXT,
  DESTRUCTIVE_LABEL,
  DESTRUCTIVE_TEXT,
  FEASIBILITY_LABEL,
  FEASIBILITY_TEXT,
  IMPACT_LABEL,
  IMPACT_TEXT,
  OUTCOME_LABEL,
  OUTCOME_TEXT,
  PRIORITY_LABEL,
  PRIORITY_TEXT,
  SEVERITY_LABEL,
} from '../domain/semantics.ts'
import { TIER_LABEL, TIER_DECAY, VOLATILITY_RANK } from '../domain/volatility.ts'
import {
  CONFIDENCE_STYLE,
  DESTRUCTIVE_STYLE,
  FEASIBILITY_STYLE,
  FOCUS,
  IMPACT_STYLE,
  LABEL,
  OUTCOME_STYLE,
  PANEL,
  PRIORITY_STYLE,
  SEVERITY_STYLE,
  type StateStyle,
} from './tokens.ts'

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}

/* ========================================================================== */
/* Panels                                                                     */
/* ========================================================================== */

export function Panel({
  children,
  className,
  as: As = 'section',
}: {
  children: ReactNode
  className?: string
  as?: 'section' | 'div' | 'article' | 'aside'
}) {
  return <As className={cx(PANEL, className)}>{children}</As>
}

export function PanelHeader({
  title,
  hint,
  right,
  id,
}: {
  title: ReactNode
  hint?: ReactNode
  right?: ReactNode
  id?: string
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line-1 px-5 py-4">
      <div className="min-w-0">
        <h2 id={id} className="font-display text-md font-medium tracking-[-0.01em] text-ink-0">
          {title}
        </h2>
        {hint ? <p className="mt-1 max-w-[74ch] text-xs leading-relaxed text-ink-2">{hint}</p> : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </header>
  )
}

/** A small uppercase field label. */
export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx(LABEL, className)}>{children}</span>
}

/** A monospaced identifier. `.ident` lets it break rather than overflow. */
export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx('ident font-mono text-xs text-ink-1', className)}>{children}</span>
}

/* ========================================================================== */
/* Badges                                                                     */
/* ========================================================================== */

function Badge({
  style,
  label,
  aria,
  compact,
  className,
}: {
  style: StateStyle
  label: string
  aria: string
  compact?: boolean
  className?: string
}) {
  return (
    <span
      className={cx(
        'tnum inline-flex shrink-0 items-center gap-1.5 rounded border px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-[0.08em]',
        style.text,
        style.border,
        style.wash,
        className,
      )}
      // The label is the sentence, not the word: a reader who lands on a badge
      // with a screen reader gets the meaning rather than "LOST".
      aria-label={aria}
      title={aria}
    >
      <span aria-hidden="true" className="text-[0.9em] leading-none">
        {style.glyph}
      </span>
      {compact ? null : <span>{label}</span>}
    </span>
  )
}

export function OutcomeBadge({
  outcome,
  compact,
  className,
}: {
  outcome: PreservationOutcome
  compact?: boolean
  className?: string
}) {
  return (
    <Badge
      style={OUTCOME_STYLE[outcome]}
      label={OUTCOME_STYLE[outcome].short}
      aria={`${OUTCOME_LABEL[outcome]}. ${OUTCOME_TEXT[outcome]}`}
      compact={compact}
      className={className}
    />
  )
}

export function ImpactBadge({ impact, compact }: { impact: ImpactKind; compact?: boolean }) {
  return (
    <Badge
      style={IMPACT_STYLE[impact]}
      label={IMPACT_STYLE[impact].short}
      aria={`${IMPACT_LABEL[impact]}. ${IMPACT_TEXT[impact]}`}
      compact={compact}
    />
  )
}

export function FeasibilityBadge({ status }: { status: FeasibilityStatus }) {
  return (
    <Badge
      style={FEASIBILITY_STYLE[status]}
      label={FEASIBILITY_STYLE[status].short}
      aria={`${FEASIBILITY_LABEL[status]}. ${FEASIBILITY_TEXT[status]}`}
    />
  )
}

export function DestructiveBadge({ level }: { level: DestructiveLevel }) {
  return (
    <Badge
      style={DESTRUCTIVE_STYLE[level]}
      label={DESTRUCTIVE_STYLE[level].short}
      aria={`${DESTRUCTIVE_LABEL[level]} destructive level. ${DESTRUCTIVE_TEXT[level]}`}
    />
  )
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <Badge
      style={SEVERITY_STYLE[severity]}
      label={SEVERITY_STYLE[severity].short}
      aria={`${SEVERITY_LABEL[severity]} severity`}
    />
  )
}

/**
 * Confidence, as a three-cell meter.
 *
 * A meter rather than a word, so the reader can compare two rows without
 * reading either — and filled cells survive greyscale, which "medium" in amber
 * would not.
 */
export function ConfidenceMeter({ confidence }: { confidence: Confidence }) {
  const s = CONFIDENCE_STYLE[confidence]
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center gap-1.5 rounded border px-1.5 py-0.5 text-2xs font-medium uppercase tracking-[0.08em]',
        s.cls,
      )}
      aria-label={`Confidence: ${CONFIDENCE_LABEL[confidence].toLowerCase()}. ${CONFIDENCE_TEXT[confidence]}`}
      title={`Confidence: ${CONFIDENCE_LABEL[confidence].toLowerCase()}. ${CONFIDENCE_TEXT[confidence]}`}
    >
      <span aria-hidden="true" className="font-mono leading-none tracking-tighter">
        {s.glyph}
      </span>
      <span>{CONFIDENCE_LABEL[confidence]}</span>
    </span>
  )
}

export function PriorityBadge({ priority }: { priority: CollectionPriority }) {
  const s = PRIORITY_STYLE[priority]
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-[0.08em]',
        s.cls,
      )}
      aria-label={`${PRIORITY_LABEL[priority]}. ${PRIORITY_TEXT[priority]}`}
      title={`${PRIORITY_LABEL[priority]}. ${PRIORITY_TEXT[priority]}`}
    >
      <span aria-hidden="true">{s.glyph}</span>
      <span>{PRIORITY_LABEL[priority]}</span>
    </span>
  )
}

/**
 * The volatility tier, with its rank rendered.
 *
 * The number is the point: it tells the reader where this artifact sits on the
 * ladder without them having to remember the order, and it makes two rows
 * comparable at a glance.
 */
export function TierTag({ tier, className }: { tier: VolatilityTier; className?: string }) {
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center gap-1.5 text-2xs uppercase tracking-[0.08em] text-ink-3',
        className,
      )}
      title={`Volatility tier ${VOLATILITY_RANK[tier]} of 8 — ${TIER_LABEL[tier]}. ${TIER_DECAY[tier]}`}
    >
      <span className="tnum rounded-sm border border-line-2 bg-surface-2 px-1 font-mono text-ink-2">
        {VOLATILITY_RANK[tier]}
      </span>
      <span className="truncate">{TIER_LABEL[tier]}</span>
    </span>
  )
}

/* ========================================================================== */
/* Controls                                                                   */
/* ========================================================================== */

export function Button({
  children,
  onClick,
  variant = 'default',
  size = 'md',
  disabled,
  ariaLabel,
  ariaPressed,
  className,
  type = 'button',
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'default' | 'quiet' | 'primary' | 'danger'
  size?: 'sm' | 'md'
  disabled?: boolean
  ariaLabel?: string
  ariaPressed?: boolean
  className?: string
  type?: 'button' | 'submit'
}) {
  const variants: Record<string, string> = {
    default: 'border-line-2 bg-surface-2 text-ink-1 hover:bg-surface-3 hover:text-ink-0',
    quiet: 'border-transparent text-ink-2 hover:bg-surface-2 hover:text-ink-0',
    primary: 'border-accent/45 bg-accent/15 text-accent-strong hover:bg-accent/25',
    danger: 'border-lost/45 bg-lost/12 text-lost hover:bg-lost/20',
  }
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-pressed={ariaPressed}
      className={cx(
        'inline-flex items-center gap-1.5 rounded border font-medium transition-colors duration-140',
        size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm',
        variants[variant],
        disabled && 'cursor-not-allowed opacity-40',
        FOCUS,
        className,
      )}
    >
      {children}
    </button>
  )
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: (id: string) => ReactNode
}) {
  const id = useId()
  return (
    <div className="min-w-0">
      <label htmlFor={id} className={cx(LABEL, 'mb-1.5 block')}>
        {label}
      </label>
      {children(id)}
      {hint ? <p className="mt-1.5 text-2xs leading-relaxed text-ink-3">{hint}</p> : null}
    </div>
  )
}

const CONTROL =
  'w-full rounded border border-line-2 bg-surface-3 px-2.5 py-1.5 text-sm text-ink-0 placeholder:text-ink-3 transition-colors duration-140 hover:border-line-3'

export function TextInput({
  id,
  value,
  onChange,
  placeholder,
  invalid,
}: {
  id?: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  invalid?: boolean
}) {
  return (
    <input
      id={id}
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-invalid={invalid}
      className={cx(CONTROL, invalid && 'border-lost/60', FOCUS)}
    />
  )
}

export function TextArea({
  id,
  value,
  onChange,
  placeholder,
  rows = 3,
  invalid,
}: {
  id?: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  rows?: number
  invalid?: boolean
}) {
  return (
    <textarea
      id={id}
      value={value}
      rows={rows}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-invalid={invalid}
      className={cx(CONTROL, 'scroll-thin resize-y leading-relaxed', invalid && 'border-lost/60', FOCUS)}
    />
  )
}

export function Select<T extends string>({
  id,
  value,
  options,
  onChange,
}: {
  id?: string
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className={cx(CONTROL, 'appearance-none pr-8', FOCUS)}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%237C899D' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E\")",
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 10px center',
        backgroundSize: '10px',
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

export function Checkbox({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: ReactNode
  hint?: ReactNode
}) {
  const id = useId()
  return (
    <div className="flex items-start gap-2.5">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className={cx('mt-0.5 h-3.5 w-3.5 shrink-0 accent-[rgb(var(--accent))]', FOCUS)}
      />
      <label htmlFor={id} className="min-w-0 cursor-pointer text-sm leading-snug text-ink-1">
        {label}
        {hint ? <span className="mt-0.5 block text-2xs text-ink-3">{hint}</span> : null}
      </label>
    </div>
  )
}

/* ========================================================================== */
/* Structure                                                                  */
/* ========================================================================== */

/** A labelled figure. The unit is separated so the number stays scannable. */
export function Stat({
  label,
  value,
  unit,
  tone,
  hint,
  onClick,
}: {
  label: string
  value: ReactNode
  unit?: string
  tone?: string
  hint?: string
  onClick?: () => void
}) {
  const body = (
    <>
      <p className={cx(LABEL, 'truncate')}>{label}</p>
      <p className="mt-1.5 flex items-baseline gap-1.5">
        <span className={cx('tnum font-display text-xl font-medium leading-none', tone ?? 'text-ink-0')}>
          {value}
        </span>
        {unit ? <span className="text-2xs uppercase tracking-[0.08em] text-ink-3">{unit}</span> : null}
      </p>
      {hint ? <p className="mt-1.5 text-2xs leading-relaxed text-ink-3">{hint}</p> : null}
    </>
  )
  if (!onClick) return <div className="min-w-0">{body}</div>
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx('min-w-0 rounded text-left transition-colors duration-140 hover:bg-surface-2', FOCUS)}
    >
      {body}
    </button>
  )
}

/** A definition row, for drawers and detail panels. */
export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(7rem,30%)_1fr] gap-x-4 gap-y-1 border-b border-line-1 py-2.5 last:border-0">
      <dt className={LABEL}>{label}</dt>
      <dd className="min-w-0 text-sm leading-relaxed text-ink-1">{children}</dd>
    </div>
  )
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="px-5 py-12 text-center">
      <p className="font-display text-md text-ink-1">{title}</p>
      {children ? (
        <p className="mx-auto mt-2 max-w-[56ch] text-sm leading-relaxed text-ink-3">{children}</p>
      ) : null}
    </div>
  )
}

/**
 * A proportional bar.
 *
 * Takes a fraction rather than a percentage string so the caller cannot
 * accidentally pass an unclamped value; anything outside 0..1 is clamped here
 * rather than overflowing its track.
 */
export function Meter({
  fraction,
  tone,
  label,
  height = 'h-1.5',
}: {
  fraction: number
  tone: string
  label: string
  height?: string
}) {
  const pct = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0)) * 100
  return (
    <div
      className={cx('w-full overflow-hidden rounded-full bg-surface-3', height)}
      role="img"
      aria-label={label}
    >
      <div
        className={cx('h-full rounded-full transition-[width] duration-380 ease-out', tone)}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

/* ========================================================================== */
/* Drawer                                                                     */
/* ========================================================================== */

/**
 * A right-hand detail drawer.
 *
 * Escape closes it, focus moves into it on open and returns to whatever
 * opened it on close, and it traps neither scroll nor focus beyond that —
 * this is a detail panel, not a modal, and a reader should be able to keep
 * reading the table behind it.
 */
export function Drawer({
  open,
  onClose,
  title,
  eyebrow,
  children,
  footer,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  eyebrow?: ReactNode
  children: ReactNode
  footer?: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const restore = useRef<Element | null>(null)

  useEffect(() => {
    if (!open) return
    restore.current = document.activeElement
    ref.current?.focus()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      const el = restore.current
      if (el instanceof HTMLElement) el.focus()
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <>
      <div
        className="fixed inset-0 z-40 animate-fade-in bg-surface-0/70 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[34rem] animate-drawer-in flex-col border-l border-line-2 bg-surface-1 shadow-drawer focus:outline-none"
      >
        <header className="flex items-start justify-between gap-4 border-b border-line-1 px-5 py-4">
          <div className="min-w-0">
            {eyebrow ? <div className="mb-1">{eyebrow}</div> : null}
            <h2 className="font-display text-lg font-medium leading-snug tracking-[-0.015em] text-ink-0">
              {title}
            </h2>
          </div>
          <Button variant="quiet" size="sm" onClick={onClose} ariaLabel="Close">
            <span aria-hidden="true">✕</span>
          </Button>
        </header>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <footer className="border-t border-line-1 px-5 py-3">{footer}</footer> : null}
      </div>
    </>
  )
}

/* ========================================================================== */
/* Disclosure                                                                 */
/* ========================================================================== */

export function Disclosure({
  summary,
  children,
  defaultOpen = false,
  count,
}: {
  summary: ReactNode
  children: ReactNode
  defaultOpen?: boolean
  count?: number
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-t border-line-1 first:border-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cx(
          'flex w-full items-center gap-2 px-5 py-3 text-left text-sm text-ink-1 transition-colors duration-140 hover:bg-surface-2',
          FOCUS,
        )}
      >
        <span
          aria-hidden="true"
          className={cx(
            'shrink-0 text-2xs text-ink-3 transition-transform duration-140',
            open && 'rotate-90',
          )}
        >
          ▶
        </span>
        <span className="min-w-0 flex-1">{summary}</span>
        {count !== undefined ? (
          <span className="tnum shrink-0 font-mono text-2xs text-ink-3">{count}</span>
        ) : null}
      </button>
      {open ? <div className="animate-fade-in px-5 pb-4">{children}</div> : null}
    </div>
  )
}

/* ========================================================================== */
/* Callout                                                                    */
/* ========================================================================== */

export function Callout({
  tone = 'neutral',
  title,
  children,
}: {
  tone?: 'neutral' | 'warn' | 'bad' | 'unknown' | 'good'
  title?: ReactNode
  children: ReactNode
}) {
  const tones: Record<string, string> = {
    neutral: 'border-line-2 bg-surface-2 text-ink-1',
    good: 'border-preserved/35 bg-preserved/8 text-ink-1',
    warn: 'border-degraded/35 bg-degraded/8 text-ink-1',
    bad: 'border-lost/35 bg-lost/8 text-ink-1',
    unknown: 'border-unknown/35 bg-unknown/8 text-ink-1',
  }
  return (
    <div className={cx('rounded border px-4 py-3 text-sm leading-relaxed', tones[tone])}>
      {title ? <p className="mb-1 font-medium text-ink-0">{title}</p> : null}
      {children}
    </div>
  )
}
