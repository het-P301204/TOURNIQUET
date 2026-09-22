#!/usr/bin/env node
/**
 * The command line tool.
 *
 * Runs the same engine the interface does, with no build step and no
 * dependencies: Node strips the types and executes the `.ts` sources
 * directly. That is why everything reachable from here imports with a real
 * `.ts` extension, marks type-only imports as `import type`, and avoids every
 * TypeScript construct that needs a runtime emit. `eslint.config.js` enforces
 * all three.
 *
 * It exists because a remediation plan is frequently reviewed in a terminal,
 * in a pipeline, or by somebody who is not going to open a browser at two in
 * the morning. The exit code is the useful part in a pipeline: a plan with an
 * unresolved conflict fails.
 */

import { readFileSync } from 'node:fs'
import { analyse } from '../src/engine/analyze.ts'
import { toHtml, toJson, toMarkdown, headline } from '../src/engine/report.ts'
import { SCENARIOS, SCENARIO_BY_ID } from '../src/data/scenarios.ts'
import { EVIDENCE_CATALOGUE } from '../src/data/evidence.ts'
import { ACTION_LIBRARY } from '../src/data/actions.ts'
import { formatDuration } from '../src/domain/time.ts'
import {
  ASSET_TYPE_LABEL,
  DESTRUCTIVE_LABEL,
  FEASIBILITY_LABEL,
  OUTCOME_LABEL,
  SEVERITY_LABEL,
} from '../src/domain/semantics.ts'
import { TIER_LABEL, VOLATILITY_ORDER } from '../src/domain/volatility.ts'
import type { AnalysisResult, PreservationOutcome, RemediationPlan } from '../src/domain/types.ts'
import { parsePlan } from '../src/state.ts'

/* -------------------------------------------------------------------------- */
/* Terminal styling                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Colour only when a human is looking.
 *
 * `NO_COLOR` is honoured, and so is a redirected stdout — escape codes in a
 * file somebody is grepping are worse than no colour at all.
 */
const COLOUR = process.stdout.isTTY === true && process.env.NO_COLOR === undefined

/**
 * Built from a char code rather than written as a literal escape.
 *
 * A raw ESC byte in source is invisible in most editors and is the sort of
 * thing a reformat, a copy-paste or an encoding conversion silently eats.
 */
const ESC = String.fromCharCode(27)
const sgr = (code: string, s: string): string => `${ESC}[${code}m${s}${ESC}[0m`

const c = {
  dim: (s: string): string => (COLOUR ? sgr('2', s) : s),
  bold: (s: string): string => (COLOUR ? sgr('1', s) : s),
  green: (s: string): string => (COLOUR ? sgr('32', s) : s),
  amber: (s: string): string => (COLOUR ? sgr('33', s) : s),
  red: (s: string): string => (COLOUR ? sgr('31', s) : s),
  violet: (s: string): string => (COLOUR ? sgr('35', s) : s),
  grey: (s: string): string => (COLOUR ? sgr('90', s) : s),
}

/** Glyph plus colour. The glyph is what survives a pipe into a file. */
const MARK: Readonly<Record<PreservationOutcome, (s: string) => string>> = {
  preserved: c.green,
  degraded: c.amber,
  lost: c.red,
  accepted_loss: c.red,
  indeterminate: c.violet,
  retained: c.grey,
}

const GLYPH: Readonly<Record<PreservationOutcome, string>> = {
  preserved: '●',
  degraded: '◐',
  lost: '✕',
  accepted_loss: '✎',
  indeterminate: '?',
  retained: '○',
}

function pad(s: string, w: number): string {
  return s.length >= w ? s : s + ' '.repeat(w - s.length)
}

/* -------------------------------------------------------------------------- */
/* Output                                                                     */
/* -------------------------------------------------------------------------- */

