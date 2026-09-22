#!/usr/bin/env node
/**
 * Every number in the README, checked against the thing it describes.
 *
 * Documentation numbers rot the moment somebody adds a catalogue entry, and
 * a README that says "38 artifacts" over a catalogue of 41 undermines
 * everything else it says. Each claim below is a marker in the README of the
 * form `<!-- n:key -->N`, which this script rewrites in place, or verifies
 * with `--check`.
 *
 * The marker syntax is deliberately ugly so that nobody edits the number by
 * hand and expects it to stick.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { EVIDENCE_CATALOGUE } from '../src/data/evidence.ts'
import { ACTION_LIBRARY } from '../src/data/actions.ts'
import { SCENARIOS } from '../src/data/scenarios.ts'
import { VOLATILITY_ORDER } from '../src/domain/volatility.ts'
import { analyse } from '../src/engine/analyze.ts'

const ROOT = join(import.meta.dirname, '..')
const AT = '2026-09-22T12:00:00Z'
const check = process.argv.includes('--check')

const captures = ACTION_LIBRARY.filter((a) => a.category === 'capture')
const finWeb = SCENARIOS[0]
if (!finWeb) throw new Error('no scenarios')
const demo = analyse(finWeb.plan, AT)

/**
 * The flagship scenario's headline figures.
 *
 * These are the numbers the README uses to describe what the tool does, so
 * they are the ones most likely to be quoted and the most embarrassing to
 * get wrong.
 */
const rec = new Map(demo.recommended_outcomes.map((o) => [o.artifact_id, o.outcome]))
const savedByReorder = demo.outcomes.filter(
  (o) =>
    (o.outcome === 'lost' || o.outcome === 'accepted_loss' || o.outcome === 'indeterminate') &&
    rec.get(o.artifact_id) === 'preserved',
).length

const VALUES: Readonly<Record<string, number>> = {
  artifacts: EVIDENCE_CATALOGUE.length,
  actions: ACTION_LIBRARY.length,
  captures: captures.length,
  remediations: ACTION_LIBRARY.length - captures.length,
  rules: ACTION_LIBRARY.reduce((n, a) => n + a.effects.length, 0),
  tiers: VOLATILITY_ORDER.length,
  scenarios: SCENARIOS.length,
  'demo-artifacts': demo.summary.artifact_count,
  'demo-lost': demo.summary.outcomes.lost,
  'demo-saved': savedByReorder,
  'demo-conflicts': demo.conflicts.length,
}

const README = join(ROOT, 'README.md')
let text = readFileSync(README, 'utf8')

let wrong = 0
let seen = 0

for (const [key, value] of Object.entries(VALUES)) {
  const re = new RegExp(`(<!-- n:${key} -->)(\\d+)`, 'g')
  let found = false

  text = text.replace(re, (_m, marker: string, current: string) => {
    found = true
    seen += 1
    if (Number(current) !== value) {
      if (check) {
        wrong += 1
        console.error(`  FAIL  ${key}: README says ${current}, actual is ${value}`)
      } else {
        console.log(`  fixed ${key}: ${current} -> ${value}`)
      }
    } else if (check) {
      console.log(`  ok    ${key} = ${value}`)
    }
    return `${marker}${value}`
  })

  if (!found) {
    console.error(`  WARN  no marker for "${key}" in README.md (expected <!-- n:${key} -->)`)
  }
}

if (check) {
  console.log(`\n${seen} numbers checked.`)
  if (wrong > 0) {
    console.error(`${wrong} out of date. Run \`npm run docs-numbers\` to fix.\n`)
    process.exitCode = 1
  }
} else {
  writeFileSync(README, text, 'utf8')
  console.log(`\n${seen} numbers written to README.md.`)
}
