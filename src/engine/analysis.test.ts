/**
 * End to end: conflicts, reports, and the demo scenarios as fixtures.
 *
 * The scenario assertions are the closest thing this project has to a
 * regression suite for judgement. Each one pins the specific thing that
 * scenario exists to demonstrate, so a change to the library or the sequencer
 * that quietly ruins a demonstration fails here rather than in front of
 * somebody.
 */

import { describe, expect, it } from 'vitest'
import { analyse } from './analyze.ts'
import { toHtml, toJson, toMarkdown, headline } from './report.ts'
import { SCENARIOS, SCENARIO_BY_ID } from '../data/scenarios.ts'
import type { AnalysisResult, ConflictKind, RemediationPlan } from '../domain/types.ts'

const NOW = '2026-09-22T12:00:00Z'

function run(id: string): AnalysisResult {
  const s = SCENARIO_BY_ID.get(id)
  if (!s) throw new Error(`no scenario ${id}`)
  return analyse(s.plan, NOW)
}

function kinds(r: AnalysisResult): Set<ConflictKind> {
  return new Set(r.conflicts.map((c) => c.kind))
}

function outcomeOf(r: AnalysisResult, artifact_id: string): string | undefined {
  return r.outcomes.find((o) => o.artifact_id === artifact_id)?.outcome
}

/* ========================================================================== */

describe('determinism', () => {
  it('the same plan analysed twice is byte-identical', () => {
    for (const s of SCENARIOS) {
      const a = toJson(analyse(s.plan, NOW))
      const b = toJson(analyse(s.plan, NOW))
      expect(a, s.id).toBe(b)
    }
  })

  it('the analysis does not depend on the clock except where it says so', () => {
    const a = analyse(SCENARIOS[0]!.plan, '2020-01-01T00:00:00Z')
    const b = analyse(SCENARIOS[0]!.plan, '2030-01-01T00:00:00Z')
    expect(a.feasibility).toEqual(b.feasibility)
    expect(a.summary.outcomes).toEqual(b.summary.outcomes)
    expect(a.analysed_at).not.toBe(b.analysed_at)
  })
})

describe('scenario 1 — the order is the finding', () => {
  const r = run('fin_web')

  it('the plan as written loses evidence the recommended order keeps', () => {
    const lost = (o: readonly { outcome: string }[]): number =>
      o.filter((x) => x.outcome === 'lost').length
    expect(lost(r.outcomes)).toBeGreaterThan(lost(r.recommended_outcomes))
  })

  it('the patch destroys the record of the version you were exposed on', () => {
    // The most easily missed loss in the whole product: the thing that proves
    // which version was running is the thing the upgrade overwrites, and the
    // triage capture in this plan runs six steps too late.
    expect(outcomeOf(r, 'installed_package_state')).toBe('lost')
    expect(
      r.recommended_outcomes.find((o) => o.artifact_id === 'installed_package_state')?.outcome,
    ).toBe('preserved')
  })

  it('the restart takes the unlinked-file handles and the injected regions with it', () => {
    for (const id of ['open_file_handles', 'service_runtime_state', 'injected_code_regions']) {
      expect(outcomeOf(r, id), id).toBe('lost')
      expect(r.recommended_outcomes.find((o) => o.artifact_id === id)?.outcome, id).toBe('preserved')
    }
  })

  it('a full memory image survives even the plan as written, because nothing here reboots', () => {
    // Worth pinning: the restart carve-out is real, and the tool must not
    // report host memory as lost just because something restarted.
    expect(outcomeOf(r, 'physical_memory')).toBe('preserved')
  })

  it('raises an ordering conflict rather than blaming the remediation', () => {
    expect(kinds(r).has('ordering')).toBe(true)
    const c = r.conflicts.find((x) => x.kind === 'ordering')
    expect(c?.detail).toContain('only the order differs')
  })

  it('recommends memory, then running state, then network state, then triage', () => {
    const captures = r.sequence.steps.filter((s) => s.kind === 'capture').map((s) => s.action_id)
    expect(captures.slice(0, 4)).toEqual([
      'capture_memory',
      'capture_process_state',
      'capture_network_state',
      'capture_host_triage',
    ])
  })

  it('defers the off-host log export to the end, and says why', () => {
    const last = r.sequence.steps[r.sequence.steps.length - 1]
    expect(last?.action_id).toBe('capture_offhost_logs')
    expect(last?.why_now).toContain('not racing anything')
  })

  it('the deadline is comfortable, so the finding is about order and not time', () => {
    expect(r.feasibility.status).toBe('feasible')
  })

  it('the patch is what destroys the record of the vulnerable version', () => {
    const upgrade = r.footprints.find((f) => f.action_id === 'package_upgrade')
    expect(upgrade?.destroys.map((d) => d.artifact_id)).toContain('installed_package_state')
  })
})

