/**
 * Reports.
 *
 * Three formats from one analysis: Markdown for a ticket, HTML for somebody
 * who will read it once and never open a terminal, JSON for anything that
 * wants to consume it.
 *
 * The audience is mixed on purpose. The first three sections are written so an
 * incident commander can read them and stop; everything after that is for the
 * analyst who has to execute the sequence. Neither group should need to
 * understand the source to trust the document, which is why every section
 * states what it is claiming and the last two state what the tool cannot know.
 *
 * All operator-supplied text goes through `src/domain/text.ts` on the way out.
 * The HTML report is a self-contained file with no scripts, no external
 * references and a restrictive content security policy, because the realistic
 * end of its life is as an email attachment.
 */

import type { AnalysisResult, ArtifactOutcome, Conflict, Severity } from '../domain/types.ts'
import {
  CONFIDENCE_LABEL,
  DESTRUCTIVE_LABEL,
  FEASIBILITY_LABEL,
  FEASIBILITY_TEXT,
  IMPACT_LABEL,
  OUTCOME_LABEL,
  OUTCOME_TEXT,
  PRIORITY_LABEL,
  SCOPE_STATEMENT,
  SEVERITY_LABEL,
  CONFLICT_LABEL,
  ASSET_TYPE_LABEL,
} from '../domain/semantics.ts'
import { TIER_LABEL, VOLATILITY_RANK } from '../domain/volatility.ts'
import { formatDuration, formatInstant } from '../domain/time.ts'
import { escapeCell, escapeHtml, escapeProse, stripInvisible } from '../domain/text.ts'

/* ========================================================================== */
/* Shared shaping                                                             */
/* ========================================================================== */

const SEVERITY_ORDER: readonly Severity[] = ['critical', 'high', 'medium', 'informational']

function byVolatility(a: ArtifactOutcome, b: ArtifactOutcome): number {
  return VOLATILITY_RANK[a.tier] - VOLATILITY_RANK[b.tier] || a.name.localeCompare(b.name)
}

/** The one-paragraph answer, for a reader who will read one paragraph. */
export function headline(result: AnalysisResult): string {
  const o = result.summary.outcomes
  const gone = o.lost + o.accepted_loss
  const unclear = o.indeterminate
  const f = result.feasibility

  const clock =
    f.status === 'conflict'
      ? `The plan does not fit the ${formatDuration(f.available_minutes)} window.`
      : f.status === 'unknown'
        ? 'The plan cannot be timed, so it cannot be compared against the window.'
        : `The plan fits the ${formatDuration(f.available_minutes)} window with ${formatDuration(f.slack_minutes)} to spare.`

  const loss =
    gone === 0 && unclear === 0
      ? 'Nothing in the evidence catalogue is lost to it.'
      : `${gone > 0 ? `${gone} ${gone === 1 ? 'artifact' : 'artifacts'} will not survive it` : ''}${
          gone > 0 && unclear > 0 ? ', and ' : ''
        }${
          unclear > 0
            ? `${unclear} ${unclear === 1 ? 'artifact has' : 'artifacts have'} an outcome that cannot be determined from the plan as written`
            : ''
        }.`

  const { saved, improved } = resequencingGain(result)
  const order =
    saved === 0 && improved === 0
      ? 'The order the plan is written in preserves as much as the recommended order does.'
      : saved === 0
        ? `Resequencing the same steps would leave ${improved} ${
            improved === 1 ? 'artifact' : 'artifacts'
          } intact rather than altered, but would not save any that are gone.`
        : `Resequencing the same steps — same remediation, different order — would save ${saved} of ${
            saved === 1 ? 'them' : 'them'
          }${
            improved > 0
              ? ` and leave ${improved} more intact rather than altered`
              : ''
          }.`

  return `${clock} ${loss} ${order}`
}

/**
 * What the recommended order would buy, split into two honest numbers.
 *
 * The first version reported a single figure and wrote "N of those are lost
 * to the order", where "those" referred to the artifacts that do not survive.
 * The figure counted every artifact that fares better under the
 * recommendation, including ones merely going from altered to intact — so a
 * plan losing six artifacts announced that ten of the six were lost to the
 * order. Two counts, two clauses.
 */
