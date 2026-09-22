/**
 * The evidence catalogue.
 *
 * Every entry answers one question: if this artifact is gone, what can the
 * investigation no longer determine? That is the `answers` field, and it is
 * the reason the catalogue is not just a list of things a tool can dump.
 *
 * Four things to know about how it is written.
 *
 * `estimated_minutes` is an order-of-magnitude figure for a mid-sized
 * enterprise host, not a measurement. It exists so the deadline arithmetic has
 * something to work with, and every screen that shows a total says where the
 * number came from. Where an honest estimate is not possible it is `null`, and
 * the total says "plus N steps nobody has timed" rather than quietly adding
 * zero.
 *
 * `observer_effect` records what collecting costs. Live memory acquisition
 * writes to the memory it is acquiring; a disk image of a running host is
 * internally inconsistent. A tool that presents capture as free is lying by
 * omission about the one trade-off it exists to surface.
 *
 * `tags` are what actions write rules against. An action says "everything
 * tagged `memory` is destroyed" once instead of naming eleven artifacts, and
 * then carves out exceptions by id.
 *
 * `applies_to` scopes the catalogue by asset type. It is not a claim to model
 * every platform faithfully — a container has no physical memory of its own,
 * and a SaaS identity tenant has no host artifacts at all, and those two facts
 * are most of what the scoping does.
 */

import type { EvidenceArtifact } from '../domain/types.ts'

/** Host platforms where a full memory acquisition is a coherent idea. */
const HOSTS = [
  'windows_workstation',
  'windows_server',
  'linux_server',
  'cloud_vm',
  'database_server',
  'application_server',
] as const

/** The above plus the container runtimes, where process-level work still applies. */
const HOSTS_AND_RUNTIMES = [...HOSTS, 'container', 'kubernetes_workload'] as const