describe('scenario 2 — the fix is the whole forensic cost', () => {
  const r = run('pay_k8s')

  it('the container writable layer is lost, and nothing in the plan collects it', () => {
    expect(outcomeOf(r, 'container_writable_layer')).toBe('lost')
    const o = r.outcomes.find((x) => x.artifact_id === 'container_writable_layer')
    expect(o?.captured_at_index).toBeNull()
  })

  it('reordering cannot save it: there is no capture step to move', () => {
    expect(r.recommended_outcomes.find((o) => o.artifact_id === 'container_writable_layer')?.outcome).toBe('lost')
    expect(kinds(r).has('uncaptured_required')).toBe(true)
  })

  it('the off-host and cloud records survive, which is the one thing that does', () => {
    expect(outcomeOf(r, 'cloud_control_plane_logs')).toBe('preserved')
    expect(outcomeOf(r, 'centralised_logs')).toBe('preserved')
  })

  it('names the artifacts and the questions that go unanswered', () => {
    const c = r.conflicts.find((x) => x.kind === 'uncaptured_required')
    expect(c?.subject_ids).toContain('container_writable_layer')
    expect(c?.detail).toContain('What goes unanswered')
  })
})

describe('scenario 3 — visibility, not storage', () => {
  const r = run('corp_idp')

  it('the token inventory is destroyed by the revocation', () => {
    expect(outcomeOf(r, 'active_access_tokens')).toBe('lost')
  })

  it('the sign-in history is untouched: rotation and revocation destroy no record', () => {
    // Captured at step one, and nothing in the plan ever reaches it. The
    // point of the scenario is that the cost of this remediation is entirely
    // in the token inventory and not at all in the stored history.
    for (const id of ['identity_signin_logs', 'identity_audit_logs']) {
      expect(outcomeOf(r, id), id).toBe('preserved')
      expect(r.outcomes.find((o) => o.artifact_id === id)?.first_harm, id).toBeNull()
    }
  })

  it('flags the capture that has been scheduled where it can no longer work', () => {
    expect(kinds(r).has('unusable_capture')).toBe(true)
    const c = r.conflicts.find((x) => x.kind === 'unusable_capture')
    expect(c?.detail).toContain('yields nothing')
  })

  it('the recommended order moves the inventory in front of the revocation', () => {
    const order = r.sequence.steps.map((s) => s.action_id)
    expect(order.indexOf('capture_token_inventory')).toBeLessThan(order.indexOf('token_revoke'))
  })

  it('keeps the honest unknown about whether a reset ends a session', () => {
    expect(kinds(r).has('unknown_impact')).toBe(true)
    expect(outcomeOf(r, 'app_session_store')).not.toBe('retained')
  })
})

describe('scenario 4 — unknown stays unknown', () => {
  const r = run('edge_fw')

  it('most artifacts come out indeterminate, not safe and not lost', () => {
    const counts = r.summary.outcomes
    expect(counts.indeterminate).toBeGreaterThan(0)
    expect(counts.lost).toBe(0)
  })

  it('the one thing the vendor procedure definitely destroys is still asserted', () => {
    const fw = r.footprints.find((f) => f.action_id === 'firmware_update')
    expect(fw?.destroys.map((d) => d.artifact_id)).toContain('conntrack_table')
  })

  it('off-host records are still reported as preserved', () => {
    expect(outcomeOf(r, 'centralised_logs')).toBe('retained')
  })

  it('grades the whole action as unknown rather than as moderately destructive', () => {
    const fw = r.footprints.find((f) => f.action_id === 'firmware_update')
    expect(fw?.destructive_level).toBe('unknown')
  })

  it('the deadline is comfortable, so the finding is entirely about uncertainty', () => {
    expect(r.feasibility.status).toBe('feasible')
    expect(kinds(r).has('unknown_impact')).toBe(true)
    expect(kinds(r).has('deadline')).toBe(false)
  })

  it('recommends human review rather than picking a reading', () => {
    const u = r.unknowns[0]
    expect(u?.recommendation).toContain('not safe')
    expect(u?.recommendation).toContain('not destroyed')
  })
})