function resequencingGain(result: AnalysisResult): { saved: number; improved: number } {
  const gone = (o: string): boolean => o === 'lost' || o === 'accepted_loss' || o === 'indeterminate'
  const badness = {
    preserved: 0,
    retained: 1,
    degraded: 2,
    indeterminate: 3,
    accepted_loss: 4,
    lost: 5,
  } as const

  const rec = new Map(result.recommended_outcomes.map((o) => [o.artifact_id, o]))
  let saved = 0
  let improved = 0
  for (const o of result.outcomes) {
    const r = rec.get(o.artifact_id)
    if (r === undefined || badness[o.outcome] <= badness[r.outcome]) continue
    if (gone(o.outcome) && !gone(r.outcome)) saved += 1
    else improved += 1
  }
  return { saved, improved }
}

/* ========================================================================== */
/* JSON                                                                       */
/* ========================================================================== */

/**
 * The analysis, whole.
 *
 * Not a reshaped summary: the same object the interface renders from, so a
 * consumer of the export and a reader of the screen are looking at the same
 * thing. `headline` is added because it is generated prose rather than data,
 * and a consumer should not have to reimplement it.
 */
export function toJson(result: AnalysisResult): string {
  return JSON.stringify({ headline: headline(result), ...result }, null, 2)
}

/* ========================================================================== */
/* Markdown                                                                   */
/* ========================================================================== */

