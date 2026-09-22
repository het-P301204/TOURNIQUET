/**
 * The icon set.
 *
 * Hand-drawn on a 16-unit grid rather than pulled from a library, for three
 * reasons: the set is small, an icon dependency is a supply-chain surface for
 * decoration, and several of these glyphs do not exist anywhere — there is no
 * stock icon for "unbacked executable memory" or "the boundary past which this
 * artifact no longer exists".
 *
 * One drawing convention throughout: 1.5-unit strokes, round caps, no fills
 * except where a shape is meant to read as solid (a destroyed marker, a
 * captured dot). `currentColor` everywhere, so an icon inherits the semantic
 * colour of whatever it sits in and never carries a colour of its own.
 *
 * Every icon is decorative. Each one is rendered `aria-hidden`, and the
 * component that uses it is responsible for the accessible name — an icon is
 * never the only way a state is communicated.
 */

import type { SVGProps } from 'react'
import type {
  ActionCategory,
  ImpactKind,
  PreservationOutcome,
  VolatilityTier,
} from '../domain/types.ts'

export type IconProps = Omit<SVGProps<SVGSVGElement>, 'children'> & {
  readonly size?: number
}

function Svg({ size = 16, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  )
}

/* -------------------------------------------------------------------------- */
/* Evidence fate                                                              */
/* -------------------------------------------------------------------------- */

/** Preserved: captured cleanly. A check inside a closed ring. */
export function IconPreserved(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="8" cy="8" r="6.25" />
      <path d="M5.2 8.3 7.1 10.2 10.9 6.2" />
    </Svg>
  )
}

/** Degraded: still there, altered. A ring half-filled. */
export function IconDegraded(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="8" cy="8" r="6.25" />
      <path d="M8 1.75a6.25 6.25 0 0 1 0 12.5z" fill="currentColor" stroke="none" />
    </Svg>
  )
}

/** Lost: destroyed. A severed ring with the cut drawn through it. */
export function IconLost(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="8" cy="8" r="6.25" />
      <path d="M5.5 5.5 10.5 10.5M10.5 5.5 5.5 10.5" />
    </Svg>
  )
}

/** Accepted loss: destroyed, and signed for. A cut ring plus a nib. */
export function IconAcceptedLoss(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="8" cy="8" r="6.25" />
      <path d="M5.4 10.6 10.4 5.6" />
      <path d="M9.2 4.4 11.6 6.8" />
    </Svg>
  )
}

/** Indeterminate: the plan does not say. A ring and a question. */
export function IconUnknown(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="8" cy="8" r="6.25" strokeDasharray="2.2 2" />
      <path d="M6.3 6.2a1.75 1.75 0 1 1 1.9 2.6v.9" />
      <path d="M8.2 11.6v.01" strokeWidth={2} />
    </Svg>
  )
}

/** Retained: untouched, still on the system. An open ring. */
export function IconRetained(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="8" cy="8" r="6.25" />
    </Svg>
  )
}

export const OUTCOME_ICON: Readonly<
  Record<PreservationOutcome, (p: IconProps) => React.ReactElement>
> = {
  preserved: IconPreserved,
  degraded: IconDegraded,
  lost: IconLost,
  accepted_loss: IconAcceptedLoss,
  indeterminate: IconUnknown,
  retained: IconRetained,
}

/* -------------------------------------------------------------------------- */
/* Impact                                                                     */
/* -------------------------------------------------------------------------- */

/** Destroys: a line that stops dead at a cut. */
export function IconDestroys(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M1.5 8h7" />
      <path d="M10 4.5v7" />
      <path d="M12.2 5.6 14.4 10.4M14.4 5.6 12.2 10.4" strokeWidth={1.2} />
    </Svg>
  )
}

/** Modifies: a line that continues, bent. */
export function IconModifies(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M1.5 9.5c2 0 2.2-3 4.2-3s2.2 3 4.2 3 2.2-3 4.6-3" />
    </Svg>
  )
}

