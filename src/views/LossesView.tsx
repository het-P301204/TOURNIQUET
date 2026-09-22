/**
 * Accepted loss.
 *
 * A decision-record interface, not a checkbox. Every field on the form is
 * something a reviewer six months later will ask for, and the form refuses to
 * submit without the ones that make the record worth having: what is being
 * given up, why it was necessary, what else was considered, what nobody will
 * be able to determine afterwards, and who decided.
 *
 * The tool generates no legal or compliance language, because it has no
 * standing to. It records what a named person decided and why, and it says
 * exactly that.
 */

import { useMemo, useState } from 'react'
import type { AcceptedLoss, AnalysisResult } from '../domain/types.ts'
import { OUTCOME_LABEL } from '../domain/semantics.ts'
import { VOLATILITY_RANK } from '../domain/volatility.ts'
import { formatInstant } from '../domain/time.ts'
import { FOCUS, LABEL, OUTCOME_STYLE, PANEL_INSET } from '../ui/tokens.ts'
import { IconDecision } from '../ui/icons.tsx'
import {
  Button,
  Callout,
  Checkbox,
  Empty,
  Field,
  OutcomeBadge,
  Panel,
  PanelHeader,
  Row,
  Select,
  TextArea,
  TextInput,
  cx,
} from '../ui/primitives.tsx'

type Reason = AcceptedLoss['reason_category']

const REASONS: readonly { value: Reason; label: string }[] = [
  { value: 'operational', label: 'Operational constraint — a window, a schedule, a dependency' },
  { value: 'technical', label: 'Technical constraint — the collection is not possible here' },
  { value: 'deadline', label: 'Deadline — the remediation clock does not allow it' },
  { value: 'scope', label: 'Scope — the investigation does not need it' },
  { value: 'other', label: 'Other' },
]

interface Draft {
  readonly artifact_ids: readonly string[]
  readonly what_is_lost: string
  readonly reason_category: Reason
  readonly why_necessary: string
  readonly alternative_considered: string
  readonly residual_risk: string
  readonly accepted_by: string
  readonly role: string
}

const EMPTY: Draft = {
  artifact_ids: [],
  what_is_lost: '',
  reason_category: 'operational',
  why_necessary: '',
  alternative_considered: '',
  residual_risk: '',
  accepted_by: '',
  role: '',
}

