#!/usr/bin/env node
/**
 * Fixtures for the demonstration scenarios.
 *
 * Writes the full JSON analysis of every scenario to `fixtures/`, and with
 * `--check` verifies that regenerating them produces exactly what is on disk.
 *
 * This is the project's regression net for judgement rather than for
 * correctness. The test suite asserts specific properties; this asserts that
 * *nothing at all* changed. A rule added to the action library that quietly
 * reclassifies eleven artifacts across four scenarios shows up here as a diff
 * somebody has to look at and either accept or undo.
 *
 * It only works because the engine never reads a clock: the instant is passed
 * in, fixed below, and every figure downstream is derived from the plan's own
 * timestamps.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { analyse } from '../src/engine/analyze.ts'
import { toJson } from '../src/engine/report.ts'
import { SCENARIOS } from '../src/data/scenarios.ts'

/** Fixed, so the output is reproducible. Not "now" under any circumstances. */
const AT = '2026-09-22T12:00:00Z'

const DIR = join(import.meta.dirname, '..', 'fixtures')
const check = process.argv.includes('--check')

mkdirSync(DIR, { recursive: true })

let failures = 0

for (const scenario of SCENARIOS) {
  const path = join(DIR, `${scenario.id}.json`)
  const generated = `${toJson(analyse(scenario.plan, AT))}\n`

  if (!check) {
    writeFileSync(path, generated, 'utf8')
    console.log(`wrote ${scenario.id}.json  ${(generated.length / 1024).toFixed(1)} kB`)
    continue
  }

  let onDisk: string
  try {
    onDisk = readFileSync(path, 'utf8')
  } catch {
    console.error(`MISSING  fixtures/${scenario.id}.json — run: npm run fixtures`)
    failures += 1
    continue
  }

  if (onDisk === generated) {
    console.log(`ok       ${scenario.id}`)
    continue
  }

  failures += 1
  console.error(`CHANGED  ${scenario.id}`)
  // A first differing line is more useful than a diff of a 200 kB document.
  const a = onDisk.split('\n')
  const b = generated.split('\n')
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] === b[i]) continue
    console.error(`  line ${i + 1}`)
    console.error(`    on disk:   ${(a[i] ?? '<end of file>').trim().slice(0, 140)}`)
    console.error(`    generated: ${(b[i] ?? '<end of file>').trim().slice(0, 140)}`)
    break
  }
}

if (check && failures > 0) {
  console.error(
    `\n${failures} fixture${failures === 1 ? '' : 's'} differ from the current engine.`,
  )
  console.error('If the change is intended, run `npm run fixtures` and review the diff.')
  process.exitCode = 1
}
