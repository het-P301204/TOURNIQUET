/**
 * Demonstration scenarios.
 *
 * All synthetic. The hostnames, vulnerabilities, people and timestamps are
 * invented; no vendor advisory, CVE record or real incident is reproduced.
 *
 * Each one is built around a single thing that is hard to see without the
 * tool, and — importantly — most of them are written the way plans are
 * actually written rather than the way they should be. Scenario one appends
 * the evidence collection to the end of the change, which is what a change
 * ticket looks like when nobody has thought about forensics yet. The point of
 * the demo is not that TOURNIQUET agrees with the plan; it is that it moves
 * four steps and saves three artifacts.
 *
 * Every instant is absolute and fixed. Feasibility is measured from
 * `plan_start` to `due_at`, never from the wall clock, so these read the same
 * today as they will next year — which is also what makes the fixture check
 * in `scripts/make-fixtures.ts` meaningful.
 */

import type { EvidenceSelection, PlannedStep, RemediationPlan } from '../domain/types.ts'

export interface Scenario {
  readonly id: string
  readonly label: string
  /** The one thing this scenario is for. Shown on the scenario picker. */
  readonly teaches: string
  readonly plan: RemediationPlan
}

let seq = 0
function step(action_id: string, override_minutes: number | null = null, note: string | null = null): PlannedStep {
  seq += 1
  return { step_id: `s${String(seq).padStart(3, '0')}`, action_id, override_minutes, note }
}

function sel(
  artifact_id: string,
  priority: EvidenceSelection['priority'],
  included = true,
): EvidenceSelection {
  return { artifact_id, priority, included, override_minutes: null }
}

/* ========================================================================== */
/* 1 — internet-facing server, patch appended to the end of the change        */
/* ========================================================================== */

const FIN_WEB: RemediationPlan = {
  plan_id: 'PLN-2291',
  name: 'FIN-WEB-01 — payments front end, KEV-listed deserialisation flaw',
  asset: {
    asset_id: 'FIN-WEB-01',
    name: 'FIN-WEB-01.prod.payments.internal',
    type: 'linux_server',
    environment: 'Production',
    owner: 'Payments Platform',
    description:
      'Internet-facing web front end for the card payments service. Two nodes behind a load balancer; this is node one.',
    notes: 'Handles cardholder data in transit. Change control requires a recorded plan before execution.',
  },
  vulnerability: {
    reference: 'VULN-2026-0417 (synthetic)',
    title: 'Deserialisation flaw in the request-handling library',
    summary:
      'Unauthenticated remote code execution through a crafted request body. Listed as known-exploited by the vulnerability management team; public exploitation reported against internet-facing deployments.',
    suspected_compromise: false,
    notes:
      'No confirmed compromise on this host. The service is internet-facing and has been exposed for the full exploitation window, so the investigation is a question that has not been answered rather than one that has been ruled out.',
  },
  tier: {
    label: 'Critical — 3 day',
    source: 'Vulnerability management, known-exploited tier',
    window_hours: 72,
    external: true,
    notes:
      'Set by the vulnerability management process before this plan existed. TOURNIQUET consumes it and does not assess whether it is right.',
  },
  deadline: {
    issued_at: '2026-09-21T14:00:00Z',
    due_at: '2026-09-24T14:00:00Z',
    plan_start: '2026-09-22T08:00:00Z',
    label: '3-day remediation window',
  },
  steps: [
    // Written the way a change ticket is written: fix it, check it, and
    // "collect evidence" bolted on at the end as an afterthought.
    step('package_upgrade'),
    step('service_restart'),
    step('verify_remediation'),
    step('capture_process_state', null, 'Added after the security team reviewed the change.'),
    step('capture_network_state'),
    step('capture_memory'),
    step('capture_host_triage'),
    step('capture_offhost_logs'),
  ],
  evidence: [
    sel('physical_memory', 'required'),
    sel('injected_code_regions', 'required'),
    sel('running_processes', 'required'),
    sel('active_connections', 'required'),
    sel('installed_package_state', 'required'),
    sel('dropped_web_files', 'required'),
    sel('persistence_mechanisms', 'required'),
    sel('local_event_logs', 'recommended'),
    // Downgraded deliberately: a three-hour block acquisition does not fit a
    // production change window, and saying so here is better than leaving a
    // required artifact in the plan that was never going to be collected.
    sel('disk_image', 'optional', false),
    sel('swap_and_pagefile', 'optional', false),
    sel('crash_dumps', 'optional'),
    sel('arp_neighbour_cache', 'optional'),
  ],
  accepted_losses: [],
  overrides: [],
  contingency_buffer_minutes: 45,
  verification_minutes: 30,
  notes:
    'Soak monitoring after the change is counted as verification time separately from the verification step itself.',
}