export function LossesView({
  result,
  onAdd,
  onRemove,
  onSelectArtifact,
}: {
  result: AnalysisResult
  onAdd: (l: AcceptedLoss) => void
  onRemove: (id: string) => void
  onSelectArtifact: (id: string) => void
}) {
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [touched, setTouched] = useState(false)

  const byId = useMemo(
    () => new Map(result.artifacts.map((a) => [a.artifact_id, a])),
    [result.artifacts],
  )

  /** Everything that will not survive and has nobody's name against it. */
  const candidates = useMemo(
    () =>
      result.outcomes
        .filter(
          (o) =>
            (o.outcome === 'lost' || o.outcome === 'indeterminate') && o.accepted_loss_id === null,
        )
        .sort(
          (a, b) =>
            VOLATILITY_RANK[a.tier] - VOLATILITY_RANK[b.tier] || a.name.localeCompare(b.name),
        ),
    [result.outcomes],
  )

  const set = <K extends keyof Draft>(k: K, v: Draft[K]): void =>
    setDraft((d) => ({ ...d, [k]: v }))

  const errors: Partial<Record<keyof Draft, string>> = {}
  if (draft.artifact_ids.length === 0) errors.artifact_ids = 'Choose at least one artifact.'
  if (draft.what_is_lost.trim().length < 12)
    errors.what_is_lost = 'Say what is lost in a sentence a reviewer would understand.'
  if (draft.why_necessary.trim().length < 12)
    errors.why_necessary = 'A reason a reviewer can weigh, not a category.'
  if (draft.alternative_considered.trim().length < 6)
    errors.alternative_considered = 'What else was on the table, even if the answer is "nothing".'
  if (draft.residual_risk.trim().length < 12)
    errors.residual_risk = 'What will nobody be able to determine afterwards?'
  if (draft.accepted_by.trim().length < 2) errors.accepted_by = 'A person, not a team.'
  if (draft.role.trim().length < 2) errors.role = 'The role they are deciding in.'
  const valid = Object.keys(errors).length === 0

  const submit = (): void => {
    setTouched(true)
    if (!valid) return
    onAdd({
      loss_id: `AL-${String(result.plan.accepted_losses.length + 1).padStart(4, '0')}`,
      artifact_ids: draft.artifact_ids,
      what_is_lost: draft.what_is_lost.trim(),
      reason_category: draft.reason_category,
      why_necessary: draft.why_necessary.trim(),
      alternative_considered: draft.alternative_considered.trim(),
      residual_risk: draft.residual_risk.trim(),
      accepted_by: draft.accepted_by.trim(),
      role: draft.role.trim(),
      decided_at: result.analysed_at,
      tier_label: result.plan.tier.label,
    })
    setDraft(EMPTY)
    setTouched(false)
  }

  return (
    <div className="space-y-5">
      {/* ---- existing records -------------------------------------------- */}
      <Panel>
        <PanelHeader
          title={
            result.plan.accepted_losses.length === 0
              ? 'No decisions on record'
              : `${result.plan.accepted_losses.length} ${result.plan.accepted_losses.length === 1 ? 'decision' : 'decisions'} on record`
          }
          hint="Losing evidence during remediation is frequently the right call. Losing it without a record of who decided and why is the part that becomes a problem later."
        />
        {result.plan.accepted_losses.length === 0 ? (
          <Empty title="Nothing has been signed for yet">
            {candidates.length === 0
              ? 'Nothing in this plan is being lost without a record, so there is nothing to sign for.'
              : `${candidates.length} ${candidates.length === 1 ? 'artifact' : 'artifacts'} will not survive this plan. Use the form below to record a decision about ${candidates.length === 1 ? 'it' : 'them'}.`}
          </Empty>
        ) : (
          <ul className="space-y-4 p-5">
            {result.plan.accepted_losses.map((l) => (
              <li
                key={l.loss_id}
                className="overflow-hidden rounded-lg border border-lost/30 bg-surface-2"
              >
                {/* A decision record, drawn like one: a header band with the
                    identifier and the signature, then the fields. It should
                    read as something somebody put their name to, not as a
                    row in a table. */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-lost/25 bg-lost/8 px-4 py-2.5">
                  <p className="flex flex-wrap items-center gap-2.5">
                    <span className="text-lost">
                      <IconDecision size={15} />
                    </span>
                    <span className="font-mono text-xs font-semibold tracking-[0.08em] text-lost">
                      {l.loss_id}
                    </span>
                    <span className="text-2xs uppercase tracking-[0.1em] text-ink-3">
                      Accepted loss
                    </span>
                  </p>
                  <p className="flex flex-wrap items-baseline gap-2.5">
                    <span className="text-sm font-medium text-ink-0">{l.accepted_by}</span>
                    <span className="text-xs text-ink-2">{l.role}</span>
                    <span className="tnum font-mono text-2xs text-ink-3">
                      {formatInstant(l.decided_at)}
                    </span>
                    <Button size="sm" variant="quiet" onClick={() => onRemove(l.loss_id)}>
                      Remove
                    </Button>
                  </p>
                </div>

                <div className="px-4 py-3">
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {l.artifact_ids.map((id) => {
                    const o = result.outcomes.find((x) => x.artifact_id === id)
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => onSelectArtifact(id)}
                        className={cx(
                          PANEL_INSET,
                          'flex items-center gap-1.5 px-2 py-0.5 text-2xs text-ink-2 transition-colors duration-140 hover:text-ink-0',
                          FOCUS,
                        )}
                      >
                        {o ? (
                          <span aria-hidden="true" className={OUTCOME_STYLE[o.outcome].text}>
                            {OUTCOME_STYLE[o.outcome].glyph}
                          </span>
                        ) : null}
                        {byId.get(id)?.name ?? id}
                      </button>
                    )
                  })}
                </div>

                <dl>
                  <Row label="What is lost">{l.what_is_lost}</Row>
                  <Row label="Reason">{REASONS.find((r) => r.value === l.reason_category)?.label ?? l.reason_category}</Row>
                  <Row label="Why necessary">{l.why_necessary}</Row>
                  <Row label="Alternative considered">{l.alternative_considered}</Row>
                  <Row label="Residual risk">
                    <span className="text-lost">{l.residual_risk}</span>
                  </Row>
                  <Row label="Tier at the time">{l.tier_label}</Row>
                </dl>

                {/* Staleness: a record against something the plan preserves. */}
                {l.artifact_ids.some((id) => {
                  const o = result.outcomes.find((x) => x.artifact_id === id)
                  return o !== undefined && o.outcome !== 'accepted_loss'
                }) ? (
                  <Callout tone="warn" title="Part of this record is stale">
                    Under the plan as it stands now, at least one artifact named here is not
                    actually lost. The record has been kept rather than quietly deleted — check
                    whether the decision still applies.
                  </Callout>
                ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {/* ---- the form ------------------------------------------------------ */}
      <Panel>
        <PanelHeader
          title="Record a decision"
          hint="Everything here goes into the plan, the report and the JSON export. Nothing is generated for you: a decision record written by a tool is not a decision."
        />

        <div className="space-y-5 px-5 py-5">
          <div>
            <p className={cx(LABEL, 'mb-2')}>
              What is being given up
              {candidates.length > 0 ? (
                <span className="ml-2 normal-case tracking-normal text-ink-3">
                  {candidates.length} without a record
                </span>
              ) : null}
            </p>
            {candidates.length === 0 ? (
              <p className="text-sm text-ink-3">
                Nothing in this plan is currently being lost without a record. You can still
                record a decision in advance by changing the plan first.
              </p>
            ) : (
              <div
                className={cx(
                  PANEL_INSET,
                  'scroll-thin max-h-64 space-y-2.5 overflow-y-auto p-4',
                  touched && errors.artifact_ids ? 'border-lost/50' : '',
                )}
              >
                {candidates.map((o) => (
                  <Checkbox
                    key={o.artifact_id}
                    checked={draft.artifact_ids.includes(o.artifact_id)}
                    onChange={(v) =>
                      set(
                        'artifact_ids',
                        v
                          ? [...draft.artifact_ids, o.artifact_id]
                          : draft.artifact_ids.filter((x) => x !== o.artifact_id),
                      )
                    }
                    label={
                      <span className="flex flex-wrap items-center gap-2">
                        <span>{o.name}</span>
                        <OutcomeBadge outcome={o.outcome} />
                      </span>
                    }
                    hint={byId.get(o.artifact_id)?.answers}
                  />
                ))}
              </div>
            )}
            {touched && errors.artifact_ids ? (
              <p className="mt-1.5 text-2xs text-lost">{errors.artifact_ids}</p>
            ) : null}
          </div>

          <FormField
            label="What is lost"
            hint="In the words you would use to a colleague. A reviewer should not have to look anything up."
            error={touched ? errors.what_is_lost : undefined}
          >
            {(id) => (
              <TextArea
                id={id}
                rows={2}
                value={draft.what_is_lost}
                onChange={(v) => set('what_is_lost', v)}
                placeholder="Live memory will not be acquired, so anything that was executing without a file on disk will not be recoverable."
                invalid={touched && errors.what_is_lost !== undefined}
              />
            )}
          </FormField>

          <FormField label="Reason category">
            {(id) => (
              <Select
                id={id}
                value={draft.reason_category}
                onChange={(v) => set('reason_category', v)}
                options={REASONS}
              />
            )}
          </FormField>

          <FormField
            label="Why it was necessary"
            hint="The constraint, specifically. 'No time' is not a reason anybody can weigh later."
            error={touched ? errors.why_necessary : undefined}
          >
            {(id) => (
              <TextArea
                id={id}
                rows={2}
                value={draft.why_necessary}
                onChange={(v) => set('why_necessary', v)}
                placeholder="The approved maintenance procedure begins with a shutdown at a fixed time set by the production schedule, and the line cannot be held."
                invalid={touched && errors.why_necessary !== undefined}
              />
            )}
          </FormField>

          <FormField
            label="Alternative considered"
            hint="What else was on the table, and why it was rejected. 'Nothing' is an acceptable answer if it is true."
            error={touched ? errors.alternative_considered : undefined}
          >
            {(id) => (
              <TextArea
                id={id}
                rows={2}
                value={draft.alternative_considered}
                onChange={(v) => set('alternative_considered', v)}
                placeholder="A targeted process dump at roughly eight minutes was considered and rejected: it would consume the whole window and leave no time for the upgrade."
                invalid={touched && errors.alternative_considered !== undefined}
              />
            )}
          </FormField>

          <FormField
            label="Residual risk"
            hint="What will nobody be able to determine afterwards? This is the field the record exists for."
            error={touched ? errors.residual_risk : undefined}
          >
            {(id) => (
              <TextArea
                id={id}
                rows={2}
                value={draft.residual_risk}
                onChange={(v) => set('residual_risk', v)}
                placeholder="If the host was compromised, we will be unable to determine whether anything was executing that never touched disk."
                invalid={touched && errors.residual_risk !== undefined}
              />
            )}
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="Accepted by"
              hint="A named person. A team cannot make this decision."
              error={touched ? errors.accepted_by : undefined}
            >
              {(id) => (
                <TextInput
                  id={id}
                  value={draft.accepted_by}
                  onChange={(v) => set('accepted_by', v)}
                  placeholder="R. Okonjo"
                  invalid={touched && errors.accepted_by !== undefined}
                />
              )}
            </FormField>
            <FormField
              label="Role"
              error={touched ? errors.role : undefined}
            >
              {(id) => (
                <TextInput
                  id={id}
                  value={draft.role}
                  onChange={(v) => set('role', v)}
                  placeholder="Incident Commander"
                  invalid={touched && errors.role !== undefined}
                />
              )}
            </FormField>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-line-1 pt-4">
            <Button variant="primary" onClick={submit}>
              Record the decision
            </Button>
            {touched && !valid ? (
              <span className="text-xs text-lost">
                {Object.keys(errors).length} {Object.keys(errors).length === 1 ? 'field' : 'fields'}{' '}
                still needed.
              </span>
            ) : (
              <span className="text-2xs text-ink-3">
                Timestamped {formatInstant(result.analysed_at)} against tier "{result.plan.tier.label}".
              </span>
            )}
          </div>
        </div>
      </Panel>

      <Panel>
        <PanelHeader title="What a decision record is not" />
        <div className="px-5 py-4">
          <ul className="max-w-[84ch] space-y-2 text-sm leading-relaxed text-ink-2">
            <li>
              It is not an approval. TOURNIQUET has no workflow, no authority and no idea who in
              your organisation is allowed to accept this.
            </li>
            <li>
              It is not a compliance artifact. No standard is cited and none is implied; the tool
              generates no legal language because it has no standing to.
            </li>
            <li>
              It does not change the outcome. An artifact with a decision against it is still
              destroyed — the record says somebody knew, not that it survived.
            </li>
          </ul>
        </div>
      </Panel>
    </div>
  )
}

function FormField({
  label,
  hint,
  error,
  children,
}: {
  label: string
  hint?: string
  error?: string
  children: (id: string) => React.ReactNode
}) {
  return (
    <div>
      <Field label={label} hint={error ? undefined : hint}>
        {children}
      </Field>
      {error ? <p className="mt-1.5 text-2xs text-lost">{error}</p> : null}
    </div>
  )
}

/** Re-exported so the command palette can name the outcome labels. */
export { OUTCOME_LABEL }
