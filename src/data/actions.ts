/**
 * The action library.
 *
 * Each entry says what one remediation step does to the evidence catalogue.
 * This is the part of TOURNIQUET that carries an opinion, so it is worth being
 * explicit about how the opinions are written.
 *
 * **Effects are written at three levels of specificity.** An action can name a
 * whole volatility tier, a tag, or one artifact, and the resolver takes the
 * most specific match — artifact, then tag, then tier. That is what lets
 * `host_reboot` say "everything volatile is gone" in four lines and then carve
 * out the one artifact where the honest answer is "it depends on your restart
 * policy".
 *
 * **`default_effect` is mandatory, and it is the most important field here.**
 * It is what the action does to every artifact it did not mention. A restart
 * says `preserves`, because a restart is bounded and we know it. A vendor
 * firmware procedure says `unknown`, because nobody here has characterised it.
 * Without this field those two cases would be indistinguishable, and the
 * second would silently be treated as the first — which is the exact failure
 * mode this product exists to prevent.
 *
 * **Durations are order-of-magnitude figures, not measurements.** They exist
 * so the deadline arithmetic has something to work with. Where an honest
 * estimate is not possible the field is `null` and the totals say so out loud.
 *
 * Nothing here is a recommendation to run any of these actions, and nothing
 * here executes anything. The library describes consequences; the operator
 * chooses steps.
 */

import type { RemediationAction } from '../domain/types.ts'

const HOSTS = [
  'windows_workstation',
  'windows_server',
  'linux_server',
  'cloud_vm',
  'database_server',
  'application_server',
] as const

const HOSTS_AND_RUNTIMES = [...HOSTS, 'container', 'kubernetes_workload'] as const

/**
 * Capture steps.
 *
 * Modelled as actions because they occupy the same clock as everything else.
 * A capture that takes 45 minutes competes with the remediation window just as
 * hard as the remediation does, and a tool that put captures outside the
 * timeline would make every plan look feasible.
 *
 * `preserves` is their default effect, with one honest caveat: the *act* of
 * collecting is not always free. Where it is not, the cost is recorded on the
 * artifact's `observer_effect` rather than modelled as an impact, because a
 * capture step that invalidated its own artifact would be both true and
 * useless.
 */
