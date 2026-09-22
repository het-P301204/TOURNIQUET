/**
 * Application state.
 *
 * One reducer over one plan. Every screen is a projection of `analyse(plan,
 * now)`, recomputed from scratch on each change — the analysis of a realistic
 * plan is a few thousand map lookups, and keeping a derived copy in state
 * would buy nothing and introduce the class of bug where two screens disagree.
 *
 * The reducer owns plan edits and nothing else. Transient interface state —
 * which drawer is open, where the loss boundary is parked — lives here too,
 * but it is deliberately kept separate from the plan so that "what would I
 * export" is always exactly `state.plan`.
 */

import type {
  AcceptedLoss,
  AssetType,
  CollectionPriority,
  OverrideRecord,
  PreservationOutcome,
  RemediationPlan,
  Severity,
} from './domain/types.ts'
import { stripInvisible } from './domain/text.ts'
import { DEFAULT_SCENARIO, SCENARIO_BY_ID } from './data/scenarios.ts'

/* -------------------------------------------------------------------------- */
/* Views                                                                      */
/* -------------------------------------------------------------------------- */

export type ViewId =
  | 'command'
  | 'plan'
  | 'evidence'
  | 'sequence'
  | 'timeline'
  | 'conflicts'
  | 'losses'
  | 'report'
  | 'catalogue'

export interface ViewSpec {
  readonly id: ViewId
  readonly label: string
  /** The question this view exists to answer. Rendered under its title. */
  readonly question: string
  readonly group: 'Situation' | 'The plan' | 'Decisions' | 'Output'
}

export const VIEWS: readonly ViewSpec[] = [
  {
    id: 'command',
    label: 'Command centre',
    question: 'Before you fix it, what will you lose the ability to know?',
    group: 'Situation',
  },
  {
    id: 'evidence',
    label: 'Evidence map',
    question:
      'Which step reaches which artifact, and what does it do to it? Every mapping, with its rule and its confidence.',
    group: 'Situation',
  },
  {
    id: 'plan',
    label: 'Remediation plan',
    question:
      'What are you actually going to do, in what order, and what does each step cost in evidence?',
    group: 'The plan',
  },
  {
    id: 'sequence',
    label: 'Preservation sequence',
    question:
      'What order would preserve the most, and why is each step where it is? Nothing here is a black box.',
    group: 'The plan',
  },
  {
    id: 'timeline',
    label: 'Timeline',
    question:
      'Where does the evidence stop existing, measured against the clock you have been given?',
    group: 'The plan',
  },
  {
    id: 'conflicts',
    label: 'Conflict centre',
    question:
      'Where can the plan not satisfy both obligations? Stated, with options — the choice stays with you.',
    group: 'Decisions',
  },
  {
    id: 'losses',
    label: 'Accepted loss',
    question: 'What is being given up on purpose, why, and who decided?',
    group: 'Decisions',
  },
  {
    id: 'report',
    label: 'Report',
    question: 'The whole analysis, in a form somebody who has never seen this tool can read.',
    group: 'Output',
  },
  {
    id: 'catalogue',
    label: 'Catalogue & data',
    question:
      'The evidence catalogue and action library this analysis is built on, and where to load your own plan.',
    group: 'Output',
  },
]

export const VIEW_BY_ID: ReadonlyMap<ViewId, ViewSpec> = new Map(VIEWS.map((v) => [v.id, v]))

/* -------------------------------------------------------------------------- */
/* Filters                                                                    */
/* -------------------------------------------------------------------------- */

export interface Filters {
  readonly query: string
  readonly outcomes: readonly PreservationOutcome[]
  readonly severities: readonly Severity[]
  /** Volatility class, as the coarse band rather than the eight tiers. */
  readonly volatility: readonly ('volatile' | 'semi_volatile' | 'persistent')[]
  readonly priorities: readonly CollectionPriority[]
  readonly onlyHarmful: boolean
}

export const DEFAULT_FILTERS: Filters = {
  query: '',
  outcomes: [],
  severities: [],
  volatility: [],
  priorities: [],
  onlyHarmful: false,
}

export function filtersActive(f: Filters): boolean {
  return (
    f.query.trim() !== '' ||
    f.outcomes.length > 0 ||
    f.severities.length > 0 ||
    f.volatility.length > 0 ||
    f.priorities.length > 0 ||
    f.onlyHarmful
  )
}

