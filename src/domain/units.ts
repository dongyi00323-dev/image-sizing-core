import type { PhysicalTarget, PixelDimensions } from "./types.js";

export function calculateTargetPixels(target: PhysicalTarget): PixelDimensions {
  if (
    !Number.isFinite(target.width) ||
    !Number.isFinite(target.height) ||
    !Number.isFinite(target.dpi) ||
    target.width <= 0 ||
    target.height <= 0 ||
    target.dpi <= 0
  ) {
    throw new Error("INVALID_TARGET_DIMENSIONS");
  }

  const divisor =
    target.unit === "cm" ? 2.54 : target.unit === "mm" ? 25.4 : null;
  const width = Math.round(
    divisor ? (target.width / divisor) * target.dpi : target.width,
  );
  const height = Math.round(
    divisor ? (target.height / divisor) * target.dpi : target.height,
  );

  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1
  ) {
    throw new Error("INVALID_TARGET_DIMENSIONS");
  }

  return { width, height };
}
