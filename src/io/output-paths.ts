import { lstat, mkdir, mkdtemp, realpath, rmdir } from "node:fs/promises";
import { platform } from "node:os";
import { basename, dirname, extname, join, parse, resolve } from "node:path";
import { EngineError } from "../domain/errors.js";
import type { JobRequest, PixelDimensions } from "../domain/types.js";

const TEMP_DIRECTORY_PREFIX = ".image-adapt-";
const cleanupCapability = Symbol("image-adapt-cleanup-capability");

interface FileIdentity {
  readonly device: bigint;
  readonly inode: bigint;
  readonly birthtimeNanoseconds: bigint;
}

interface CleanupCapability {
  readonly sourcePath: string;
  readonly sourceIdentity: FileIdentity;
  readonly outputDirectory: string;
  readonly outputIdentity: FileIdentity;
  readonly tempDirectory: string;
  readonly tempIdentity: FileIdentity;
}

type CleanupGrant = (candidate: JobPaths) => CleanupCapability;

interface CapabilityBearingPaths extends JobPaths {
  readonly [cleanupCapability]?: CleanupGrant;
}

export interface JobPaths {
  readonly outputDirectory: string;
  readonly tempDirectory: string;
  readonly scaledSourceTemp: string;
  readonly backgroundTemp: string;
  readonly candidateOutput: string;
  readonly finalImage: string;
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

function comparablePath(filePath: string): string {
  const resolvedPath = resolve(filePath);
  return platform() === "win32" ? resolvedPath.toLowerCase() : resolvedPath;
}

function samePath(left: string, right: string): boolean {
  return comparablePath(left) === comparablePath(right);
}

function sameIdentity(left: FileIdentity, right: FileIdentity): boolean {
  return (
    left.device === right.device &&
    left.inode === right.inode &&
    left.birthtimeNanoseconds === right.birthtimeNanoseconds
  );
}

function cleanupRefused(): EngineError {
  return new EngineError("INTERNAL_ERROR", "拒绝清理未经验证的任务临时目录");
}

async function fileIdentity(filePath: string): Promise<FileIdentity> {
  const stats = await lstat(filePath, { bigint: true });
  return Object.freeze({
    device: stats.dev,
    inode: stats.ino,
    birthtimeNanoseconds: stats.birthtimeNs,
  });
}

async function directoryIdentity(filePath: string): Promise<FileIdentity> {
  const stats = await lstat(filePath, { bigint: true });
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw cleanupRefused();
  }

  return Object.freeze({
    device: stats.dev,
    inode: stats.ino,
    birthtimeNanoseconds: stats.birthtimeNs,
  });
}

async function validateDirectoryIdentity(
  filePath: string,
  expectedPath: string,
  expectedIdentity: FileIdentity,
): Promise<void> {
  if (!samePath(filePath, expectedPath)) {
    throw cleanupRefused();
  }

  let physicalPath: string;
  let actualIdentity: FileIdentity;
  try {
    physicalPath = await realpath(filePath);
    actualIdentity = await directoryIdentity(physicalPath);
  } catch (error) {
    if (error instanceof EngineError) {
      throw error;
    }
    throw cleanupRefused();
  }

  if (
    !samePath(physicalPath, expectedPath) ||
    !sameIdentity(actualIdentity, expectedIdentity)
  ) {
    throw cleanupRefused();
  }
}

function outputExtension(request: JobRequest): "jpg" | "png" {
  if (request.output.format === "png") {
    return "png";
  }

  if (request.output.format === "jpeg") {
    return "jpg";
  }

  const sourceExtension = extname(request.inputPath).toLowerCase();
  if (sourceExtension === ".png") {
    return "png";
  }
  if (sourceExtension === ".jpg" || sourceExtension === ".jpeg") {
    return "jpg";
  }

  throw new EngineError(
    "UNSUPPORTED_FORMAT",
    "无法从源文件扩展名确定输出格式",
    { extension: sourceExtension },
  );
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await lstat(filePath);
    return true;
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      return false;
    }
    throw new EngineError("INTERNAL_ERROR", "无法检查输出路径是否已存在", {
      causeCode: errorCode(error) ?? "UNKNOWN",
    });
  }
}

function assertValidPixels(pixels: PixelDimensions): void {
  if (
    !Number.isSafeInteger(pixels.width) ||
    !Number.isSafeInteger(pixels.height) ||
    pixels.width <= 0 ||
    pixels.height <= 0
  ) {
    throw new EngineError(
      "INVALID_TARGET_DIMENSIONS",
      "输出像素尺寸必须是正整数",
      { width: pixels.width, height: pixels.height },
    );
  }
}