/* ========================================================================== */
/* 2 — container workload, where redeploy is the whole cost                   */
/* ========================================================================== */

const PAY_K8S: RemediationPlan = {
  plan_id: 'PLN-2308',
  name: 'PAY-K8S-07 — checkout workload, unexpected egress after dependency RCE',
  asset: {
    asset_id: 'PAY-K8S-07',
    name: 'checkout-api-7d9f4b8c6-x2kqp',
    type: 'kubernetes_workload',
    environment: 'Production',
    owner: 'Checkout Engineering',
    description:
      'Checkout API pod, one of twelve replicas. Built from an internal base image; the vulnerable dependency is in the application layer.',
    notes: 'Egress to an unrecognised address was observed ninety minutes before this plan was written.',
  },
  vulnerability: {
    reference: 'VULN-2026-0455 (synthetic)',
    title: 'Remote code execution in a bundled dependency',
    summary:
      'A serialisation library bundled into the application image permits code execution on crafted input. A patched image is already built and waiting.',
    suspected_compromise: true,
    notes:
      'Egress to an address with no business relationship, from a pod that only talks to two internal services. Treated as a suspected compromise.',
  },
  tier: {
    label: 'Incident-driven — same shift',
    source: 'Incident commander, declared incident INC-4471',
    window_hours: 8,
    external: true,
    notes: 'Set by the incident commander rather than by the vulnerability tier.',
  },
  deadline: {
    issued_at: '2026-09-22T05:30:00Z',
    due_at: '2026-09-22T14:00:00Z',
    plan_start: '2026-09-22T06:00:00Z',
    label: 'Same-shift containment',
  },
  steps: [
    step('capture_offhost_logs'),
    step('capture_cloud_logs'),
    // The evidence that only exists inside the pod is not collected at all.
    step('container_redeploy'),
    step('verify_remediation'),
  ],
  evidence: [
    sel('container_writable_layer', 'required'),
    sel('process_memory_target', 'required'),
    sel('running_processes', 'required'),
    sel('active_connections', 'required'),
    sel('ephemeral_volume_contents', 'recommended'),
    sel('local_event_logs', 'required'),
    sel('cloud_control_plane_logs', 'required'),
    sel('centralised_logs', 'required'),
    sel('staged_tooling', 'required'),
  ],
  accepted_losses: [],
  overrides: [],
  contingency_buffer_minutes: 20,
  verification_minutes: 15,
  notes:
    'The patched image is clean by construction. Everything the attacker did is in the writable layer of the pod about to be deleted.',
}

/* ========================================================================== */
/* 3 — credential compromise, where the cost is visibility not storage        */
/* ========================================================================== */

const CORP_IDP: RemediationPlan = {
  plan_id: 'PLN-2314',
  name: 'CORP-IDP — service principal credential disclosed in a public repository',
  asset: {
    asset_id: 'CORP-IDP-SP-0092',
    name: 'sp-reporting-exporter (tenant: corp)',
    type: 'saas_identity',
    environment: 'Production',
    owner: 'Identity Engineering',
    description:
      'Service principal used by the reporting exporter. Holds read access across three data sources and a directory read role.',
    notes: 'The secret was committed to a public repository and was reachable for an unknown period.',
  },
  vulnerability: {
    reference: 'VULN-2026-0461 (synthetic)',
    title: 'Disclosed service principal secret',
    summary:
      'A client secret for the reporting exporter was committed to a public repository. Sign-ins for the principal appear from a network with no business relationship.',
    suspected_compromise: true,
    notes: null,
  },
  tier: {
    label: 'Critical — 24 hour',
    source: 'Identity standard, credential disclosure',
    window_hours: 24,
    external: true,
    notes: null,
  },
  deadline: {
    issued_at: '2026-09-22T02:10:00Z',
    due_at: '2026-09-23T02:10:00Z',
    plan_start: '2026-09-22T07:00:00Z',
    label: '24-hour credential response',
  },
  steps: [
    step('capture_identity_logs'),
    step('token_revoke'),
    step('credential_rotate'),
    step('disable_account'),
    // Ordered after the revocation, which is the mistake: by the time this
    // runs there is nothing left to inventory.
    step('capture_token_inventory', null, 'Requested by the investigation lead.'),
    step('verify_remediation'),
  ],
  evidence: [
    sel('active_access_tokens', 'required'),
    sel('identity_signin_logs', 'required'),
    sel('identity_audit_logs', 'required'),
    sel('app_session_store', 'recommended'),
    sel('cloud_control_plane_logs', 'required'),
  ],
  accepted_losses: [],
  overrides: [],
  contingency_buffer_minutes: 30,
  verification_minutes: 20,
  notes:
    'Rotation and revocation are not in dispute. The question is what can still be learned about the blast radius afterwards.',
}

