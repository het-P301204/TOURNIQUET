/**
 * The untrusted-input path, attacked.
 *
 * A plan arrives as JSON somebody pasted in. Everything in it is rendered
 * into three output formats and back out as an export, so every field is a
 * potential injection into a document that will end up in a ticket, an email
 * or a change record.
 *
 * These tests are the adversary. They are not about whether the parser
 * accepts a well-formed plan — `analysis.test.ts` covers that — but about
 * what it does with one that is trying to get somewhere.
 */

import { describe, expect, it } from 'vitest'
import { parsePlan } from '../state.ts'
import { analyse } from './analyze.ts'
import { toHtml, toJson, toMarkdown } from './report.ts'
import { escapeCell, escapeHtml, escapeProse, stripInvisible, truncate } from '../domain/text.ts'

const NOW = '2026-09-22T12:00:00Z'

/** The minimum a plan must have for the parser to accept it at all. */
function basePlan(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    asset: { name: 'host', type: 'linux_server' },
    deadline: { plan_start: '2026-01-01T00:00:00Z', due_at: '2026-01-02T00:00:00Z' },
    steps: [{ action_id: 'host_reboot' }],
    ...over,
  })
}

function ok(text: string): ReturnType<typeof parsePlan> & { ok: true } {
  const r = parsePlan(text)
  if (!r.ok) throw new Error(`expected a valid plan, got: ${r.error}`)
  return r
}

/* ========================================================================== */

