export const ENGINE_VERSION = "0.1.0" as const;

export { createAdaptationPlan } from "./domain/adaptation-plan.js";
export { classifyAspectRisk } from "./domain/aspect-risk.js";
export { calculateTargetPixels } from "./domain/units.js";
export { EngineError } from "./domain/errors.js";
export { sha256File } from "./io/hash-file.js";
export { inspectSource } from "./io/inspect-source.js";
export { allocateJobPaths, cleanupJobPaths } from "./io/output-paths.js";
export { renderSafeJob } from "./render/render-safe.js";
export type {
  RenderArtifacts,
  RenderSafeContext,
} from "./render/render-safe.js";
export {
  assertStrategyAvailable,
  parseJobRequest,
} from "./domain/request-schema.js";
export type {
  AdaptationPlan,
  AspectRisk,
  AspectRiskAnalysis,
  BackgroundStrategy,
  PhysicalTarget,
  JobBackground,
  JobOperation,
  JobOutput,
  JobRequest,
  OutputFormat,
  PixelDimensions,
  PixelOffset,
  ProtectedSourceRegion,
  Unit,
} from "./domain/types.js";
export type { ErrorCode } from "./domain/errors.js";
export type { SourceFormat, SourceMetadata } from "./io/inspect-source.js";
export type { JobPaths } from "./io/output-paths.js";