function printSummary(r: AnalysisResult): void {
  const { plan, feasibility, summary } = r
  const line = (s = ''): void => console.log(s)

  line()
  line(c.bold('TOURNIQUET') + c.dim('  remediation evidence preservation plan'))
  line(c.dim('─'.repeat(74)))
  line()
  line(`  ${c.dim('Asset')}          ${plan.asset.name}  ${c.dim(`(${ASSET_TYPE_LABEL[plan.asset.type]})`)}`)
  line(`  ${c.dim('Vulnerability')}  ${plan.vulnerability.reference} — ${plan.vulnerability.title}`)
  line(
    `  ${c.dim('Priority')}       ${plan.tier.label}  ${c.dim(`— external input, set by ${plan.tier.source}`)}`,
  )
  line(`  ${c.dim('Window')}         ${formatDuration(feasibility.available_minutes)}  ${c.dim(`(${plan.deadline.label})`)}`)
  line()

  const tone =
    feasibility.status === 'feasible'
      ? c.green
      : feasibility.status === 'tight'
        ? c.amber
        : feasibility.status === 'conflict'
          ? c.red
          : c.violet
  line(`  ${tone(FEASIBILITY_LABEL[feasibility.status].toUpperCase())}  ${feasibility.explanation}`)
  line()
  line(`  ${wrap(headline(r), 72, '  ')}`)
  line()

  /* ---- outcomes ------------------------------------------------------- */
  line(c.dim('  EVIDENCE'))
  const o = summary.outcomes
  const cells: [PreservationOutcome, number][] = [
    ['preserved', o.preserved],
    ['degraded', o.degraded],
    ['lost', o.lost],
    ['accepted_loss', o.accepted_loss],
    ['indeterminate', o.indeterminate],
    ['retained', o.retained],
  ]
  line(
    '  ' +
      cells
        .map(([k, n]) => MARK[k](`${GLYPH[k]} ${String(n).padStart(2)} ${OUTCOME_LABEL[k]}`))
        .join('   '),
  )
  line()

  /* ---- sequence -------------------------------------------------------- */
  line(c.dim('  RECOMMENDED SEQUENCE'))
  if (r.sequence.matches_plan_order) {
    line(c.dim('  The plan is already in this order.'))
  } else {
    line(c.amber('  The plan is NOT in this order. Same steps, same remediation.'))
  }
  line()
  for (const s of r.sequence.steps) {
    const kind = s.kind === 'capture' ? c.green('CAPTURE') : c.dim('REMEDIATE')
    line(
      `  ${c.dim(String(s.order).padStart(2, '0'))}  ${pad(kind, COLOUR ? 18 : 9)} ${pad(s.name, 34)} ${c.dim(
        formatDuration(s.estimated_minutes).padStart(6),
      )}`,
    )
    line(`      ${c.dim(wrap(s.why_now, 66, '      '))}`)
    if (s.lost_after.length > 0) {
      line(`      ${c.red('lost here: ' + s.lost_after.join(', '))}`)
    }
  }
  line()

  /* ---- conflicts -------------------------------------------------------- */
  line(c.dim('  CONFLICTS'))
  if (r.conflicts.length === 0) {
    line(c.green('  None.'))
  } else {
    for (const x of r.conflicts) {
      const sev =
        x.severity === 'critical' || x.severity === 'high'
          ? c.red(SEVERITY_LABEL[x.severity].toUpperCase())
          : c.amber(SEVERITY_LABEL[x.severity].toUpperCase())
      line(`  ${sev}  ${x.title}`)
      line(`      ${c.dim(wrap(x.detail, 66, '      '))}`)
      line(c.dim('      Options, none of them chosen:'))
      for (const opt of x.options) line(c.dim(`        - ${wrap(opt, 62, '          ')}`))
      line()
    }
  }

  /* ---- unknowns --------------------------------------------------------- */
  if (r.unknowns.length > 0) {
    line(c.dim('  UNKNOWN IMPACT'))
    for (const u of r.unknowns) {
      line(`  ${c.violet('?')}  ${u.action_name}`)
      line(`      ${c.dim(wrap(u.reason, 66, '      '))}`)
    }
    line()
  }

  line(c.dim('─'.repeat(74)))
  line(
    c.dim(
      '  TOURNIQUET plans an order. It does not acquire evidence, execute remediation\n  or assess how urgent the vulnerability is. The action-to-evidence mappings are\n  a synthetic library written for this tool, not vendor statements.',
    ),
  )
  line()
}

/** Wrap prose to a width, indenting continuation lines. */
function wrap(text: string, width: number, indent: string): string {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let current = ''
  for (const w of words) {
    if (current.length + w.length + 1 > width) {
      lines.push(current)
      current = w
    } else {
      current = current === '' ? w : `${current} ${w}`
    }
  }
  if (current !== '') lines.push(current)
  return lines.join(`\n${indent}`)
}

function printCatalogue(): void {
  console.log()
  console.log(c.bold('EVIDENCE CATALOGUE') + c.dim(`  ${EVIDENCE_CATALOGUE.length} artifacts`))
  console.log()
  for (const tier of VOLATILITY_ORDER) {
    const inTier = EVIDENCE_CATALOGUE.filter((a) => a.tier === tier)
    if (inTier.length === 0) continue
    console.log(
      `  ${c.dim(String(VOLATILITY_ORDER.indexOf(tier) + 1))} ${c.bold(TIER_LABEL[tier])}`,
    )
    for (const a of inTier) {
      console.log(
        `      ${pad(a.artifact_id, 28)} ${c.dim(pad(formatDuration(a.collection.estimated_minutes), 8))} ${a.name}`,
      )
    }
    console.log()
  }

  console.log(c.bold('ACTION LIBRARY') + c.dim(`  ${ACTION_LIBRARY.length} actions`))
  console.log()
  for (const a of [...ACTION_LIBRARY].sort((x, y) => x.action_id.localeCompare(y.action_id))) {
    const lvl = DESTRUCTIVE_LABEL[a.destructive_level]
    const tone =
      a.destructive_level === 'high'
        ? c.red
        : a.destructive_level === 'moderate'
          ? c.amber
          : a.destructive_level === 'unknown'
            ? c.violet
            : c.dim
    console.log(
      `  ${pad(a.action_id, 26)} ${tone(pad(lvl, 16))} ${c.dim(pad(formatDuration(a.estimated_minutes), 8))} ${a.name}`,
    )
    console.log(
      c.dim(`      default effect: ${a.default_effect.impact} (${a.default_effect.confidence})`),
    )
  }
  console.log()
}

