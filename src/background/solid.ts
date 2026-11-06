import sharp from "sharp";
import type { PixelDimensions } from "../domain/types.js";

// Temporary SAFE baseline shared by the background artifact and source-copy margins.
export const SOLID_RGBA = { r: 255, g: 255, b: 255, alpha: 1 } as const;

export async function renderSolidBackground(
  target: PixelDimensions,
  outputPath: string,
): Promise<void> {
  await sharp({
    create: {
      ...target,
      channels: 4,
      background: SOLID_RGBA,
    },
  })
    .png({ compressionLevel: 1 })
    .toFile(outputPath);
}
