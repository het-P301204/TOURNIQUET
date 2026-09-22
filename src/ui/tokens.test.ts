/**
 * The palette, asserted arithmetically.
 *
 * These are the same triplets that appear in `src/index.css`, duplicated on
 * purpose: the test is a specification of what the palette has to achieve, and
 * a test that read the CSS would only prove the CSS equals itself. The
 * duplication is the point of failure that catches a colour edited in one
 * place and not the other.
 */

import { describe, expect, it } from 'vitest'
import {
  BAR_STYLE,
  CONFIDENCE_STYLE,
  DESTRUCTIVE_STYLE,
  FEASIBILITY_STYLE,
  IMPACT_STYLE,
  OUTCOME_STYLE,
  contrast,
} from './tokens.ts'
import { OUTCOME_LABEL, OUTCOME_TEXT, IMPACT_TEXT, IMPACT_LABEL } from '../domain/semantics.ts'
import type { ImpactKind, PreservationOutcome } from '../domain/types.ts'

type RGB = readonly [number, number, number]

const DARK = {
  surface0: [11, 14, 20] as RGB,
  surface3: [30, 36, 49] as RGB,
  surface4: [40, 48, 63] as RGB,
  ink0: [240, 244, 250] as RGB,
  ink1: [188, 198, 213] as RGB,
  ink2: [165, 177, 194] as RGB,
  ink3: [133, 146, 166] as RGB,
  accent: [117, 162, 215] as RGB,
  link: [116, 194, 202] as RGB,
  time: [212, 190, 125] as RGB,
  preserved: [102, 183, 151] as RGB,
  degraded: [194, 141, 94] as RGB,
  lost: [188, 92, 95] as RGB,
  unknown: [155, 121, 200] as RGB,
  retained: [136, 141, 147] as RGB,
}

const LIGHT = {
  surface0: [233, 237, 244] as RGB,
  surface3: [226, 233, 242] as RGB,
  surface4: [212, 220, 232] as RGB,
  ink0: [11, 15, 21] as RGB,
  ink1: [52, 64, 80] as RGB,
  ink2: [70, 82, 100] as RGB,
  ink3: [90, 102, 120] as RGB,
  accent: [39, 93, 155] as RGB,
  link: [31, 112, 124] as RGB,
  time: [135, 101, 34] as RGB,
  preserved: [36, 123, 88] as RGB,
  degraded: [174, 108, 50] as RGB,
  lost: [152, 44, 48] as RGB,
  unknown: [122, 63, 199] as RGB,
  retained: [98, 104, 111] as RGB,
}

const THEMES = [
  ['dark', DARK],
  ['light', LIGHT],
] as const

