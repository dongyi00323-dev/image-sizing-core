import type { AdaptationPlan, PixelDimensions } from "./types.js";

export function createAdaptationPlan(
  source: PixelDimensions,
  target: PixelDimensions,
): AdaptationPlan {
  const uniformScale = Math.min(
    target.width / source.width,
    target.height / source.height,
  );
  const scaledDimensions = {
    width: Math.max(1, Math.round(source.width * uniformScale)),
    height: Math.max(1, Math.round(source.height * uniformScale)),
  };
  const offset = {
    x: Math.floor((target.width - scaledDimensions.width) / 2),
    y: Math.floor((target.height - scaledDimensions.height) / 2),
  };

  return {
    uniformScale,
    scaleX: uniformScale,
    scaleY: uniformScale,
    scaledDimensions,
    offset,
    protectedSourceRegion: { ...scaledDimensions, ...offset },
    sourceCrop: false,
    nonUniformDistortion: false,
  };
}
