/**
 * What survives an order.
 *
 * The first three tests here are the acceptance criteria of the whole
 * product, restated as code: capture before the reboot and memory is
 * preserved; capture after it and memory is lost; leave the impact
 * uncharacterised and the answer is neither.
 */

import { describe, expect, it } from 'vitest'
import { simulate } from './outcomes.ts'
import { materialise } from './steps.ts'
import { artifactsFor } from './scope.ts'
import type {
  AcceptedLoss,
  EvidenceSelection,
  PlannedStep,
  RemediationPlan,
} from '../domain/types.ts'

function plan(actionIds: readonly string[], over: Partial<RemediationPlan> = {}): RemediationPlan {
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
      asset_id: 'H1',
      name: 'host-1',
      type: 'linux_server',
      environment: 'test',
      owner: 'test',
      description: '',
      notes: null,
    },
    vulnerability: {
      reference: 'TEST',
      title: 'test',
      summary: '',
      suspected_compromise: false,
      notes: null,
    },
    tier: { label: '3 day', source: 'test', window_hours: 72, external: true, notes: null },
    deadline: {
      issued_at: '2026-01-01T00:00:00Z',
      due_at: '2026-01-04T00:00:00Z',
      plan_start: '2026-01-01T00:00:00Z',
      label: 'test',
    },
    steps,
    evidence: [],
    accepted_losses: [],
    overrides: [],
    contingency_buffer_minutes: 0,
    verification_minutes: 0,
    notes: null,
    ...over,
  }
}

function run(
  actionIds: readonly string[],
  over: Partial<RemediationPlan> = {},
): ReadonlyMap<string, ReturnType<typeof simulate>[number]> {
  const p = plan(actionIds, over)
  const artifacts = artifactsFor(p.asset.type)
  const selections: ReadonlyMap<string, EvidenceSelection> = new Map(
    p.evidence.map((e) => [e.artifact_id, e]),
  )
  const out = simulate(materialise(p), artifacts, selections, p.accepted_losses)
  return new Map(out.map((o) => [o.artifact_id, o]))
}

describe('the central acceptance criteria', () => {
  it('memory captured before a reboot is preserved', () => {
    const r = run(['capture_memory', 'host_reboot'])
    expect(r.get('physical_memory')?.outcome).toBe('preserved')
  })

  it('memory captured after a reboot is lost, and the plan still contains the step', () => {
    const r = run(['host_reboot', 'capture_memory'])
    const mem = r.get('physical_memory')
    expect(mem?.outcome).toBe('lost')
    // The capture is still recorded as present. Its presence is exactly why
    // the plan looks complete to a reader who is not checking the order.
    expect(mem?.captured_at_index).toBe(1)
    expect(mem?.explanation).toContain('collects nothing')
  })

  it('an uncharacterised step yields indeterminate, not safe and not lost', () => {
    // A network appliance whose only remediation step is the vendor procedure.
    const p = plan(['firmware_update'], {
      asset: {
        asset_id: 'FW',
        name: 'fw-1',
        type: 'network_appliance',
        environment: 'test',
        owner: 'test',
        description: '',
        notes: null,
      },
    })
    const artifacts = artifactsFor('network_appliance')
    const out = simulate(materialise(p), artifacts, new Map(), [])
    const running = out.find((o) => o.artifact_id === 'running_processes')
    expect(running?.outcome).toBe('indeterminate')
    expect(running?.confidence).toBe('unknown')
    // Not quietly filed as either of the two comfortable answers.
    expect(running?.outcome).not.toBe('retained')
    expect(running?.outcome).not.toBe('lost')
  })
})

describe('the other outcomes', () => {
  it('an artifact nothing touches is retained, not preserved', () => {
    const r = run(['service_restart'])
    // A restart cannot reach off-host records.
    expect(r.get('centralised_logs')?.outcome).toBe('retained')
  })

  it('an artifact altered before its capture is degraded, not preserved', () => {
    // The upgrade alters filesystem timestamps; the triage capture follows it.
    const r = run(['package_upgrade', 'capture_host_triage'])
    const ts = r.get('file_timestamps')
    expect(ts?.outcome).toBe('degraded')
    expect(ts?.explanation).toContain('altered state')
  })

  it('the same two steps in the other order preserve it', () => {
    const r = run(['capture_host_triage', 'package_upgrade'])
    expect(r.get('file_timestamps')?.outcome).toBe('preserved')
  })

  it('an artifact altered with no capture at all is degraded', () => {
    const r = run(['package_upgrade'])
    expect(r.get('file_timestamps')?.outcome).toBe('degraded')
    expect(r.get('file_timestamps')?.captured_at_index).toBeNull()
  })

  it('a destroying step anywhere before the capture wins over a later alteration', () => {
    const r = run(['host_reboot', 'package_upgrade', 'capture_memory'])
    expect(r.get('physical_memory')?.outcome).toBe('lost')
  })
})