function printHelp(): void {
  console.log(`
${c.bold('TOURNIQUET')} — remediation evidence preservation planner

  Works out what each remediation step destroys, what has to be captured
  first, the order that preserves the most, and whether that fits the
  deadline you were given.

${c.bold('USAGE')}

  node bin/tourniquet.ts <command> [options]

${c.bold('COMMANDS')}

  analyse <file.json>   Analyse a plan. Accepts a plan object or a JSON
                        report export with the plan nested inside it.
  demo [scenario]       Analyse a built-in demonstration scenario.
  scenarios             List the demonstration scenarios.
  catalogue             Print the evidence catalogue and action library.
  help                  This.

${c.bold('OPTIONS')}

  --format <fmt>        text (default), markdown, html, json
  --strict              Exit non-zero if any conflict is unresolved.

${c.bold('EXIT CODES')}

  0   analysed; no unresolved conflict, or --strict not given
  1   --strict and at least one conflict is unresolved
  2   the plan could not be read

${c.bold('SCENARIOS')}

${SCENARIOS.map((s) => `  ${pad(s.id, 12)} ${s.label}`).join('\n')}

${c.dim('  TOURNIQUET plans an order. It does not scan, prioritise, acquire, patch or\n  execute anything, and it makes no network request.')}
`)
}

/* -------------------------------------------------------------------------- */
/* Entry                                                                      */
/* -------------------------------------------------------------------------- */

function emit(r: AnalysisResult, format: string): void {
  switch (format) {
    case 'markdown':
    case 'md':
      console.log(toMarkdown(r))
      break
    case 'html':
      console.log(toHtml(r))
      break
    case 'json':
      console.log(toJson(r))
      break
    default:
      printSummary(r)
  }
}

function main(argv: readonly string[]): number {
  const args = [...argv]
  const command = args.shift() ?? 'help'

  const formatIndex = args.indexOf('--format')
  const format = formatIndex >= 0 ? (args[formatIndex + 1] ?? 'text') : 'text'
  const strict = args.includes('--strict')
  // Guarded on `--format` actually being present. Without the guard,
  // `formatIndex` is -1 when it is absent, `formatIndex + 1` is 0, and the
  // filter silently drops the first positional argument -- so `demo mfg_db`
  // analysed the default scenario and said nothing about it.
  const formatValueIndex = formatIndex >= 0 ? formatIndex + 1 : -1
  const positional = args.filter((a, i) => !a.startsWith('--') && i !== formatValueIndex)

  // The clock is an argument to the engine, never read inside it. Taken once
  // here so every figure in one run agrees with every other.
  const now = new Date().toISOString()

  let plan: RemediationPlan

  switch (command) {
    case 'help':
    case '--help':
    case '-h':
      printHelp()
      return 0

    case 'scenarios':
      console.log()
      for (const s of SCENARIOS) {
        console.log(`  ${c.bold(pad(s.id, 12))} ${s.label}`)
        console.log(`  ${' '.repeat(12)} ${c.dim(wrap(s.teaches, 62, ' '.repeat(14)))}`)
        console.log()
      }
      return 0

    case 'catalogue':
      printCatalogue()
      return 0

    case 'demo': {
      const id = positional[0] ?? SCENARIOS[0]?.id ?? ''
      const scenario = SCENARIO_BY_ID.get(id)
      if (!scenario) {
        console.error(
          `Unknown scenario "${id}". Available: ${SCENARIOS.map((s) => s.id).join(', ')}`,
        )
        return 2
      }
      plan = scenario.plan
      break
    }

    case 'analyse':
    case 'analyze': {
      const file = positional[0]
      if (file === undefined) {
        console.error('analyse needs a file. Try: node bin/tourniquet.ts analyse plan.json')
        return 2
      }
      let text: string
      try {
        text = readFileSync(file, 'utf8')
      } catch (e) {
        console.error(`Could not read ${file}: ${e instanceof Error ? e.message : String(e)}`)
        return 2
      }
      const parsed = parsePlan(text)
      if (!parsed.ok) {
        console.error(parsed.error)
        return 2
      }
      plan = parsed.plan
      break
    }

    default:
      console.error(`Unknown command "${command}". Try: node bin/tourniquet.ts help`)
      return 2
  }

  const result = analyse(plan, now)
  emit(result, format)

  // Unresolved means nobody has signed for it. A conflict with a decision
  // record against it has been dealt with, and failing a pipeline for it
  // would punish the team for doing the right thing.
  const unresolved = result.conflicts.filter((x) => x.resolved_by === null)
  if (strict && unresolved.length > 0) {
    if (format === 'text') {
      console.error(
        `\n${unresolved.length} unresolved ${unresolved.length === 1 ? 'conflict' : 'conflicts'}. Exiting 1 because --strict was given.`,
      )
    }
    return 1
  }
  return 0
}

process.exitCode = main(process.argv.slice(2))
