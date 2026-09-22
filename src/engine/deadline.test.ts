/**
 * Deadline arithmetic.
 *
 * The interesting tests are the boundaries: an untimed step, a window that
 * has already closed, and a plan that fits with exactly nothing to spare.
 */

import { describe, expect, it } from 'vitest'
import { assessDeadline, TIGHT_THRESHOLD } from './deadline.ts'
import { materialise } from './steps.ts'
import { formatClock, formatDuration, sumMinutes } from '../domain/time.ts'
import type { PlannedStep, RemediationPlan } from '../domain/types.ts'

interface Opts {
  readonly windowMinutes?: number
  readonly buffer?: number
  readonly verification?: number
  readonly overrides?: Readonly<Record<number, number | null>>
}

function plan(actionIds: readonly string[], opts: Opts = {}): RemediationPlan {
  const windowMinutes = opts.windowMinutes ?? 72 * 60
  const start = '2026-01-01T00:00:00Z'
  const due = new Date(Date.parse(start) + windowMinutes * 60_000).toISOString()
  const steps: PlannedStep[] = actionIds.map((action_id, i) => ({
    step_id: `s${i}`,
    action_id,
    override_minutes: opts.overrides?.[i] ?? null,
    note: null,
  }))
  return {
    plan_id: 'T',
    name: 'test',
    asset: {
      asset_id: 'H',
      name: 'h',
      type: 'linux_server',
      environment: 't',
      owner: 't',
      description: '',
      notes: null,
    },
    vulnerability: {
      reference: 'T',
      title: 't',
      summary: '',
      suspected_compromise: false,
      notes: null,
    },
    tier: { label: 't', source: 't', window_hours: null, external: true, notes: null },
    deadline: { issued_at: start, due_at: due, plan_start: start, label: 't' },
    steps,
    evidence: [],
    accepted_losses: [],
    overrides: [],
    contingency_buffer_minutes: opts.buffer ?? 0,
    verification_minutes: opts.verification ?? 0,
    notes: null,
  }
}

const assess = (ids: readonly string[], o: Opts = {}) => assessDeadline(plan(ids, o), materialise(plan(ids, o)))

describe('the worked example from the product brief', () => {
  it('72 hours against one hour of preservation and the rest is feasible', () => {
    // 45 + 5 + 4 = 54 minutes of capture, 12 + 4 = 16 of remediation,
    // 180 of verification, 120 of buffer. Comfortably inside 72 hours.
    const f = assess(
      ['capture_memory', 'capture_process_state', 'capture_network_state', 'package_upgrade', 'service_restart'],
      { verification: 180, buffer: 120 },
    )
    expect(f.status).toBe('feasible')
    expect(f.preservation_minutes).toBe(54)
    expect(f.remediation_minutes).toBe(16)
    expect(f.total_minutes).toBe(54 + 16 + 180 + 120)
    expect(f.slack_minutes).toBeGreaterThan(0)
  })
})

describe('boundaries', () => {
  it('a plan that exactly fills the window is tight, not feasible', () => {
    // capture_process_state (5) + service_restart (4) = 9.
    const f = assess(['capture_process_state', 'service_restart'], { windowMinutes: 9 })
    expect(f.total_minutes).toBe(9)
    expect(f.slack_minutes).toBe(0)
    expect(f.status).toBe('tight')
  })

  it('one minute over the window is a conflict', () => {
    const f = assess(['capture_process_state', 'service_restart'], { windowMinutes: 8 })
    expect(f.status).toBe('conflict')
    expect(f.slack_minutes).toBe(-1)
  })

  it('the tight threshold is where it says it is', () => {
    // 9 minutes of work. At TIGHT_THRESHOLD = 0.75 the boundary window is 12.
    const boundary = Math.ceil(9 / TIGHT_THRESHOLD)
    expect(assess(['capture_process_state', 'service_restart'], { windowMinutes: boundary }).status).toBe('tight')
    expect(assess(['capture_process_state', 'service_restart'], { windowMinutes: boundary + 4 }).status).toBe('feasible')
  })

  it('a zero-minute step is believed rather than replaced by the library estimate', () => {
    const f = assess(['capture_memory'], { overrides: { 0: 0 } })
    expect(f.preservation_minutes).toBe(0)
    expect(f.unknown_duration_count).toBe(0)
    expect(f.status).toBe('feasible')
  })

  it('an empty plan is feasible and honest about being empty', () => {
    const f = assess([])
    expect(f.total_minutes).toBe(0)
    expect(f.status).toBe('feasible')
  })
})

describe('untimed steps', () => {
  it('produce unknown rather than a total that silently omits them', () => {
    const f = assess(['a_step_nobody_documented', 'service_restart'])
    expect(f.status).toBe('unknown')
    expect(f.unknown_duration_count).toBe(1)
    expect(f.utilisation).toBeNull()
    // The timed leg is still reported, as a floor.
    expect(f.remediation_minutes).toBe(4)
  })

  it('an untimed step in a window that would otherwise be comfortable still blocks a verdict', () => {
    const f = assess(['a_step_nobody_documented'], { windowMinutes: 100000 })
    expect(f.status).toBe('unknown')
    expect(f.explanation).toContain('floor')
  })

  it('an expired window outranks an untimed step: the clock has already run out', () => {
    const f = assess(['a_step_nobody_documented'], { windowMinutes: -60 })
    expect(f.status).toBe('conflict')
  })
})

describe('an expired deadline', () => {
  it('is a conflict and says how long ago', () => {
    const f = assess(['service_restart'], { windowMinutes: -120 })
    expect(f.status).toBe('conflict')
    expect(f.available_minutes).toBe(-120)
    expect(f.explanation).toContain('2h')
  })

  it('does not report a utilisation percentage against a negative window', () => {
    expect(assess(['service_restart'], { windowMinutes: -120 }).utilisation).toBeNull()
  })
})

describe('duration arithmetic', () => {
  it('sumMinutes counts absences rather than adding them as zero', () => {
    expect(sumMinutes([10, null, 5, null])).toEqual({ known: 15, unknown: 2 })
  })

  it('formatDuration distinguishes zero from unknown', () => {
    expect(formatDuration(0)).toBe('0m')
    expect(formatDuration(null)).toBe('not estimated')
  })

  it('formatDuration stays in hours below two days and switches above', () => {
    expect(formatDuration(45)).toBe('45m')
    expect(formatDuration(265)).toBe('4h 25m')
    expect(formatDuration(47 * 60)).toBe('47h')
    expect(formatDuration(49 * 60)).toBe('2d 1h')
  })

  it('formatDuration signs a negative overrun', () => {
    expect(formatDuration(-90)).toBe('-1h 30m')
  })

  it('formatClock pads, clamps at zero, and widens past 100 hours', () => {
    expect(formatClock(72 * 60)).toBe('72:00:00')
    expect(formatClock(0)).toBe('00:00:00')
    expect(formatClock(-5)).toBe('00:00:00')
    expect(formatClock(null)).toBe('--:--:--')
    expect(formatClock(150 * 60)).toBe('150:00:00')
    expect(formatClock(65.5)).toBe('01:05:30')
  })
})