/* -------------------------------------------------------------------------- */
/* State                                                                      */
/* -------------------------------------------------------------------------- */

export interface State {
  readonly plan: RemediationPlan
  /** Which demo is loaded, or `'custom'` once the operator has changed it. */
  readonly source: string
  readonly view: ViewId
  readonly filters: Filters
  /** Index into the executed order. The loss boundary sits after this step. */
  readonly boundary: number
  readonly selectedArtifact: string | null
  readonly selectedStep: string | null
  readonly selectedConflict: string | null
  readonly paletteOpen: boolean
  readonly loadError: string | null
  /** Set when the operator has reordered away from the recommendation. */
  readonly pendingOverride: { readonly recommended: readonly string[] } | null
}

export function initialState(): State {
  return {
    plan: DEFAULT_SCENARIO.plan,
    source: DEFAULT_SCENARIO.id,
    view: 'command',
    filters: DEFAULT_FILTERS,
    // Parked at the end of the plan. The counts above the diagram describe
    // the state after everything has run, and a boundary that started at zero
    // showed a diagram contradicting them until the reader dragged it.
    boundary: DEFAULT_SCENARIO.plan.steps.length,
    selectedArtifact: null,
    selectedStep: null,
    selectedConflict: null,
    paletteOpen: false,
    loadError: null,
    pendingOverride: null,
  }
}

/* -------------------------------------------------------------------------- */
/* Actions                                                                    */
/* -------------------------------------------------------------------------- */

export type Action =
  | { type: 'view'; view: ViewId }
  | { type: 'scenario'; id: string }
  | { type: 'boundary'; index: number }
  | { type: 'select-artifact'; id: string | null }
  | { type: 'select-step'; id: string | null }
  | { type: 'select-conflict'; id: string | null }
  | { type: 'palette'; open: boolean }
  | { type: 'filter-query'; query: string }
  | { type: 'filter-outcome'; outcome: PreservationOutcome }
  | { type: 'filter-severity'; severity: Severity }
  | { type: 'filter-volatility'; band: 'volatile' | 'semi_volatile' | 'persistent' }
  | { type: 'filter-priority'; priority: CollectionPriority }
  | { type: 'filter-harmful'; value: boolean }
  | { type: 'reset-filters' }
  | { type: 'move-step'; step_id: string; direction: -1 | 1; recommended: readonly string[] }
  | { type: 'remove-step'; step_id: string }
  | { type: 'add-step'; action_id: string; at?: number }
  | { type: 'set-step-minutes'; step_id: string; minutes: number | null }
  | { type: 'adopt-sequence'; order: readonly string[] }
  | { type: 'set-priority'; artifact_id: string; priority: CollectionPriority }
  | { type: 'set-included'; artifact_id: string; included: boolean }
  | { type: 'set-buffer'; minutes: number }
  | { type: 'set-verification'; minutes: number }
  | { type: 'set-deadline'; due_at: string }
  | { type: 'add-loss'; loss: AcceptedLoss }
  | { type: 'remove-loss'; loss_id: string }
  | { type: 'record-override'; override: OverrideRecord }
  | { type: 'dismiss-override' }
  | { type: 'remove-override'; override_id: string }
  | { type: 'load-json'; text: string }
  | { type: 'dismiss-load-error' }

/* -------------------------------------------------------------------------- */
/* Reducer                                                                    */
/* -------------------------------------------------------------------------- */

/** Any plan edit marks the plan as the operator's rather than a demo. */
function edited(state: State, plan: RemediationPlan): State {
  return {
    ...state,
    plan,
    source: SCENARIO_BY_ID.has(state.source) ? 'custom' : state.source,
    // The boundary indexes into the step list, which has just changed under
    // it. Clamping here rather than in the view keeps every consumer from
    // having to defend against an index that no longer exists. The maximum is
    // `length`, not `length - 1`: "after the last step" is a real position.
    boundary: Math.min(state.boundary, plan.steps.length),
  }
}

function toggle<T>(list: readonly T[], value: T): readonly T[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value]
}

let nextId = 0
function makeStepId(): string {
  nextId += 1
  return `u${String(nextId).padStart(3, '0')}`
}