/* ========================================================================== */
/* 4 — vendor procedure with an uncharacterised blast radius                  */
/* ========================================================================== */

const EDGE_FW: RemediationPlan = {
  plan_id: 'PLN-2277',
  name: 'EDGE-FW-02 — management-plane advisory, vendor firmware procedure',
  asset: {
    asset_id: 'EDGE-FW-02',
    name: 'edge-fw-02.dc1',
    type: 'network_appliance',
    environment: 'Production',
    owner: 'Network Engineering',
    description: 'Perimeter firewall, datacentre one. Active member of an HA pair.',
    notes: 'On-device log retention is short and has not been measured.',
  },
  vulnerability: {
    reference: 'VULN-2026-0398 (synthetic)',
    title: 'Authentication bypass in the management interface',
    summary:
      'A vendor advisory describes an authentication bypass reachable from the management network. The advisory does not describe indicators, and the remediation is a full firmware update.',
    suspected_compromise: false,
    notes:
      'The management interface is reachable from the management VLAN only. Whether it was reached cannot currently be determined.',
  },
  tier: {
    label: 'High — 14 day',
    source: 'Vulnerability management, vendor-advisory tier',
    window_hours: 336,
    external: true,
    notes: null,
  },
  deadline: {
    issued_at: '2026-09-12T09:00:00Z',
    due_at: '2026-09-26T09:00:00Z',
    plan_start: '2026-09-22T22:00:00Z',
    label: '14-day vendor advisory window',
  },
  steps: [
    step('capture_appliance_state'),
    step('firmware_update'),
    step('verify_remediation'),
  ],
  evidence: [
    sel('conntrack_table', 'required'),
    sel('appliance_syslog', 'required'),
    sel('service_configuration', 'required'),
    sel('installed_package_state', 'required'),
    sel('centralised_logs', 'recommended'),
    sel('interactive_sessions', 'recommended'),
    sel('running_processes', 'recommended'),
    sel('active_connections', 'recommended'),
    sel('listening_sockets', 'optional'),
    sel('service_runtime_state', 'recommended'),
  ],
  accepted_losses: [],
  overrides: [],
  contingency_buffer_minutes: 60,
  verification_minutes: 30,
  notes:
    'The window is comfortable. The problem is not time; it is that nobody can say what the procedure touches.',
}

/* ========================================================================== */
/* 5 — a window too short for the plan, and a decision on the record          */
/* ========================================================================== */