/** May invalidate: a line with a raised flag on it. */
export function IconMayInvalidate(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M1.5 12h13" />
      <path d="M8 2.5v5.5" />
      <path d="M8 10.2v.01" strokeWidth={2} />
    </Svg>
  )
}

/** Preserves: a line that simply continues. */
export function IconPreserves(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M1.5 8h13" />
    </Svg>
  )
}

export const IMPACT_ICON: Readonly<Record<ImpactKind, (p: IconProps) => React.ReactElement>> = {
  destroys: IconDestroys,
  modifies: IconModifies,
  may_invalidate: IconMayInvalidate,
  preserves: IconPreserves,
  unknown: IconUnknown,
}

/* -------------------------------------------------------------------------- */
/* Objects in the domain                                                      */
/* -------------------------------------------------------------------------- */

/** The clock. Used only for time, never for anything else. */
export function IconClock(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="8" cy="8" r="6.25" />
      <path d="M8 4.4V8l2.6 1.7" />
    </Svg>
  )
}

/** A capture: pulling something out and keeping it. */
export function IconCapture(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M8 2v7" />
      <path d="M5.2 6.4 8 9.2l2.8-2.8" />
      <path d="M2.5 11.5v1.4a.6.6 0 0 0 .6.6h9.8a.6.6 0 0 0 .6-.6v-1.4" />
    </Svg>
  )
}

/** A remediation action: an operation applied to the system. */
export function IconAction(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M2.2 8h3.1" />
      <path d="M10.7 8h3.1" />
      <circle cx="8" cy="8" r="2.4" />
    </Svg>
  )
}

/** A relationship. Drawn in `link` cyan wherever it appears. */
export function IconLink(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M6.6 9.4 9.4 6.6" />
      <path d="M7.6 4.6 9 3.2a2.6 2.6 0 0 1 3.7 3.7l-1.4 1.4" />
      <path d="M8.4 11.4 7 12.8a2.6 2.6 0 0 1-3.7-3.7l1.4-1.4" />
    </Svg>
  )
}

/** A human decision on the record. */
export function IconDecision(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3 2.5h7.2L13 5.3v8.2H3z" />
      <path d="M5.5 9.3h5" />
      <path d="M5.5 11.4h3" />
    </Svg>
  )
}

/** A conflict: two things that will not both fit. */
export function IconConflict(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M2 5.2h7.4" />
      <path d="M2 10.8h4.6" />
      <path d="M11.6 3.4 14 5.2l-2.4 1.8" />
      <path d="M8.8 9 6.4 10.8l2.4 1.8" />
    </Svg>
  )
}

/** The loss boundary itself: the product's own mark. */
export function IconBoundary(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M8 1.5v13" />
      <path d="M1.8 5h4" />
      <path d="M1.8 11h4" />
      <path d="M10.2 5h4" strokeDasharray="1.6 1.6" opacity={0.55} />
      <path d="M10.2 11h4" strokeDasharray="1.6 1.6" opacity={0.55} />
    </Svg>
  )
}

/* -------------------------------------------------------------------------- */
/* Volatility tiers                                                           */
/* -------------------------------------------------------------------------- */

function IconMemory(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3.2" y="3.2" width="9.6" height="9.6" rx="1.4" />
      <rect x="6.2" y="6.2" width="3.6" height="3.6" rx="0.6" />
      <path d="M6 1.8v1.4M10 1.8v1.4M6 12.8v1.4M10 12.8v1.4" />
    </Svg>
  )
}

function IconProcess(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="2" y="3" width="12" height="8.4" rx="1.2" />
      <path d="M5.2 13.6h5.6" />
      <path d="M4.6 6.2h3" />
      <path d="M4.6 8.4h5" />
    </Svg>
  )
}

function IconNetwork(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="3.4" cy="3.6" r="1.7" />
      <circle cx="12.6" cy="3.6" r="1.7" />
      <circle cx="8" cy="12.4" r="1.7" />
      <path d="M4.6 4.8 7.2 10.9M11.4 4.8 8.8 10.9M5.1 3.6h5.8" />
    </Svg>
  )
}