describe('accepted loss', () => {
  const loss: AcceptedLoss = {
    loss_id: 'AL-1',
    artifact_ids: ['physical_memory'],
    what_is_lost: 'memory',
    reason_category: 'operational',
    why_necessary: 'window',
    alternative_considered: 'none',
    residual_risk: 'unknown execution',
    accepted_by: 'A. Person',
    role: 'IC',
    decided_at: '2026-01-01T00:00:00Z',
    tier_label: '3 day',
  }

  it('reclassifies a lost artifact as an accepted loss', () => {
    const r = run(['host_reboot'], { accepted_losses: [loss] })
    const mem = r.get('physical_memory')
    expect(mem?.outcome).toBe('accepted_loss')
    expect(mem?.accepted_loss_id).toBe('AL-1')
  })

  it('does not rewrite the outcome of something that is actually preserved', () => {
    const r = run(['capture_memory', 'host_reboot'], { accepted_losses: [loss] })
    const mem = r.get('physical_memory')
    expect(mem?.outcome).toBe('preserved')
    // The record is kept and flagged rather than silently dropped.
    expect(mem?.accepted_loss_id).toBe('AL-1')
    expect(mem?.explanation).toContain('stale')
  })

  it('does not launder an indeterminate outcome into a preserved one', () => {
    const p = plan(['firmware_update'], {
      asset: {
        asset_id: 'FW',
        name: 'fw-1',
        type: 'network_appliance',
        environment: 'test',
        owner: 'test',
        description: '',
        notes: null,
      },
      accepted_losses: [{ ...loss, artifact_ids: ['running_processes'] }],
    })
    const out = simulate(materialise(p), artifactsFor('network_appliance'), new Map(), p.accepted_losses)
    expect(out.find((o) => o.artifact_id === 'running_processes')?.outcome).toBe('accepted_loss')
  })
})

describe('confidence propagation', () => {
  it('a preserved artifact is high confidence regardless of the rule that threatened it', () => {
    const r = run(['capture_memory', 'host_reboot'])
    expect(r.get('physical_memory')?.confidence).toBe('high')
  })

  it('a lost artifact inherits the confidence of the rule that destroyed it', () => {
    const r = run(['host_reboot'])
    expect(r.get('physical_memory')?.confidence).toBe('high')
  })

  it('a retained artifact is no more confident than the weakest claim about it', () => {
    // `host_isolate` makes only a medium-confidence claim about the neighbour
    // cache, so "retained" for it cannot be high.
    const r = run(['host_isolate'])
    expect(r.get('arp_neighbour_cache')?.outcome).toBe('degraded')
    const central = r.get('centralised_logs')
    expect(central?.outcome).toBe('degraded')
  })

  it('an indeterminate outcome is reported at unknown confidence, never low', () => {
    const p = plan(['firmware_update'], {
      asset: {
        asset_id: 'FW',
        name: 'fw-1',
        type: 'network_appliance',
        environment: 'test',
        owner: 'test',
        description: '',
        notes: null,
      },
    })
    const out = simulate(materialise(p), artifactsFor('network_appliance'), new Map(), [])
    for (const o of out.filter((x) => x.outcome === 'indeterminate')) {
      expect(o.confidence).toBe('unknown')
    }
  })
})

describe('selection', () => {
  it('an excluded artifact still gets an outcome, so nothing disappears silently', () => {
    const r = run(['host_reboot'], {
      evidence: [
        { artifact_id: 'physical_memory', priority: 'optional', included: false, override_minutes: null },
      ],
    })
    expect(r.get('physical_memory')?.outcome).toBe('lost')
    expect(r.get('physical_memory')?.priority).toBe('optional')
  })

  it('priority comes from the selection when one exists and the catalogue otherwise', () => {
    const r = run(['host_reboot'], {
      evidence: [
        { artifact_id: 'physical_memory', priority: 'optional', included: true, override_minutes: null },
      ],
    })
    expect(r.get('physical_memory')?.priority).toBe('optional')
    // Not overridden, so the catalogue default stands.
    expect(r.get('running_processes')?.priority).toBe('required')
  })
})

describe('edge cases', () => {
  it('an empty plan leaves everything retained', () => {
    const r = run([])
    for (const o of r.values()) expect(o.outcome).toBe('retained')
  })

  it('an unknown action id makes everything indeterminate rather than fine', () => {
    const r = run(['a_step_nobody_documented'])
    const outcomes = new Set([...r.values()].map((o) => o.outcome))
    expect(outcomes).toEqual(new Set(['indeterminate']))
  })

  it('two destructive steps at once do not double-count: the first one owns the loss', () => {
    const r = run(['host_reboot', 'host_rebuild'])
    const mem = r.get('physical_memory')
    expect(mem?.outcome).toBe('lost')
    expect(mem?.first_harm?.action_id).toBe('host_reboot')
  })

  it('a duplicated capture step is harmless; the first one counts', () => {
    const r = run(['capture_memory', 'capture_memory', 'host_reboot'])
    expect(r.get('physical_memory')?.captured_at_index).toBe(0)
    expect(r.get('physical_memory')?.outcome).toBe('preserved')
  })

  it('only artifacts in scope for the asset type appear at all', () => {
    const p = plan(['container_redeploy'], {
      asset: {
        asset_id: 'C',
        name: 'pod-1',
        type: 'container',
        environment: 'test',
        owner: 'test',
        description: '',
        notes: null,
      },
    })
    const out = simulate(materialise(p), artifactsFor('container'), new Map(), [])
    const ids = new Set(out.map((o) => o.artifact_id))
    // A container has no physical memory of its own, and no ARP cache.
    expect(ids.has('physical_memory')).toBe(false)
    expect(ids.has('arp_neighbour_cache')).toBe(false)
    expect(ids.has('container_writable_layer')).toBe(true)
  })
})
