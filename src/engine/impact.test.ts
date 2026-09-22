/**
 * Impact resolution.
 *
 * The rules under test are small and the consequences of getting them wrong
 * are not: a resolver that lets `unknown` fall through to `preserves` turns
 * the product into a tool that reassures people about things nobody has
 * checked.
 */

import { describe, expect, it } from 'vitest'
import { resolveImpact } from './impact.ts'
import type { EvidenceArtifact, RemediationAction } from '../domain/types.ts'
import { ACTION_BY_ID } from '../data/actions.ts'
import { EVIDENCE_BY_ID } from '../data/evidence.ts'

function artifact(over: Partial<EvidenceArtifact> = {}): EvidenceArtifact {
  return {
    artifact_id: 'a1',
    name: 'Artifact one',
    tier: 'volatile_memory',
    description: '',
    applies_to: 'all',
    collection: {
      label: 'test',
      estimated_minutes: 1,
      requires_live_host: true,
      observer_effect: null,
      note: null,
    },
    default_priority: 'recommended',
    answers: '',
    tags: ['memory'],
    confidence: 'high',
    notes: null,
    ...over,
  }
}

function action(over: Partial<RemediationAction> = {}): RemediationAction {
  return {
    action_id: 'x1',
    name: 'Action one',
    category: 'config',
    description: '',
    estimated_minutes: 1,
    destructive_level: 'low',
    reversible: true,
    applies_to: 'all',
    effects: [],
    default_effect: { impact: 'preserves', confidence: 'high', rationale: 'default' },
    captures: [],
    prerequisites: [],
    confidence: 'high',
    reference: null,
    unknown_impact: false,
    notes: null,
    ...over,
  }
}

describe('specificity', () => {
  it('an artifact rule beats a tag rule and a tier rule', () => {
    const a = action({
      effects: [
        { target: { kind: 'tier', tier: 'volatile_memory' }, impact: 'destroys', confidence: 'high', rationale: 'tier' },
        { target: { kind: 'tag', tag: 'memory' }, impact: 'modifies', confidence: 'high', rationale: 'tag' },
        { target: { kind: 'artifact', artifact_id: 'a1' }, impact: 'preserves', confidence: 'high', rationale: 'artifact' },
      ],
    })
    const r = resolveImpact(a, artifact())
    expect(r.impact).toBe('preserves')
    expect(r.matched_by).toBe('artifact')
  })

  it('a tag rule beats a tier rule', () => {
    const a = action({
      effects: [
        { target: { kind: 'tier', tier: 'volatile_memory' }, impact: 'destroys', confidence: 'high', rationale: 'tier' },
        { target: { kind: 'tag', tag: 'memory' }, impact: 'preserves', confidence: 'high', rationale: 'tag' },
      ],
    })
    const r = resolveImpact(a, artifact())
    expect(r.impact).toBe('preserves')
    expect(r.matched_by).toBe('tag')
    expect(r.matched_on).toBe('memory')
  })

  it('falls back to the action default when nothing matches', () => {
    const a = action({
      default_effect: { impact: 'unknown', confidence: 'unknown', rationale: 'uncharacterised' },
    })
    const r = resolveImpact(a, artifact())
    expect(r.impact).toBe('unknown')
    expect(r.matched_by).toBe('action_default')
    expect(r.matched_on).toBeNull()
  })
})

describe('the default effect distinguishes a bounded action from a black box', () => {
  it('two actions with no rules for an artifact give different answers', () => {
    const bounded = action({
      default_effect: { impact: 'preserves', confidence: 'high', rationale: 'bounded' },
    })
    const blackBox = action({
      action_id: 'x2',
      default_effect: { impact: 'unknown', confidence: 'unknown', rationale: 'uncharacterised' },
    })
    expect(resolveImpact(bounded, artifact()).impact).toBe('preserves')
    expect(resolveImpact(blackBox, artifact()).impact).toBe('unknown')
  })
})