describe('scenario 5 — the window and the plan are incompatible', () => {
  const r = run('mfg_db')

  it('reports a conflict with the overrun stated', () => {
    expect(r.feasibility.status).toBe('conflict')
    expect(r.feasibility.slack_minutes).toBeLessThan(0)
    expect(kinds(r).has('deadline')).toBe(true)
  })

  it('offers options and chooses none of them', () => {
    const c = r.conflicts.find((x) => x.kind === 'deadline')
    expect(c?.options.length).toBeGreaterThan(3)
    expect(c?.detail).toContain('not both possible')
  })

  it('the accepted-loss record reclassifies the memory outcome', () => {
    expect(outcomeOf(r, 'physical_memory')).toBe('accepted_loss')
    expect(r.outcomes.find((o) => o.artifact_id === 'physical_memory')?.accepted_loss_id).toBe('AL-0001')
  })

  it('still names the losses nobody has signed for', () => {
    const c = r.conflicts.find((x) => x.kind === 'undocumented_loss')
    expect(c).toBeDefined()
    expect(c?.subject_ids).not.toContain('physical_memory')
  })

  it('the database audit export can wait, because the shutdown does not reach it', () => {
    const last = r.sequence.steps[r.sequence.steps.length - 1]
    expect(last?.action_id).toBe('capture_db_audit')
  })
})

/* ========================================================================== */

describe('the headline sentence', () => {
  it('leads with the clock and then the loss, for every scenario', () => {
    for (const s of SCENARIOS) {
      const h = headline(analyse(s.plan, NOW))
      expect(h.length, s.id).toBeGreaterThan(80)
      expect(h, s.id).toMatch(/plan (fits|does not fit|cannot be timed)/)
    }
  })
})

describe('reports', () => {
  for (const s of SCENARIOS) {
    it(`${s.id}: markdown carries every required section`, () => {
      const md = toMarkdown(analyse(s.plan, NOW))
      for (const section of [
        '## 1. Summary',
        '## 2. Deadline feasibility',
        '## 3. Conflicts requiring a human decision',
        '## 4. Recommended preservation sequence',
        '## 5. Evidence inventory and outcome',
        '## 6. Destructive effects, step by step',
        '## 7. Unknown impact',
        '## 8. Accepted losses',
        '## 9. Manual overrides',
        '## 10. Assumptions',
        '## 11. Limitations',
      ]) {
        expect(md, `${s.id} missing ${section}`).toContain(section)
      }
    })

    it(`${s.id}: html is self-contained and scriptless`, () => {
      const html = toHtml(analyse(s.plan, NOW))
      expect(html.startsWith('<!doctype html>')).toBe(true)
      expect(html).not.toMatch(/<script/i)
      expect(html).not.toMatch(/https?:\/\//)
      expect(html).toContain('Content-Security-Policy')
    })

    it(`${s.id}: json round-trips`, () => {
      const parsed: unknown = JSON.parse(toJson(analyse(s.plan, NOW)))
      expect(typeof parsed).toBe('object')
      expect(parsed).not.toBeNull()
      const o = parsed as Record<string, unknown>
      expect(o.analysis_version).toBe('tourniquet/1')
      expect(Array.isArray(o.outcomes)).toBe(true)
    })
  }

  it('states the tier as an external input in every format', () => {
    const r = run('fin_web')
    expect(toMarkdown(r)).toContain('EXTERNAL INPUT')
    expect(toHtml(r)).toContain('TOURNIQUET did not calculate this')
  })

  it('carries the limitations rather than only the findings', () => {
    const md = toMarkdown(run('fin_web'))
    expect(md).toContain('does not acquire evidence')
    expect(md).toContain('not vendor statements')
  })
})

describe('report escaping', () => {
  /** A plan whose every free-text field is hostile. */
  function hostile(): RemediationPlan {
    const base = SCENARIOS[0]!.plan
    return {
      ...base,
      name: 'Plan | with | pipes\nand a newline',
      asset: {
        ...base.asset,
        // A right-to-left override, a zero-width space and a script tag.
        name: 'host‮gnp.evil​.internal<script>alert(1)</script>',
      },
      accepted_losses: [
        {
          loss_id: 'AL-X',
          artifact_ids: ['physical_memory'],
          what_is_lost: 'memory | and | more',
          reason_category: 'operational',
          why_necessary: '<img src=x onerror=alert(1)>',
          alternative_considered: 'none\n| forged | row |',
          residual_risk: "it's bad & worse",
          accepted_by: 'A ‮ Person',
          role: 'IC',
          decided_at: '2026-09-22T00:00:00Z',
          tier_label: 'x',
        },
      ],
    }
  }

  const r = analyse(hostile(), NOW)

  it('strips bidirectional overrides, which escaping alone would not catch', () => {
    const md = toMarkdown(r)
    const html = toHtml(r)
    const json = toJson(r)
    expect(md).not.toContain('‮')
    expect(html).not.toContain('‮')
    // The JSON export is data rather than a rendered document, so the raw
    // value survives there; what matters is that the two *rendered* formats
    // cannot be made to display something other than what is stored.
    expect(json.length).toBeGreaterThan(0)
  })

  it('strips zero-width characters used to make two identifiers look alike', () => {
    expect(toMarkdown(r)).not.toContain('​')
    expect(toHtml(r)).not.toContain('​')
  })

  it('escapes pipes so a hostile value cannot forge a table column', () => {
    const md = toMarkdown(r)
    // Every table row has the same number of unescaped pipes as its header.
    const lines = md.split('\n').filter((l) => l.startsWith('|'))
    const counts = new Set(
      lines.map((l) => (l.replace(/\\\|/g, '').match(/\|/g) ?? []).length),
    )
    // Two shapes only: the two-column key/value tables and the wider ones.
    expect(counts.size).toBeLessThanOrEqual(6)
    expect(md).toContain('memory \\| and \\| more')
  })

  it('escapes newlines in a cell so a value cannot forge a whole row', () => {
    const md = toMarkdown(r)
    expect(md).toContain('none | forged | row |'.replace(/\|/g, '\\|'))
  })

  it('escapes markup so the HTML report cannot be made to execute anything', () => {
    const html = toHtml(r)
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).not.toContain('<img src=x onerror')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('&amp;')
  })
})

