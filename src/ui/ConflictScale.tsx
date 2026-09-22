/**
 * The conflict, drawn.
 *
 * A deadline conflict is two quantities that will not both fit, and the
 * fastest way to say that is to draw them against each other. A sentence
 * saying "57m of work against an 8m window" is accurate and takes a second to
 * parse; two bars of visibly different length take none.
 *
 * The bars are scaled to whichever is longer, so the overrun is drawn at its
 * true proportion rather than clipped at the deadline. A chart that clipped
 * the plan at the window would draw an infeasible plan as though it fitted,
 * which is the single thing this component must not do.
 */

import { formatDuration } from '../domain/time.ts'
import { LABEL } from './tokens.ts'
import { cx } from './primitives.tsx'
import { IconClock } from './icons.tsx'

export function ConflictScale({
  preservationMinutes,
  remediationMinutes,
  verificationMinutes,
  bufferMinutes,
  windowMinutes,
  untimedSteps,
}: {
  preservationMinutes: number
  remediationMinutes: number
  verificationMinutes: number
  bufferMinutes: number
  windowMinutes: number
  untimedSteps: number
}) {
  const plan = preservationMinutes + remediationMinutes + verificationMinutes + bufferMinutes
  const span = Math.max(plan, windowMinutes, 1)
  const pct = (m: number): number => Math.max(0, (m / span) * 100)
  const overrun = plan - windowMinutes

  const legs = [
    ['Preservation', preservationMinutes, 'bg-preserved'],
    ['Remediation', remediationMinutes, 'bg-accent'],
    ['Verification', verificationMinutes, 'bg-retained'],
    ['Buffer', bufferMinutes, 'bg-line-3'],
  ] as const

  return (
    <div className="space-y-3">
      {/* The plan, broken into its legs so the reader can see what to cut. */}
      <div>
        <div className="mb-1 flex items-baseline justify-between gap-3">
          <span className={LABEL}>What the plan needs</span>
          <span className="tnum font-mono text-xs text-ink-1">{formatDuration(plan)}</span>
        </div>
        <div className="flex h-6 w-full gap-px overflow-hidden rounded bg-surface-inset">
          {legs.map(([name, m, tone]) =>
            m <= 0 ? null : (
              <div
                key={name}
                className={cx('h-full', tone)}
                style={{ width: `${pct(m)}%`, opacity: 0.85 }}
                title={`${name}: ${formatDuration(m)}`}
              />
            ),
          )}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
          {legs.map(([name, m, tone]) =>
            m <= 0 ? null : (
              <span key={name} className="flex items-center gap-1.5 text-2xs text-ink-3">
                <span aria-hidden="true" className={cx('h-2 w-3 rounded-sm', tone)} />
                {name} <span className="tnum">{formatDuration(m)}</span>
              </span>
            ),
          )}
        </div>
      </div>

      {/* The window. */}
      <div>
        <div className="mb-1 flex items-baseline justify-between gap-3">
          <span className={cx(LABEL, 'flex items-center gap-1.5 text-time')}>
            <IconClock size={11} />
            What the deadline allows
          </span>
          <span className="tnum font-mono text-xs text-ink-1">
            {formatDuration(windowMinutes)}
          </span>
        </div>
        <div className="h-6 w-full overflow-hidden rounded bg-surface-inset">
          <div
            className="h-full rounded-r bg-time/70"
            style={{ width: `${pct(windowMinutes)}%` }}
          />
        </div>
      </div>

      {/* The difference, named. */}
      <div
        className={cx(
          'flex flex-wrap items-baseline justify-between gap-2 rounded border px-3 py-2',
          overrun > 0 ? 'border-lost/40 bg-lost/10' : 'border-preserved/35 bg-preserved/8',
        )}
      >
        <span className={cx('text-xs font-medium', overrun > 0 ? 'text-lost' : 'text-preserved')}>
          {overrun > 0 ? 'Overrun' : 'Slack'}
        </span>
        <span
          className={cx(
            'tnum font-mono text-sm font-medium',
            overrun > 0 ? 'text-lost' : 'text-preserved',
          )}
        >
          {formatDuration(Math.abs(overrun))}
        </span>
      </div>

      {untimedSteps > 0 ? (
        <p className="text-2xs leading-relaxed text-degraded">
          {untimedSteps} {untimedSteps === 1 ? 'step has' : 'steps have'} no duration estimate and
          are not in either bar. Both figures are floors.
        </p>
      ) : null}
    </div>
  )
}
