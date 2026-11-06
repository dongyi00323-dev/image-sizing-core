import { realpath } from "node:fs/promises";
import sharp from "sharp";
import { EngineError } from "../domain/errors.js";
import type { PixelDimensions } from "../domain/types.js";
import { sha256File } from "./hash-file.js";

export type SourceFormat = "jpeg" | "png";

export interface SourceMetadata {
  readonly inputPath: string;
  readonly format: SourceFormat;
  readonly stored: PixelDimensions;
  readonly oriented: PixelDimensions;
  readonly orientation: number;
  readonly density: number | undefined;
  readonly hasAlpha: boolean;
  readonly hasIccProfile: boolean;
  readonly sha256: string;
}

function errorCode(error: unknown): string | undefined {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }

  return undefined;
}

function decodeFailed(error: unknown): EngineError {
  return new EngineError("DECODE_FAILED", "无法读取源图像", {
    causeCode: errorCode(error) ?? "UNKNOWN",
  });
}

async function readMetadata(inputPath: string) {
  try {
    return await sharp(inputPath, {
      failOn: "error",
      sequentialRead: true,
    }).metadata();
  } catch (error) {
    throw decodeFailed(error);
  }
}

export async function inspectSource(
  inputPath: string,
): Promise<SourceMetadata> {
  let resolvedInputPath: string;
  try {
    resolvedInputPath = await realpath(inputPath);
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      throw new EngineError("INPUT_NOT_FOUND", "源图像不存在");
    }

    throw decodeFailed(error);
  }

  const metadata = await readMetadata(resolvedInputPath);

  if (metadata.format !== "jpeg" && metadata.format !== "png") {
    throw new EngineError("UNSUPPORTED_FORMAT", "仅支持 JPG 和 PNG 源图像", {
      format: metadata.format ?? "unknown",
    });
  }

  if (metadata.width === undefined || metadata.height === undefined) {
    throw decodeFailed(undefined);
  }

  const stored = { width: metadata.width, height: metadata.height };
  const orientation = metadata.orientation ?? 1;
  const swapsAxes = orientation >= 5 && orientation <= 8;

  let sha256: string;
  try {
    sha256 = await sha256File(resolvedInputPath);
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      throw new EngineError("INPUT_NOT_FOUND", "源图像不存在");
    }

    throw decodeFailed(error);
  }

  return {
    inputPath: resolvedInputPath,
    format: metadata.format,
    stored,
    oriented: swapsAxes
      ? { width: stored.height, height: stored.width }
      : stored,
    orientation,
    density: metadata.density,
    hasAlpha: metadata.hasAlpha ?? false,
    hasIccProfile: metadata.icc !== undefined,
    sha256,
  };
}
