import type { AspectRiskAnalysis } from "./types.js";

export function classifyAspectRisk(
  sourceRatio: number,
  targetRatio: number,
): AspectRiskAnalysis {
  const ratioFactor = Math.max(
    sourceRatio / targetRatio,
    targetRatio / sourceRatio,
  );
  const risk =
    ratioFactor < 1.15
      ? "LOW"
      : ratioFactor < 1.5
        ? "MEDIUM"
        : ratioFactor < 2.5
          ? "HIGH"
          : "EXTREME";

  return { sourceRatio, targetRatio, ratioFactor, risk };
}
