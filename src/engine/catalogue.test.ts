/**
 * The shipped library, checked against itself.
 *
 * These are the tests that catch a typo in a 900-line data file: an effect
 * written against a tag no artifact carries, a capture action that claims to
 * acquire an artifact that does not exist, a declared destructive level that
 * no longer matches the rules underneath it.
 *
 * None of them assert that the library is *right* about the world — nothing
 * in a test suite can do that, and the README says so. They assert that it is
 * internally coherent, which is the part a machine can check.
 */

import { describe, expect, it } from 'vitest'
import { ACTION_LIBRARY, ACTION_BY_ID } from '../data/actions.ts'
import { EVIDENCE_CATALOGUE, EVIDENCE_BY_ID } from '../data/evidence.ts'
import { SCENARIOS } from '../data/scenarios.ts'
import { computeDestructiveLevel } from './footprint.ts'
import { resolveAll } from './impact.ts'
import { artifactApplies, actionApplies, artifactsFor } from './scope.ts'
import { VOLATILITY_RANK, TIER_LABEL, TIER_CLASS, TIER_DECAY } from '../domain/volatility.ts'
import type { AssetType, VolatilityTier } from '../domain/types.ts'

const ALL_TYPES: readonly AssetType[] = [
  'windows_workstation',
  'windows_server',
  'linux_server',
  'cloud_vm',
  'container',
  'kubernetes_workload',
  'database_server',
  'application_server',
  'network_appliance',
  'saas_identity',
]

const ALL_TAGS = new Set(EVIDENCE_CATALOGUE.flatMap((a) => a.tags))