const MFG_DB: RemediationPlan = {
  plan_id: 'PLN-2331',
  name: 'MFG-DB-11 — privilege escalation, fixed maintenance window',
  asset: {
    asset_id: 'MFG-DB-11',
    name: 'MFG-DB-11.plant.internal',
    type: 'database_server',
    environment: 'Production (plant)',
    owner: 'Manufacturing Systems',
    description:
      'Database server for the plant execution system. The approved maintenance procedure requires the host to be shut down before the upgrade.',
    notes:
      'The maintenance window is fixed by the production schedule and cannot be extended without stopping the line.',
  },
  vulnerability: {
    reference: 'VULN-2026-0442 (synthetic)',
    title: 'Local privilege escalation in the database engine',
    summary:
      'A flaw in the engine permits a local account to escalate to the engine service account. Exploitation reported in the wild.',
    suspected_compromise: false,
    notes: null,
  },
  tier: {
    label: 'Critical — 3 day',
    source: 'Vulnerability management, known-exploited tier',
    window_hours: 72,
    external: true,
    notes:
      'The remediation tier allows three days. The operational window allows eight minutes. Those are two different constraints and only one of them is negotiable.',
  },
  deadline: {
    issued_at: '2026-09-20T10:00:00Z',
    // The binding constraint is not the tier. It is the change window.
    due_at: '2026-09-22T23:08:00Z',
    plan_start: '2026-09-22T23:00:00Z',
    label: '8-minute approved change window',
  },
  steps: [
    step('capture_process_state'),
    step('capture_db_audit'),
    step('host_shutdown'),
    step('package_upgrade'),
    step('verify_remediation'),
  ],
  evidence: [
    sel('physical_memory', 'required'),
    sel('running_processes', 'required'),
    sel('active_connections', 'required'),
    sel('database_audit_log', 'required'),
    sel('installed_package_state', 'required'),
    sel('interactive_sessions', 'recommended'),
    sel('local_event_logs', 'recommended'),
    sel('service_configuration', 'recommended'),
    sel('disk_image', 'optional', false),
    sel('swap_and_pagefile', 'optional', false),
  ],
  accepted_losses: [
    {
      loss_id: 'AL-0001',
      artifact_ids: ['physical_memory', 'injected_code_regions', 'decrypted_key_material'],
      what_is_lost:
        'Live memory will not be acquired. The physical memory image, and with it any unbacked executable regions and resident key material, will not exist after the shutdown.',
      reason_category: 'operational',
      why_necessary:
        'The approved maintenance procedure begins with a shutdown at a fixed time set by the production schedule. A memory acquisition takes approximately forty-five minutes against an eight-minute window, and the line cannot be held.',
      alternative_considered:
        'A targeted dump of the database engine process was considered at roughly eight minutes. It was rejected because it would consume the entire window and leave no time for the upgrade itself.',
      residual_risk:
        'If the host was compromised through the escalation flaw, we will be unable to determine whether anything was executing that never touched disk. A disk-based investigation remains possible and the audit log is being preserved.',
      accepted_by: 'R. Okonjo',
      role: 'Incident Commander',
      decided_at: '2026-09-22T21:40:00Z',
      tier_label: 'Critical — 3 day',
    },
  ],
  overrides: [],
  contingency_buffer_minutes: 5,
  verification_minutes: 0,
  notes:
    'The plan does not fit the window and everyone involved knows it. What this analysis adds is the list of exactly what is being given up, and a record of who decided.',
}

export const SCENARIOS: readonly Scenario[] = [
  {
    id: 'fin_web',
    label: 'FIN-WEB-01 — internet-facing server',
    teaches:
      'A change ticket with the evidence collection appended at the end. The steps are right; the order costs three artifacts.',
    plan: FIN_WEB,
  },
  {
    id: 'pay_k8s',
    label: 'PAY-K8S-07 — container workload',
    teaches:
      'Redeploying from a clean image is the fix and the entire forensic cost. The image is immutable, so everything the attacker left is in the layer being discarded.',
    plan: PAY_K8S,
  },
  {
    id: 'corp_idp',
    label: 'CORP-IDP — credential compromise',
    teaches:
      'Rotation and revocation destroy no stored record. What they destroy is the ability to enumerate what the credential could still reach.',
    plan: CORP_IDP,
  },
  {
    id: 'edge_fw',
    label: 'EDGE-FW-02 — vendor firmware',
    teaches:
      'A comfortable deadline and an uncharacterised procedure. Unknown stays unknown: it does not become safe and it does not become destroyed.',
    plan: EDGE_FW,
  },
  {
    id: 'mfg_db',
    label: 'MFG-DB-11 — window too short',
    teaches:
      'Preservation and the change window are arithmetically incompatible. The tool states the conflict and a named person signs for what is given up.',
    plan: MFG_DB,
  },
]

export const DEFAULT_SCENARIO = SCENARIOS[0] as Scenario

export const SCENARIO_BY_ID: ReadonlyMap<string, Scenario> = new Map(
  SCENARIOS.map((s) => [s.id, s]),
)
