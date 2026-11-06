import sharp from "sharp";
import { renderSolidBackground, SOLID_RGBA } from "../background/solid.js";
import { EngineError } from "../domain/errors.js";
import type { AdaptationPlan, JobRequest } from "../domain/types.js";
import { calculateTargetPixels } from "../domain/units.js";
import type { SourceMetadata } from "../io/inspect-source.js";
import type { JobPaths } from "../io/output-paths.js";
import { encodeOutput } from "./encode-output.js";

export interface RenderSafeContext {
  readonly request: JobRequest;
  readonly source: SourceMetadata;
  readonly plan: AdaptationPlan;
  readonly paths: JobPaths;
}

export interface RenderArtifacts {
  readonly scaledSourceTemp: string;
  readonly backgroundTemp: string;
  readonly candidateOutput: string;
}

export async function renderSafeJob({
  request,
  source,
  plan,
  paths,
}: RenderSafeContext): Promise<RenderArtifacts> {
  const target = calculateTargetPixels(request.target);
  await renderSolidBackground(target, paths.backgroundTemp);

  // Set only the limiting axis so rounding cannot introduce separate X/Y scales.
  const resizeDimensions =
    target.width / source.oriented.width <=
    target.height / source.oriented.height
      ? { width: plan.scaledDimensions.width }
      : { height: plan.scaledDimensions.height };
  const scaled = await sharp(source.inputPath, {
    sequentialRead: true,
    failOn: "error",
  })
    .autoOrient()
    .resize({
      ...resizeDimensions,
      kernel: sharp.kernel.lanczos3,
    })
    .keepIccProfile()
    .png({ compressionLevel: 1 })
    .toFile(paths.scaledSourceTemp);
  if (
    scaled.width !== plan.scaledDimensions.width ||
    scaled.height !== plan.scaledDimensions.height
  ) {
    throw new EngineError(
      "OUTPUT_VERIFY_FAILED",
      "等比缩放结果与计划尺寸不一致",
      {
        expected: plan.scaledDimensions,
        actual: { width: scaled.width, height: scaled.height },
      },
    );
  }

  // Native embed copies the protected rectangle, including transparent RGB/alpha.
  // Porter-Duff source clears the margins and rounds semi-transparent RGB bytes.
  // For this solid-only stage, embed uses the same fill as the background artifact.
  const composite = sharp(paths.scaledSourceTemp, {
    sequentialRead: true,
    failOn: "error",
  }).extend({
    left: plan.offset.x,
    top: plan.offset.y,
    right: target.width - plan.scaledDimensions.width - plan.offset.x,
    bottom: target.height - plan.scaledDimensions.height - plan.offset.y,
    background: SOLID_RGBA,
  });
  await encodeOutput(
    composite,
    request.output.format === "source" ? source.format : request.output.format,
    request.target.dpi,
  ).toFile(paths.candidateOutput);

  return {
    scaledSourceTemp: paths.scaledSourceTemp,
    backgroundTemp: paths.backgroundTemp,
    candidateOutput: paths.candidateOutput,
  };
}
