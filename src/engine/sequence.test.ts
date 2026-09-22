/**
 * The sequencer.
 *
 * Three properties, in descending order of how badly it hurts to get them
 * wrong: it never reorders remediation, volatile captures come first, and a
 * capture nothing threatens is allowed to wait.
 */

import { describe, expect, it } from 'vitest'
import { buildSequence } from './sequence.ts'
import { materialise } from './steps.ts'
import { artifactsFor } from './scope.ts'
import { simulate } from './outcomes.ts'
import { VOLATILITY_RANK } from '../domain/volatility.ts'
import { EVIDENCE_BY_ID } from '../data/evidence.ts'
import type { AssetType, PlannedStep, RemediationPlan } from '../domain/types.ts'

function plan(actionIds: readonly string[], type: AssetType = 'linux_server'): RemediationPlan {
  const steps: PlannedStep[] = actionIds.map((action_id, i) => ({
    step_id: `s${i}`,
    action_id,
    override_minutes: null,
    note: null,
  }))
  return {
    plan_id: 'T',
    name: 'test',
    asset: {
      asset_id: 'H',
      name: 'h',
      type,
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
    tier: { label: 't', source: 't', window_hours: 72, external: true, notes: null },
    deadline: {
      issued_at: '2026-01-01T00:00:00Z',
      due_at: '2026-01-04T00:00:00Z',
      plan_start: '2026-01-01T00:00:00Z',
      label: 't',
    },
    steps,
    evidence: [],
    accepted_losses: [],
    overrides: [],
    contingency_buffer_minutes: 0,
    verification_minutes: 0,
    notes: null,
  }
}

function seq(actionIds: readonly string[], type: AssetType = 'linux_server'): readonly string[] {
  const p = plan(actionIds, type)
  const s = buildSequence(materialise(p), artifactsFor(type), new Map())
  return s.steps.map((x) => x.action_id)
}

describe('remediation order is never touched', () => {
  it('keeps the relative order of remediation steps exactly as written', () => {
    const out = seq(['verify_remediation', 'service_restart', 'package_upgrade', 'capture_memory'])
    const remediationOnly = out.filter((a) => a !== 'capture_memory')
    // Nonsensical as an operational order, and preserved anyway: dependencies
    // between remediation steps are not something the tool can see.
    expect(remediationOnly).toEqual(['verify_remediation', 'service_restart', 'package_upgrade'])
  })

  it('never invents or drops a step', () => {
    const input = ['package_upgrade', 'capture_memory', 'service_restart', 'capture_offhost_logs']
    const out = seq(input)
    expect([...out].sort()).toEqual([...input].sort())
  })
})

describe('volatile captures come first', () => {
  it('hoists the memory capture ahead of a patch that does not touch memory', () => {
    // The bug this test exists for: scheduling purely against what each step
    // threatens put the memory image after the package upgrade, because an
    // upgrade does not touch RAM. Correct, and wrong.
    const out = seq(['package_upgrade', 'service_restart', 'capture_memory'])
    expect(out.indexOf('capture_memory')).toBeLessThan(out.indexOf('package_upgrade'))
  })

  it('orders the volatile captures among themselves by the order of volatility', () => {
    const out = seq([
      'service_restart',
      'capture_network_state',
      'capture_sessions',
      'capture_memory',
      'capture_process_state',
    ])
    const rank = (id: string): number => out.indexOf(id)
    expect(rank('capture_memory')).toBeLessThan(rank('capture_process_state'))
    expect(rank('capture_process_state')).toBeLessThan(rank('capture_network_state'))
    expect(rank('capture_network_state')).toBeLessThan(rank('capture_sessions'))
  })

  it('the tier ranks that ordering depends on are the ones in the ladder', () => {
    const tierOf = (id: string): number => {
      const a = EVIDENCE_BY_ID.get(id)
      if (!a) throw new Error(`missing ${id}`)
      return VOLATILITY_RANK[a.tier]
    }
    expect(tierOf('physical_memory')).toBeLessThan(tierOf('running_processes'))
    expect(tierOf('running_processes')).toBeLessThan(tierOf('active_connections'))
    expect(tierOf('active_connections')).toBeLessThan(tierOf('interactive_sessions'))
    expect(tierOf('interactive_sessions')).toBeLessThan(tierOf('local_event_logs'))
  })
})

describe('what can wait', () => {
  it('defers a capture that nothing in the plan threatens to after the remediation', () => {
    const out = seq(['package_upgrade', 'capture_offhost_logs'])
    expect(out).toEqual(['package_upgrade', 'capture_offhost_logs'])
  })

  it('says why it deferred it rather than leaving the reader to guess', () => {
    const p = plan(['package_upgrade', 'capture_offhost_logs'])
    const s = buildSequence(materialise(p), artifactsFor('linux_server'), new Map())
    const deferred = s.steps.find((x) => x.action_id === 'capture_offhost_logs')
    expect(deferred?.gate).toBeNull()
    expect(deferred?.why_now).toContain('not racing anything')
  })

  it('does not defer a persistent capture that the plan does threaten', () => {
    // The upgrade destroys the pre-patch package state, which the triage set
    // collects. It has to come first even though it is not volatile.
    const out = seq(['package_upgrade', 'capture_host_triage'])
    expect(out.indexOf('capture_host_triage')).toBeLessThan(out.indexOf('package_upgrade'))
  })
})

describe('gates', () => {
  it('records the step each gate exists to precede', () => {
    const p = plan(['package_upgrade', 'capture_host_triage'])
    const s = buildSequence(materialise(p), artifactsFor('linux_server'), new Map())
    expect(s.gates).toHaveLength(1)
    expect(s.gates[0]?.before_action_id).toBe('package_upgrade')
    expect(s.gates[0]?.artifact_ids).toContain('installed_package_state')
  })

  it('reports whether the plan is already in the recommended order', () => {
    const good = plan(['capture_memory', 'host_reboot'])
    expect(buildSequence(materialise(good), artifactsFor('linux_server'), new Map()).matches_plan_order).toBe(true)

    const bad = plan(['host_reboot', 'capture_memory'])
    expect(buildSequence(materialise(bad), artifactsFor('linux_server'), new Map()).matches_plan_order).toBe(false)
  })
})

describe('the sequence is actually better', () => {
  it('resequencing the same steps converts losses into preservations', () => {
    const p = plan(['package_upgrade', 'service_restart', 'capture_memory', 'capture_process_state'])
    const artifacts = artifactsFor('linux_server')
    const steps = materialise(p)

    const asWritten = simulate(steps, artifacts, new Map(), [])
    const s = buildSequence(steps, artifacts, new Map())
    const byId = new Map(steps.map((x) => [x.step_id, x]))
    const reordered = s.order.map((id) => byId.get(id)).filter((x) => x !== undefined)
    const asRecommended = simulate(reordered, artifacts, new Map(), [])

    const lost = (o: readonly { outcome: string }[]): number =>
      o.filter((x) => x.outcome === 'lost').length
    expect(lost(asRecommended)).toBeLessThan(lost(asWritten))
  })
})

describe('offsets', () => {
  it('accumulates minutes from plan start', () => {
    const p = plan(['capture_process_state', 'service_restart'])
    const s = buildSequence(materialise(p), artifactsFor('linux_server'), new Map())
    expect(s.steps[0]?.offset_minutes).toBe(0)
    expect(s.steps[1]?.offset_minutes).toBe(5)
  })

  it('stops the clock at the first untimed step instead of guessing', () => {
    const p = plan(['a_step_nobody_documented', 'service_restart'])
    const s = buildSequence(materialise(p), artifactsFor('linux_server'), new Map())
    expect(s.steps[0]?.offset_minutes).toBe(0)
    expect(s.steps[1]?.offset_minutes).toBeNull()
  })
})

describe('degenerate plans', () => {
  it('an empty plan produces an empty sequence', () => {
    const s = buildSequence(materialise(plan([])), artifactsFor('linux_server'), new Map())
    expect(s.steps).toHaveLength(0)
    expect(s.matches_plan_order).toBe(true)
  })

  it('captures only, with no remediation at all, stay in volatility order', () => {
    const out = seq(['capture_offhost_logs', 'capture_memory'])
    // Nothing threatens either, but memory still decays, so it leads.
    expect(out[0]).toBe('capture_memory')
  })

  it('a capture whose artifacts are all out of scope is flagged rather than silently kept', () => {
    // A disk-image capture against a Kubernetes workload: the action applies,
    // the artifact does not.
    const p = plan(['capture_disk_image', 'container_redeploy'], 'kubernetes_workload')
    const s = buildSequence(materialise(p), artifactsFor('kubernetes_workload'), new Map())
    const step = s.steps.find((x) => x.action_id === 'capture_disk_image')
    expect(step?.artifact_ids).toHaveLength(0)
    expect(step?.why_now).toContain('collects nothing that is in scope')
  })
})

describe('explanations do not overclaim', () => {
  it('never says a step reaches evidence it does not touch', () => {
    // The bug this pins: `capture_memory` is pulled to the front because RAM
    // decays, and the gate it lands in belongs to `package_upgrade`. The
    // first version of the explanation therefore announced that the package
    // upgrade "is the first step that reaches Physical memory image", which
    // is plainly untrue and is exactly the kind of confident wrong sentence
    // this product exists to avoid producing.
    const p = plan(['package_upgrade', 'service_restart', 'capture_memory'])
    const s = buildSequence(materialise(p), artifactsFor('linux_server'), new Map())
    const mem = s.steps.find((x) => x.action_id === 'capture_memory')

    expect(mem?.why_now).toContain('decay on their own')
    expect(mem?.why_now).not.toContain('is the first step in this plan that reaches')
  })

  it('still names the threatening step when there genuinely is one', () => {
    const p = plan(['package_upgrade', 'capture_host_triage'])
    const s = buildSequence(materialise(p), artifactsFor('linux_server'), new Map())
    const triage = s.steps.find((x) => x.action_id === 'capture_host_triage')
    expect(triage?.why_now).toContain('Apply package upgrade')
    expect(triage?.why_now).toContain('would collect nothing')
  })

  it('a gate separates what its action destroys from what merely decays', () => {
    const p = plan(['package_upgrade', 'capture_memory', 'capture_host_triage'])
    const s = buildSequence(materialise(p), artifactsFor('linux_server'), new Map())
    const reason = s.gates[0]?.reason ?? ''
    // The triage set is genuinely threatened by the upgrade.
    expect(reason).toContain('Installed package and version state')
    // The memory image is not, and the gate says so rather than implying it.
    expect(reason).toContain('decay without')
  })

  it('counts a single remainder as "1 other", not "1 others"', () => {
    const p = plan(['service_restart', 'capture_process_state'])
    const s = buildSequence(materialise(p), artifactsFor('linux_server'), new Map())
    const all = s.steps.map((x) => x.why_now).join(' ')
    expect(all).not.toContain('1 others')
  })
})
