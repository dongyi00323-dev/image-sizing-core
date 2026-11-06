export type Unit = "cm" | "mm" | "px";

export type JobOperation = "preview" | "export";

export type OutputFormat = "source" | "png" | "jpeg";

export type BackgroundStrategy =
  | "AUTO"
  | "SOLID_EXTEND"
  | "GRADIENT_EXTEND"
  | "EDGE_EXTEND"
  | "MIRROR_EXTEND"
  | "PATTERN_REPEAT"
  | "TEXTURE_SYNTHESIS"
  | "CONTENT_AWARE_EXTEND";

export interface JobOutput {
  readonly format: OutputFormat;
  readonly jpegQuality: 100;
  readonly overwrite: false;
}

export interface JobBackground {
  readonly strategy: BackgroundStrategy;
}

export type AspectRisk = "LOW" | "MEDIUM" | "HIGH" | "EXTREME";

export interface PixelDimensions {
  readonly width: number;
  readonly height: number;
}

export interface PhysicalTarget extends PixelDimensions {
  readonly unit: Unit;
  readonly dpi: number;
}

export interface JobRequest {
  readonly schemaVersion: 1;
  readonly jobId: string;
  readonly inputPath: string;
  readonly outputDirectory: string;
  readonly target: PhysicalTarget;
  readonly output: JobOutput;
  readonly background: JobBackground;
  readonly operation: JobOperation;
}

export interface AspectRiskAnalysis {
  readonly sourceRatio: number;
  readonly targetRatio: number;
  readonly ratioFactor: number;
  readonly risk: AspectRisk;
}

export interface PixelOffset {
  readonly x: number;
  readonly y: number;
}

export interface ProtectedSourceRegion extends PixelDimensions, PixelOffset {}

export interface AdaptationPlan {
  readonly uniformScale: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly scaledDimensions: PixelDimensions;
  readonly offset: PixelOffset;
  readonly protectedSourceRegion: ProtectedSourceRegion;
  readonly sourceCrop: false;
  readonly nonUniformDistortion: false;
}