describe('severity tie-break at equal specificity', () => {
  it('unknown beats preserves, so absence of knowledge never becomes assurance', () => {
    const a = action({
      effects: [
        { target: { kind: 'tag', tag: 'memory' }, impact: 'preserves', confidence: 'high', rationale: 'safe' },
        { target: { kind: 'tag', tag: 'host_state' }, impact: 'unknown', confidence: 'unknown', rationale: 'no idea' },
      ],
    })
    const r = resolveImpact(a, artifact({ tags: ['memory', 'host_state'] }))
    expect(r.impact).toBe('unknown')
  })

  it('destroys beats everything', () => {
    const a = action({
      effects: [
        { target: { kind: 'tag', tag: 'memory' }, impact: 'unknown', confidence: 'unknown', rationale: 'u' },
        { target: { kind: 'tag', tag: 'host_state' }, impact: 'destroys', confidence: 'high', rationale: 'd' },
      ],
    })
    expect(resolveImpact(a, artifact({ tags: ['memory', 'host_state'] })).impact).toBe('destroys')
  })

  it('an affirmative statement of risk beats the absence of any statement', () => {
    const a = action({
      effects: [
        { target: { kind: 'tag', tag: 'memory' }, impact: 'unknown', confidence: 'unknown', rationale: 'u' },
        { target: { kind: 'tag', tag: 'host_state' }, impact: 'may_invalidate', confidence: 'medium', rationale: 'm' },
      ],
    })
    expect(resolveImpact(a, artifact({ tags: ['memory', 'host_state'] })).impact).toBe('may_invalidate')
  })

  it('says out loud that it resolved a contradiction', () => {
    const a = action({
      effects: [
        { target: { kind: 'tag', tag: 'memory' }, impact: 'preserves', confidence: 'high', rationale: 'Safe.' },
        { target: { kind: 'tag', tag: 'host_state' }, impact: 'destroys', confidence: 'high', rationale: 'Gone.' },
      ],
    })
    const r = resolveImpact(a, artifact({ tags: ['memory', 'host_state'] }))
    expect(r.rationale).toContain('conflicting rule')
    expect(r.rationale).toContain('preserves')
  })

  it('stays quiet when the rules agree', () => {
    const a = action({
      effects: [
        { target: { kind: 'tag', tag: 'memory' }, impact: 'destroys', confidence: 'high', rationale: 'Gone.' },
        { target: { kind: 'tag', tag: 'host_state' }, impact: 'destroys', confidence: 'high', rationale: 'Also gone.' },
      ],
    })
    const r = resolveImpact(a, artifact({ tags: ['memory', 'host_state'] }))
    expect(r.rationale).not.toContain('conflicting')
  })
})

describe('the shipped library', () => {
  it('a reboot destroys physical memory with high confidence', () => {
    const reboot = ACTION_BY_ID.get('host_reboot')
    const mem = EVIDENCE_BY_ID.get('physical_memory')
    if (!reboot || !mem) throw new Error('library entry missing')
    const r = resolveImpact(reboot, mem)
    expect(r.impact).toBe('destroys')
    expect(r.confidence).toBe('high')
  })

  it('a reboot preserves disk artifacts — it is not a rebuild', () => {
    const reboot = ACTION_BY_ID.get('host_reboot')
    const disk = EVIDENCE_BY_ID.get('disk_image')
    if (!reboot || !disk) throw new Error('library entry missing')
    expect(resolveImpact(reboot, disk).impact).toBe('preserves')
  })

  it('a reboot leaves the container writable layer as an open question', () => {
    const reboot = ACTION_BY_ID.get('host_reboot')
    const layer = EVIDENCE_BY_ID.get('container_writable_layer')
    if (!reboot || !layer) throw new Error('library entry missing')
    expect(resolveImpact(reboot, layer).impact).toBe('unknown')
  })

  it('a service restart does not destroy physical memory — the carve-out is real', () => {
    const restart = ACTION_BY_ID.get('service_restart')
    const mem = EVIDENCE_BY_ID.get('physical_memory')
    if (!restart || !mem) throw new Error('library entry missing')
    expect(resolveImpact(restart, mem).impact).toBe('preserves')
  })

  it('instance termination cannot say whether the root volume survives', () => {
    const term = ACTION_BY_ID.get('instance_terminate')
    const disk = EVIDENCE_BY_ID.get('disk_image')
    if (!term || !disk) throw new Error('library entry missing')
    const r = resolveImpact(term, disk)
    expect(r.impact).toBe('unknown')
    expect(r.confidence).toBe('unknown')
  })

  it('firmware update asserts the one thing it can and no more', () => {
    const fw = ACTION_BY_ID.get('firmware_update')
    const conntrack = EVIDENCE_BY_ID.get('conntrack_table')
    const running = EVIDENCE_BY_ID.get('running_processes')
    const central = EVIDENCE_BY_ID.get('centralised_logs')
    if (!fw || !conntrack || !running || !central) throw new Error('library entry missing')
    expect(resolveImpact(fw, conntrack).impact).toBe('destroys')
    expect(resolveImpact(fw, running).impact).toBe('unknown')
    // Off-host records are the exception it can still assert.
    expect(resolveImpact(fw, central).impact).toBe('preserves')
  })

  it('token revocation destroys the token inventory but not the sign-in history', () => {
    const revoke = ACTION_BY_ID.get('token_revoke')
    const tokens = EVIDENCE_BY_ID.get('active_access_tokens')
    const signins = EVIDENCE_BY_ID.get('identity_signin_logs')
    if (!revoke || !tokens || !signins) throw new Error('library entry missing')
    expect(resolveImpact(revoke, tokens).impact).toBe('destroys')
    expect(resolveImpact(revoke, signins).impact).toBe('preserves')
  })

  it('a rebuild destroys local logs but cannot reach off-host copies', () => {
    const rebuild = ACTION_BY_ID.get('host_rebuild')
    const local = EVIDENCE_BY_ID.get('local_event_logs')
    const central = EVIDENCE_BY_ID.get('centralised_logs')
    if (!rebuild || !local || !central) throw new Error('library entry missing')
    expect(resolveImpact(rebuild, local).impact).toBe('destroys')
    expect(resolveImpact(rebuild, central).impact).toBe('preserves')
  })
})
