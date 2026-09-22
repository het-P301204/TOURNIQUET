/**
 * The engine's public surface.
 *
 * The interface, the CLI and the tests all come through here. Nothing else
 * should reach into the individual modules, so that the boundary between
 * "domain logic" and "a React component that renders it" stays a real one.
 */

export { analyse, ANALYSIS_VERSION } from './analyze.ts'
export { resolveImpact, resolveAll } from './impact.ts'
export { footprintFor, footprintsFor, computeDestructiveLevel } from './footprint.ts'
export { simulate, lostAtStep, listNames } from './outcomes.ts'
export { buildSequence } from './sequence.ts'
export { assessDeadline, TIGHT_THRESHOLD } from './deadline.ts'
export { findConflicts, findUnknowns } from './conflicts.ts'
export { materialise, isCapture, unknownAction, type MaterialisedStep } from './steps.ts'
export { artifactsFor, actionsFor, actionApplies, artifactApplies } from './scope.ts'
export { toJson, toMarkdown, toHtml, headline } from './report.ts'