const CAPTURE_ACTIONS: readonly RemediationAction[] = [
  {
    action_id: 'capture_memory',
    name: 'Acquire physical memory',
    category: 'capture',
    description:
      'Image host RAM to external storage. Recovers injected code and resident key material as a side effect, because both live in the image.',
    estimated_minutes: 45,
    destructive_level: 'none',
    reversible: true,
    applies_to: HOSTS,
    effects: [],
    default_effect: {
      impact: 'preserves',
      confidence: 'high',
      rationale: 'A capture reads. It does not remediate anything and destroys nothing.',
    },
    captures: ['physical_memory', 'injected_code_regions', 'decrypted_key_material'],
    prerequisites: [],
    confidence: 'high',
    reference: null,
    unknown_impact: false,
    notes:
      'The single longest step in most plans, and the first to be cut when the clock is tight. That trade-off is the one worth arguing about in the open.',
  },
  {
    action_id: 'capture_process_memory',
    name: 'Dump target process memory',
    category: 'capture',
    description:
      'Dump the address space of the affected service only, recovering injected regions and resident secrets belonging to that process. The realistic substitute when a full memory image will not fit the window, and the only memory option on a container, which has no memory image of its own.',
    estimated_minutes: 8,
    destructive_level: 'none',
    reversible: true,
    applies_to: HOSTS_AND_RUNTIMES,
    effects: [],
    default_effect: {
      impact: 'preserves',
      confidence: 'high',
      rationale: 'A capture reads. It does not remediate anything and destroys nothing.',
    },
    captures: ['process_memory_target', 'injected_code_regions', 'decrypted_key_material'],
    prerequisites: [],
    confidence: 'high',
    reference: null,
    unknown_impact: false,
    notes:
      'Covers the target process only. Injection into any other process on the host is not covered and will not be detected by this step.',
  },
  {
    action_id: 'capture_process_state',
    name: 'Snapshot running state',
    category: 'capture',
    description: 'Process list, loaded modules, open handles and service runtime configuration.',
    estimated_minutes: 5,
    destructive_level: 'none',
    reversible: true,
    applies_to: 'all',
    effects: [],
    default_effect: {
      impact: 'preserves',
      confidence: 'high',
      rationale: 'A capture reads. It does not remediate anything and destroys nothing.',
    },
    captures: ['running_processes', 'loaded_modules', 'open_file_handles', 'service_runtime_state'],
    prerequisites: [],
    confidence: 'high',
    reference: null,
    unknown_impact: false,
    notes: 'Cheap, fast, and the step most often skipped because it feels redundant next to a memory image. It is not: it is readable immediately.',
  },
  {
    action_id: 'capture_network_state',
    name: 'Snapshot network state',
    category: 'capture',
    description: 'Socket table, listeners, neighbour cache and resolver cache.',
    estimated_minutes: 4,
    destructive_level: 'none',
    reversible: true,
    applies_to: 'all',
    effects: [],
    default_effect: {
      impact: 'preserves',
      confidence: 'high',
      rationale: 'A capture reads. It does not remediate anything and destroys nothing.',
    },
    captures: [
      'active_connections',
      'listening_sockets',
      'arp_neighbour_cache',
      'dns_resolver_cache',
    ],
    prerequisites: [],
    confidence: 'high',
    reference: null,
    unknown_impact: false,
    notes: null,
  },
  {
    action_id: 'capture_sessions',
    name: 'Enumerate sessions and tickets',
    category: 'capture',
    description:
      'Logged-on sessions, plus the cached Kerberos tickets where the platform has them. Applies everywhere something can be logged in; the ticket cache is host-only and is filtered out where it does not apply.',
    estimated_minutes: 4,
    destructive_level: 'none',
    reversible: true,
    applies_to: 'all',
    effects: [],
    default_effect: {
      impact: 'preserves',
      confidence: 'high',
      rationale: 'A capture reads. It does not remediate anything and destroys nothing.',
    },
    captures: ['interactive_sessions', 'kerberos_tickets'],
    prerequisites: [],
    confidence: 'high',
    reference: null,
    unknown_impact: false,
    notes: null,
  },
  {
    action_id: 'capture_token_inventory',
    name: 'Inventory live tokens',
    category: 'capture',
    description:
      'Record the tokens currently valid for the affected principal, with scopes and expiry, from the identity provider.',
    estimated_minutes: 6,
    destructive_level: 'none',
    reversible: true,
    applies_to: ['saas_identity', 'cloud_vm', 'application_server', 'kubernetes_workload'],
    effects: [],
    default_effect: {
      impact: 'preserves',
      confidence: 'high',
      rationale: 'A capture reads. It does not remediate anything and destroys nothing.',
    },
    captures: ['active_access_tokens'],
    prerequisites: [],
    confidence: 'medium',
    reference: null,
    unknown_impact: false,
    notes:
      'What a provider will tell you about live tokens varies. Some expose sessions rather than tokens, and refresh-token lineage is frequently not exposed at all.',
  },
  {
    action_id: 'capture_app_sessions',
    name: 'Export application session store',
    category: 'capture',
    description: 'Export server-side application sessions before anything restarts the application.',
    estimated_minutes: 10,
    destructive_level: 'none',
    reversible: true,
    applies_to: ['application_server', 'container', 'kubernetes_workload', 'saas_identity'],
    effects: [],
    default_effect: {
      impact: 'preserves',
      confidence: 'high',
      rationale: 'A capture reads. It does not remediate anything and destroys nothing.',
    },
    captures: ['app_session_store'],
    prerequisites: [],
    confidence: 'medium',
    reference: null,
    unknown_impact: false,
    notes: null,
  },
  {
    action_id: 'capture_container_layer',
    name: 'Checkpoint container writable layer',
    category: 'capture',
    description:
      'Export the copy-on-write layer and any ephemeral volumes before the workload is replaced.',
    estimated_minutes: 15,
    destructive_level: 'none',
    reversible: true,
    applies_to: ['container', 'kubernetes_workload'],
    effects: [],
    default_effect: {
      impact: 'preserves',
      confidence: 'high',
      rationale: 'A capture reads. It does not remediate anything and destroys nothing.',
    },
    captures: ['container_writable_layer', 'ephemeral_volume_contents'],
    prerequisites: [],
    confidence: 'high',
    reference: null,
    unknown_impact: false,
    notes:
      'The step that distinguishes a container investigation from a host one. The image is immutable, so everything the attacker left is here.',
  },
  {
    action_id: 'capture_runtime_paths',
    name: 'Collect runtime and temporary paths',
    category: 'capture',
    description: 'Memory-backed paths, temporary directories, staged tooling and crash dumps.',
    estimated_minutes: 12,
    destructive_level: 'none',
    reversible: true,
    applies_to: HOSTS_AND_RUNTIMES,
    effects: [],
    default_effect: {
      impact: 'preserves',
      confidence: 'high',
      rationale: 'A capture reads. It does not remediate anything and destroys nothing.',
    },
    captures: [
      'shared_memory_segments',
      'temp_directory_contents',
      'staged_tooling',
      'crash_dumps',
    ],
    prerequisites: [],
    confidence: 'high',
    reference: null,
    unknown_impact: false,
    notes: null,
  },
  {
    action_id: 'capture_host_triage',
    name: 'Collect host triage set',
    category: 'capture',
    description:
      'Package state, persistence mechanisms, served-path contents, service configuration and a filesystem metadata timeline.',
    estimated_minutes: 22,
    destructive_level: 'none',
    reversible: true,
    applies_to: HOSTS_AND_RUNTIMES,
    effects: [],
    default_effect: {
      impact: 'preserves',
      confidence: 'high',
      rationale: 'A capture reads. It does not remediate anything and destroys nothing.',
    },
    captures: [
      'installed_package_state',
      'persistence_mechanisms',
      'dropped_web_files',
      'service_configuration',
      'file_timestamps',
    ],
    prerequisites: [],
    confidence: 'high',
    reference: null,
    unknown_impact: false,
    notes:
      'Includes the pre-patch package state, which the upgrade will overwrite. Skipping this step is how a team ends up unable to say which version was actually exposed.',
  },
  {
    action_id: 'capture_disk_image',
    name: 'Acquire full disk image',
    category: 'capture',
    description: 'Block-level acquisition of host storage, including swap.',
    estimated_minutes: 180,
    destructive_level: 'none',
    reversible: true,
    applies_to: HOSTS,
    effects: [],
    default_effect: {
      impact: 'preserves',
      confidence: 'high',
      rationale: 'A capture reads. It does not remediate anything and destroys nothing.',
    },
    captures: ['disk_image', 'swap_and_pagefile'],
    prerequisites: [],
    confidence: 'high',
    reference: null,
    unknown_impact: false,
    notes: 'Rarely fits a short remediation window. On a cloud VM, take a volume snapshot instead.',
  },
  {
    action_id: 'capture_volume_snapshot',
    name: 'Snapshot attached volumes',
    category: 'capture',
    description: 'Take provider-side snapshots of the attached volumes.',
    estimated_minutes: 12,
    destructive_level: 'none',
    reversible: true,
    applies_to: ['cloud_vm', 'kubernetes_workload', 'container'],
    effects: [],
    default_effect: {
      impact: 'preserves',
      confidence: 'high',
      rationale: 'A capture reads. It does not remediate anything and destroys nothing.',
    },
    captures: ['disk_image'],
    prerequisites: [],
    confidence: 'high',
    reference: null,
    unknown_impact: false,
    notes:
      'Fast, and it survives the instance. It does not capture swap or memory, so it is not a substitute for either.',
  },
  {
    action_id: 'capture_local_logs',
    name: 'Export host logs',
    category: 'capture',
    description: 'Export the logs held on the host, before anything rotates or rebuilds it.',
    estimated_minutes: 18,
    destructive_level: 'none',
    reversible: true,
    applies_to: HOSTS_AND_RUNTIMES,
    effects: [],
    default_effect: {
      impact: 'preserves',
      confidence: 'high',
      rationale: 'A capture reads. It does not remediate anything and destroys nothing.',
    },
    captures: ['local_event_logs'],
    prerequisites: [],
    confidence: 'high',
    reference: null,
    unknown_impact: false,
    notes: null,
  },
  {
    action_id: 'capture_offhost_logs',
    name: 'Export off-host records',
    category: 'capture',
    description: 'Pull the centralised log copies and endpoint telemetry for the affected window.',
    estimated_minutes: 15,
    destructive_level: 'none',
    reversible: true,
    applies_to: 'all',
    effects: [],
    default_effect: {
      impact: 'preserves',
      confidence: 'high',
      rationale: 'A capture reads. It does not remediate anything and destroys nothing.',
    },
    captures: ['centralised_logs', 'edr_telemetry'],
    prerequisites: [],
    confidence: 'high',
    reference: null,
    unknown_impact: false,
    notes:
      'These records are off the host, so nothing done to the host destroys them. They can usually wait — the reason to do them early is platform retention, not remediation.',
  },
  {
    action_id: 'capture_cloud_logs',
    name: 'Export cloud audit records',
    category: 'capture',
    description: 'Export control-plane audit records for the account and the affected resources.',
    estimated_minutes: 12,
    destructive_level: 'none',
    reversible: true,
    applies_to: ['cloud_vm', 'container', 'kubernetes_workload', 'saas_identity'],
    effects: [],
    default_effect: {
      impact: 'preserves',
      confidence: 'high',
      rationale: 'A capture reads. It does not remediate anything and destroys nothing.',
    },
    captures: ['cloud_control_plane_logs'],
    prerequisites: [],
    confidence: 'high',
    reference: null,
    unknown_impact: false,
    notes: null,
  },
  {
    action_id: 'capture_identity_logs',
    name: 'Export identity records',
    category: 'capture',
    description: 'Export sign-in history and directory audit records for the affected principal.',
    estimated_minutes: 14,
    destructive_level: 'none',
    reversible: true,
    applies_to: ['saas_identity', 'cloud_vm', 'windows_server', 'application_server'],
    effects: [],
    default_effect: {
      impact: 'preserves',
      confidence: 'high',
      rationale: 'A capture reads. It does not remediate anything and destroys nothing.',
    },
    captures: ['identity_signin_logs', 'identity_audit_logs'],
    prerequisites: [],
    confidence: 'high',
    reference: null,
    unknown_impact: false,
    notes: null,
  },
  {
    action_id: 'capture_db_audit',
    name: 'Export database audit log',
    category: 'capture',
    description: 'Export statement and connection auditing for the affected window.',
    estimated_minutes: 20,
    destructive_level: 'none',
    reversible: true,
    applies_to: ['database_server'],
    effects: [],
    default_effect: {
      impact: 'preserves',
      confidence: 'high',
      rationale: 'A capture reads. It does not remediate anything and destroys nothing.',
    },
    captures: ['database_audit_log'],
    prerequisites: [],
    confidence: 'medium',
    reference: null,
    unknown_impact: false,
    notes: null,
  },
  {
    action_id: 'capture_appliance_state',
    name: 'Export appliance state',
    category: 'capture',
    description:
      'Export the session table, the on-device logs, the running configuration and the firmware version before maintenance begins.',
    estimated_minutes: 12,
    destructive_level: 'none',
    reversible: true,
    applies_to: ['network_appliance'],
    effects: [],
    default_effect: {
      impact: 'preserves',
      confidence: 'high',
      rationale: 'A capture reads. It does not remediate anything and destroys nothing.',
    },
    captures: ['conntrack_table', 'appliance_syslog', 'service_configuration', 'installed_package_state'],
    prerequisites: [],
    confidence: 'medium',
    reference: null,
    unknown_impact: false,
    notes: null,
  },
]

