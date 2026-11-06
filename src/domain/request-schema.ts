import { z } from "zod";
import { EngineError } from "./errors.js";
import type { BackgroundStrategy, JobRequest } from "./types.js";

const positiveFiniteNumber = z.number().finite().positive();

const targetSchema = z
  .object({
    width: positiveFiniteNumber,
    height: positiveFiniteNumber,
    unit: z.enum(["cm", "mm", "px"]),
    dpi: positiveFiniteNumber.default(300),
  })
  .strict();

const outputSchema = z
  .object({
    format: z.enum(["source", "png", "jpeg"]).default("source"),
    jpegQuality: z.literal(100).default(100),
    overwrite: z.literal(false).default(false),
  })
  .strict();

const backgroundSchema = z
  .object({
    strategy: z
      .enum([
        "AUTO",
        "SOLID_EXTEND",
        "GRADIENT_EXTEND",
        "EDGE_EXTEND",
        "MIRROR_EXTEND",
        "PATTERN_REPEAT",
        "TEXTURE_SYNTHESIS",
        "CONTENT_AWARE_EXTEND",
      ])
      .default("AUTO"),
  })
  .strict();

const jobRequestSchema = z
  .object({
    schemaVersion: z.literal(1),
    jobId: z.string().min(1),
    inputPath: z.string().min(1),
    outputDirectory: z.string().min(1),
    target: targetSchema,
    output: outputSchema.default({
      format: "source",
      jpegQuality: 100,
      overwrite: false,
    }),
    background: backgroundSchema.default({ strategy: "AUTO" }),
    operation: z.enum(["preview", "export"]).default("export"),
  })
  .strict();

export function parseJobRequest(value: unknown): JobRequest {
  const parsed = jobRequestSchema.safeParse(value);
  if (parsed.success) {
    return parsed.data;
  }

  throw new EngineError("INVALID_REQUEST", "请求格式无效", {
    issues: parsed.error.issues.map(({ code, message, path }) => ({
      code,
      message,
      path,
    })),
  });
}

export function assertStrategyAvailable(strategy: BackgroundStrategy): void {
  if (strategy === "TEXTURE_SYNTHESIS" || strategy === "CONTENT_AWARE_EXTEND") {
    throw new EngineError(
      "BACKGROUND_STRATEGY_UNAVAILABLE",
      "背景策略当前不可用",
      { strategy },
    );
  }
}
