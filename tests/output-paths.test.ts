import {
  access,
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { platform, tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  allocateJobPaths,
  cleanupJobPaths,
  sha256File,
  type JobPaths,
  type JobRequest,
} from "../src/index.js";

const fixturePath = resolve(
  process.cwd(),
  "tests",
  "fixtures",
  "synthetic",
  "generated",
  "photo.jpg",
);

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

describe("job output paths", () => {
  let sandboxDirectory: string;
  let inputPath: string;
  let outputDirectory: string;

  beforeEach(async () => {
    sandboxDirectory = await mkdtemp(join(tmpdir(), "image-adapt-path-test-"));
    inputPath = resolve(sandboxDirectory, "sample.jpg");
    outputDirectory = resolve(sandboxDirectory, "output");
    await copyFile(fixturePath, inputPath);
  });

  afterEach(async () => {
    await rm(sandboxDirectory, { recursive: true, force: true });
  });

  function request(
    outputFormat: JobRequest["output"]["format"] = "source",
  ): JobRequest {
    return {
      schemaVersion: 1,
      jobId: "path-test",
      inputPath,
      outputDirectory,
      target: { width: 88, height: 40, unit: "cm", dpi: 300 },
      output: { format: outputFormat, jpegQuality: 100, overwrite: false },
      background: { strategy: "SOLID_EXTEND" },
      operation: "export",
    };
  }

  it("never overwrites the input or an existing output", async () => {
    await mkdir(outputDirectory, { recursive: true });
    const firstCandidate = resolve(outputDirectory, "sample_10394x4724.jpg");
    await writeFile(firstCandidate, "existing-output", "utf8");
    const sourceBefore = await sha256File(inputPath);

    const paths = await allocateJobPaths(request(), {
      width: 10394,
      height: 4724,
    });

    expect(resolve(paths.finalImage)).not.toBe(resolve(inputPath));
    expect(paths.finalImage).toMatch(/_2[.]jpg$/);
    expect(await exists(paths.finalImage)).toBe(false);
    expect(await readFile(firstCandidate, "utf8")).toBe("existing-output");
    expect(await sha256File(inputPath)).toBe(sourceBefore);
    expect(dirname(paths.tempDirectory)).toBe(resolve(outputDirectory));
    expect(basename(paths.tempDirectory)).toMatch(/^\.image-adapt-/);
    expect(await exists(paths.tempDirectory)).toBe(true);

    await cleanupJobPaths(paths);
  });

  it("uses the requested format and increments through every collision", async () => {
    await mkdir(outputDirectory, { recursive: true });
    await writeFile(
      resolve(outputDirectory, "sample_320x240.png"),
      "first",
      "utf8",
    );
    await writeFile(
      resolve(outputDirectory, "sample_320x240_2.png"),
      "second",
      "utf8",
    );

    const paths = await allocateJobPaths(request("png"), {
      width: 320,
      height: 240,
    });

    expect(paths.finalImage).toBe(
      resolve(outputDirectory, "sample_320x240_3.png"),
    );
    expect(paths.candidateOutput).toMatch(/[.]png$/);

    await cleanupJobPaths(paths);
  });

  it("cleanup removes a freshly allocated empty job temp directory", async () => {
    const paths = await allocateJobPaths(request(), {
      width: 10394,
      height: 4724,
    });
    const siblingPath = resolve(outputDirectory, "keep.txt");
    await writeFile(siblingPath, "keep");
    expect(await readdir(paths.tempDirectory)).toEqual([]);

    await cleanupJobPaths(paths);

    expect(await exists(paths.tempDirectory)).toBe(false);
    expect(await exists(inputPath)).toBe(true);
    expect(await readFile(siblingPath, "utf8")).toBe("keep");
  });

  it("cleanup rejects a non-empty current temp directory and preserves its contents", async () => {
    const paths = await allocateJobPaths(request(), {
      width: 10394,
      height: 4724,
    });
    const sentinelPath = resolve(paths.tempDirectory, "keep.txt");
    await writeFile(sentinelPath, "keep");

    await expect(cleanupJobPaths(paths)).rejects.toMatchObject({
      name: "EngineError",
      code: "INTERNAL_ERROR",
    });

    expect(await readFile(sentinelPath, "utf8")).toBe("keep");
    expect(await exists(paths.tempDirectory)).toBe(true);
  });

  it("cleanup rejects the output directory itself", async () => {
    const paths = await allocateJobPaths(request(), {
      width: 640,
      height: 480,
    });
    const forgedPaths: JobPaths = {
      ...paths,
      tempDirectory: paths.outputDirectory,
    };

    await expect(cleanupJobPaths(forgedPaths)).rejects.toMatchObject({
      name: "EngineError",
      code: "INTERNAL_ERROR",
    });
    expect(await exists(outputDirectory)).toBe(true);

    await cleanupJobPaths(paths);
  });

  it("cleanup rejects prefixed directories outside the expected parent", async () => {
    const paths = await allocateJobPaths(request(), {
      width: 640,
      height: 480,
    });
    const outsideDirectory = resolve(
      sandboxDirectory,
      "elsewhere",
      ".image-adapt-forged",
    );
    await mkdir(outsideDirectory, { recursive: true });
    await writeFile(resolve(outsideDirectory, "keep.txt"), "keep");

    await expect(
      cleanupJobPaths({ ...paths, tempDirectory: outsideDirectory }),
    ).rejects.toMatchObject({
      name: "EngineError",
      code: "INTERNAL_ERROR",
    });
    expect(await readFile(resolve(outsideDirectory, "keep.txt"), "utf8")).toBe(
      "keep",
    );

    await cleanupJobPaths(paths);
  });

  it("cleanup rejects unprefixed siblings in the expected parent", async () => {
    const paths = await allocateJobPaths(request(), {
      width: 640,
      height: 480,
    });
    const siblingDirectory = resolve(outputDirectory, "do-not-remove");
    await mkdir(siblingDirectory);
    await writeFile(resolve(siblingDirectory, "keep.txt"), "keep");

    await expect(
      cleanupJobPaths({ ...paths, tempDirectory: siblingDirectory }),
    ).rejects.toMatchObject({
      name: "EngineError",
      code: "INTERNAL_ERROR",
    });
    expect(await readFile(resolve(siblingDirectory, "keep.txt"), "utf8")).toBe(
      "keep",
    );

    await cleanupJobPaths(paths);
  });

  it("cleanup cannot borrow authority to remove another job temp directory", async () => {
    const firstPaths = await allocateJobPaths(request(), {
      width: 640,
      height: 480,
    });
    const secondPaths = await allocateJobPaths(request(), {
      width: 800,
      height: 600,
    });
    const sentinelPath = resolve(secondPaths.tempDirectory, "keep.txt");
    await writeFile(sentinelPath, "keep");

    await expect(
      cleanupJobPaths({
        ...firstPaths,
        tempDirectory: secondPaths.tempDirectory,
      } as unknown as JobPaths),
    ).rejects.toMatchObject({
      name: "EngineError",
      code: "INTERNAL_ERROR",
    });
    expect(await readFile(sentinelPath, "utf8")).toBe("keep");

    await cleanupJobPaths(firstPaths);
    await unlink(sentinelPath);
    await cleanupJobPaths(secondPaths);
  });

  it("cleanup cannot remove a prefixed source file in the output directory", async () => {
    await mkdir(outputDirectory, { recursive: true });
    inputPath = resolve(outputDirectory, ".image-adapt-source.jpg");
    await copyFile(fixturePath, inputPath);
    const sourceHash = await sha256File(inputPath);
    const paths = await allocateJobPaths(request(), {
      width: 640,
      height: 480,
    });

    await expect(
      cleanupJobPaths({
        ...paths,
        tempDirectory: inputPath,
      } as unknown as JobPaths),
    ).rejects.toMatchObject({
      name: "EngineError",
      code: "INTERNAL_ERROR",
    });
    expect(await sha256File(inputPath)).toBe(sourceHash);

    await cleanupJobPaths(paths);
  });

  it("cleanup fails closed when the output ancestor is replaced by a link", async () => {
    const paths = await allocateJobPaths(request(), {
      width: 640,
      height: 480,
    });
    const movedOutputDirectory = resolve(sandboxDirectory, "moved-output");
    const redirectedDirectory = resolve(sandboxDirectory, "redirected-output");
    const redirectedTempDirectory = resolve(
      redirectedDirectory,
      basename(paths.tempDirectory),
    );
    const sentinelPath = resolve(redirectedTempDirectory, "keep.txt");

    await rename(outputDirectory, movedOutputDirectory);
    await mkdir(redirectedTempDirectory, { recursive: true });
    await writeFile(sentinelPath, "keep");
    await symlink(
      redirectedDirectory,
      outputDirectory,
      platform() === "win32" ? "junction" : "dir",
    );

    try {
      await expect(cleanupJobPaths(paths)).rejects.toMatchObject({
        name: "EngineError",
        code: "INTERNAL_ERROR",
      });
      expect(await readFile(sentinelPath, "utf8")).toBe("keep");
    } finally {
      await unlink(outputDirectory);
    }
  });

  it("non-recursive cleanup preserves a non-empty path substituted after validation", async () => {
    const actualFs =
      await vi.importActual<typeof import("node:fs/promises")>(
        "node:fs/promises",
      );
    const movedOutputDirectory = resolve(sandboxDirectory, "moved-at-rmdir");
    const redirectedDirectory = resolve(
      sandboxDirectory,
      "redirected-at-rmdir",
    );
    let sentinelPath: string | undefined;

    async function substituteThenRemove(
      targetPath: string,
      recursive: boolean,
    ): Promise<void> {
      const redirectedTarget = resolve(
        redirectedDirectory,
        basename(targetPath),
      );
      sentinelPath = resolve(redirectedTarget, "keep.txt");
      await actualFs.mkdir(redirectedTarget, { recursive: true });
      await actualFs.writeFile(sentinelPath, "keep");
      await actualFs.rename(outputDirectory, movedOutputDirectory);
      await actualFs.symlink(
        redirectedDirectory,
        outputDirectory,
        platform() === "win32" ? "junction" : "dir",
      );

      try {
        if (recursive) {
          await actualFs.rm(targetPath, { recursive: true, force: false });
        } else {
          await actualFs.rmdir(targetPath);
        }
      } finally {
        await actualFs.unlink(outputDirectory);
      }
    }

    vi.resetModules();
    vi.doMock("node:fs/promises", () => ({
      ...actualFs,
      rm: async (targetPath: Parameters<typeof actualFs.rm>[0]) =>
        substituteThenRemove(String(targetPath), true),
      rmdir: async (targetPath: Parameters<typeof actualFs.rmdir>[0]) =>
        substituteThenRemove(String(targetPath), false),
    }));

    try {
      const moduleAtRemoveBoundary = await import("../src/io/output-paths.js");
      const paths = await moduleAtRemoveBoundary.allocateJobPaths(request(), {
        width: 640,
        height: 480,
      });

      await expect(
        moduleAtRemoveBoundary.cleanupJobPaths(paths),
      ).rejects.toMatchObject({
        name: "EngineError",
        code: "INTERNAL_ERROR",
      });
      expect(sentinelPath).toBeDefined();
      expect(await readFile(sentinelPath!, "utf8")).toBe("keep");
    } finally {
      vi.doUnmock("node:fs/promises");
      vi.resetModules();
    }
  });

  it("propagates non-ENOENT candidate inspection failures", async () => {
    const actualFs =
      await vi.importActual<typeof import("node:fs/promises")>(
        "node:fs/promises",
      );
    const denied = Object.assign(new Error("denied"), { code: "EACCES" });
    let lstatCalls = 0;

    vi.resetModules();
    vi.doMock("node:fs/promises", () => ({
      ...actualFs,
      lstat: async (...args: Parameters<typeof actualFs.lstat>) => {
        const [filePath] = args;
        if (basename(String(filePath)) === "sample_640x480.jpg") {
          lstatCalls += 1;
          throw denied;
        }
        return actualFs.lstat(...args);
      },
    }));

    try {
      const moduleWithDeniedLstat = await import("../src/io/output-paths.js");
      await expect(
        moduleWithDeniedLstat.allocateJobPaths(request(), {
          width: 640,
          height: 480,
        }),
      ).rejects.toMatchObject({
        name: "EngineError",
        code: "INTERNAL_ERROR",
      });
      expect(lstatCalls).toBe(1);
    } finally {
      vi.doUnmock("node:fs/promises");
      vi.resetModules();
    }
  });
});