function withCleanupCapability(
  paths: JobPaths,
  capability: CleanupCapability,
): JobPaths {
  const frozenCapability = Object.freeze(capability);
  const grant = Object.freeze((candidate: JobPaths): CleanupCapability => {
    if (candidate !== paths || !Object.isFrozen(paths)) {
      throw cleanupRefused();
    }
    return frozenCapability;
  });
  Object.defineProperty(paths, cleanupCapability, {
    configurable: false,
    enumerable: false,
    value: grant,
    writable: false,
  });
  return Object.freeze(paths);
}

function readCleanupCapability(paths: JobPaths): CleanupCapability {
  const descriptor = Object.getOwnPropertyDescriptor(paths, cleanupCapability);
  const grant = (paths as CapabilityBearingPaths)[cleanupCapability];
  if (
    grant === undefined ||
    descriptor?.value !== grant ||
    descriptor.configurable !== false ||
    descriptor.enumerable !== false ||
    descriptor.writable !== false
  ) {
    throw cleanupRefused();
  }

  const capability = grant(paths);
  if (
    !samePath(paths.outputDirectory, capability.outputDirectory) ||
    !samePath(paths.tempDirectory, capability.tempDirectory)
  ) {
    throw cleanupRefused();
  }

  return capability;
}

export async function allocateJobPaths(
  request: JobRequest,
  pixels: PixelDimensions,
): Promise<JobPaths> {
  assertValidPixels(pixels);

  let resolvedInputPath: string;
  let sourceIdentity: FileIdentity;
  try {
    resolvedInputPath = await realpath(request.inputPath);
    sourceIdentity = await fileIdentity(resolvedInputPath);
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      throw new EngineError("INPUT_NOT_FOUND", "源图像不存在");
    }
    throw new EngineError("INTERNAL_ERROR", "无法解析源图像路径", {
      causeCode: errorCode(error) ?? "UNKNOWN",
    });
  }

  try {
    await mkdir(request.outputDirectory, { recursive: true });
  } catch (error) {
    throw new EngineError("INTERNAL_ERROR", "无法创建输出目录", {
      causeCode: errorCode(error) ?? "UNKNOWN",
    });
  }

  const outputDirectory = await realpath(request.outputDirectory);
  const outputIdentity = await directoryIdentity(outputDirectory);
  const extension = outputExtension(request);
  const sourceName = parse(resolvedInputPath).name || "image";
  const baseName = `${sourceName}_${pixels.width}x${pixels.height}`;
  let sequence = 1;
  let finalImage: string;

  while (true) {
    const suffix = sequence === 1 ? "" : `_${sequence}`;
    const candidate = resolve(
      outputDirectory,
      `${baseName}${suffix}.${extension}`,
    );

    if (
      !samePath(candidate, resolvedInputPath) &&
      !(await pathExists(candidate))
    ) {
      finalImage = candidate;
      break;
    }

    sequence += 1;
  }

  await validateDirectoryIdentity(
    outputDirectory,
    outputDirectory,
    outputIdentity,
  );
  const allocatedTempDirectory = await mkdtemp(
    join(outputDirectory, TEMP_DIRECTORY_PREFIX),
  );
  const tempDirectory = await realpath(allocatedTempDirectory);
  if (!samePath(dirname(tempDirectory), outputDirectory)) {
    throw cleanupRefused();
  }
  const tempIdentity = await directoryIdentity(tempDirectory);
  await validateDirectoryIdentity(
    outputDirectory,
    outputDirectory,
    outputIdentity,
  );
  return withCleanupCapability(
    {
      outputDirectory,
      tempDirectory,
      scaledSourceTemp: resolve(tempDirectory, "scaled-source.png"),
      backgroundTemp: resolve(tempDirectory, "background.png"),
      candidateOutput: resolve(tempDirectory, `candidate.${extension}`),
      finalImage,
    },
    {
      sourcePath: resolvedInputPath,
      sourceIdentity,
      outputDirectory,
      outputIdentity,
      tempDirectory,
      tempIdentity,
    },
  );
}

export async function cleanupJobPaths(paths: JobPaths): Promise<void> {
  const capability = readCleanupCapability(paths);

  if (
    !samePath(dirname(capability.tempDirectory), capability.outputDirectory) ||
    !basename(capability.tempDirectory).startsWith(TEMP_DIRECTORY_PREFIX) ||
    samePath(capability.tempDirectory, capability.sourcePath) ||
    sameIdentity(capability.tempIdentity, capability.sourceIdentity)
  ) {
    throw cleanupRefused();
  }

  await validateDirectoryIdentity(
    capability.outputDirectory,
    capability.outputDirectory,
    capability.outputIdentity,
  );
  await validateDirectoryIdentity(
    capability.tempDirectory,
    capability.tempDirectory,
    capability.tempIdentity,
  );

  try {
    await rmdir(capability.tempDirectory);
  } catch {
    throw cleanupRefused();
  }
}