export function reduce(state: State, action: Action): State {
  switch (action.type) {
    case 'view':
      return { ...state, view: action.view, paletteOpen: false }

    case 'scenario': {
      const s = SCENARIO_BY_ID.get(action.id)
      if (!s) return state
      return {
        ...initialState(),
        plan: s.plan,
        source: s.id,
        boundary: s.plan.steps.length,
        view: state.view,
      }
    }

    case 'boundary':
      return {
        ...state,
        boundary: Math.max(0, Math.min(action.index, state.plan.steps.length)),
      }

    case 'select-artifact':
      return { ...state, selectedArtifact: action.id }
    case 'select-step':
      return { ...state, selectedStep: action.id }
    case 'select-conflict':
      return { ...state, selectedConflict: action.id }
    case 'palette':
      return { ...state, paletteOpen: action.open }

    case 'filter-query':
      return { ...state, filters: { ...state.filters, query: action.query } }
    case 'filter-outcome':
      return {
        ...state,
        filters: { ...state.filters, outcomes: toggle(state.filters.outcomes, action.outcome) },
      }
    case 'filter-severity':
      return {
        ...state,
        filters: { ...state.filters, severities: toggle(state.filters.severities, action.severity) },
      }
    case 'filter-volatility':
      return {
        ...state,
        filters: { ...state.filters, volatility: toggle(state.filters.volatility, action.band) },
      }
    case 'filter-priority':
      return {
        ...state,
        filters: { ...state.filters, priorities: toggle(state.filters.priorities, action.priority) },
      }
    case 'filter-harmful':
      return { ...state, filters: { ...state.filters, onlyHarmful: action.value } }
    case 'reset-filters':
      return { ...state, filters: DEFAULT_FILTERS }

    /* ---- plan edits --------------------------------------------------- */

    case 'move-step': {
      const steps = [...state.plan.steps]
      const i = steps.findIndex((s) => s.step_id === action.step_id)
      const j = i + action.direction
      if (i < 0 || j < 0 || j >= steps.length) return state
      const a = steps[i]
      const b = steps[j]
      if (!a || !b) return state
      steps[i] = b
      steps[j] = a
      const next = edited(state, { ...state.plan, steps })
      // Moving a step by hand is exactly the moment to ask why, so the
      // question is raised here rather than discovered later in a review.
      return { ...next, pendingOverride: { recommended: action.recommended } }
    }

    case 'remove-step': {
      const steps = state.plan.steps.filter((s) => s.step_id !== action.step_id)
      if (steps.length === state.plan.steps.length) return state
      return edited(state, { ...state.plan, steps })
    }

    case 'add-step': {
      const step = { step_id: makeStepId(), action_id: action.action_id, override_minutes: null, note: null }
      const steps = [...state.plan.steps]
      steps.splice(action.at ?? steps.length, 0, step)
      return edited(state, { ...state.plan, steps })
    }

    case 'set-step-minutes': {
      const steps = state.plan.steps.map((s) =>
        s.step_id === action.step_id ? { ...s, override_minutes: action.minutes } : s,
      )
      return edited(state, { ...state.plan, steps })
    }

    case 'adopt-sequence': {
      const byId = new Map(state.plan.steps.map((s) => [s.step_id, s]))
      const steps = action.order.map((id) => byId.get(id)).filter((s) => s !== undefined)
      // Defensive: never adopt an order that would drop a step.
      if (steps.length !== state.plan.steps.length) return state
      const next = edited(state, { ...state.plan, steps })
      return { ...next, pendingOverride: null }
    }

    case 'set-priority': {
      const evidence = upsertSelection(state.plan, action.artifact_id, (e) => ({
        ...e,
        priority: action.priority,
      }))
      return edited(state, { ...state.plan, evidence })
    }

    case 'set-included': {
      const evidence = upsertSelection(state.plan, action.artifact_id, (e) => ({
        ...e,
        included: action.included,
      }))
      return edited(state, { ...state.plan, evidence })
    }

    case 'set-buffer':
      return edited(state, {
        ...state.plan,
        contingency_buffer_minutes: Math.max(0, action.minutes),
      })

    case 'set-verification':
      return edited(state, { ...state.plan, verification_minutes: Math.max(0, action.minutes) })

    case 'set-deadline':
      return edited(state, {
        ...state.plan,
        deadline: { ...state.plan.deadline, due_at: action.due_at, label: 'Operator-set deadline' },
      })

    /* ---- decisions ----------------------------------------------------- */

    case 'add-loss':
      return edited(state, {
        ...state.plan,
        accepted_losses: [...state.plan.accepted_losses, action.loss],
      })

    case 'remove-loss':
      return edited(state, {
        ...state.plan,
        accepted_losses: state.plan.accepted_losses.filter((l) => l.loss_id !== action.loss_id),
      })

    case 'record-override': {
      const next = edited(state, {
        ...state.plan,
        overrides: [...state.plan.overrides, action.override],
      })
      return { ...next, pendingOverride: null }
    }

    case 'dismiss-override':
      return { ...state, pendingOverride: null }

    case 'remove-override':
      return edited(state, {
        ...state.plan,
        overrides: state.plan.overrides.filter((o) => o.override_id !== action.override_id),
      })

    /* ---- loading ------------------------------------------------------- */

    case 'load-json': {
      const parsed = parsePlan(action.text)
      if (!parsed.ok) return { ...state, loadError: parsed.error }
      return {
        ...initialState(),
        plan: parsed.plan,
        source: 'custom',
        boundary: parsed.plan.steps.length,
        view: state.view,
      }
    }

    case 'dismiss-load-error':
      return { ...state, loadError: null }
  }
}

