/**
 * The order of volatility, as data.
 *
 * The sequencer does not sort rows by a hunch about which evidence "feels"
 * urgent. It sorts by `VOLATILITY_RANK`, which is the single place the ladder
 * is written down. A team whose house doctrine differs — one that collects
 * network state before process state, say — changes it here and every
 * sequence, gate, chart and report follows.
 *
 * The ladder descends from state that is gone the moment power or a process
 * ends, through state that survives a restart but not a rebuild, to records
 * that outlive the host entirely. Rank 1 is collected first.
 *
 * The idea is long-standing in digital forensics — RFC 3227's guidelines on
 * evidence collection state it plainly — but the specific eight tiers below
 * are this tool's decomposition of it, chosen because they are the granularity
 * at which remediation actions actually differ. A reboot and a container
 * redeployment both destroy "volatile data"; they differ on whether the
 * writable layer survives, which is why `runtime_artifact` is its own rung.
 */

import type { VolatilityClass, VolatilityTier } from './types.ts'

export const VOLATILITY_RANK: Readonly<Record<VolatilityTier, number>> = {
  volatile_memory: 1,
  process_state: 2,
  network_state: 3,
  session_state: 4,
  runtime_artifact: 5,
  temporary_state: 6,
  disk_artifact: 7,
  long_term_record: 8,
}

export const VOLATILITY_ORDER: readonly VolatilityTier[] = (
  Object.keys(VOLATILITY_RANK) as VolatilityTier[]
).sort((a, b) => VOLATILITY_RANK[a] - VOLATILITY_RANK[b])

export const TIER_LABEL: Readonly<Record<VolatilityTier, string>> = {
  volatile_memory: 'Volatile memory',
  process_state: 'Running state',
  network_state: 'Network state',
  session_state: 'Session state',
  runtime_artifact: 'Runtime artifacts',
  temporary_state: 'Temporary state',
  disk_artifact: 'Disk artifacts',
  long_term_record: 'Long-term records',
}

/** What ends this tier, in the fewest words that are still true. */
export const TIER_DECAY: Readonly<Record<VolatilityTier, string>> = {
  volatile_memory: 'Gone the moment the host loses power or is reset.',
  process_state: 'Gone when the process ends; partially gone when it restarts.',
  network_state: 'Gone when the connection closes or the stack is reinitialised.',
  session_state: 'Gone when the session is terminated or its credential is revoked.',
  runtime_artifact: 'Gone when the runtime is replaced — a redeploy, not a restart.',
  temporary_state: 'Survives a restart; usually not a rebuild, and may be reaped at any time.',
  disk_artifact: 'Survives a restart and a patch; gone on rebuild or reimage.',
  long_term_record: 'Held off the host. Usually survives everything done to the host.',
}

export const TIER_CLASS: Readonly<Record<VolatilityTier, VolatilityClass>> = {
  volatile_memory: 'volatile',
  process_state: 'volatile',
  network_state: 'volatile',
  session_state: 'volatile',
  runtime_artifact: 'semi_volatile',
  temporary_state: 'semi_volatile',
  disk_artifact: 'persistent',
  long_term_record: 'persistent',
}

export const CLASS_LABEL: Readonly<Record<VolatilityClass, string>> = {
  volatile: 'Volatile',
  semi_volatile: 'Semi-volatile',
  persistent: 'Persistent',
}

/** Negative when `a` decays faster than `b`. The sequencer's tie-break basis. */
export function compareVolatility(a: VolatilityTier, b: VolatilityTier): number {
  return VOLATILITY_RANK[a] - VOLATILITY_RANK[b]
}