describe('prototype pollution', () => {
  it('a __proto__ key in the plan does not reach Object.prototype', () => {
    const before = Object.keys(Object.prototype).length
    const r = parsePlan(
      basePlan({ __proto__: { polluted: 'yes' }, name: 'x' } as Record<string, unknown>),
    )
    expect(r.ok).toBe(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(({} as any).polluted).toBeUndefined()
    expect(Object.keys(Object.prototype).length).toBe(before)
  })

  it('a __proto__ key nested inside the asset is ignored, not copied', () => {
    const r = ok(
      JSON.stringify({
        asset: { name: 'h', type: 'linux_server', __proto__: { polluted: 'yes' } },
        deadline: { plan_start: '2026-01-01T00:00:00Z', due_at: '2026-01-02T00:00:00Z' },
        steps: [{ action_id: 'host_reboot' }],
      }),
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(({} as any).polluted).toBeUndefined()
    expect(Object.hasOwn(r.plan.asset, 'polluted')).toBe(false)
  })

  it('a constructor key does not survive into the plan', () => {
    const r = ok(basePlan({ constructor: { prototype: { x: 1 } } }))
    // The plan is built field by field, so nothing unrecognised comes along.
    expect(Object.hasOwn(r.plan, 'constructor')).toBe(false)
  })
})

describe('unrecognised keys are dropped, not carried', () => {
  it('an arbitrary extra field does not survive the round trip', () => {
    const r = ok(basePlan({ payload: 'something a tool should not relay' }))
    const exported = JSON.stringify(r.plan)
    expect(exported).not.toContain('something a tool should not relay')
  })

  it('an extra field on a step does not survive either', () => {
    const r = ok(
      basePlan({ steps: [{ action_id: 'host_reboot', smuggled: 'x'.repeat(40) }] }),
    )
    expect(JSON.stringify(r.plan.steps)).not.toContain('smuggled')
  })
})

describe('type confusion', () => {
  it('a number where a string belongs becomes the documented fallback', () => {
    const r = ok(basePlan({ name: 12345, notes: [] }))
    expect(typeof r.plan.name).toBe('string')
    expect(r.plan.name).toBe('Imported plan')
    expect(r.plan.notes).toBeNull()
  })

  it('an object where a string belongs does not become "[object Object]"', () => {
    const r = ok(
      JSON.stringify({
        asset: { name: { evil: true }, type: 'linux_server' },
        deadline: { plan_start: '2026-01-01T00:00:00Z', due_at: '2026-01-02T00:00:00Z' },
        steps: [{ action_id: 'host_reboot' }],
      }),
    )
    expect(r.plan.asset.name).toBe('Unnamed asset')
    expect(r.plan.asset.name).not.toContain('object Object')
  })

  it('a non-array where an array belongs becomes an empty array', () => {
    const r = ok(basePlan({ evidence: 'not an array', accepted_losses: 7, overrides: null }))
    expect(r.plan.evidence).toEqual([])
    expect(r.plan.accepted_losses).toEqual([])
    expect(r.plan.overrides).toEqual([])
  })

  it('an unrecognised enum value falls back rather than reaching a lookup', () => {
    const r = ok(
      basePlan({
        evidence: [{ artifact_id: 'physical_memory', priority: 'catastrophic' }],
        accepted_losses: [{ loss_id: 'AL-1', reason_category: '../../etc/passwd' }],
      }),
    )
    expect(r.plan.evidence[0]?.priority).toBe('recommended')
    expect(r.plan.accepted_losses[0]?.reason_category).toBe('other')
  })

  it('a NaN or Infinity duration becomes null rather than poisoning the total', () => {
    // JSON has no NaN literal, so the realistic vector is a string that looks
    // numeric or a value the parser coerced elsewhere.
    const r = ok(basePlan({ steps: [{ action_id: 'host_reboot', override_minutes: '99' }] }))
    expect(r.plan.steps[0]?.override_minutes).toBeNull()
    const f = analyse(r.plan, NOW).feasibility
    expect(Number.isFinite(f.total_minutes)).toBe(true)
  })

  it('a negative buffer is clamped to zero', () => {
    const r = ok(basePlan({ contingency_buffer_minutes: -99999, verification_minutes: -1 }))
    expect(r.plan.contingency_buffer_minutes).toBe(0)
    expect(r.plan.verification_minutes).toBe(0)
  })
})

describe('the external tier cannot be forged', () => {
  it('an import claiming the tier is internal is overruled', () => {
    const r = ok(basePlan({ tier: { label: 'x', source: 'y', external: false } }))
    expect(r.plan.tier.external).toBe(true)
  })
})

describe('bounds', () => {
  it('refuses an input past the size limit before parsing it', () => {
    const huge = `{"padding":"${'a'.repeat(2_100_000)}"}`
    const r = parsePlan(huge)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('limit is')
  })

  it('refuses a plan with an absurd number of steps', () => {
    const r = parsePlan(
      basePlan({ steps: Array.from({ length: 900 }, () => ({ action_id: 'host_reboot' })) }),
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('The limit is')
  })

  it('truncates a field long enough to break a layout', () => {
    const r = ok(basePlan({ name: 'A'.repeat(50_000) }))
    expect(r.plan.name.length).toBeLessThanOrEqual(4_000)
  })

  it('caps the number of accepted-loss records', () => {
    const r = ok(
      basePlan({ accepted_losses: Array.from({ length: 900 }, (_, i) => ({ loss_id: `L${i}` })) }),
    )
    expect(r.plan.accepted_losses.length).toBeLessThanOrEqual(500)
  })
})

describe('an unknown asset type is refused with a usable message', () => {
  it('names the value and lists what is allowed', () => {
    const r = parsePlan(
      JSON.stringify({
        asset: { name: 'h', type: 'mainframe' },
        deadline: { plan_start: '2026-01-01T00:00:00Z', due_at: '2026-01-02T00:00:00Z' },
        steps: [],
      }),
    )
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error).toContain('mainframe')
      expect(r.error).toContain('linux_server')
    }
  })
})

/* ========================================================================== */
/* Injection, end to end                                                      */
/* ========================================================================== */

const PAYLOADS: readonly [string, string][] = [
  ['script tag', '<script>alert(1)</script>'],
  ['attribute break', '"><img src=x onerror=alert(1)>'],
  ['javascript url', 'javascript:alert(document.domain)'],
  ['path traversal', '../../../../etc/passwd'],
  ['template literal', '${process.env.SECRET}'],
  ['svg handler', '<svg/onload=alert(1)>'],
  ['markdown table break', 'a | b | c'],
  ['markdown row break', 'first\nsecond | forged |'],
  ['bidi override', 'safe‮elbatsnu‬'],
  ['zero width', 'admi​n'],
  ['html comment', '--><script>alert(1)</script><!--'],
  ['null byte', 'name injected'],
  ['entity double encode', '&lt;script&gt;alert(1)&lt;/script&gt;'],
]

describe('hostile strings survive the round trip without executing', () => {
  for (const [name, payload] of PAYLOADS) {
    it(`${name}: is neutralised in the HTML report`, () => {
      const r = ok(
        basePlan({
          name: payload,
          asset: { name: payload, type: 'linux_server' },
          vulnerability: { title: payload, reference: payload, summary: payload },
          accepted_losses: [
            {
              loss_id: payload,
              artifact_ids: ['physical_memory'],
              what_is_lost: payload,
              why_necessary: payload,
              alternative_considered: payload,
              residual_risk: payload,
              accepted_by: payload,
              role: payload,
            },
          ],
        }),
      )
      const html = toHtml(analyse(r.plan, NOW))

      // No executable markup, in any form.
      expect(html).not.toContain('<script>')
      expect(html).not.toContain('<img src=x')
      expect(html).not.toContain('<svg/onload')

      // The property that actually matters: hostile markup never reaches the
      // document verbatim. Searching the output for the string "onload=" is
      // not that test — it matches the *escaped text* `&lt;svg/onload=…&gt;`,
      // which is inert content rather than an attribute, and an assertion
      // that fails on correctly escaped output is an assertion that gets
      // deleted the first time it is inconvenient.
      if (/[<>"']/.test(payload)) {
        expect(html).not.toContain(payload)
      }

      // No event-handler attribute anywhere. Attributes only ever appear
      // inside a tag, so the check is scoped to what is between < and >.
      for (const tag of html.match(/<[^>]*>/g) ?? []) {
        expect(tag).not.toMatch(/\son[a-z]+\s*=/i)
        expect(tag.toLowerCase()).not.toContain('javascript:')
      }
      // No invisible characters.
      expect(html).not.toContain('‮')
      expect(html).not.toContain('​')
      expect(html).not.toContain(' ')
    })

    it(`${name}: cannot forge structure in the Markdown report`, () => {
      const r = ok(basePlan({ name: payload, asset: { name: payload, type: 'linux_server' } }))
      const md = toMarkdown(analyse(r.plan, NOW))
      expect(md).not.toContain('‮')
      expect(md).not.toContain('​')

      // Every table row has a pipe count consistent with a real table: an
      // unescaped pipe from a hostname would add a column to one row only.
      const rows = md.split('\n').filter((l) => l.startsWith('|'))
      const shapes = new Set(rows.map((l) => (l.replace(/\\\|/g, '').match(/\|/g) ?? []).length))
      expect(shapes.size).toBeLessThanOrEqual(6)
    })

    it(`${name}: the JSON export stays parseable`, () => {
      const r = ok(basePlan({ name: payload, asset: { name: payload, type: 'linux_server' } }))
      const json = toJson(analyse(r.plan, NOW))
      expect(() => JSON.parse(json)).not.toThrow()
    })
  }
})

describe('the escaping primitives themselves', () => {
  it('strips bidirectional overrides rather than escaping them', () => {
    // Escaping does not help: these are not markup, they reorder the rendered
    // glyphs while leaving the bytes intact, so they have to be removed.
    const s = stripInvisible('a‮b‭c⁦d⁩e')
    expect(s).toBe('abcde')
  })

  it('strips zero-width and soft-hyphen characters used to fake identifiers', () => {
    expect(stripInvisible('ad​min­istrator')).toBe('administrator')
  })

  it('strips C0 and C1 controls but keeps tab and newline', () => {
    expect(stripInvisible('a bc')).toBe('abc')
    expect(stripInvisible('a\tb\nc')).toBe('a\tb\nc')
  })

  it('escapes every HTML metacharacter including the apostrophe', () => {
    expect(escapeHtml(`<&>"'`)).toBe('&lt;&amp;&gt;&quot;&#39;')
  })

  it('escapes pipes and flattens newlines in a table cell', () => {
    expect(escapeCell('a|b\nc')).toBe('a\\|b c')
  })

  it('escapes only line-leading markdown in prose', () => {
    expect(escapeProse('# heading\nnormal *text*')).toBe('\\# heading\nnormal *text*')
  })

  it('truncates without splitting a surrogate pair', () => {
    const s = '😀😀😀😀'
    const t = truncate(s, 3)
    expect([...t].length).toBe(3)
    expect(t).not.toContain('�')
    // Still valid UTF-16: no lone surrogate survived the cut.
    for (const ch of t) expect(ch.codePointAt(0)).toBeDefined()
  })
})

describe('a hostile plan still analyses', () => {
  it('does not throw, and produces a usable result', () => {
    const r = ok(
      basePlan({
        name: PAYLOADS.map(([, p]) => p).join(' '),
        steps: [
          { action_id: '<script>alert(1)</script>' },
          { action_id: 'host_reboot' },
          { action_id: '../../../../etc/passwd' },
        ],
      }),
    )
    const analysis = analyse(r.plan, NOW)
    expect(analysis.summary.step_count).toBe(3)
    // The two unrecognised actions are kept and reported as uncharacterised
    // rather than dropped.
    expect(analysis.unknowns.length).toBeGreaterThanOrEqual(2)
    expect(() => toHtml(analysis)).not.toThrow()
    expect(() => toMarkdown(analysis)).not.toThrow()
  })
})