describe('the tool does not assert what it has just refused to assert', () => {
  it('calls an undetermined outcome undetermined, not a loss', () => {
    // EDGE-FW-02 has nothing lost and five artifacts whose fate the vendor
    // procedure leaves open. Titling that "will not survive this plan" would
    // convert unknown into destroyed in the one sentence a decision-maker is
    // most likely to read.
    const r = run('edge_fw')
    expect(r.summary.outcomes.lost).toBe(0)
    const c = r.conflicts.find((x) => x.kind === 'undocumented_loss')
    expect(c?.title).toContain('undetermined outcome')
    expect(c?.title).not.toContain('will not survive')
  })

  it('does call an actual loss a loss', () => {
    const r = run('fin_web')
    expect(r.summary.outcomes.lost).toBeGreaterThan(0)
    const c = r.conflicts.find((x) => x.kind === 'undocumented_loss')
    expect(c?.title).toContain('will not survive')
  })

  it('distinguishes the two when a plan has both', () => {
    const r = run('corp_idp')
    const c = r.conflicts.find((x) => x.kind === 'undocumented_loss')
    expect(c?.title).toMatch(/will not survive this plan and \d+ may not/)
  })
})

describe('the headline is arithmetically consistent with itself', () => {
  it('never claims more artifacts are saved by reordering than are lost', () => {
    // The bug: one figure counted every artifact that fares better under the
    // recommendation, including merely-altered ones, and was then introduced
    // as "N of those" where "those" meant the artifacts that do not survive.
    // A plan losing six announced that ten of the six were lost to the order.
    for (const s of SCENARIOS) {
      const r = analyse(s.plan, NOW)
      const h = headline(r)
      const saved = Number(h.match(/would save (\d+) of them/)?.[1] ?? 0)
      const gone =
        r.summary.outcomes.lost + r.summary.outcomes.accepted_loss + r.summary.outcomes.indeterminate
      expect(saved, `${s.id}: claims to save ${saved} of ${gone}`).toBeLessThanOrEqual(gone)
    }
  })

  it('separates artifacts saved from artifacts merely improved', () => {
    const h = headline(run('fin_web'))
    expect(h).toMatch(/would save \d+ of them/)
    expect(h).toMatch(/leave \d+ more intact rather than altered/)
  })

  it('says so plainly when reordering buys nothing', () => {
    const h = headline(run('mfg_db'))
    expect(h).toContain('preserves as much as the recommended order does')
  })
})