function upsertSelection(
  plan: RemediationPlan,
  artifact_id: string,
  update: (e: RemediationPlan['evidence'][number]) => RemediationPlan['evidence'][number],
): RemediationPlan['evidence'] {
  const existing = plan.evidence.find((e) => e.artifact_id === artifact_id)
  if (existing) return plan.evidence.map((e) => (e.artifact_id === artifact_id ? update(e) : e))
  return [
    ...plan.evidence,
    update({ artifact_id, priority: 'recommended', included: true, override_minutes: null }),
  ]
}

/* -------------------------------------------------------------------------- */
/* Loading a plan                                                             */
/* -------------------------------------------------------------------------- */

type ParseResult = { ok: true; plan: RemediationPlan } | { ok: false; error: string }

/**
 * The largest plan this will accept, in characters.
 *
 * A plan with a hundred steps is a few tens of kilobytes. Two megabytes is
 * far past anything legitimate and well short of what would take a noticeable
 * time to parse — the point is to refuse a paste that would freeze the tab
 * before `JSON.parse` ever sees it, not to police plan size.
 */
const MAX_INPUT_CHARS = 2_000_000

/** Every asset type the catalogue is scoped by. */
const ASSET_TYPES: readonly AssetType[] = [
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

const PRIORITIES: readonly CollectionPriority[] = ['required', 'recommended', 'optional']
const REASONS: readonly AcceptedLoss['reason_category'][] = [
  'operational',
  'technical',
  'deadline',
  'scope',
  'other',
]

/* -------------------------------------------------------------------------- */
/* Coercion                                                                   */
/*                                                                            */
/* Everything below treats the parsed JSON as hostile. Three rules:           */
/*                                                                            */
/*   Every value that will be *rendered* is coerced to a string and stripped  */
/*   of invisible and bidirectional control characters at this boundary, so   */
/*   no view has to defend against a number, an object or a right-to-left     */
/*   override where it expected text. The report generator escapes again on   */
/*   the way out; this is the other end of the same job.                      */
/*                                                                            */
/*   Every enum is checked against its member list rather than cast. An       */
/*   unrecognised value falls back to a documented default instead of         */
/*   flowing into a `Record` lookup that would return `undefined` and crash   */
/*   a view three screens away.                                               */
/*                                                                            */
/*   Every length is bounded. A one-megabyte hostname is not a hostname.      */
/* -------------------------------------------------------------------------- */

const MAX_FIELD = 4_000
const MAX_ITEMS = 500

/** A rendered string: real, bounded, and free of invisible characters. */
function str(v: unknown, fallback = ''): string {
  if (typeof v !== 'string') return fallback
  return stripInvisible(v).slice(0, MAX_FIELD)
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

function nullableNum(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback
}

function obj(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {}
}

function arr(v: unknown): readonly unknown[] {
  return Array.isArray(v) ? v.slice(0, MAX_ITEMS) : []
}

/**
 * Validate and coerce a pasted plan.
 *
 * Hand-written rather than schema-driven, and deliberately strict about the
 * *shape* while staying permissive about the content: an unknown `action_id`
 * is allowed through, because the engine represents it honestly as an
 * uncharacterised step, and rejecting it here would push the operator towards
 * deleting the step instead — which is how a real remediation loses the one
 * action nobody understands.
 *
 * Every failure names the field. "Invalid plan" is not a message anyone can
 * act on.
 */
export function parsePlan(text: string): ParseResult {
  if (text.length > MAX_INPUT_CHARS) {
    return {
      ok: false,
      error: `That input is ${Math.round(text.length / 1024)} kB. The limit is ${MAX_INPUT_CHARS / 1024} kB — a plan with a hundred steps is a few tens of kilobytes, so this is almost certainly not one.`,
    }
  }

  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (e) {
    return { ok: false, error: `That is not valid JSON. ${e instanceof Error ? e.message : ''}`.trim() }
  }

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, error: 'The top level of the file must be a JSON object describing one plan.' }
  }
  const o = raw as Record<string, unknown>

  // A report export is the whole analysis, with the plan nested inside it.
  // Accepting either is a kindness worth the four lines: the file somebody
  // has to hand is usually the one the tool gave them.
  const candidate =
    typeof o.plan === 'object' && o.plan !== null && !Array.isArray(o.plan)
      ? (o.plan as Record<string, unknown>)
      : o

  const missing = (['asset', 'deadline', 'steps'] as const).filter((k) => !(k in candidate))
  if (missing.length > 0) {
    return {
      ok: false,
      error: `The plan is missing ${missing.join(', ')}. Export a plan from the Catalogue & data view to see the expected shape.`,
    }
  }

  const rawAsset = candidate.asset
  if (typeof rawAsset !== 'object' || rawAsset === null || Array.isArray(rawAsset)) {
    return { ok: false, error: '`asset` must be an object with at least `name` and `type`.' }
  }
  const assetIn = rawAsset as Record<string, unknown>
  if (typeof assetIn.type !== 'string') {
    return { ok: false, error: '`asset.type` must be a string, such as "linux_server".' }
  }
  if (!(ASSET_TYPES as readonly string[]).includes(assetIn.type)) {
    return {
      ok: false,
      error: `\`asset.type\` is "${str(assetIn.type, '').slice(0, 40)}", which is not one of: ${ASSET_TYPES.join(', ')}.`,
    }
  }

  const rawSteps = candidate.steps
  if (!Array.isArray(rawSteps)) return { ok: false, error: '`steps` must be an array.' }
  if (rawSteps.length > MAX_ITEMS) {
    return { ok: false, error: `That plan has ${rawSteps.length} steps. The limit is ${MAX_ITEMS}.` }
  }
  for (const [i, x] of rawSteps.entries()) {
    if (typeof x !== 'object' || x === null || Array.isArray(x)) {
      return { ok: false, error: `Step ${i + 1} is not an object.` }
    }
    if (typeof (x as Record<string, unknown>).action_id !== 'string') {
      return { ok: false, error: `Step ${i + 1} has no \`action_id\`.` }
    }
  }

  const rawDeadline = candidate.deadline
  if (typeof rawDeadline !== 'object' || rawDeadline === null || Array.isArray(rawDeadline)) {
    return { ok: false, error: '`deadline` must be an object with `plan_start` and `due_at`.' }
  }
  const d = rawDeadline as Record<string, unknown>
  for (const key of ['plan_start', 'due_at'] as const) {
    const v = d[key]
    if (typeof v !== 'string' || !Number.isFinite(Date.parse(v))) {
      return { ok: false, error: `\`deadline.${key}\` must be an ISO 8601 instant, such as "2026-09-22T08:00:00Z".` }
    }
  }

  /* ---- build the plan from coerced values, field by field --------------- */
  //
  // Deliberately *not* a spread of the parsed object. Spreading would carry
  // every unrecognised key straight into application state and out again
  // through the JSON export, which turns this tool into a way of laundering
  // arbitrary content through somebody's incident ticket. Naming each field
  // is more code and is the only way to know what the object contains.

  const vuln = obj(candidate.vulnerability)
  const tier = obj(candidate.tier)

  const plan: RemediationPlan = {
    plan_id: str(candidate.plan_id, 'PLN-IMPORTED'),
    name: str(candidate.name, 'Imported plan'),
    asset: {
      asset_id: str(assetIn.asset_id, 'ASSET'),
      name: str(assetIn.name, 'Unnamed asset'),
      type: assetIn.type as AssetType,
      environment: str(assetIn.environment, 'Unspecified'),
      owner: str(assetIn.owner, 'Unspecified'),
      description: str(assetIn.description),
      notes: typeof assetIn.notes === 'string' ? str(assetIn.notes) : null,
    },
    vulnerability: {
      reference: str(vuln.reference, 'Unspecified'),
      title: str(vuln.title, 'Unspecified vulnerability'),
      summary: str(vuln.summary),
      suspected_compromise: bool(vuln.suspected_compromise, false),
      notes: typeof vuln.notes === 'string' ? str(vuln.notes) : null,
    },
    tier: {
      label: str(tier.label, 'Unspecified tier'),
      source: str(tier.source, 'Unspecified (external)'),
      window_hours: nullableNum(tier.window_hours),
      // Forced. The type says a tier always comes from outside this tool, and
      // an import must not be able to assert otherwise.
      external: true,
      notes: typeof tier.notes === 'string' ? str(tier.notes) : null,
    },
    deadline: {
      issued_at: str(d.issued_at, String(d.plan_start)),
      due_at: String(d.due_at),
      plan_start: String(d.plan_start),
      label: str(d.label, 'Imported deadline'),
    },
    steps: rawSteps.map((x, i) => {
      const step = obj(x)
      return {
        step_id: str(step.step_id, '') || `l${String(i + 1).padStart(3, '0')}`,
        action_id: str(step.action_id, 'unknown_action'),
        override_minutes: nullableNum(step.override_minutes),
        note: typeof step.note === 'string' ? str(step.note) : null,
      }
    }),
    evidence: arr(candidate.evidence).map((x) => {
      const e = obj(x)
      return {
        artifact_id: str(e.artifact_id),
        priority: oneOf(e.priority, PRIORITIES, 'recommended'),
        included: bool(e.included, true),
        override_minutes: nullableNum(e.override_minutes),
      }
    }),
    accepted_losses: arr(candidate.accepted_losses).map((x, i) => {
      const l = obj(x)
      return {
        loss_id: str(l.loss_id, '') || `AL-${String(i + 1).padStart(4, '0')}`,
        artifact_ids: arr(l.artifact_ids).map((a) => str(a)).filter((a) => a !== ''),
        what_is_lost: str(l.what_is_lost, 'Not stated'),
        reason_category: oneOf(l.reason_category, REASONS, 'other'),
        why_necessary: str(l.why_necessary, 'Not stated'),
        alternative_considered: str(l.alternative_considered, 'Not stated'),
        residual_risk: str(l.residual_risk, 'Not stated'),
        accepted_by: str(l.accepted_by, 'Not stated'),
        role: str(l.role, 'Not stated'),
        decided_at: str(l.decided_at, 'Not stated'),
        tier_label: str(l.tier_label, 'Not stated'),
      }
    }),
    overrides: arr(candidate.overrides).map((x, i) => {
      const ov = obj(x)
      return {
        override_id: str(ov.override_id, '') || `OV-${String(i + 1).padStart(4, '0')}`,
        recorded_at: str(ov.recorded_at, 'Not stated'),
        reason: str(ov.reason, 'Not stated'),
        recommended_order: arr(ov.recommended_order).map((a) => str(a)),
        chosen_order: arr(ov.chosen_order).map((a) => str(a)),
        newly_lost_artifact_ids: arr(ov.newly_lost_artifact_ids).map((a) => str(a)),
      }
    }),
    contingency_buffer_minutes: Math.max(0, num(candidate.contingency_buffer_minutes, 0)),
    verification_minutes: Math.max(0, num(candidate.verification_minutes, 0)),
    notes: typeof candidate.notes === 'string' ? str(candidate.notes) : null,
  }

  return { ok: true, plan }
}