/** The bounded-restart default effect, written once because it recurs. */
const BOUNDED: RemediationAction['default_effect'] = {
  impact: 'preserves',
  confidence: 'high',
  rationale:
    'This action is bounded to the component named above. Everything else on the host, including all stored state, is outside what it touches.',
}

/** The destroys-the-host default, for actions that replace the machine. */
const REPLACES_HOST: RemediationAction['default_effect'] = {
  impact: 'destroys',
  confidence: 'medium',
  rationale:
    'This action replaces the host. Anything held on it and not explicitly listed above should be assumed gone.',
}

const REMEDIATION_ACTIONS: readonly RemediationAction[] = [
  /* ---------------------------------------------------------------------- */
  {
    action_id: 'service_restart',
    name: 'Restart affected service',
    category: 'service',
    description:
      'Stop and start the affected service. The most common remediation step, and the one most often assumed to be harmless.',
    estimated_minutes: 4,
    destructive_level: 'moderate',
    reversible: true,
    applies_to: 'all',
    effects: [
      {
        target: { kind: 'artifact', artifact_id: 'process_memory_target' },
        impact: 'destroys',
        confidence: 'high',
        rationale:
          'The process whose memory you wanted is replaced by a fresh one. Its address space is returned to the operating system.',
      },
      {
        target: { kind: 'artifact', artifact_id: 'service_runtime_state' },
        impact: 'destroys',
        confidence: 'high',
        rationale:
          'The running configuration is rebuilt from disk. Anything set at runtime and never written down is gone.',
      },
      {
        target: { kind: 'artifact', artifact_id: 'decrypted_key_material' },
        impact: 'destroys',
        confidence: 'high',
        rationale: 'Secrets held by the service exist only while it is running.',
      },
      {
        target: { kind: 'artifact', artifact_id: 'injected_code_regions' },
        impact: 'destroys',
        confidence: 'medium',
        rationale:
          'Code injected into the restarted service goes with it. Injection into any other process on the host is untouched, so this is a partial loss that the plan cannot narrow further.',
      },
      {
        target: { kind: 'artifact', artifact_id: 'open_file_handles' },
        impact: 'destroys',
        confidence: 'high',
        rationale:
          'A file the attacker unlinked but left open by this service becomes unrecoverable the moment the process ends.',
      },
      {
        target: { kind: 'artifact', artifact_id: 'active_connections' },
        impact: 'modifies',
        confidence: 'high',
        rationale:
          'Connections owned by the service are torn down. The rest of the socket table survives, so what you collect afterwards is a partial picture that looks like a complete one.',
      },
      {
        target: { kind: 'artifact', artifact_id: 'listening_sockets' },
        impact: 'modifies',
        confidence: 'high',
        rationale: 'The service unbinds and rebinds. An unexpected extra listener may not come back.',
      },
      {
        target: { kind: 'artifact', artifact_id: 'running_processes' },
        impact: 'modifies',
        confidence: 'high',
        rationale:
          'Process identifiers and start times for the service change, which breaks the parent chain from before the restart.',
      },
      {
        target: { kind: 'artifact', artifact_id: 'shared_memory_segments' },
        impact: 'may_invalidate',
        confidence: 'medium',
        rationale: 'Segments owned by the service may be released when it exits.',
      },
      {
        target: { kind: 'artifact', artifact_id: 'app_session_store' },
        impact: 'unknown',
        confidence: 'unknown',
        rationale:
          'If the session store is held in the application process it is destroyed; if it is an external cache or table it is untouched. Which one this deployment uses is not recorded here.',
      },
    ],
    default_effect: BOUNDED,
    captures: [],
    prerequisites: [],
    confidence: 'high',
    reference: 'Synthetic mapping. Derived from how service managers replace processes.',
    unknown_impact: false,
    notes:
      'A restart is frequently treated as a non-event. It is the single cheapest way to destroy the memory of the process you are investigating.',
  },

  /* ---------------------------------------------------------------------- */
  {
    action_id: 'host_reboot',
    name: 'Reboot host',
    category: 'reboot',
    description: 'Restart the operating system.',
    estimated_minutes: 8,
    destructive_level: 'high',
    reversible: false,
    applies_to: [...HOSTS, 'network_appliance'],
    effects: [
      {
        target: { kind: 'tier', tier: 'volatile_memory' },
        impact: 'destroys',
        confidence: 'high',
        rationale:
          'Memory contents do not survive a reset. This is the clearest evidence-destroying relationship in the library.',
      },
      {
        target: { kind: 'tier', tier: 'process_state' },
        impact: 'destroys',
        confidence: 'high',
        rationale: 'Every process on the host is replaced. Nothing about the previous set survives in memory.',
      },
      {
        target: { kind: 'tier', tier: 'network_state' },
        impact: 'destroys',
        confidence: 'high',
        rationale: 'The network stack reinitialises. Sockets, caches and neighbour tables all start empty.',
      },
      {
        target: { kind: 'tier', tier: 'session_state' },
        impact: 'destroys',
        confidence: 'high',
        rationale: 'Sessions and cached tickets on the host do not survive the reset.',
      },
      {
        target: { kind: 'artifact', artifact_id: 'shared_memory_segments' },
        impact: 'destroys',
        confidence: 'high',
        rationale: 'Memory-backed filesystems are memory. They look like disk and behave like RAM.',
      },
      {
        target: { kind: 'artifact', artifact_id: 'container_writable_layer' },
        impact: 'unknown',
        confidence: 'unknown',
        rationale:
          'Whether the layer survives depends on whether the orchestrator restarts the existing container or schedules a new one. That is a property of your restart policy, not of the reboot.',
      },
      {
        target: { kind: 'artifact', artifact_id: 'temp_directory_contents' },
        impact: 'may_invalidate',
        confidence: 'medium',
        rationale:
          'Some platforms clear temporary paths at boot and some do not. Treat survival as configuration-dependent rather than assured.',
      },
      {
        target: { kind: 'artifact', artifact_id: 'swap_and_pagefile' },
        impact: 'modifies',
        confidence: 'medium',
        rationale:
          'The swap area is reinitialised or reused on boot. Where swap is encrypted with an ephemeral key, its contents become unreadable even though the file survives.',
      },
      {
        target: { kind: 'artifact', artifact_id: 'local_event_logs' },
        impact: 'modifies',
        confidence: 'high',
        rationale:
          'The log gains shutdown and boot records, and anything buffered but not yet flushed at shutdown is lost.',
      },
      {
        target: { kind: 'artifact', artifact_id: 'file_timestamps' },
        impact: 'modifies',
        confidence: 'medium',
        rationale:
          'Boot activity updates access and modification times across system paths, adding noise to a timeline that has not yet been captured.',
      },
      {
        target: { kind: 'tier', tier: 'disk_artifact' },
        impact: 'preserves',
        confidence: 'high',
        rationale: 'Stored state survives a reset. A reboot is not a rebuild.',
      },
      {
        target: { kind: 'tag', tag: 'offhost' },
        impact: 'preserves',
        confidence: 'high',
        rationale: 'Records already held off the host cannot be reached by anything done to the host.',
      },
    ],
    default_effect: BOUNDED,
    captures: [],
    prerequisites: [],
    confidence: 'high',
    reference: 'Synthetic mapping. Derived from the definition of a power-cycle.',
    unknown_impact: false,
    notes: null,
  },

  /* ---------------------------------------------------------------------- */
  {
    action_id: 'host_shutdown',
    name: 'Shut down host',
    category: 'reboot',
    description: 'Power the host off, typically because a maintenance procedure requires it.',
    estimated_minutes: 5,
    destructive_level: 'high',
    reversible: 'unknown',
    applies_to: [...HOSTS, 'network_appliance'],
    effects: [
      {
        target: { kind: 'tier', tier: 'volatile_memory' },
        impact: 'destroys',
        confidence: 'high',
        rationale: 'Memory contents do not survive loss of power.',
      },
      {
        target: { kind: 'tier', tier: 'process_state' },
        impact: 'destroys',
        confidence: 'high',
        rationale: 'Nothing is running afterwards.',
      },
      {
        target: { kind: 'tier', tier: 'network_state' },
        impact: 'destroys',
        confidence: 'high',
        rationale: 'Nothing is connected afterwards.',
      },
      {
        target: { kind: 'tier', tier: 'session_state' },
        impact: 'destroys',
        confidence: 'high',
        rationale: 'Sessions on the host end with the host.',
      },
      {
        target: { kind: 'artifact', artifact_id: 'shared_memory_segments' },
        impact: 'destroys',
        confidence: 'high',
        rationale: 'Memory-backed filesystems are memory.',
      },
      {
        target: { kind: 'tier', tier: 'disk_artifact' },
        impact: 'preserves',
        confidence: 'high',
        rationale: 'Stored state survives a clean shutdown, and the disk can still be imaged offline.',
      },
      {
        target: { kind: 'tag', tag: 'offhost' },
        impact: 'preserves',
        confidence: 'high',
        rationale: 'Records already held off the host are unaffected.',
      },
    ],
    default_effect: BOUNDED,
    captures: [],
    prerequisites: [],
    confidence: 'high',
    reference: 'Synthetic mapping.',
    unknown_impact: false,
    notes:
      'A shutdown ends every opportunity that required a live host. Anything with `requires_live_host` that has not been collected by this point cannot be collected at all.',
  },

  /* ---------------------------------------------------------------------- */
  {
    action_id: 'process_terminate',
    name: 'Terminate process',
    category: 'process',
    description: 'Kill a specific process — typically one identified as malicious.',
    estimated_minutes: 2,
    destructive_level: 'moderate',
    reversible: false,
    applies_to: HOSTS_AND_RUNTIMES,
    effects: [
      {
        target: { kind: 'artifact', artifact_id: 'process_memory_target' },
        impact: 'destroys',
        confidence: 'high',
        rationale: 'The address space is returned to the operating system when the process exits.',
      },
      {
        target: { kind: 'artifact', artifact_id: 'injected_code_regions' },
        impact: 'destroys',
        confidence: 'medium',
        rationale: 'Regions belonging to the terminated process go with it.',
      },
      {
        target: { kind: 'artifact', artifact_id: 'decrypted_key_material' },
        impact: 'destroys',
        confidence: 'high',
        rationale: 'Secrets held by the process are freed with its memory.',
      },
      {
        target: { kind: 'artifact', artifact_id: 'open_file_handles' },
        impact: 'destroys',
        confidence: 'high',
        rationale:
          'Any file the process held open after unlinking it is released, and at that moment it stops being recoverable.',
      },
      {
        target: { kind: 'artifact', artifact_id: 'running_processes' },
        impact: 'modifies',
        confidence: 'high',
        rationale: 'The list changes. Children of the terminated process may be reparented or die with it.',
      },
      {
        target: { kind: 'artifact', artifact_id: 'active_connections' },
        impact: 'modifies',
        confidence: 'high',
        rationale: 'Connections owned by the process close.',
      },
    ],
    default_effect: BOUNDED,
    captures: [],
    prerequisites: [],
    confidence: 'high',
    reference: 'Synthetic mapping.',
    unknown_impact: false,
    notes:
      'Terminating a suspicious process before dumping it is the most common way an investigation loses its primary artifact.',
  },

  /* ---------------------------------------------------------------------- */
  {
    action_id: 'host_isolate',
    name: 'Isolate host from network',
    category: 'containment',
    description: 'Apply network quarantine so the host can no longer reach anything but management.',
    estimated_minutes: 5,
    destructive_level: 'moderate',
    reversible: true,
    applies_to: HOSTS_AND_RUNTIMES,
    effects: [
      {
        target: { kind: 'artifact', artifact_id: 'active_connections' },
        impact: 'destroys',
        confidence: 'high',
        rationale:
          'Established connections are torn down by the quarantine. The socket table afterwards records the isolation, not the incident.',
      },
      {
        target: { kind: 'artifact', artifact_id: 'arp_neighbour_cache' },
        impact: 'modifies',
        confidence: 'medium',
        rationale: 'Entries age out with nothing refreshing them.',
      },
      {
        target: { kind: 'artifact', artifact_id: 'centralised_logs' },
        impact: 'may_invalidate',
        confidence: 'medium',
        rationale:
          'If the host can no longer reach the logging platform, forwarding stops. Events after this point exist only on the host.',
      },
      {
        target: { kind: 'artifact', artifact_id: 'edr_telemetry' },
        impact: 'unknown',
        confidence: 'unknown',
        rationale:
          'Whether the endpoint agent keeps its management channel under your quarantine policy is a property of that policy, which is not recorded here.',
      },
    ],
    default_effect: BOUNDED,
    captures: [],
    prerequisites: [],
    confidence: 'medium',
    reference: 'Synthetic mapping.',
    unknown_impact: false,
    notes:
      'Isolation is usually filed under "safe". It is safe for the estate and destructive for network state — and it may quietly stop the off-host logging you were relying on.',
  },

  /* ---------------------------------------------------------------------- */
  {
    action_id: 'binary_replace',
    name: 'Replace binary',
    category: 'replace',
    description: 'Overwrite the vulnerable executable or library in place.',
    estimated_minutes: 6,
    destructive_level: 'low',
    reversible: true,
    applies_to: HOSTS_AND_RUNTIMES,
    effects: [
      {
        target: { kind: 'artifact', artifact_id: 'file_timestamps' },
        impact: 'modifies',
        confidence: 'high',
        rationale:
          'The replaced file carries the replacement times. Whatever the original timestamps said is gone unless already recorded.',
      },
      {
        target: { kind: 'artifact', artifact_id: 'installed_package_state' },
        impact: 'modifies',
        confidence: 'high',
        rationale: 'The on-disk state no longer matches what the package manager believes is installed.',
      },
      {
        target: { kind: 'artifact', artifact_id: 'disk_image' },
        impact: 'may_invalidate',
        confidence: 'medium',
        rationale:
          'An image taken after this point no longer contains the vulnerable binary, which is often the artifact the investigation needs to hash.',
      },
    ],
    default_effect: BOUNDED,
    captures: [],
    prerequisites: [],
    confidence: 'high',
    reference: 'Synthetic mapping.',
    unknown_impact: false,
    notes: null,
  },

  /* ---------------------------------------------------------------------- */
  {
    action_id: 'package_upgrade',
    name: 'Apply package upgrade',
    category: 'patch',
    description: 'Upgrade the vulnerable package through the platform package manager.',
    estimated_minutes: 12,
    destructive_level: 'low',
    reversible: true,
    applies_to: 'all',
    effects: [
      {
        target: { kind: 'artifact', artifact_id: 'installed_package_state' },
        impact: 'destroys',
        confidence: 'high',
        rationale:
          'The on-disk state of the vulnerable version is overwritten. This is the record of what you were actually exposed to, and the patch is what removes it — which is why it is captured before rather than after.',
      },
      {
        target: { kind: 'artifact', artifact_id: 'file_timestamps' },
        impact: 'modifies',
        confidence: 'high',
        rationale: 'Every file the upgrade touches gets new times, over the top of the timeline you wanted.',
      },
      {
        target: { kind: 'artifact', artifact_id: 'service_configuration' },
        impact: 'may_invalidate',
        confidence: 'medium',
        rationale:
          'Upgrades may replace, merge or back up configuration files. A tampered configuration can be quietly normalised.',
      },
      {
        target: { kind: 'artifact', artifact_id: 'disk_image' },
        impact: 'may_invalidate',
        confidence: 'medium',
        rationale: 'An image taken afterwards is of the patched system, not the exposed one.',
      },
    ],
    default_effect: BOUNDED,
    captures: [],
    prerequisites: [],
    confidence: 'high',
    reference: 'Synthetic mapping.',
    unknown_impact: false,
    notes:
      'Modelled as the package operation alone. Most package managers also restart the service; where yours does, add the restart as its own step so its footprint is counted.',
  },

  /* ---------------------------------------------------------------------- */
  {
    action_id: 'config_change',
    name: 'Apply configuration change',
    category: 'config',
    description:
      'Change the service configuration — a mitigation, a hardening step, or disabling the vulnerable feature.',
    estimated_minutes: 6,
    destructive_level: 'low',
    reversible: true,
    applies_to: 'all',
    effects: [
      {
        target: { kind: 'artifact', artifact_id: 'service_configuration' },
        impact: 'destroys',
        confidence: 'high',
        rationale:
          'The pre-change configuration is overwritten. If it had been tampered with, the tampering is what you have just deleted.',
      },
      {
        target: { kind: 'artifact', artifact_id: 'file_timestamps' },
        impact: 'modifies',
        confidence: 'medium',
        rationale: 'The configuration files carry new modification times.',
      },
      {
        target: { kind: 'artifact', artifact_id: 'service_runtime_state' },
        impact: 'modifies',
        confidence: 'medium',
        rationale: 'The running configuration diverges from what it was when the incident occurred.',
      },
    ],
    default_effect: BOUNDED,
    captures: [],
    prerequisites: [],
    confidence: 'high',
    reference: 'Synthetic mapping.',
    unknown_impact: false,
    notes: null,
  },

  /* ---------------------------------------------------------------------- */
  {
    action_id: 'credential_rotate',
    name: 'Rotate credential',
    category: 'credential',
    description: 'Issue a new secret for the affected service account, key or certificate.',
    estimated_minutes: 10,
    destructive_level: 'low',
    reversible: false,
    applies_to: 'all',
    effects: [
      {
        target: { kind: 'artifact', artifact_id: 'active_access_tokens' },
        impact: 'may_invalidate',
        confidence: 'high',
        rationale:
          'Rotation is the point of the action, but it also ends your ability to observe what the old credential could still reach. Inventory the live tokens first or the blast radius becomes unknowable.',
      },
      {
        target: { kind: 'artifact', artifact_id: 'identity_signin_logs' },
        impact: 'preserves',
        confidence: 'high',
        rationale: 'Sign-in history is a record of the past. Changing a secret does not edit it.',
      },
      {
        target: { kind: 'artifact', artifact_id: 'identity_audit_logs' },
        impact: 'preserves',
        confidence: 'high',
        rationale: 'The directory audit trail is appended to, not rewritten.',
      },
    ],
    default_effect: BOUNDED,
    captures: [],
    prerequisites: [],
    confidence: 'medium',
    reference: 'Synthetic mapping.',
    unknown_impact: false,
    notes:
      'Rotation does not destroy stored records. What it destroys is visibility: after it, nobody can enumerate what the compromised credential was still able to do.',
  },

  /* ---------------------------------------------------------------------- */
  {
    action_id: 'password_reset',
    name: 'Reset account password',
    category: 'credential',
    description: 'Force a password change on the affected user account.',
    estimated_minutes: 5,
    destructive_level: 'low',
    reversible: false,
    applies_to: ['saas_identity', 'windows_server', 'windows_workstation', 'linux_server'],
    effects: [
      {
        target: { kind: 'artifact', artifact_id: 'interactive_sessions' },
        impact: 'unknown',
        confidence: 'unknown',
        rationale:
          'Whether a reset terminates existing sessions depends on the directory and its session policy. Assuming it does is how an account stays compromised through a reset.',
      },
      {
        target: { kind: 'artifact', artifact_id: 'kerberos_tickets' },
        impact: 'may_invalidate',
        confidence: 'medium',
        rationale:
          'Tickets already issued remain usable until they expire. A reset prevents new ones; it does not recall old ones.',
      },
      {
        target: { kind: 'artifact', artifact_id: 'identity_audit_logs' },
        impact: 'preserves',
        confidence: 'high',
        rationale: 'The audit trail records the reset; it does not lose what came before it.',
      },
    ],
    default_effect: BOUNDED,
    captures: [],
    prerequisites: [],
    confidence: 'medium',
    reference: 'Synthetic mapping.',
    unknown_impact: false,
    notes: null,
  },

  /* ---------------------------------------------------------------------- */
  {
    action_id: 'token_revoke',
    name: 'Revoke tokens',
    category: 'session',
    description: 'Revoke issued access and refresh tokens for the affected principal.',
    estimated_minutes: 4,
    destructive_level: 'moderate',
    reversible: false,
    applies_to: ['saas_identity', 'cloud_vm', 'application_server', 'kubernetes_workload'],
    effects: [
      {
        target: { kind: 'artifact', artifact_id: 'active_access_tokens' },
        impact: 'destroys',
        confidence: 'high',
        rationale:
          'The live token inventory is what is being revoked. Afterwards the set of tokens that existed, and the scopes they carried, is no longer observable from the provider.',
      },
      {
        target: { kind: 'artifact', artifact_id: 'app_session_store' },
        impact: 'modifies',
        confidence: 'medium',
        rationale: 'Sessions backed by a revoked token become invalid and may be reaped.',
      },
      {
        target: { kind: 'artifact', artifact_id: 'identity_signin_logs' },
        impact: 'preserves',
        confidence: 'high',
        rationale: 'History is unaffected.',
      },
      {
        target: { kind: 'artifact', artifact_id: 'identity_audit_logs' },
        impact: 'preserves',
        confidence: 'high',
        rationale: 'The revocation is appended to the audit trail.',
      },
    ],
    default_effect: BOUNDED,
    captures: [],
    prerequisites: [],
    confidence: 'medium',
    reference: 'Synthetic mapping.',
    unknown_impact: false,
    notes:
      'Necessary, and it erases the answer to "what could they still have done". Inventory first; the inventory takes six minutes.',
  },

  /* ---------------------------------------------------------------------- */
  {
    action_id: 'session_terminate',
    name: 'Terminate active sessions',
    category: 'session',
    description: 'Force-close interactive and remote sessions on the affected asset or principal.',
    estimated_minutes: 3,
    destructive_level: 'moderate',
    reversible: false,
    applies_to: 'all',
    effects: [
      {
        target: { kind: 'tier', tier: 'session_state' },
        impact: 'destroys',
        confidence: 'high',
        rationale: 'The sessions are the thing being ended.',
      },
      {
        target: { kind: 'artifact', artifact_id: 'active_connections' },
        impact: 'modifies',
        confidence: 'high',
        rationale: 'Connections carrying those sessions close.',
      },
      {
        target: { kind: 'tag', tag: 'offhost' },
        impact: 'preserves',
        confidence: 'high',
        rationale: 'Off-host records are unaffected.',
      },
    ],
    default_effect: BOUNDED,
    captures: [],
    prerequisites: [],
    confidence: 'high',
    reference: 'Synthetic mapping.',
    unknown_impact: false,
    notes: null,
  },

  /* ---------------------------------------------------------------------- */
  {
    action_id: 'disable_account',
    name: 'Disable account',
    category: 'credential',
    description: 'Disable the affected principal in the directory.',
    estimated_minutes: 3,
    destructive_level: 'low',
    reversible: true,
    applies_to: ['saas_identity', 'windows_server', 'cloud_vm'],
    effects: [
      {
        target: { kind: 'artifact', artifact_id: 'interactive_sessions' },
        impact: 'unknown',
        confidence: 'unknown',
        rationale:
          'Whether disabling an account ends sessions already established depends on the provider and on token lifetime. It is frequently assumed and frequently untrue.',
      },
      {
        target: { kind: 'artifact', artifact_id: 'active_access_tokens' },
        impact: 'may_invalidate',
        confidence: 'medium',
        rationale:
          'Tokens already issued commonly remain valid until they expire. Disabling the account stops new ones being issued.',
      },
      {
        target: { kind: 'tag', tag: 'identity' },
        impact: 'preserves',
        confidence: 'high',
        rationale: 'Directory records are appended to, not rewritten.',
      },
    ],
    default_effect: BOUNDED,
    captures: [],
    prerequisites: [],
    confidence: 'medium',
    reference: 'Synthetic mapping.',
    unknown_impact: false,
    notes: null,
  },

  /* ---------------------------------------------------------------------- */
  {
    action_id: 'container_redeploy',
    name: 'Redeploy container',
    category: 'redeploy',
    description: 'Replace the running container with a fresh one from the patched image.',
    estimated_minutes: 8,
    destructive_level: 'high',
    reversible: false,
    applies_to: ['container', 'kubernetes_workload'],
    effects: [
      {
        target: { kind: 'tier', tier: 'volatile_memory' },
        impact: 'destroys',
        confidence: 'high',
        rationale: 'The workload process is replaced. Its memory goes with it.',
      },
      {
        target: { kind: 'tier', tier: 'process_state' },
        impact: 'destroys',
        confidence: 'high',
        rationale: 'Nothing from the previous container is still running.',
      },
      {
        target: { kind: 'tier', tier: 'network_state' },
        impact: 'destroys',
        confidence: 'high',
        rationale: 'The network namespace is torn down with the container.',
      },
      {
        target: { kind: 'tier', tier: 'session_state' },
        impact: 'destroys',
        confidence: 'high',
        rationale: 'In-workload sessions end with the workload.',
      },
      {
        target: { kind: 'artifact', artifact_id: 'container_writable_layer' },
        impact: 'destroys',
        confidence: 'high',
        rationale:
          'The copy-on-write layer is discarded. The image is immutable, so everything the attacker wrote lived in that layer and nowhere else — this single step is the whole forensic cost of a redeploy.',
      },
      {
        target: { kind: 'artifact', artifact_id: 'ephemeral_volume_contents' },
        impact: 'destroys',
        confidence: 'high',
        rationale: 'Volumes bound to the workload lifetime are removed with it.',
      },
      {
        target: { kind: 'tier', tier: 'temporary_state' },
        impact: 'destroys',
        confidence: 'high',
        rationale: 'Temporary paths inside the container are part of the discarded layer.',
      },
      {
        target: { kind: 'artifact', artifact_id: 'local_event_logs' },
        impact: 'destroys',
        confidence: 'high',
        rationale: 'Logs written inside the container are in the writable layer.',
      },
      {
        target: { kind: 'tag', tag: 'offhost' },
        impact: 'preserves',
        confidence: 'high',
        rationale: 'Anything already shipped off the workload is untouched.',
      },
      {
        target: { kind: 'tag', tag: 'cloud' },
        impact: 'preserves',
        confidence: 'high',
        rationale: 'Control-plane records are kept by the provider, not by the workload.',
      },
    ],
    default_effect: REPLACES_HOST,
    captures: [],
    prerequisites: [],
    confidence: 'high',
    reference: 'Synthetic mapping.',
    unknown_impact: false,
    notes:
      'Redeployment is the default cloud remediation and the fastest way to erase a container investigation. The image being clean is exactly why the evidence is not in it.',
  },

  /* ---------------------------------------------------------------------- */
  {
    action_id: 'vm_redeploy',
    name: 'Redeploy VM from image',
    category: 'redeploy',
    description: 'Replace the virtual machine with a fresh instance built from a patched image.',
    estimated_minutes: 30,
    destructive_level: 'high',
    reversible: false,
    applies_to: ['cloud_vm'],
    effects: [
      {
        target: { kind: 'tier', tier: 'volatile_memory' },
        impact: 'destroys',
        confidence: 'high',
        rationale: 'The instance is gone, and so is its memory.',
      },
      {
        target: { kind: 'tier', tier: 'process_state' },
        impact: 'destroys',
        confidence: 'high',
        rationale: 'The instance is gone.',
      },
      {
        target: { kind: 'tier', tier: 'network_state' },
        impact: 'destroys',
        confidence: 'high',
        rationale: 'The instance is gone.',
      },
      {
        target: { kind: 'tier', tier: 'session_state' },
        impact: 'destroys',
        confidence: 'high',
        rationale: 'The instance is gone.',
      },
      {
        target: { kind: 'tier', tier: 'runtime_artifact' },
        impact: 'destroys',
        confidence: 'high',
        rationale: 'Runtime state does not carry across a replacement.',
      },
      {
        target: { kind: 'tier', tier: 'temporary_state' },
        impact: 'destroys',
        confidence: 'high',
        rationale: 'Temporary state lives on the replaced instance.',
      },
      {
        target: { kind: 'tier', tier: 'disk_artifact' },
        impact: 'destroys',
        confidence: 'high',
        rationale:
          'The new instance is built from an image. The old root volume is not carried across unless somebody deliberately detaches and keeps it.',
      },
      {
        target: { kind: 'artifact', artifact_id: 'local_event_logs' },
        impact: 'destroys',
        confidence: 'high',
        rationale: 'Logs on the old instance go with the old instance.',
      },
      {
        target: { kind: 'tag', tag: 'offhost' },
        impact: 'preserves',
        confidence: 'high',
        rationale: 'Anything already shipped off the instance is untouched.',
      },
      {
        target: { kind: 'tag', tag: 'cloud' },
        impact: 'preserves',
        confidence: 'high',
        rationale: 'Control-plane records are kept by the provider.',
      },
    ],
    default_effect: REPLACES_HOST,
    captures: [],
    prerequisites: [],
    confidence: 'high',
    reference: 'Synthetic mapping.',
    unknown_impact: false,
    notes: null,
  },

  /* ---------------------------------------------------------------------- */
  {
    action_id: 'instance_terminate',
    name: 'Terminate instance',
    category: 'terminate',
    description: 'Destroy the cloud instance outright.',
    estimated_minutes: 6,
    destructive_level: 'high',
    reversible: false,
    applies_to: ['cloud_vm', 'container', 'kubernetes_workload'],
    effects: [
      {
        target: { kind: 'tier', tier: 'volatile_memory' },
        impact: 'destroys',
        confidence: 'high',
        rationale: 'The instance ceases to exist.',
      },
      {
        target: { kind: 'tier', tier: 'process_state' },
        impact: 'destroys',
        confidence: 'high',
        rationale: 'The instance ceases to exist.',
      },
      {
        target: { kind: 'tier', tier: 'network_state' },
        impact: 'destroys',
        confidence: 'high',
        rationale: 'The instance ceases to exist.',
      },
      {
        target: { kind: 'tier', tier: 'session_state' },
        impact: 'destroys',
        confidence: 'high',
        rationale: 'The instance ceases to exist.',
      },
      {
        target: { kind: 'tier', tier: 'runtime_artifact' },
        impact: 'destroys',
        confidence: 'high',
        rationale: 'The instance ceases to exist.',
      },
      {
        target: { kind: 'tier', tier: 'temporary_state' },
        impact: 'destroys',
        confidence: 'high',
        rationale: 'The instance ceases to exist.',
      },
      {
        target: { kind: 'artifact', artifact_id: 'disk_image' },
        impact: 'unknown',
        confidence: 'unknown',
        rationale:
          'Whether the root volume survives termination depends on the delete-on-termination setting for that volume. The plan does not record it, so neither does this. Check it before, not after.',
      },
      {
        target: { kind: 'artifact', artifact_id: 'local_event_logs' },
        impact: 'destroys',
        confidence: 'high',
        rationale: 'Held on the volume attached to a resource that is being destroyed.',
      },
      {
        target: { kind: 'tag', tag: 'offhost' },
        impact: 'preserves',
        confidence: 'high',
        rationale: 'Anything already shipped off the instance is untouched.',
      },
      {
        target: { kind: 'tag', tag: 'cloud' },
        impact: 'preserves',
        confidence: 'high',
        rationale:
          'Control-plane audit records belong to the account, not to the instance. They are the one thing termination cannot reach.',
      },
    ],
    default_effect: REPLACES_HOST,
    captures: [],
    prerequisites: [],
    confidence: 'high',
    reference: 'Synthetic mapping.',
    unknown_impact: false,
    notes: null,
  },

  /* ---------------------------------------------------------------------- */
  {
    action_id: 'host_rebuild',
    name: 'Rebuild host',
    category: 'rebuild',
    description: 'Reimage the host from a known-good build.',
    estimated_minutes: 240,
    destructive_level: 'high',
    reversible: false,
    applies_to: HOSTS,
    effects: [
      {
        target: { kind: 'tier', tier: 'volatile_memory' },
        impact: 'destroys',
        confidence: 'high',
        rationale: 'Nothing about the old host survives.',
      },
      {
        target: { kind: 'tier', tier: 'process_state' },
        impact: 'destroys',
        confidence: 'high',
        rationale: 'Nothing about the old host survives.',
      },
      {
        target: { kind: 'tier', tier: 'network_state' },
        impact: 'destroys',
        confidence: 'high',
        rationale: 'Nothing about the old host survives.',
      },
      {
        target: { kind: 'tier', tier: 'session_state' },
        impact: 'destroys',
        confidence: 'high',
        rationale: 'Nothing about the old host survives.',
      },
      {
        target: { kind: 'tier', tier: 'runtime_artifact' },
        impact: 'destroys',
        confidence: 'high',
        rationale: 'Nothing about the old host survives.',
      },
      {
        target: { kind: 'tier', tier: 'temporary_state' },
        impact: 'destroys',
        confidence: 'high',
        rationale: 'Nothing about the old host survives.',
      },
      {
        target: { kind: 'tier', tier: 'disk_artifact' },
        impact: 'destroys',
        confidence: 'high',
        rationale: 'The storage is overwritten by the new build.',
      },
      {
        target: { kind: 'artifact', artifact_id: 'local_event_logs' },
        impact: 'destroys',
        confidence: 'high',
        rationale: 'Held on the storage being overwritten.',
      },
      {
        target: { kind: 'tag', tag: 'offhost' },
        impact: 'preserves',
        confidence: 'high',
        rationale:
          'Records already held off the host are the only thing a rebuild cannot reach. After a rebuild they are the investigation.',
      },
    ],
    default_effect: REPLACES_HOST,
    captures: [],
    prerequisites: [],
    confidence: 'high',
    reference: 'Synthetic mapping.',
    unknown_impact: false,
    notes: null,
  },

  /* ---------------------------------------------------------------------- */
  {
    action_id: 'firmware_update',
    name: 'Apply vendor firmware update',
    category: 'firmware',
    description:
      'Run the vendor maintenance procedure for the device. What the procedure does internally is not published.',
    estimated_minutes: 45,
    destructive_level: 'unknown',
    reversible: 'unknown',
    applies_to: ['network_appliance'],
    effects: [
      {
        target: { kind: 'artifact', artifact_id: 'conntrack_table' },
        impact: 'destroys',
        confidence: 'high',
        rationale:
          'The session table does not survive a reload on any vendor platform. This one part of the procedure can be asserted.',
      },
      {
        target: { kind: 'artifact', artifact_id: 'appliance_syslog' },
        impact: 'unknown',
        confidence: 'unknown',
        rationale:
          'Vendor maintenance procedures frequently clear on-device buffers, and frequently do not. Nothing in this library establishes which applies here.',
      },
      {
        target: { kind: 'tag', tag: 'offhost' },
        impact: 'preserves',
        confidence: 'high',
        rationale:
          'Records already forwarded off the device cannot be reached by anything the device does to itself.',
      },
    ],
    default_effect: {
      impact: 'unknown',
      confidence: 'unknown',
      rationale:
        'The vendor procedure is not characterised in this library. No claim is made about what it does to anything not named above — and an uncharacterised procedure is not a harmless one.',
    },
    captures: [],
    prerequisites: [],
    confidence: 'unknown',
    reference:
      'No published relationship between this procedure and on-device evidence. Treat every unlisted artifact as an open question for the vendor or for DFIR review.',
    unknown_impact: true,
    notes:
      'The honest answer for most appliance maintenance. The tool will not convert this into "safe" and will not convert it into "destroyed"; it will keep saying "nobody here knows" until somebody finds out.',
  },

  /* ---------------------------------------------------------------------- */
  {
    action_id: 'verify_remediation',
    name: 'Verify remediation',
    category: 'verify',
    description: 'Confirm the fix is in place and the service is healthy.',
    estimated_minutes: 10,
    destructive_level: 'none',
    reversible: true,
    applies_to: 'all',
    effects: [],
    default_effect: {
      impact: 'preserves',
      confidence: 'high',
      rationale: 'Verification reads the system. It changes nothing in the evidence catalogue.',
    },
    captures: [],
    prerequisites: [],
    confidence: 'high',
    reference: null,
    unknown_impact: false,
    notes: null,
  },
]

export const ACTION_LIBRARY: readonly RemediationAction[] = [
  ...CAPTURE_ACTIONS,
  ...REMEDIATION_ACTIONS,
]

export const ACTION_BY_ID: ReadonlyMap<string, RemediationAction> = new Map(
  ACTION_LIBRARY.map((a) => [a.action_id, a]),
)