describe('contrast', () => {
  for (const [name, t] of THEMES) {
    /**
     * Measured against the *lightest* surface text sits on in dark and the
     * darkest in light — `surface-3`, the hovered row — rather than only
     * against the page. A row that fails contrast on hover fails while it is
     * being read.
     */
    it(`${name}: all four ink tiers clear AA body text on the hovered row`, () => {
      for (const tier of ['ink0', 'ink1', 'ink2', 'ink3'] as const) {
        expect(contrast(t[tier], t.surface3), `${name} ${tier}`).toBeGreaterThanOrEqual(4.5)
      }
    })

    it(`${name}: the ink tiers are perceptibly separated from each other`, () => {
      // A hierarchy the reader cannot see is decoration.
      const tiers = (['ink0', 'ink1', 'ink2', 'ink3'] as const).map((k) => t[k])
      for (let i = 0; i + 1 < tiers.length; i++) {
        const a = tiers[i]
        const b = tiers[i + 1]
        if (!a || !b) throw new Error('tier missing')
        expect(contrast(a, b), `${name} tier ${i}/${i + 1}`).toBeGreaterThan(1.15)
      }
    })

    it(`${name}: every semantic hue clears AA large text on the hovered row`, () => {
      for (const hue of [
        'preserved',
        'degraded',
        'lost',
        'unknown',
        'retained',
        'accent',
        'link',
        'time',
      ] as const) {
        expect(contrast(t[hue], t.surface3), `${name} ${hue}`).toBeGreaterThanOrEqual(3)
      }
    })

    it(`${name}: every semantic hue also clears AA large text on a selected row`, () => {
      // `surface-4` exists so a selected row is distinguishable from a hovered
      // one. It is the lightest thing anything sits on in dark, so it is the
      // surface the palette actually has to survive.
      for (const hue of ['preserved', 'degraded', 'lost', 'unknown', 'retained', 'accent'] as const) {
        expect(contrast(t[hue], t.surface4), `${name} ${hue} on surface-4`).toBeGreaterThanOrEqual(3)
      }
    })

    it(`${name}: the two confusable role/fate pairs are separated`, () => {
      // Gold means the clock and orange means degraded evidence. They never
      // share a legend, but they are adjacent hues and a reader glancing at
      // a dense screen should not have to work out which is which.
      expect(contrast(t.time, t.degraded), `${name} time/degraded`).toBeGreaterThan(1.2)
      // Cyan means a relationship, blue means the product's own voice.
      expect(contrast(t.link, t.accent), `${name} link/accent`).toBeGreaterThan(1.15)
    })

    it(`${name}: the surface stack spans a real range`, () => {
      // Adjacent surfaces are deliberately close — a hovered row should not
      // flash — so the meaningful assertion is about the span from the page
      // to the most elevated surface, not about each step. Light needs a
      // smaller span than dark: on paper a 4% lightness step is clearly
      // visible, on near-black it is not.
      const span = contrast(t.surface0, t.surface4)
      expect(span, `${name} surface span`).toBeGreaterThan(name === 'dark' ? 1.3 : 1.06)
      expect(contrast(t.surface3, t.surface4), `${name} hover vs selected`).toBeGreaterThan(1.02)
    })

    it(`${name}: the four fate hues are separable from one another in lightness`, () => {
      // The check that matters for a reader who cannot distinguish two of the
      // hues. Every state also carries a glyph and a word, so hue is never the
      // only signal — but a palette where preserved and degraded are
      // equiluminant is still one where two of the four look the same, and the
      // first hand-tuned pass had them 1.14:1 apart. The shipped values were
      // solved to sit in separated luminance bands rather than chosen and
      // checked afterwards.
      const hues = (['preserved', 'degraded', 'lost', 'unknown'] as const).map((k) => t[k])
      for (let i = 0; i < hues.length; i++) {
        for (let j = i + 1; j < hues.length; j++) {
          const a = hues[i]
          const b = hues[j]
          if (!a || !b) throw new Error('hue missing')
          expect(contrast(a, b), `${name} hue ${i}/${j}`).toBeGreaterThan(1.2)
        }
      }
    })

    it(`${name}: retained is desaturated enough to read as "nothing happened"`, () => {
      // Not part of the fate separation test: it is a neutral on purpose, so
      // that an artifact the plan never touches does not compete for
      // attention with one the plan destroys. What it must not be is a hue.
      const [r, g, b] = t.retained
      const spread = Math.max(r, g, b) - Math.min(r, g, b)
      expect(spread, `${name} retained chroma`).toBeLessThan(30)
    })
  }
})