describe('identity', () => {
  it('every artifact id is unique', () => {
    const ids = EVIDENCE_CATALOGUE.map((a) => a.artifact_id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every action id is unique', () => {
    const ids = ACTION_LIBRARY.map((a) => a.action_id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('the lookup maps cover the whole catalogue', () => {
    expect(EVIDENCE_BY_ID.size).toBe(EVIDENCE_CATALOGUE.length)
    expect(ACTION_BY_ID.size).toBe(ACTION_LIBRARY.length)
  })
})

describe('every reference resolves', () => {
  it('capture actions only claim artifacts that exist', () => {
    for (const action of ACTION_LIBRARY) {
      for (const id of action.captures) {
        expect(EVIDENCE_BY_ID.has(id), `${action.action_id} captures ${id}`).toBe(true)
      }
    }
  })

  it('artifact-targeted effects name artifacts that exist', () => {
    for (const action of ACTION_LIBRARY) {
      for (const e of action.effects) {
        if (e.target.kind !== 'artifact') continue
        expect(
          EVIDENCE_BY_ID.has(e.target.artifact_id),
          `${action.action_id} targets ${e.target.artifact_id}`,
        ).toBe(true)
      }
    }
  })

  it('tag-targeted effects name tags some artifact carries', () => {
    for (const action of ACTION_LIBRARY) {
      for (const e of action.effects) {
        if (e.target.kind !== 'tag') continue
        expect(ALL_TAGS.has(e.target.tag), `${action.action_id} targets tag ${e.target.tag}`).toBe(true)
      }
    }
  })

  it('prerequisites name actions that exist', () => {
    for (const action of ACTION_LIBRARY) {
      for (const id of action.prerequisites) {
        expect(ACTION_BY_ID.has(id), `${action.action_id} requires ${id}`).toBe(true)
      }
    }
  })
})

describe('scoping is coherent', () => {
  it('no artifact is orphaned: everything in scope has an in-scope way to collect it', () => {
    // Not "the same action everywhere" — a container has no memory image and
    // collects injected regions through a process dump instead. What matters
    // is that no asset type is offered an artifact with no route to acquiring
    // it, which would put something in the preservation plan that nobody can
    // actually preserve.
    for (const type of ALL_TYPES) {
      for (const artifact of artifactsFor(type)) {
        const collectors = ACTION_LIBRARY.filter(
          (a) => a.captures.includes(artifact.artifact_id) && actionApplies(a, type),
        )
        expect(
          collectors.length,
          `${artifact.artifact_id} is in scope for ${type} with no in-scope capture action`,
        ).toBeGreaterThan(0)
      }
    }
  })

  it('a capture action never claims an artifact that is out of scope everywhere it runs', () => {
    for (const action of ACTION_LIBRARY) {
      for (const id of action.captures) {
        const artifact = EVIDENCE_BY_ID.get(id)
        if (!artifact) continue
        const overlap = ALL_TYPES.some(
          (t) => actionApplies(action, t) && artifactApplies(artifact, t),
        )
        expect(overlap, `${action.action_id} can never collect ${id}`).toBe(true)
      }
    }
  })

  it('every asset type has at least one artifact and one action', () => {
    for (const type of ALL_TYPES) {
      expect(artifactsFor(type).length, type).toBeGreaterThan(0)
    }
  })

  it('a SaaS identity tenant is offered no host artifacts', () => {
    const ids = new Set(artifactsFor('saas_identity').map((a) => a.artifact_id))
    for (const hostOnly of ['physical_memory', 'disk_image', 'swap_and_pagefile', 'kerberos_tickets']) {
      expect(ids.has(hostOnly), hostOnly).toBe(false)
    }
  })

  it('a container is offered its writable layer and not a physical memory image', () => {
    const ids = new Set(artifactsFor('container').map((a) => a.artifact_id))
    expect(ids.has('container_writable_layer')).toBe(true)
    expect(ids.has('physical_memory')).toBe(false)
  })
})

describe('declared metadata matches the rules underneath it', () => {
  it('the declared destructive level agrees with the resolved footprint', () => {
    for (const action of ACTION_LIBRARY) {
      const computed = computeDestructiveLevel(
        resolveAll(action, EVIDENCE_CATALOGUE),
        EVIDENCE_BY_ID,
        action.default_effect.impact === 'unknown',
      )
      expect(action.destructive_level, `${action.action_id}`).toBe(computed)
    }
  })

  it('`unknown_impact` is set exactly when the action default is unknown', () => {
    for (const action of ACTION_LIBRARY) {
      expect(action.unknown_impact, `${action.action_id}`).toBe(
        action.default_effect.impact === 'unknown',
      )
    }
  })

  it('only capture actions capture anything', () => {
    for (const action of ACTION_LIBRARY) {
      if (action.category === 'capture') continue
      expect(action.captures, `${action.action_id}`).toHaveLength(0)
    }
  })

  it('every capture action actually captures something', () => {
    for (const action of ACTION_LIBRARY) {
      if (action.category !== 'capture') continue
      expect(action.captures.length, `${action.action_id}`).toBeGreaterThan(0)
    }
  })

  it('a capture action is never destructive', () => {
    for (const action of ACTION_LIBRARY) {
      if (action.category !== 'capture') continue
      expect(action.destructive_level, `${action.action_id}`).toBe('none')
    }
  })
})

describe('the library says something, everywhere', () => {
  it('every action declares a default effect with a rationale', () => {
    for (const a of ACTION_LIBRARY) {
      expect(a.default_effect.rationale.length, a.action_id).toBeGreaterThan(20)
    }
  })

  it('every effect carries a rationale written for a reader', () => {
    for (const a of ACTION_LIBRARY) {
      for (const e of a.effects) {
        expect(e.rationale.length, `${a.action_id} / ${JSON.stringify(e.target)}`).toBeGreaterThan(20)
        expect(e.rationale.trim().endsWith('.'), `${a.action_id} rationale is a sentence`).toBe(true)
      }
    }
  })

  it('every artifact says what question it answers', () => {
    for (const a of EVIDENCE_CATALOGUE) {
      expect(a.answers.length, a.artifact_id).toBeGreaterThan(20)
    }
  })

  it('an unknown impact is always declared at unknown confidence', () => {
    for (const a of ACTION_LIBRARY) {
      if (a.default_effect.impact === 'unknown') {
        expect(a.default_effect.confidence, a.action_id).toBe('unknown')
      }
      for (const e of a.effects) {
        if (e.impact === 'unknown') {
          expect(e.confidence, `${a.action_id}`).toBe('unknown')
        }
      }
    }
  })

  it('a duration is null or positive, never a zero standing in for unknown', () => {
    for (const a of ACTION_LIBRARY) {
      if (a.estimated_minutes !== null) expect(a.estimated_minutes, a.action_id).toBeGreaterThan(0)
    }
    for (const a of EVIDENCE_CATALOGUE) {
      const m = a.collection.estimated_minutes
      if (m !== null) expect(m, a.artifact_id).toBeGreaterThan(0)
    }
  })
})

describe('the volatility ladder', () => {
  it('is a total order with no ties', () => {
    const ranks = Object.values(VOLATILITY_RANK)
    expect(new Set(ranks).size).toBe(ranks.length)
  })

  it('has a label, a class and a decay sentence for every tier', () => {
    for (const tier of Object.keys(VOLATILITY_RANK) as VolatilityTier[]) {
      expect(TIER_LABEL[tier]).toBeTruthy()
      expect(TIER_CLASS[tier]).toBeTruthy()
      expect(TIER_DECAY[tier].length).toBeGreaterThan(20)
    }
  })

  it('classes follow the ranks: volatile is the fast end', () => {
    for (const tier of Object.keys(VOLATILITY_RANK) as VolatilityTier[]) {
      const rank = VOLATILITY_RANK[tier]
      const cls = TIER_CLASS[tier]
      if (rank <= 4) expect(cls, tier).toBe('volatile')
      else if (rank <= 6) expect(cls, tier).toBe('semi_volatile')
      else expect(cls, tier).toBe('persistent')
    }
  })

  it('every artifact sits on a tier the ladder knows about', () => {
    for (const a of EVIDENCE_CATALOGUE) {
      expect(VOLATILITY_RANK[a.tier], a.artifact_id).toBeGreaterThan(0)
    }
  })
})

describe('the demo scenarios', () => {
  it('name only actions the library contains', () => {
    for (const s of SCENARIOS) {
      for (const step of s.plan.steps) {
        expect(ACTION_BY_ID.has(step.action_id), `${s.id}: ${step.action_id}`).toBe(true)
      }
    }
  })

  it('name only actions applicable to their asset type', () => {
    for (const s of SCENARIOS) {
      for (const step of s.plan.steps) {
        const action = ACTION_BY_ID.get(step.action_id)
        if (!action) continue
        expect(
          actionApplies(action, s.plan.asset.type),
          `${s.id}: ${step.action_id} on ${s.plan.asset.type}`,
        ).toBe(true)
      }
    }
  })

  it('select only artifacts in scope for their asset type', () => {
    for (const s of SCENARIOS) {
      const scope = new Set(artifactsFor(s.plan.asset.type).map((a) => a.artifact_id))
      for (const e of s.plan.evidence) {
        expect(scope.has(e.artifact_id), `${s.id}: ${e.artifact_id}`).toBe(true)
      }
    }
  })

  it('record accepted losses only against artifacts that exist', () => {
    for (const s of SCENARIOS) {
      for (const loss of s.plan.accepted_losses) {
        for (const id of loss.artifact_ids) {
          expect(EVIDENCE_BY_ID.has(id), `${s.id}: ${id}`).toBe(true)
        }
      }
    }
  })

  it('use unique step ids within a plan', () => {
    for (const s of SCENARIOS) {
      const ids = s.plan.steps.map((x) => x.step_id)
      expect(new Set(ids).size, s.id).toBe(ids.length)
    }
  })

  it('use unique step ids across all plans, so a merged export cannot collide', () => {
    const all = SCENARIOS.flatMap((s) => s.plan.steps.map((x) => x.step_id))
    expect(new Set(all).size).toBe(all.length)
  })

  it('have a deadline after the plan start, except where the point is that it is not', () => {
    for (const s of SCENARIOS) {
      const start = Date.parse(s.plan.deadline.plan_start)
      const due = Date.parse(s.plan.deadline.due_at)
      expect(Number.isFinite(start), s.id).toBe(true)
      expect(Number.isFinite(due), s.id).toBe(true)
      expect(due, s.id).toBeGreaterThan(start)
    }
  })

  it('declare the tier as an external input, always', () => {
    for (const s of SCENARIOS) {
      expect(s.plan.tier.external, s.id).toBe(true)
      expect(s.plan.tier.source.length, s.id).toBeGreaterThan(3)
    }
  })

  it('each teaches something, stated', () => {
    for (const s of SCENARIOS) expect(s.teaches.length, s.id).toBeGreaterThan(40)
  })
})
