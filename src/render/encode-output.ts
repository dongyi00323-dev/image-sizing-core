import type { Sharp } from "sharp";
import type { SourceFormat } from "../io/inspect-source.js";

export function encodeOutput(
  pipeline: Sharp,
  format: SourceFormat,
  dpi: number,
): Sharp {
  const withMetadata = pipeline.keepIccProfile().withDensity(dpi);
  return format === "png"
    ? withMetadata.png({ compressionLevel: 9, adaptiveFiltering: true })
    : withMetadata.jpeg({
        quality: 100,
        chromaSubsampling: "4:4:4",
        mozjpeg: false,
      });
}