describe('state vocabulary', () => {
  const outcomes: readonly PreservationOutcome[] = [
    'preserved',
    'degraded',
    'lost',
    'retained',
    'indeterminate',
    'accepted_loss',
  ]

  it('every outcome has a glyph, so colour is never the only signal', () => {
    for (const o of outcomes) expect(OUTCOME_STYLE[o].glyph.length, o).toBeGreaterThan(0)
  })

  it('every outcome has a distinct short label', () => {
    const shorts = outcomes.map((o) => OUTCOME_STYLE[o].short)
    expect(new Set(shorts).size).toBe(shorts.length)
  })

  it('a lost bar is drawn at full opacity rather than faded out', () => {
    // Fading says "de-emphasised". The artifact stopped existing, which is a
    // different statement and needs a different mark.
    expect(BAR_STYLE.lost.opacity).toBe(1)
    expect(BAR_STYLE.retained.opacity).toBeLessThan(BAR_STYLE.lost.opacity)
  })

  it('lost and accepted loss share a hue and differ by glyph and word', () => {
    // Deliberate: both mean the artifact is gone. The difference is whether
    // anybody put their name to that, which is not a severity difference.
    expect(OUTCOME_STYLE.accepted_loss.text).toBe(OUTCOME_STYLE.lost.text)
    expect(OUTCOME_STYLE.accepted_loss.glyph).not.toBe(OUTCOME_STYLE.lost.glyph)
    expect(OUTCOME_STYLE.accepted_loss.short).not.toBe(OUTCOME_STYLE.lost.short)
  })

  it('no two outcomes are identical across hue, bar treatment and glyph at once', () => {
    // `lost` and `accepted_loss` are deliberately the same bar in the same
    // colour: on a timeline the artifact is gone either way, and drawing them
    // differently would imply the signature changed the outcome. They are
    // separated by glyph and by word, which is where the distinction lives.
    for (const a of outcomes) {
      for (const b of outcomes) {
        if (a === b) continue
        const sameBar =
          BAR_STYLE[a].opacity === BAR_STYLE[b].opacity &&
          BAR_STYLE[a].hatched === BAR_STYLE[b].hatched &&
          BAR_STYLE[a].severed === BAR_STYLE[b].severed
        const sameHue = OUTCOME_STYLE[a].text === OUTCOME_STYLE[b].text
        const sameGlyph = OUTCOME_STYLE[a].glyph === OUTCOME_STYLE[b].glyph
        expect(sameBar && sameHue && sameGlyph, `${a} and ${b} are indistinguishable`).toBe(false)
      }
    }
  })

  it('only lost evidence is severed, and only unknown is hatched', () => {
    expect(BAR_STYLE.lost.severed).toBe(true)
    expect(BAR_STYLE.accepted_loss.severed).toBe(true)
    expect(BAR_STYLE.preserved.severed).toBe(false)
    expect(BAR_STYLE.retained.severed).toBe(false)
    expect(BAR_STYLE.indeterminate.hatched).toBe(true)
    expect(BAR_STYLE.preserved.hatched).toBe(false)
  })

  it('every outcome has a label and an explanatory sentence, not just a colour', () => {
    for (const o of outcomes) {
      expect(OUTCOME_LABEL[o].length, o).toBeGreaterThan(3)
      expect(OUTCOME_TEXT[o].length, o).toBeGreaterThan(40)
    }
  })
})

describe('impact vocabulary', () => {
  const impacts: readonly ImpactKind[] = [
    'destroys',
    'modifies',
    'may_invalidate',
    'preserves',
    'unknown',
  ]

  it('every impact has a distinct glyph and short label', () => {
    expect(new Set(impacts.map((i) => IMPACT_STYLE[i].glyph)).size).toBe(impacts.length)
    expect(new Set(impacts.map((i) => IMPACT_STYLE[i].short)).size).toBe(impacts.length)
  })

  it('modifies and may_invalidate share a hue, because both mean "worth less"', () => {
    expect(IMPACT_STYLE.modifies.text).toBe(IMPACT_STYLE.may_invalidate.text)
    expect(IMPACT_STYLE.modifies.glyph).not.toBe(IMPACT_STYLE.may_invalidate.glyph)
  })

  it('unknown does not share a hue with preserves', () => {
    expect(IMPACT_STYLE.unknown.text).not.toBe(IMPACT_STYLE.preserves.text)
  })

  it('every impact has a sentence long enough to actually explain itself', () => {
    for (const i of impacts) {
      expect(IMPACT_LABEL[i].length, i).toBeGreaterThan(3)
      expect(IMPACT_TEXT[i].length, i).toBeGreaterThan(40)
    }
  })
})

describe('the secondary vocabularies', () => {
  it('feasibility statuses are all distinct', () => {
    const shorts = Object.values(FEASIBILITY_STYLE).map((s) => s.short)
    expect(new Set(shorts).size).toBe(shorts.length)
  })

  it('destructive levels are all distinct', () => {
    const shorts = Object.values(DESTRUCTIVE_STYLE).map((s) => s.short)
    expect(new Set(shorts).size).toBe(shorts.length)
  })

  it('confidence is rendered as a filled meter, so it reads without colour', () => {
    for (const c of ['high', 'medium', 'low', 'unknown'] as const) {
      expect(CONFIDENCE_STYLE[c].glyph).toHaveLength(3)
    }
    const filled = (g: string): number => [...g].filter((ch) => ch === '▮').length
    expect(filled(CONFIDENCE_STYLE.high.glyph)).toBe(3)
    expect(filled(CONFIDENCE_STYLE.medium.glyph)).toBe(2)
    expect(filled(CONFIDENCE_STYLE.low.glyph)).toBe(1)
    expect(filled(CONFIDENCE_STYLE.unknown.glyph)).toBe(0)
  })
})