export const EVIDENCE_CATALOGUE: readonly EvidenceArtifact[] = [
  /* ---------------------------------------------------------------------- */
  /* Tier 1 — volatile memory                                               */
  /* ---------------------------------------------------------------------- */
  {
    artifact_id: 'physical_memory',
    name: 'Physical memory image',
    tier: 'volatile_memory',
    description:
      'A full image of the host RAM, including kernel structures, process address spaces and anything resident that never touched disk.',
    applies_to: HOSTS,
    collection: {
      label: 'Live acquisition to external storage',
      estimated_minutes: 45,
      requires_live_host: true,
      observer_effect:
        'The acquisition agent runs in the memory it is imaging, so the image includes the act of taking it and is not a consistent point-in-time snapshot.',
      note: 'Scales with installed RAM and the write speed of the destination.',
    },
    default_priority: 'required',
    answers:
      'Was anything executing that never existed as a file? Fileless malware, injected code and in-memory credentials exist nowhere else.',
    tags: ['memory', 'host_state'],
    confidence: 'high',
    notes: null,
  },
  {
    artifact_id: 'process_memory_target',
    name: 'Target process memory',
    tier: 'volatile_memory',
    description:
      'The address space of one specific process — typically the vulnerable service — dumped without imaging the whole host.',
    applies_to: HOSTS_AND_RUNTIMES,
    collection: {
      label: 'Per-process memory dump',
      estimated_minutes: 8,
      requires_live_host: true,
      observer_effect:
        'Dumping a running process may briefly suspend it, and the dump reflects the moment of collection rather than the moment of interest.',
      note: 'The pragmatic substitute when a full memory image will not fit the window.',
    },
    default_priority: 'required',
    answers:
      'What was inside the vulnerable service at the time — deserialised payloads, request buffers, loaded webshell code?',
    tags: ['memory', 'process', 'host_state'],
    confidence: 'high',
    notes: null,
  },
  {
    artifact_id: 'injected_code_regions',
    name: 'Unbacked executable memory',
    tier: 'volatile_memory',
    description:
      'Executable memory regions with no backing file on disk — the usual shape of process injection and reflectively loaded code.',
    applies_to: HOSTS_AND_RUNTIMES,
    collection: {
      label: 'Region enumeration and targeted dump',
      estimated_minutes: 12,
      requires_live_host: true,
      observer_effect: null,
      note: 'Depends on a live process list; loses meaning once processes have been restarted.',
    },
    default_priority: 'required',
    answers:
      'Is code running on this host that was never written to disk, and therefore leaves no file for anyone to find afterwards?',
    tags: ['memory', 'process', 'host_state'],
    confidence: 'high',
    notes: null,
  },
  {
    artifact_id: 'decrypted_key_material',
    name: 'Decrypted key material in memory',
    tier: 'volatile_memory',
    description:
      'Private keys, session keys and secrets that exist in plaintext only while the process holding them is running.',
    applies_to: HOSTS_AND_RUNTIMES,
    collection: {
      label: 'Extracted from a memory image',
      estimated_minutes: null,
      requires_live_host: true,
      observer_effect: null,
      note: 'No independent estimate: in practice this is recovered from the memory image rather than collected separately, and the time is analysis time rather than acquisition time.',
    },
    default_priority: 'recommended',
    answers:
      'Which secrets were actually resident and therefore reachable by anything running on this host?',
    tags: ['memory', 'credential', 'host_state'],
    confidence: 'medium',
    notes:
      'Recovery from an image is not guaranteed; some runtimes zero key buffers aggressively and some do not.',
  },

  /* ---------------------------------------------------------------------- */
  /* Tier 2 — running state                                                 */
  /* ---------------------------------------------------------------------- */
  {
    artifact_id: 'running_processes',
    name: 'Running process list',
    tier: 'process_state',
    description:
      'Processes with command lines, parents, owning users and start times, as a point-in-time list.',
    applies_to: 'all',
    collection: {
      label: 'Process enumeration to file',
      estimated_minutes: 3,
      requires_live_host: true,
      observer_effect: 'The collection tool appears in its own output.',
      note: null,
    },
    default_priority: 'required',
    answers:
      'What was actually running, under whose account, launched by what? The parent chain is usually the first thing an investigation asks for.',
    tags: ['process', 'host_state'],
    confidence: 'high',
    notes: null,
  },
  {
    artifact_id: 'loaded_modules',
    name: 'Loaded modules',
    tier: 'process_state',
    description:
      'Shared libraries, drivers and kernel modules loaded into running processes and into the kernel.',
    applies_to: HOSTS_AND_RUNTIMES,
    collection: {
      label: 'Module enumeration to file',
      estimated_minutes: 3,
      requires_live_host: true,
      observer_effect: null,
      note: null,
    },
    default_priority: 'recommended',
    answers:
      'Was anything loaded into a legitimate process that did not belong there — a sideloaded library, an unsigned driver?',
    tags: ['process', 'host_state'],
    confidence: 'high',
    notes: null,
  },
  {
    artifact_id: 'open_file_handles',
    name: 'Open handles and deleted-but-open files',
    tier: 'process_state',
    description:
      'Open file and socket handles, including files that have been unlinked from the filesystem but are still held open by a process.',
    applies_to: HOSTS_AND_RUNTIMES,
    collection: {
      label: 'Handle enumeration, with recovery of unlinked files',
      estimated_minutes: 4,
      requires_live_host: true,
      observer_effect: null,
      note: 'An unlinked-but-open file is recoverable only while the holding process lives.',
    },
    default_priority: 'recommended',
    answers:
      'Is there a file the attacker deleted that is still recoverable because something still has it open? After the process ends, it is not.',
    tags: ['process', 'filesystem', 'host_state'],
    confidence: 'high',
    notes: null,
  },
  {
    artifact_id: 'service_runtime_state',
    name: 'Service runtime state',
    tier: 'process_state',
    description:
      'The running configuration, uptime, worker set and in-memory state of the affected service, as distinct from its configuration on disk.',
    applies_to: 'all',
    collection: {
      label: 'Service status and runtime configuration dump',
      estimated_minutes: 2,
      requires_live_host: true,
      observer_effect: null,
      note: null,
    },
    default_priority: 'recommended',
    answers:
      'Was the service running the configuration that is on disk, or something that was changed at runtime and never written down?',
    tags: ['process', 'service', 'host_state'],
    confidence: 'high',
    notes: null,
  },

  /* ---------------------------------------------------------------------- */
  /* Tier 3 — network state                                                 */
  /* ---------------------------------------------------------------------- */
  {
    artifact_id: 'active_connections',
    name: 'Established network connections',
    tier: 'network_state',
    description:
      'The socket table: established connections with remote addresses, ports and owning processes.',
    applies_to: 'all',
    collection: {
      label: 'Socket table enumeration',
      estimated_minutes: 2,
      requires_live_host: true,
      observer_effect: null,
      note: null,
    },
    default_priority: 'required',
    answers:
      'Where was this host talking to, right now, and which process owned the conversation? A closed connection leaves no local record of itself.',
    tags: ['network', 'host_state'],
    confidence: 'high',
    notes: null,
  },
  {
    artifact_id: 'listening_sockets',
    name: 'Listening sockets',
    tier: 'network_state',
    description: 'Bound ports and the processes listening on them.',
    applies_to: 'all',
    collection: {
      label: 'Listener enumeration',
      estimated_minutes: 2,
      requires_live_host: true,
      observer_effect: null,
      note: null,
    },
    default_priority: 'recommended',
    answers: 'Was anything listening that should not have been — a backdoor port, an unexpected bind?',
    tags: ['network', 'host_state'],
    confidence: 'high',
    notes: null,
  },
  {
    artifact_id: 'arp_neighbour_cache',
    name: 'ARP / neighbour cache',
    tier: 'network_state',
    description: 'Recently resolved layer-2 neighbours on the local segment.',
    applies_to: HOSTS,
    collection: {
      label: 'Neighbour table dump',
      estimated_minutes: 1,
      requires_live_host: true,
      observer_effect: null,
      note: null,
    },
    default_priority: 'optional',
    answers: 'Which hosts on the local segment did this machine actually talk to recently?',
    tags: ['network', 'host_state'],
    confidence: 'high',
    notes: null,
  },
  {
    artifact_id: 'dns_resolver_cache',
    name: 'DNS resolver cache',
    tier: 'network_state',
    description: 'Names this host resolved recently, with their remaining time to live.',
    applies_to: HOSTS,
    collection: {
      label: 'Resolver cache dump',
      estimated_minutes: 1,
      requires_live_host: true,
      observer_effect: null,
      note: 'Entries expire on their own; the cache is a partial record even before anything touches it.',
    },
    default_priority: 'recommended',
    answers:
      'What names did this host look up? Often the only local trace of a command-and-control domain if egress logging is thin.',
    tags: ['network', 'host_state'],
    confidence: 'medium',
    notes: 'Cache contents are already lossy: TTL expiry removes entries with no record that they existed.',
  },
  {
    artifact_id: 'conntrack_table',
    name: 'Connection-tracking table',
    tier: 'network_state',
    description:
      'The stateful firewall or appliance session table: flows in progress, with translation and policy decisions.',
    applies_to: ['network_appliance'],
    collection: {
      label: 'Session table export',
      estimated_minutes: 4,
      requires_live_host: true,
      observer_effect: null,
      note: null,
    },
    default_priority: 'required',
    answers:
      'Which flows were in progress through this device, and what did the policy do with them? The table is rebuilt from empty on reload.',
    tags: ['network', 'appliance'],
    confidence: 'medium',
    notes: 'Export format and completeness vary considerably between vendors.',
  },

  /* ---------------------------------------------------------------------- */
  /* Tier 4 — session state                                                 */
  /* ---------------------------------------------------------------------- */
  {
    artifact_id: 'interactive_sessions',
    name: 'Logged-on sessions',
    tier: 'session_state',
    description: 'Interactive and remote sessions currently established, with their origin.',
    applies_to: 'all',
    collection: {
      label: 'Session enumeration',
      estimated_minutes: 2,
      requires_live_host: true,
      observer_effect: null,
      note: null,
    },
    default_priority: 'required',
    answers: 'Who is logged in right now, from where, and since when?',
    tags: ['session', 'host_state'],
    confidence: 'high',
    notes: null,
  },
  {
    artifact_id: 'active_access_tokens',
    name: 'Live access and refresh tokens',
    tier: 'session_state',
    description:
      'Tokens currently valid for the affected principal, with their scopes, audiences and issue times.',
    applies_to: ['saas_identity', 'cloud_vm', 'application_server', 'kubernetes_workload'],
    collection: {
      label: 'Token inventory from the issuer',
      estimated_minutes: 6,
      requires_live_host: false,
      observer_effect: null,
      note: 'Read from the identity provider rather than from the host.',
    },
    default_priority: 'required',
    answers:
      'What could the compromised principal still do, and for how long? Scope and expiry are the blast radius.',
    tags: ['session', 'credential', 'identity'],
    confidence: 'medium',
    notes:
      'What a provider exposes about live tokens varies; some list sessions rather than tokens, and refresh-token lineage is often not visible at all.',
  },
  {
    artifact_id: 'kerberos_tickets',
    name: 'Cached Kerberos tickets',
    tier: 'session_state',
    description: 'Ticket-granting and service tickets cached on the host for logged-on principals.',
    applies_to: ['windows_workstation', 'windows_server', 'linux_server'],
    collection: {
      label: 'Ticket cache enumeration',
      estimated_minutes: 3,
      requires_live_host: true,
      observer_effect: null,
      note: null,
    },
    default_priority: 'recommended',
    answers:
      'Which service tickets had been requested from this host — often the clearest signal of lateral movement that was attempted but not logged centrally.',
    tags: ['session', 'credential', 'host_state'],
    confidence: 'high',
    notes: null,
  },
  {
    artifact_id: 'app_session_store',
    name: 'Application session store',
    tier: 'session_state',
    description:
      'Server-side sessions held by the application — in memory, in a cache, or in a session table.',
    applies_to: ['application_server', 'container', 'kubernetes_workload', 'saas_identity'],
    collection: {
      label: 'Session store export',
      estimated_minutes: 10,
      requires_live_host: true,
      observer_effect: null,
      note: null,
    },
    default_priority: 'recommended',
    answers:
      'Which application sessions existed, and did any of them belong to an account that should not have had one?',
    tags: ['session'],
    confidence: 'medium',
    notes: 'Where the store lives is application-specific; an in-process store does not survive a restart.',
  },

  /* ---------------------------------------------------------------------- */
  /* Tier 5 — runtime artifacts                                             */
  /* ---------------------------------------------------------------------- */
  {
    artifact_id: 'container_writable_layer',
    name: 'Container writable layer',
    tier: 'runtime_artifact',
    description:
      'Everything written inside the container since it started, held in the copy-on-write layer above the immutable image.',
    applies_to: ['container', 'kubernetes_workload'],
    collection: {
      label: 'Checkpoint or export of the writable layer',
      estimated_minutes: 15,
      requires_live_host: true,
      observer_effect: null,
      note: 'The layer is discarded when the container is replaced, not when it is restarted.',
    },
    default_priority: 'required',
    answers:
      'What did the attacker write inside the container? The image is unchanged by definition, so everything they left is in this layer and nowhere else.',
    tags: ['container', 'runtime', 'filesystem'],
    confidence: 'high',
    notes: null,
  },
  {
    artifact_id: 'ephemeral_volume_contents',
    name: 'Ephemeral volume contents',
    tier: 'runtime_artifact',
    description: 'Contents of volumes whose lifetime is bound to the workload rather than the cluster.',
    // Container runtimes only. A cloud VM's instance-store volume is a
    // comparable idea, but it is acquired as part of the disk image rather
    // than through a workload checkpoint, so listing it here would offer an
    // artifact with no in-scope way to collect it.
    applies_to: ['container', 'kubernetes_workload'],
    collection: {
      label: 'Volume copy before teardown',
      estimated_minutes: 12,
      requires_live_host: true,
      observer_effect: null,
      note: null,
    },
    default_priority: 'recommended',
    answers: 'What was staged on scratch storage that the next scheduling decision will erase?',
    tags: ['container', 'runtime', 'filesystem'],
    confidence: 'medium',
    notes: 'Whether a given volume is ephemeral depends on the workload spec, not on the platform.',
  },
  {
    artifact_id: 'shared_memory_segments',
    name: 'Shared memory and tmpfs',
    tier: 'runtime_artifact',
    description:
      'Shared memory segments and memory-backed filesystems, which look like files but do not survive a reboot.',
    applies_to: ['linux_server', 'cloud_vm', 'container', 'kubernetes_workload', 'database_server'],
    collection: {
      label: 'Copy of memory-backed paths',
      estimated_minutes: 6,
      requires_live_host: true,
      observer_effect: null,
      note: null,
    },
    default_priority: 'recommended',
    answers:
      'Was anything staged somewhere that looks like disk but is not? Content here is frequently mistaken for something a disk image will capture.',
    tags: ['runtime', 'filesystem', 'memory'],
    confidence: 'high',
    notes: null,
  },

  /* ---------------------------------------------------------------------- */
  /* Tier 6 — temporary state                                               */
  /* ---------------------------------------------------------------------- */
  {
    artifact_id: 'temp_directory_contents',
    name: 'Temporary directory contents',
    tier: 'temporary_state',
    description: 'World-writable and per-user temporary paths, the usual staging ground.',
    applies_to: HOSTS_AND_RUNTIMES,
    collection: {
      label: 'Targeted copy of temporary paths',
      estimated_minutes: 10,
      requires_live_host: false,
      observer_effect: null,
      note: null,
    },
    default_priority: 'recommended',
    answers: 'What was staged and not yet cleaned up?',
    tags: ['filesystem', 'temp'],
    confidence: 'high',
    notes: 'Some platforms clear temporary paths on boot and some do not; treat survival across a reboot as configuration-dependent.',
  },
  {
    artifact_id: 'swap_and_pagefile',
    name: 'Swap and pagefile',
    tier: 'temporary_state',
    description:
      'Paged-out memory on disk, which can retain fragments of process memory long after the process has gone.',
    applies_to: HOSTS,
    collection: {
      label: 'Copy of the swap device or pagefile',
      estimated_minutes: 35,
      requires_live_host: false,
      observer_effect: null,
      note: 'Often locked while the host is running; may need to be taken from the disk image instead.',
    },
    default_priority: 'optional',
    answers:
      'Is there a fragment of a process that has already exited? Sometimes the only remaining trace of a short-lived payload.',
    tags: ['filesystem', 'temp', 'memory'],
    confidence: 'medium',
    notes: 'Some deployments run without swap, and encrypted swap is unreadable after a reboot even if the file survives.',
  },
  {
    artifact_id: 'crash_dumps',
    name: 'Crash dumps and core files',
    tier: 'temporary_state',
    description: 'Process cores and system crash dumps already written to disk.',
    applies_to: HOSTS_AND_RUNTIMES,
    collection: {
      label: 'Copy of dump paths',
      estimated_minutes: 12,
      requires_live_host: false,
      observer_effect: null,
      note: null,
    },
    default_priority: 'optional',
    answers:
      'Did the exploit crash something on the way in? A failed attempt often leaves a core file that a successful one does not.',
    tags: ['filesystem', 'temp'],
    confidence: 'high',
    notes: null,
  },
  {
    artifact_id: 'staged_tooling',
    name: 'Staged tooling in writable paths',
    tier: 'temporary_state',
    description: 'Binaries, scripts and archives left in paths the service account can write to.',
    applies_to: HOSTS_AND_RUNTIMES,
    collection: {
      label: 'Targeted collection of writable paths',
      estimated_minutes: 8,
      requires_live_host: false,
      observer_effect: null,
      note: null,
    },
    default_priority: 'required',
    answers: 'What did they bring with them, and what does it tell you about what they were doing?',
    tags: ['filesystem', 'temp'],
    confidence: 'high',
    notes: null,
  },

  /* ---------------------------------------------------------------------- */
  /* Tier 7 — disk artifacts                                                */
  /* ---------------------------------------------------------------------- */
  {
    artifact_id: 'disk_image',
    name: 'Full disk image',
    tier: 'disk_artifact',
    description: 'A block-level image of the host storage.',
    // Hosts only. A block-level acquisition of a sealed appliance is not
    // something an operator can generally do without vendor involvement, and
    // offering it would put an artifact in the plan with no way to collect it.
    applies_to: HOSTS,
    collection: {
      label: 'Block-level acquisition, or a cloud volume snapshot',
      estimated_minutes: 180,
      requires_live_host: false,
      observer_effect:
        'An image taken from a running host is internally inconsistent: different regions are captured at different moments.',
      note: 'A cloud volume snapshot is dramatically faster than a physical acquisition and is the realistic path on a VM.',
    },
    default_priority: 'recommended',
    answers: 'Everything on disk, as it was — the fallback for every question nobody thought to ask.',
    tags: ['disk', 'filesystem'],
    confidence: 'high',
    notes: null,
  },
  {
    artifact_id: 'file_timestamps',
    name: 'Filesystem timestamps',
    tier: 'disk_artifact',
    description:
      'Created, modified, accessed and metadata-changed times across the filesystem, as a timeline.',
    applies_to: HOSTS_AND_RUNTIMES,
    collection: {
      label: 'Filesystem metadata timeline',
      estimated_minutes: 25,
      requires_live_host: false,
      observer_effect: 'Collection itself updates access times unless the filesystem is mounted read-only.',
      note: null,
    },
    default_priority: 'recommended',
    answers: 'When did things change, and in what order? The backbone of almost every host timeline.',
    tags: ['disk', 'filesystem'],
    confidence: 'high',
    notes:
      'Timestamps are attacker-modifiable and are routinely modified. Treat the timeline as testimony, not as ground truth.',
  },
  {
    artifact_id: 'installed_package_state',
    name: 'Installed package and version state',
    tier: 'disk_artifact',
    description:
      'The installed package set, versions, and the package manager transaction history. On an appliance, the running firmware version and its upgrade history.',
    applies_to: [...HOSTS_AND_RUNTIMES, 'network_appliance'],
    collection: {
      label: 'Package inventory and history export',
      estimated_minutes: 3,
      requires_live_host: false,
      observer_effect: null,
      note: null,
    },
    default_priority: 'required',
    answers:
      'What was the vulnerable version, and what else was installed or changed recently? This is also the before-state the patch will overwrite.',
    tags: ['disk', 'config'],
    confidence: 'high',
    notes: null,
  },
  {
    artifact_id: 'persistence_mechanisms',
    name: 'Persistence mechanisms',
    tier: 'disk_artifact',
    description:
      'Scheduled tasks, service units, autostart entries, cron, run keys and the other places something arranges to come back.',
    applies_to: HOSTS_AND_RUNTIMES,
    collection: {
      label: 'Autostart and scheduled-task enumeration',
      estimated_minutes: 12,
      requires_live_host: false,
      observer_effect: null,
      note: null,
    },
    default_priority: 'required',
    answers:
      'Will they come back after you fix this? The question a remediation that only patches does not answer.',
    tags: ['disk', 'persistence', 'config'],
    confidence: 'high',
    notes: null,
  },
  {
    artifact_id: 'dropped_web_files',
    name: 'Dropped files in served paths',
    tier: 'disk_artifact',
    description: 'Files written into paths the web server will serve or execute.',
    applies_to: ['linux_server', 'windows_server', 'application_server', 'container', 'cloud_vm'],
    collection: {
      label: 'Copy and hash of served directories',
      estimated_minutes: 15,
      requires_live_host: false,
      observer_effect: null,
      note: null,
    },
    default_priority: 'required',
    answers: 'Is there a webshell, and how long has it been there?',
    tags: ['disk', 'filesystem'],
    confidence: 'high',
    notes: null,
  },
  {
    artifact_id: 'service_configuration',
    name: 'Service configuration on disk',
    tier: 'disk_artifact',
    description: 'The configuration files the affected service reads at start-up.',
    applies_to: [...HOSTS_AND_RUNTIMES, 'network_appliance'],
    collection: {
      label: 'Configuration copy with hashes',
      estimated_minutes: 5,
      requires_live_host: false,
      observer_effect: null,
      note: null,
    },
    default_priority: 'recommended',
    answers:
      'Was the configuration tampered with? Also the record of what the service was before the change you are about to make.',
    tags: ['disk', 'config'],
    confidence: 'high',
    notes: null,
  },

  /* ---------------------------------------------------------------------- */
  /* Tier 8 — long-term records                                             */
  /* ---------------------------------------------------------------------- */
  {
    artifact_id: 'local_event_logs',
    name: 'Local event and system logs',
    tier: 'long_term_record',
    description: 'Logs held on the host itself, before any forwarding.',
    applies_to: HOSTS_AND_RUNTIMES,
    collection: {
      label: 'Log export from the host',
      estimated_minutes: 18,
      requires_live_host: false,
      observer_effect: null,
      note: null,
    },
    default_priority: 'required',
    answers:
      'What did the host record about itself — including anything that was never forwarded, and anything that was cleared.',
    tags: ['log', 'host_state'],
    confidence: 'high',
    notes:
      'Local logs are attacker-reachable. Their absence is itself a finding; their presence is not proof they are complete.',
  },
  {
    artifact_id: 'centralised_logs',
    name: 'Centralised log copies',
    tier: 'long_term_record',
    description: 'The same events as held off the host by the logging platform.',
    applies_to: 'all',
    collection: {
      label: 'Query and export from the log platform',
      estimated_minutes: 10,
      requires_live_host: false,
      observer_effect: null,
      note: 'Held off the host, so nothing done to the host destroys them.',
    },
    default_priority: 'recommended',
    answers:
      'What survived off the host? Usually the only copy an attacker with host access could not edit.',
    tags: ['log', 'offhost'],
    confidence: 'high',
    notes: 'Bounded by the platform retention window, which may be shorter than the incident.',
  },
  {
    artifact_id: 'edr_telemetry',
    name: 'Endpoint telemetry',
    tier: 'long_term_record',
    description: 'Process, file and network telemetry recorded by the endpoint agent.',
    applies_to: HOSTS_AND_RUNTIMES,
    collection: {
      label: 'Export from the endpoint platform',
      estimated_minutes: 15,
      requires_live_host: false,
      observer_effect: null,
      note: null,
    },
    default_priority: 'recommended',
    answers:
      'What did the agent see, including process ancestry for processes that have since exited?',
    tags: ['log', 'offhost'],
    confidence: 'medium',
    notes: 'Coverage depends on sensor configuration and on whether the agent was running throughout.',
  },
  {
    artifact_id: 'cloud_control_plane_logs',
    name: 'Cloud control-plane audit log',
    tier: 'long_term_record',
    description: 'API calls against the cloud account — instance, role, key and network operations.',
    applies_to: ['cloud_vm', 'container', 'kubernetes_workload', 'saas_identity'],
    collection: {
      label: 'Export from the cloud audit service',
      estimated_minutes: 12,
      requires_live_host: false,
      observer_effect: null,
      note: 'Recorded by the provider, not by the workload. Terminating the workload does not touch it.',
    },
    default_priority: 'required',
    answers:
      'What did the compromised identity do to the account itself? The one record that survives the instance being destroyed.',
    tags: ['log', 'offhost', 'cloud'],
    confidence: 'high',
    notes: null,
  },
  {
    artifact_id: 'identity_signin_logs',
    name: 'Identity sign-in logs',
    tier: 'long_term_record',
    description: 'Authentication events for the affected principal, with source, device and outcome.',
    applies_to: ['saas_identity', 'cloud_vm', 'windows_server', 'application_server'],
    collection: {
      label: 'Export from the identity provider',
      estimated_minutes: 10,
      requires_live_host: false,
      observer_effect: null,
      note: null,
    },
    default_priority: 'required',
    answers: 'Who signed in as this principal, from where, and did it succeed?',
    tags: ['log', 'offhost', 'identity'],
    confidence: 'high',
    notes: null,
  },
  {
    artifact_id: 'identity_audit_logs',
    name: 'Identity directory audit log',
    tier: 'long_term_record',
    description:
      'Changes to the directory — consents granted, credentials added, roles assigned, applications registered.',
    applies_to: ['saas_identity'],
    collection: {
      label: 'Export from the identity provider',
      estimated_minutes: 10,
      requires_live_host: false,
      observer_effect: null,
      note: null,
    },
    default_priority: 'required',
    answers:
      'Did they leave themselves a way back in that a password reset will not touch — an added credential, a consented application, a new role?',
    tags: ['log', 'offhost', 'identity', 'persistence'],
    confidence: 'high',
    notes: null,
  },
  {
    artifact_id: 'database_audit_log',
    name: 'Database audit log',
    tier: 'long_term_record',
    description: 'Statement and connection auditing recorded by the database engine.',
    applies_to: ['database_server'],
    collection: {
      label: 'Audit log export',
      estimated_minutes: 20,
      requires_live_host: false,
      observer_effect: null,
      note: null,
    },
    default_priority: 'required',
    answers: 'What was read, and how much of it? The question the disclosure decision turns on.',
    tags: ['log', 'database'],
    confidence: 'medium',
    notes:
      'Auditing is frequently configured to record connections but not statements, in which case the volume read is not recoverable from this source.',
  },
  {
    artifact_id: 'appliance_syslog',
    name: 'Appliance log export',
    tier: 'long_term_record',
    description: 'Logs held on the appliance and, where configured, forwarded off it.',
    applies_to: ['network_appliance'],
    collection: {
      label: 'Log export before maintenance',
      estimated_minutes: 8,
      requires_live_host: true,
      observer_effect: null,
      note: 'On-device buffers on appliances are frequently small and frequently cleared by maintenance.',
    },
    default_priority: 'required',
    answers: 'What did the device record before the maintenance window began?',
    tags: ['log', 'appliance'],
    confidence: 'medium',
    notes: 'On-device retention varies enormously; some devices hold hours, some hold minutes.',
  },
]

/** Lookup by id. Built once; the catalogue is static. */
export const EVIDENCE_BY_ID: ReadonlyMap<string, EvidenceArtifact> = new Map(
  EVIDENCE_CATALOGUE.map((a) => [a.artifact_id, a]),
)