export function toMarkdown(result: AnalysisResult): string {
  const { plan, summary, feasibility } = result
  const L: string[] = []
  const p = (s = ''): void => void L.push(s)

  const row = (cells: readonly string[]): string => `| ${cells.map(escapeCell).join(' | ')} |`
  const rule = (n: number): string => `|${' --- |'.repeat(n)}`

  p('# TOURNIQUET — remediation evidence preservation plan')
  p()
  p(`_${escapeProse(plan.name)}_`)
  p()
  p(`Analysis contract \`${result.analysis_version}\` · generated ${formatInstant(result.analysed_at)}`)
  p()

  /* ---- 1. executive summary ------------------------------------------- */
  p('## 1. Summary')
  p()
  p(escapeProse(headline(result)))
  p()
  p(row(['', '']))
  p(rule(2))
  p(row(['Asset', `${plan.asset.name} (${ASSET_TYPE_LABEL[plan.asset.type]})`]))
  p(row(['Vulnerability', `${plan.vulnerability.reference} — ${plan.vulnerability.title}`]))
  p(row(['Priority tier', `${plan.tier.label} — EXTERNAL INPUT, set by ${plan.tier.source}`]))
  p(row(['Deadline', `${formatInstant(plan.deadline.due_at)} (${plan.deadline.label})`]))
  p(row(['Plan start', formatInstant(plan.deadline.plan_start)]))
  p(row(['Preservation status', `${FEASIBILITY_LABEL[feasibility.status].toUpperCase()} — ${feasibility.explanation}`]))
  p(row(['Evidence preserved', String(summary.outcomes.preserved)]))
  p(row(['Evidence lost', String(summary.outcomes.lost)]))
  p(row(['Evidence degraded', String(summary.outcomes.degraded)]))
  p(row(['Outcome indeterminate', String(summary.outcomes.indeterminate)]))
  p(row(['Accepted losses on record', String(summary.accepted_loss_count)]))
  p(row(['Conflicts', String(summary.conflict_count)]))
  p()
  p('> **What this document is.** ' + SCOPE_STATEMENT.tourniquet.question + ' ' + SCOPE_STATEMENT.tourniquet.answer)
  p('>')
  p(`> **What it is not.** ${SCOPE_STATEMENT.prioritisation.question} ${SCOPE_STATEMENT.prioritisation.answer} ${SCOPE_STATEMENT.forensics.question} ${SCOPE_STATEMENT.forensics.answer}`)
  p()

  /* ---- 2. the clock ---------------------------------------------------- */
  p('## 2. Deadline feasibility')
  p()
  p(row(['Leg', 'Duration']))
  p(rule(2))
  p(row(['Preservation', formatDuration(feasibility.preservation_minutes)]))
  p(row(['Remediation', formatDuration(feasibility.remediation_minutes)]))
  p(row(['Verification (beyond the steps)', formatDuration(feasibility.verification_minutes)]))
  p(row(['Contingency buffer', formatDuration(feasibility.buffer_minutes)]))
  p(row(['**Total**', `**${formatDuration(feasibility.total_minutes)}**`]))
  p(row(['Window available', formatDuration(feasibility.available_minutes)]))
  p(row(['Slack', formatDuration(feasibility.slack_minutes)]))
  p()
  p(`**${FEASIBILITY_LABEL[feasibility.status].toUpperCase()}** — ${escapeProse(FEASIBILITY_TEXT[feasibility.status])}`)
  if (feasibility.unknown_duration_count > 0) {
    p()
    p(`${feasibility.unknown_duration_count} ${feasibility.unknown_duration_count === 1 ? 'step has' : 'steps have'} no duration estimate. They are excluded from the total rather than counted as zero, so the total above is a floor.`)
  }
  p()

  /* ---- 3. conflicts ---------------------------------------------------- */
  p('## 3. Conflicts requiring a human decision')
  p()
  if (result.conflicts.length === 0) {
    p('None. The plan as written preserves everything it sets out to preserve, within the window.')
  } else {
    p('Each conflict lists what a human could do about it. None of them has been decided here.')
    p()
    for (const c of [...result.conflicts].sort(bySeverity)) {
      p(`### ${SEVERITY_LABEL[c.severity].toUpperCase()} — ${escapeProse(c.title)}`)
      p()
      p(`_${CONFLICT_LABEL[c.kind]}_`)
      p()
      p(escapeProse(c.detail))
      p()
      p('Options for human review:')
      p()
      for (const o of c.options) p(`- ${escapeProse(o)}`)
      if (c.resolved_by) {
        p()
        p(`Decision on record: \`${stripInvisible(c.resolved_by)}\`.`)
      }
      p()
    }
  }

  /* ---- 4. the recommended sequence ------------------------------------- */
  p('## 4. Recommended preservation sequence')
  p()
  p(
    result.sequence.matches_plan_order
      ? 'The plan is already in the recommended order.'
      : 'The plan is **not** in this order. The steps are identical; only the sequence differs.',
  )
  p()
  p(row(['#', 'Step', 'Kind', 'Est.', 'Why now']))
  p(rule(5))
  for (const s of result.sequence.steps) {
    p(
      row([
        String(s.order),
        s.name,
        s.kind === 'capture' ? 'CAPTURE' : 'REMEDIATION',
        formatDuration(s.estimated_minutes),
        s.why_now,
      ]),
    )
  }
  p()

  /* ---- 5. evidence outcomes -------------------------------------------- */
  p('## 5. Evidence inventory and outcome')
  p()
  p('Outcome is under the plan **as written**. Where the recommended sequence would do better, the difference is in section 3.')
  p()
  p(row(['Artifact', 'Volatility', 'Priority', 'Outcome', 'Confidence', 'Explanation']))
  p(rule(6))
  for (const o of [...result.outcomes].sort(byVolatility)) {
    p(
      row([
        o.name,
        TIER_LABEL[o.tier],
        PRIORITY_LABEL[o.priority],
        OUTCOME_LABEL[o.outcome].toUpperCase(),
        CONFIDENCE_LABEL[o.confidence],
        o.explanation,
      ]),
    )
  }
  p()
  p('Outcome vocabulary:')
  p()
  for (const k of ['preserved', 'degraded', 'lost', 'retained', 'indeterminate', 'accepted_loss'] as const) {
    p(`- **${OUTCOME_LABEL[k]}** — ${OUTCOME_TEXT[k]}`)
  }
  p()

  /* ---- 6. destructive effects ------------------------------------------ */
  p('## 6. Destructive effects, step by step')
  p()
  p(row(['#', 'Step', 'Level', 'Reversible', 'Destroys', 'Alters', 'Unknown']))
  p(rule(7))
  for (const f of result.footprints) {
    p(
      row([
        String(f.index + 1),
        f.name,
        DESTRUCTIVE_LABEL[f.destructive_level],
        f.reversible === 'unknown' ? 'Unknown' : f.reversible ? 'Yes' : 'No',
        String(f.destroys.length),
        String(f.modifies.length + f.may_invalidate.length),
        String(f.unknown.length),
      ]),
    )
  }
  p()
  for (const f of result.footprints.filter((x) => x.destroys.length > 0)) {
    p(`**${escapeProse(f.name)}** destroys:`)
    p()
    for (const d of f.destroys) {
      const name = result.artifacts.find((a) => a.artifact_id === d.artifact_id)?.name ?? d.artifact_id
      p(`- ${escapeProse(name)} — ${escapeProse(d.rationale)} _(confidence: ${CONFIDENCE_LABEL[d.confidence].toLowerCase()})_`)
    }
    p()
  }

  /* ---- 7. unknown impact ----------------------------------------------- */
  p('## 7. Unknown impact')
  p()
  if (result.unknowns.length === 0) {
    p('Every step in this plan has a characterised relationship to every artifact in scope.')
  } else {
    p('Unknown is reported as unknown. It has not been converted into "safe" and it has not been converted into "destroyed".')
    p()
    for (const u of result.unknowns) {
      p(`### ${escapeProse(u.action_name)}`)
      p()
      p(escapeProse(u.reason))
      p()
      p(escapeProse(u.recommendation))
      p()
      p('Artifacts affected:')
      p()
      for (const id of u.artifact_ids) {
        const a = result.artifacts.find((x) => x.artifact_id === id)
        p(`- ${escapeProse(a?.name ?? id)}`)
      }
      p()
    }
  }

  /* ---- 8. accepted losses ---------------------------------------------- */
  p('## 8. Accepted losses')
  p()
  if (plan.accepted_losses.length === 0) {
    p('None recorded.')
    const undocumented = result.outcomes.filter(
      (o) => (o.outcome === 'lost' || o.outcome === 'indeterminate') && o.accepted_loss_id === null,
    )
    if (undocumented.length > 0) {
      p()
      p(
        `${undocumented.length} ${undocumented.length === 1 ? 'artifact' : 'artifacts'} will not survive this plan without a decision record. Losing evidence during remediation is frequently the right call; losing it without a record of who decided is the part that becomes a problem later.`,
      )
    }
  } else {
    for (const loss of plan.accepted_losses) {
      p(`### ${stripInvisible(loss.loss_id)} — accepted by ${escapeProse(loss.accepted_by)}, ${escapeProse(loss.role)}`)
      p()
      p(row(['', '']))
      p(rule(2))
      p(row(['What is lost', loss.what_is_lost]))
      p(row(['Artifacts', loss.artifact_ids.join(', ')]))
      p(row(['Reason category', loss.reason_category]))
      p(row(['Why it was necessary', loss.why_necessary]))
      p(row(['Alternative considered', loss.alternative_considered]))
      p(row(['Residual risk', loss.residual_risk]))
      p(row(['Decided at', formatInstant(loss.decided_at)]))
      p(row(['Remediation tier at the time', loss.tier_label]))
      p()
    }
  }
  p()

  /* ---- 9. overrides ---------------------------------------------------- */
  p('## 9. Manual overrides')
  p()
  if (plan.overrides.length === 0) {
    p('None. The order below is the one the operator entered.')
  } else {
    for (const o of plan.overrides) {
      p(`### ${stripInvisible(o.override_id)} — ${formatInstant(o.recorded_at)}`)
      p()
      p(`**Reason given:** ${escapeProse(o.reason)}`)
      p()
      p(`Recommended order: ${o.recommended_order.map((x) => `\`${stripInvisible(x)}\``).join(' → ')}`)
      p()
      p(`Order chosen: ${o.chosen_order.map((x) => `\`${stripInvisible(x)}\``).join(' → ')}`)
      if (o.newly_lost_artifact_ids.length > 0) {
        p()
        p(`Additional evidence lost as a result: ${o.newly_lost_artifact_ids.join(', ')}.`)
      }
      p()
    }
  }
  p()

  /* ---- 10. assumptions and limits -------------------------------------- */
  p('## 10. Assumptions')
  p()
  for (const a of result.assumptions) p(`- ${escapeProse(a)}`)
  p()
  p('## 11. Limitations')
  p()
  for (const l of result.limitations) p(`- ${escapeProse(l)}`)
  p()

  return L.join('\n')
}

function bySeverity(a: Conflict, b: Conflict): number {
  return (
    SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) ||
    a.conflict_id.localeCompare(b.conflict_id)
  )
}

/* ========================================================================== */
/* HTML                                                                       */
/* ========================================================================== */

/**
 * A single self-contained file.
 *
 * No scripts, no external stylesheet, no web font, no image. The content
 * security policy in the document forbids all of it, so the file behaves the
 * same whether it is opened from a ticket, an email attachment or a share.
 * It also prints: the layout is one column and the colours have been chosen
 * to survive greyscale, because a proportion of these will end up on paper in
 * a meeting.
 */
export function toHtml(result: AnalysisResult): string {
  const { plan, feasibility, summary } = result
  const e = escapeHtml

  const statusClass = `s-${feasibility.status}`
  const outcomeRows = [...result.outcomes]
    .sort(byVolatility)
    .map(
      (o) => `<tr>
        <th scope="row">${e(o.name)}</th>
        <td>${e(TIER_LABEL[o.tier])}</td>
        <td>${e(PRIORITY_LABEL[o.priority])}</td>
        <td><span class="pill o-${o.outcome}">${e(OUTCOME_LABEL[o.outcome])}</span></td>
        <td>${e(CONFIDENCE_LABEL[o.confidence])}</td>
        <td class="prose">${e(o.explanation)}</td>
      </tr>`,
    )
    .join('\n')

  const sequenceRows = result.sequence.steps
    .map(
      (s) => `<tr>
        <td class="num">${s.order}</td>
        <th scope="row">${e(s.name)}</th>
        <td><span class="pill k-${s.kind}">${s.kind === 'capture' ? 'Capture' : 'Remediation'}</span></td>
        <td class="num">${e(formatDuration(s.estimated_minutes))}</td>
        <td class="prose">${e(s.why_now)}</td>
      </tr>`,
    )
    .join('\n')

  const conflictBlocks =
    result.conflicts.length === 0
      ? '<p class="ok">None. The plan as written preserves everything it sets out to preserve, within the window.</p>'
      : [...result.conflicts]
          .sort(bySeverity)
          .map(
            (c) => `<article class="conflict c-${c.severity}">
        <h3><span class="sev">${e(SEVERITY_LABEL[c.severity])}</span> ${e(c.title)}</h3>
        <p class="kind">${e(CONFLICT_LABEL[c.kind])}</p>
        <p class="prose">${e(c.detail)}</p>
        <p class="lead">Options for human review — none of these has been chosen:</p>
        <ul>${c.options.map((o) => `<li>${e(o)}</li>`).join('')}</ul>
        ${c.resolved_by ? `<p class="note">Decision on record: <code>${e(c.resolved_by)}</code></p>` : ''}
      </article>`,
          )
          .join('\n')

  const unknownBlocks =
    result.unknowns.length === 0
      ? '<p class="ok">Every step in this plan has a characterised relationship to every artifact in scope.</p>'
      : result.unknowns
          .map(
            (u) => `<article class="unknown">
        <h3>${e(u.action_name)}</h3>
        <p class="prose">${e(u.reason)}</p>
        <p class="prose note">${e(u.recommendation)}</p>
        <ul>${u.artifact_ids
          .map((id) => {
            const a = result.artifacts.find((x) => x.artifact_id === id)
            return `<li>${e(a?.name ?? id)}</li>`
          })
          .join('')}</ul>
      </article>`,
          )
          .join('\n')

  const lossBlocks =
    plan.accepted_losses.length === 0
      ? '<p class="ok">None recorded.</p>'
      : plan.accepted_losses
          .map(
            (l) => `<article class="loss">
        <h3>${e(l.loss_id)}</h3>
        <dl>
          <dt>What is lost</dt><dd>${e(l.what_is_lost)}</dd>
          <dt>Artifacts</dt><dd><code>${e(l.artifact_ids.join(', '))}</code></dd>
          <dt>Reason</dt><dd>${e(l.reason_category)}</dd>
          <dt>Why it was necessary</dt><dd>${e(l.why_necessary)}</dd>
          <dt>Alternative considered</dt><dd>${e(l.alternative_considered)}</dd>
          <dt>Residual risk</dt><dd>${e(l.residual_risk)}</dd>
          <dt>Accepted by</dt><dd>${e(l.accepted_by)} — ${e(l.role)}</dd>
          <dt>Decided at</dt><dd>${e(formatInstant(l.decided_at))}</dd>
          <dt>Tier at the time</dt><dd>${e(l.tier_label)}</dd>
        </dl>
      </article>`,
          )
          .join('\n')

  const overrideBlocks =
    plan.overrides.length === 0
      ? '<p class="ok">None. The order analysed is the one the operator entered.</p>'
      : plan.overrides
          .map(
            (o) => `<article class="loss">
        <h3>${e(o.override_id)} <span class="note">${e(formatInstant(o.recorded_at))}</span></h3>
        <dl>
          <dt>Reason given</dt><dd>${e(o.reason)}</dd>
          <dt>Recommended order</dt><dd><code>${e(o.recommended_order.join(' → '))}</code></dd>
          <dt>Order chosen</dt><dd><code>${e(o.chosen_order.join(' → '))}</code></dd>
          <dt>Additional evidence lost</dt><dd>${
            o.newly_lost_artifact_ids.length === 0
              ? 'None'
              : `<code>${e(o.newly_lost_artifact_ids.join(', '))}</code>`
          }</dd>
        </dl>
      </article>`,
          )
          .join('\n')

  const footprintRows = result.footprints
    .map(
      (f) => `<tr>
      <td class="num">${f.index + 1}</td>
      <th scope="row">${e(f.name)}</th>
      <td>${e(DESTRUCTIVE_LABEL[f.destructive_level])}</td>
      <td>${f.reversible === 'unknown' ? 'Unknown' : f.reversible ? 'Yes' : 'No'}</td>
      <td class="num">${f.destroys.length}</td>
      <td class="num">${f.modifies.length + f.may_invalidate.length}</td>
      <td class="num">${f.unknown.length}</td>
    </tr>`,
    )
    .join('\n')

  const destroyDetail = result.footprints
    .filter((f) => f.destroys.length > 0)
    .map(
      (f) => `<article class="fp">
      <h3>${e(f.name)}</h3>
      <ul>${f.destroys
        .map((d) => {
          const name = result.artifacts.find((a) => a.artifact_id === d.artifact_id)?.name ?? d.artifact_id
          return `<li><strong>${e(name)}</strong> — ${e(d.rationale)} <span class="note">(${e(
            IMPACT_LABEL[d.impact].toLowerCase(),
          )}, confidence ${e(CONFIDENCE_LABEL[d.confidence].toLowerCase())})</span></li>`
        })
        .join('')}</ul>
    </article>`,
    )
    .join('\n')

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">
<title>TOURNIQUET — ${e(plan.name)}</title>
<style>
  :root {
    --ink: #14181f; --ink2: #4a5568; --ink3: #6b7684; --line: #dfe4ea;
    --bg: #ffffff; --panel: #f7f9fb;
    --preserved: #2b8a5f; --degraded: #a8721c; --lost: #a9353d; --unknown: #6a3fb5; --retained: #6c7480;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0 auto; padding: 48px 28px 96px; max-width: 62rem;
    font: 15px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, system-ui, sans-serif;
    color: var(--ink); background: var(--bg);
  }
  h1 { font-size: 26px; letter-spacing: -0.02em; margin: 0 0 6px; }
  h2 { font-size: 18px; letter-spacing: -0.01em; margin: 44px 0 12px; padding-bottom: 8px; border-bottom: 1px solid var(--line); }
  h3 { font-size: 15px; margin: 22px 0 8px; }
  p { margin: 0 0 12px; max-width: 74ch; }
  .sub { color: var(--ink2); margin-bottom: 4px; }
  .meta { color: var(--ink3); font-size: 13px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .lede { font-size: 16px; line-height: 1.65; border-left: 3px solid var(--ink); padding-left: 16px; margin: 24px 0; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0 20px; font-size: 13.5px; }
  th, td { text-align: left; vertical-align: top; padding: 8px 10px; border-bottom: 1px solid var(--line); }
  thead th { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--ink3); border-bottom: 1.5px solid var(--ink3); }
  tbody th { font-weight: 600; width: 22%; }
  td.num, th.num { font-variant-numeric: tabular-nums; white-space: nowrap; }
  td.prose { color: var(--ink2); }
  .kv th { color: var(--ink3); font-weight: 500; }
  .pill { display: inline-block; padding: 1px 7px; border-radius: 3px; font-size: 11px; font-weight: 700;
          text-transform: uppercase; letter-spacing: 0.06em; border: 1px solid currentColor; white-space: nowrap; }
  .o-preserved { color: var(--preserved); }
  .o-degraded { color: var(--degraded); }
  .o-lost { color: var(--lost); }
  .o-accepted_loss { color: var(--lost); }
  .o-indeterminate { color: var(--unknown); }
  .o-retained { color: var(--retained); }
  .k-capture { color: var(--preserved); }
  .k-remediation { color: var(--ink2); }
  .status { display: inline-block; padding: 4px 12px; border: 1.5px solid currentColor; border-radius: 4px;
            font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; font-size: 12px; }
  .s-feasible { color: var(--preserved); }
  .s-tight { color: var(--degraded); }
  .s-conflict { color: var(--lost); }
  .s-unknown { color: var(--unknown); }
  article { background: var(--panel); border: 1px solid var(--line); border-radius: 6px; padding: 16px 18px; margin: 0 0 14px; }
  article.conflict { border-left-width: 4px; }
  .c-critical { border-left-color: var(--lost); }
  .c-high { border-left-color: var(--lost); }
  .c-medium { border-left-color: var(--degraded); }
  .c-informational { border-left-color: var(--retained); }
  article.unknown { border-left: 4px solid var(--unknown); }
  .sev { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--ink3); }
  .kind { font-size: 12px; color: var(--ink3); margin: -4px 0 10px; }
  .lead { font-size: 13px; color: var(--ink2); margin-bottom: 4px; }
  .note { color: var(--ink3); font-size: 12.5px; }
  .ok { color: var(--ink2); }
  ul { margin: 0 0 8px; padding-left: 20px; }
  li { margin-bottom: 4px; max-width: 74ch; }
  dl { display: grid; grid-template-columns: minmax(9rem, 22%) 1fr; gap: 6px 16px; margin: 0; font-size: 13.5px; }
  dt { color: var(--ink3); font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.06em; padding-top: 2px; }
  dd { margin: 0; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; word-break: break-word; }
  .scope { border: 1px solid var(--line); border-radius: 6px; padding: 14px 18px; margin: 20px 0; font-size: 13.5px; }
  .scope dt { text-transform: none; letter-spacing: 0; font-size: 13.5px; color: var(--ink); font-weight: 600; }
  footer { margin-top: 56px; padding-top: 16px; border-top: 1px solid var(--line); color: var(--ink3); font-size: 12.5px; }
  @media print {
    body { padding: 0; max-width: none; font-size: 11pt; }
    h2 { page-break-after: avoid; }
    article, tr { page-break-inside: avoid; }
  }
</style>
</head>
<body>

<header>
  <h1>TOURNIQUET</h1>
  <p class="sub">Remediation evidence preservation plan</p>
  <p class="meta">${e(plan.name)} · contract ${e(result.analysis_version)} · generated ${e(formatInstant(result.analysed_at))}</p>
</header>

<p class="lede">${e(headline(result))}</p>

<h2>1. Summary</h2>
<table class="kv">
<tbody>
  <tr><th scope="row">Asset</th><td>${e(plan.asset.name)} <span class="note">(${e(ASSET_TYPE_LABEL[plan.asset.type])}, ${e(plan.asset.environment)}, owner ${e(plan.asset.owner)})</span></td></tr>
  <tr><th scope="row">Vulnerability</th><td><code>${e(plan.vulnerability.reference)}</code> — ${e(plan.vulnerability.title)}</td></tr>
  <tr><th scope="row">Priority tier</th><td><strong>${e(plan.tier.label)}</strong> <span class="note">— external input, set by ${e(plan.tier.source)}. TOURNIQUET did not calculate this.</span></td></tr>
  <tr><th scope="row">Window</th><td>${e(formatInstant(plan.deadline.plan_start))} → ${e(formatInstant(plan.deadline.due_at))} <span class="note">(${e(plan.deadline.label)})</span></td></tr>
  <tr><th scope="row">Preservation status</th><td><span class="status ${statusClass}">${e(FEASIBILITY_LABEL[feasibility.status])}</span></td></tr>
  <tr><th scope="row">Evidence</th><td class="num">${summary.outcomes.preserved} preserved · ${summary.outcomes.degraded} degraded · ${summary.outcomes.lost} lost · ${summary.outcomes.indeterminate} indeterminate · ${summary.outcomes.retained} retained · ${summary.outcomes.accepted_loss} accepted loss</td></tr>
  <tr><th scope="row">Conflicts</th><td class="num">${summary.conflict_count}</td></tr>
</tbody>
</table>

<div class="scope">
  <dl>
    <dt>${e(SCOPE_STATEMENT.prioritisation.question)}</dt><dd class="note">${e(SCOPE_STATEMENT.prioritisation.answer)}</dd>
    <dt>${e(SCOPE_STATEMENT.forensics.question)}</dt><dd class="note">${e(SCOPE_STATEMENT.forensics.answer)}</dd>
    <dt>${e(SCOPE_STATEMENT.tourniquet.question)}</dt><dd class="note">${e(SCOPE_STATEMENT.tourniquet.answer)}</dd>
  </dl>
</div>

<h2>2. Deadline feasibility</h2>
<table class="kv">
<tbody>
  <tr><th scope="row">Preservation</th><td class="num">${e(formatDuration(feasibility.preservation_minutes))}</td></tr>
  <tr><th scope="row">Remediation</th><td class="num">${e(formatDuration(feasibility.remediation_minutes))}</td></tr>
  <tr><th scope="row">Verification</th><td class="num">${e(formatDuration(feasibility.verification_minutes))}</td></tr>
  <tr><th scope="row">Contingency buffer</th><td class="num">${e(formatDuration(feasibility.buffer_minutes))}</td></tr>
  <tr><th scope="row">Total</th><td class="num"><strong>${e(formatDuration(feasibility.total_minutes))}</strong></td></tr>
  <tr><th scope="row">Window available</th><td class="num">${e(formatDuration(feasibility.available_minutes))}</td></tr>
  <tr><th scope="row">Slack</th><td class="num">${e(formatDuration(feasibility.slack_minutes))}</td></tr>
</tbody>
</table>
<p class="prose">${e(feasibility.explanation)}</p>

<h2>3. Conflicts requiring a human decision</h2>
${conflictBlocks}

<h2>4. Recommended preservation sequence</h2>
<p class="prose">${
    result.sequence.matches_plan_order
      ? 'The plan is already in this order.'
      : 'The plan is <strong>not</strong> in this order. The steps are identical and the remediation is unchanged; only the sequence differs.'
  }</p>
<table>
<thead><tr><th class="num">#</th><th>Step</th><th>Kind</th><th class="num">Est.</th><th>Why now</th></tr></thead>
<tbody>${sequenceRows}</tbody>
</table>

<h2>5. Evidence inventory and outcome</h2>
<p class="prose">Outcome is under the plan as written.</p>
<table>
<thead><tr><th>Artifact</th><th>Volatility</th><th>Priority</th><th>Outcome</th><th>Confidence</th><th>Explanation</th></tr></thead>
<tbody>${outcomeRows}</tbody>
</table>
<dl class="scope">
${(['preserved', 'degraded', 'lost', 'retained', 'indeterminate', 'accepted_loss'] as const)
  .map((k) => `<dt>${e(OUTCOME_LABEL[k])}</dt><dd class="note">${e(OUTCOME_TEXT[k])}</dd>`)
  .join('\n')}
</dl>

<h2>6. Destructive effects, step by step</h2>
<table>
<thead><tr><th class="num">#</th><th>Step</th><th>Level</th><th>Reversible</th><th class="num">Destroys</th><th class="num">Alters</th><th class="num">Unknown</th></tr></thead>
<tbody>${footprintRows}</tbody>
</table>
${destroyDetail}

<h2>7. Unknown impact</h2>
${unknownBlocks}

<h2>8. Accepted losses</h2>
${lossBlocks}

<h2>9. Manual overrides</h2>
${overrideBlocks}

<h2>10. Assumptions</h2>
<ul>${result.assumptions.map((a) => `<li>${e(a)}</li>`).join('')}</ul>

<h2>11. Limitations</h2>
<ul>${result.limitations.map((l) => `<li>${e(l)}</li>`).join('')}</ul>

<footer>
  <p>Generated by TOURNIQUET, a remediation sequencing planner. It plans an order; it does not acquire evidence and does not execute remediation. The action-to-evidence mappings are a synthetic library written for this tool and are not vendor statements.</p>
</footer>

</body>
</html>`
}