function IconSession(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="8" cy="5.4" r="2.7" />
      <path d="M2.8 13.6c.6-2.7 2.6-4 5.2-4s4.6 1.3 5.2 4" />
    </Svg>
  )
}

function IconRuntime(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M8 1.8 14 5v6l-6 3.2L2 11V5z" />
      <path d="M2.2 5 8 8.1 13.8 5" />
      <path d="M8 8.1v6.1" />
    </Svg>
  )
}

function IconTemp(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3.4 2.6h9.2l-3.4 5v5.2l-2.4 1.2V7.6z" />
    </Svg>
  )
}

function IconDisk(p: IconProps) {
  return (
    <Svg {...p}>
      <ellipse cx="8" cy="4" rx="5.6" ry="2.2" />
      <path d="M2.4 4v8c0 1.2 2.5 2.2 5.6 2.2s5.6-1 5.6-2.2V4" />
      <path d="M2.4 8.2c0 1.2 2.5 2.2 5.6 2.2s5.6-1 5.6-2.2" />
    </Svg>
  )
}

function IconRecord(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3.4 2h6l3.2 3.2V14H3.4z" />
      <path d="M9.2 2v3.4h3.4" />
      <path d="M5.8 8.6h4.4M5.8 11h3" />
    </Svg>
  )
}

export const TIER_ICON: Readonly<
  Record<VolatilityTier, (p: IconProps) => React.ReactElement>
> = {
  volatile_memory: IconMemory,
  process_state: IconProcess,
  network_state: IconNetwork,
  session_state: IconSession,
  runtime_artifact: IconRuntime,
  temporary_state: IconTemp,
  disk_artifact: IconDisk,
  long_term_record: IconRecord,
}

/* -------------------------------------------------------------------------- */
/* Action categories                                                          */
/* -------------------------------------------------------------------------- */

function IconReboot(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M13.4 8a5.4 5.4 0 1 1-1.9-4.1" />
      <path d="M13.6 2.4v3.4h-3.4" />
    </Svg>
  )
}

function IconPatch(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M2.6 9.6 9.6 2.6a2.9 2.9 0 0 1 4.1 4.1l-7 7a2.9 2.9 0 0 1-4.1-4.1z" />
      <path d="M6.1 6.1 9.9 9.9" />
    </Svg>
  )
}

function IconCredential(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3" y="7" width="10" height="7" rx="1.3" />
      <path d="M5.4 7V5a2.6 2.6 0 0 1 5.2 0v2" />
    </Svg>
  )
}

function IconTerminate(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M8 2.4v6" />
      <path d="M12 4.6a5.6 5.6 0 1 1-8 0" />
    </Svg>
  )
}

function IconVerify(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M8 1.8 13.4 4v4.2c0 3-2.2 5.2-5.4 6-3.2-.8-5.4-3-5.4-6V4z" />
      <path d="M5.8 8 7.4 9.6l3-3.2" />
    </Svg>
  )
}

function IconConfig(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M2.2 4.6h11.6M2.2 8h11.6M2.2 11.4h11.6" />
      <circle cx="5.4" cy="4.6" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="10.2" cy="8" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="6.6" cy="11.4" r="1.5" fill="currentColor" stroke="none" />
    </Svg>
  )
}

function IconContainment(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="2.2" y="2.2" width="11.6" height="11.6" rx="1.6" strokeDasharray="2.4 2" />
      <path d="M5.6 8h4.8" />
    </Svg>
  )
}

export const CATEGORY_ICON: Readonly<
  Record<ActionCategory, (p: IconProps) => React.ReactElement>
> = {
  capture: IconCapture,
  containment: IconContainment,
  service: IconAction,
  process: IconProcess,
  reboot: IconReboot,
  replace: IconPatch,
  patch: IconPatch,
  credential: IconCredential,
  session: IconSession,
  rebuild: IconTerminate,
  redeploy: IconRuntime,
  terminate: IconTerminate,
  firmware: IconConfig,
  config: IconConfig,
  verify: IconVerify,
}
