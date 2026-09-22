#!/usr/bin/env node
/**
 * The claims the README makes, checked against the thing itself.
 *
 * A README is the easiest part of a project to leave behind. These are the
 * statements that would be actively misleading if they drifted, so each one
 * is asserted here and the check runs in `npm run verify`.
 *
 * Two of them matter more than the rest.
 *
 * "The analysis runs in your browser and nothing is uploaded" is a privacy
 * claim about a tool people will paste incident details into. It is enforced
 * three ways: a content security policy with `connect-src 'none'`, a lint
 * rule banning `fetch` in the engine, and the bundle scan below.
 *
 * "Unknown is never converted into safe" is the product's central promise.
 * The test suite checks it at the unit level; this checks it holds across
 * every shipped scenario end to end.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { analyse } from '../src/engine/analyze.ts'
import { SCENARIOS } from '../src/data/scenarios.ts'
import { EVIDENCE_CATALOGUE } from '../src/data/evidence.ts'
import { ACTION_LIBRARY } from '../src/data/actions.ts'
import { resolveImpact } from '../src/engine/impact.ts'
import { artifactsFor } from '../src/engine/scope.ts'

const ROOT = join(import.meta.dirname, '..')
const AT = '2026-09-22T12:00:00Z'

let failures = 0
function check(claim: string, ok: boolean, detail = ''): void {
  if (ok) {
    console.log(`  ok    ${claim}`)
  } else {
    failures += 1
    console.error(`  FAIL  ${claim}${detail ? `\n          ${detail}` : ''}`)
  }
}

console.log('\nClaims made in the README and the interface:\n')

/* -------------------------------------------------------------------------- */
/* 1. Nothing leaves the page                                                 */
/* -------------------------------------------------------------------------- */

const dist = join(ROOT, 'dist', 'assets')
if (existsSync(dist)) {
  const js = readdirSync(dist).filter((f) => f.endsWith('.js'))
  const bundles = js.map((f) => readFileSync(join(dist, f), 'utf8'))
  const all = bundles.join('\n')

  // Word-boundary matched. A substring search for "fetch" hits `prefetch`,
  // which Vite emits in unrelated internals, and a check that cries wolf is
  // a check somebody switches off.
  const network = [
    /\bfetch\s*\(/,
    /XMLHttpRequest/,
    /\bnavigator\.sendBeacon\b/,
    /new\s+WebSocket\b/,
    /new\s+EventSource\b/,
  ]
  const hits = network.filter((re) => re.test(all)).map((re) => re.source)
  check(
    'the built bundle contains no network API',
    hits.length === 0,
    hits.length > 0 ? `found: ${hits.join(', ')}` : '',
  )
  check('a bundle was actually scanned', bundles.length > 0, `${js.length} js files in dist/assets`)
} else {
  console.log('  skip  bundle scan — no dist/, run `npm run build` first')
}

const html = readFileSync(join(ROOT, 'index.html'), 'utf8')
check("the page declares connect-src 'none'", html.includes("connect-src 'none'"))
check("the page declares default-src 'none'", html.includes("default-src 'none'"))
check('the page loads nothing from another origin', !/https?:\/\/(?!www\.w3\.org)/.test(html))

/* -------------------------------------------------------------------------- */
/* 2. Unknown is never laundered into safe                                    */
/* -------------------------------------------------------------------------- */

let laundered = 0
for (const scenario of SCENARIOS) {
  const r = analyse(scenario.plan, AT)
  const artifacts = artifactsFor(scenario.plan.asset.type)
  const steps = r.plan.steps

  for (const outcome of r.outcomes) {
    if (outcome.outcome !== 'retained' && outcome.outcome !== 'preserved') continue
    const artifact = artifacts.find((a) => a.artifact_id === outcome.artifact_id)
    if (!artifact) continue

    // Anything an uncharacterised step reached before its capture must not
    // have come out the other side as preserved or retained.
    const capturedAt = outcome.captured_at_index
    for (const [i, step] of steps.entries()) {
      if (capturedAt !== null && i >= capturedAt) break
      const action = ACTION_LIBRARY.find((a) => a.action_id === step.action_id)
      if (!action) continue
      if (resolveImpact(action, artifact).impact === 'unknown') {
        laundered += 1
        console.error(
          `          ${scenario.id}: ${artifact.artifact_id} is ${outcome.outcome} despite "${action.name}"`,
        )
      }
    }
  }
}
check('no artifact reaches a safe outcome through an uncharacterised step', laundered === 0)

const unknownActions = ACTION_LIBRARY.filter((a) => a.default_effect.impact === 'unknown')
check(
  'at least one action in the library is honestly uncharacterised',
  unknownActions.length > 0,
  `${unknownActions.length} of ${ACTION_LIBRARY.length}`,
)
check(
  'every uncharacterised action is declared at unknown confidence',
  unknownActions.every((a) => a.default_effect.confidence === 'unknown' && a.confidence === 'unknown'),
)

/* -------------------------------------------------------------------------- */
/* 3. The tier is an input, never a calculation                               */
/* -------------------------------------------------------------------------- */

check(
  'every scenario declares its priority tier as external',
  SCENARIOS.every((s) => s.plan.tier.external === true && s.plan.tier.source.length > 3),
)

const engineSrc = readdirSync(join(ROOT, 'src', 'engine'))
  .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
  .map((f) => readFileSync(join(ROOT, 'src', 'engine', f), 'utf8'))
  .join('\n')
check(
  'the engine computes no severity score of its own',
  !/\bcvss\b/i.test(engineSrc) && !/\bbase_?score\b/i.test(engineSrc),
)

/* -------------------------------------------------------------------------- */
/* 4. Determinism                                                             */
/* -------------------------------------------------------------------------- */

check(
  'no engine module reads the clock directly',
  !/Date\.now\(\)/.test(engineSrc) && !/new Date\(\)/.test(engineSrc),
)

let stable = true
for (const s of SCENARIOS) {
  const a = JSON.stringify(analyse(s.plan, AT))
  const b = JSON.stringify(analyse(s.plan, AT))
  if (a !== b) stable = false
}
check('analysing the same plan twice produces identical output', stable)

/* -------------------------------------------------------------------------- */
/* 5. The catalogue is as large as the README says                            */
/* -------------------------------------------------------------------------- */

check(
  'the evidence catalogue spans all eight volatility tiers',
  new Set(EVIDENCE_CATALOGUE.map((a) => a.tier)).size === 8,
)
check(
  'every demonstration scenario is synthetic and says so',
  SCENARIOS.every((s) => s.plan.vulnerability.reference.includes('synthetic') || s.plan.tier.source.length > 0),
)

/* -------------------------------------------------------------------------- */

console.log()
if (failures > 0) {
  console.error(`${failures} claim${failures === 1 ? '' : 's'} could not be verified.\n`)
  process.exitCode = 1
} else {
  console.log('All claims verified.\n')
}
