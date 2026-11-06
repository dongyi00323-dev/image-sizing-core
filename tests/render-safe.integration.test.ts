import { mkdtemp, readdir, readFile, rmdir, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import {
  allocateJobPaths,
  cleanupJobPaths,
  createAdaptationPlan,
  inspectSource,
  renderSafeJob,
  sha256File,
  type JobPaths,
  type JobRequest,
} from "../src/index.js";

const fixtureDirectory = resolve("tests/fixtures/synthetic/generated");
const allocated: JobPaths[] = [];
const fixtureFiles: string[] = [];

afterEach(async () => {
  for (const paths of allocated.splice(0)) {
    for (const file of [
      paths.scaledSourceTemp,
      paths.backgroundTemp,
      paths.candidateOutput,
    ]) {
      await unlink(file).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
      });
    }
    await cleanupJobPaths(paths);
    await rmdir(paths.outputDirectory);
  }
  for (const file of fixtureFiles.splice(0)) {
    await unlink(file);
  }
});

async function prepareFixture(
  fileName: string,
  width = 400,
  height = 800,
  format: JobRequest["output"]["format"] = "png",
  target: JobRequest["target"] = { width, height, unit: "px", dpi: 300 },
) {
  const inputPath = resolve(fixtureDirectory, fileName);
  const request: JobRequest = {
    schemaVersion: 1,
    jobId: "safe-render-test",
    inputPath,
    outputDirectory: await mkdtemp(join(tmpdir(), "image-adapt-render-test-")),
    target,
    output: { format, jpegQuality: 100, overwrite: false },
    background: { strategy: "SOLID_EXTEND" },
    operation: "export",
  };
  const source = await inspectSource(inputPath);
  const plan = createAdaptationPlan(source.oriented, { width, height });
  const paths = await allocateJobPaths(request, { width, height });
  allocated.push(paths);
  return { inputPath, request, source, plan, paths };
}

async function renderFixture(...args: Parameters<typeof prepareFixture>) {
  const { inputPath, request, source, plan, paths } = await prepareFixture(
    ...args,
  );
  const artifacts = await renderSafeJob({ request, source, plan, paths });
  return { inputPath, source, plan, paths, artifacts };
}

describe("renderSafeJob", () => {
  it("refuses to compose when actual uniform resize dimensions differ from the plan", async () => {
    const context = await prepareFixture("landscape-text-logo.png");
    const plan = {
      ...context.plan,
      scaledDimensions: { width: 400, height: 201 },
    };
    await expect(renderSafeJob({ ...context, plan })).rejects.toMatchObject({
      name: "EngineError",
      code: "OUTPUT_VERIFY_FAILED",
    });
    expect(await readdir(context.paths.tempDirectory)).not.toContain(
      basename(context.paths.candidateOutput),
    );
  });

  it("matches an independent single uniform resize inside the protected region", async () => {
    const result = await renderFixture("landscape-text-logo.png");
    const expected = await sharp(result.inputPath)
      .autoOrient()
      .resize({ width: 400, kernel: sharp.kernel.lanczos3 })
      .ensureAlpha()
      .raw()
      .toBuffer();
    const actual = await sharp(result.artifacts.candidateOutput)
      .extract({ left: 0, top: 300, width: 400, height: 200 })
      .ensureAlpha()
      .raw()
      .toBuffer();

    expect(actual.equals(expected)).toBe(true);
    expect(result.artifacts).toMatchObject({
      scaledSourceTemp: result.paths.scaledSourceTemp,
      backgroundTemp: result.paths.backgroundTemp,
      candidateOutput: result.paths.candidateOutput,
    });
    expect((await readdir(result.paths.tempDirectory)).sort()).toEqual(
      [
        result.paths.scaledSourceTemp,
        result.paths.backgroundTemp,
        result.paths.candidateOutput,
      ]
        .map((file) => basename(file))
        .sort(),
    );
  });

  it("replaces the protected rectangle without flattening or changing PNG RGBA bytes", async () => {
    const result = await renderFixture("transparent.png");
    const expected = await sharp(result.inputPath)
      .resize({ width: 400, kernel: sharp.kernel.lanczos3 })
      .ensureAlpha()
      .raw()
      .toBuffer();
    const actual = await sharp(result.artifacts.candidateOutput)
      .extract({ left: 0, top: 250, width: 400, height: 300 })
      .ensureAlpha()
      .raw()
      .toBuffer();
    expect(actual.equals(expected)).toBe(true);
    expect(expected[3]).toBe(0);
    expect(
      expected.some(
        (value, index) => index % 4 === 3 && value > 0 && value < 255,
      ),
    ).toBe(true);
  });

  it.each([
    ["landscape-text-logo.png", 400, 800],
    ["portrait.png", 800, 400],
  ] as const)(
    "keeps opaque white extension and target dimensions for %s",
    async (fileName, width, height) => {
      const result = await renderFixture(fileName, width, height);
      const output = sharp(result.artifacts.candidateOutput);
      const metadata = await output.metadata();
      expect(metadata).toMatchObject({
        format: "png",
        width,
        height,
        density: 300,
      });
      const corner = await output
        .extract({ left: 0, top: 0, width: 1, height: 1 })
        .ensureAlpha()
        .raw()
        .toBuffer();
      expect([...corner]).toEqual([255, 255, 255, 255]);
      const background = await sharp(result.artifacts.backgroundTemp)
        .ensureAlpha()
        .raw()
        .toBuffer();
      expect(background.every((value) => value === 255)).toBe(true);
      const { data, info } = await sharp(result.artifacts.candidateOutput)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const region = result.plan.protectedSourceRegion;
      for (let y = 0; y < info.height; y += 1) {
        for (let x = 0; x < info.width; x += 1) {
          if (
            x < region.x ||
            x >= region.x + region.width ||
            y < region.y ||
            y >= region.y + region.height
          ) {
            const offset = (y * info.width + x) * 4;
            if (
              !data
                .subarray(offset, offset + 4)
                .equals(Buffer.from([255, 255, 255, 255]))
            ) {
              throw new Error(`Unexpected margin pixel at ${x},${y}`);
            }
          }
        }
      }
      const sourceMetadata = await sharp(
        result.artifacts.scaledSourceTemp,
      ).metadata();
      expect(sourceMetadata).toMatchObject(result.plan.scaledDimensions);
      expect(await sha256File(result.inputPath)).toBe(result.source.sha256);
    },
  );

  it("keeps circle and logo marker centroids at their uniformly scaled positions", async () => {
    const result = await renderFixture("landscape-text-logo.png");
    const { data, info } = await sharp(result.artifacts.candidateOutput)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const markers = [
      { color: [206, 62, 67], x: 39.5, y: 336.1667 },
      { color: [35, 111, 165], x: 360.1667, y: 336.8333 },
    ];
    for (const marker of markers) {
      let count = 0;
      let sumX = 0;
      let sumY = 0;
      for (let y = 0; y < info.height; y += 1) {
        for (let x = 0; x < info.width; x += 1) {
          const offset = (y * info.width + x) * 4;
          if (
            marker.color.every(
              (value, channel) =>
                Math.abs(data[offset + channel]! - value) <= 3,
            )
          ) {
            count += 1;
            sumX += x;
            sumY += y;
          }
        }
      }
      expect(count).toBeGreaterThan(900);
      expect(Math.abs(sumX / count - marker.x)).toBeLessThan(0.5);
      expect(Math.abs(sumY / count - marker.y)).toBeLessThan(0.5);
    }
  });

  it("auto-orients JPEG before uniform resize and preserves the source file", async () => {
    const result = await renderFixture("oriented-6.jpg", 800, 400);
    const expected = await sharp(result.inputPath)
      .autoOrient()
      .resize({ height: 400, kernel: sharp.kernel.lanczos3 })
      .keepIccProfile()
      .ensureAlpha()
      .raw()
      .toBuffer();
    const actual = await sharp(result.artifacts.candidateOutput)
      .extract({ left: 300, top: 0, width: 200, height: 400 })
      .ensureAlpha()
      .raw()
      .toBuffer();
    expect(actual.equals(expected)).toBe(true);
    expect(
      (await sharp(result.artifacts.candidateOutput).metadata()).orientation ??
        1,
    ).toBe(1);
    expect(await sha256File(result.inputPath)).toBe(result.source.sha256);
  });

  it.each(["png", "jpeg"] as const)(
    "preserves embedded ICC bytes and writes requested DPI in %s",
    async (format) => {
      const fixturePath = join(
        tmpdir(),
        `image-adapt-icc-${crypto.randomUUID()}.png`,
      );
      fixtureFiles.push(fixturePath);
      await sharp(resolve(fixtureDirectory, "landscape-text-logo.png"))
        .withIccProfile("p3")
        .png()
        .toFile(fixturePath);
      const result = await renderFixture(fixturePath, 400, 800, format);
      const inputMetadata = await sharp(fixturePath).metadata();
      const scaledMetadata = await sharp(
        result.artifacts.scaledSourceTemp,
      ).metadata();
      const outputMetadata = await sharp(
        result.artifacts.candidateOutput,
      ).metadata();
      expect(inputMetadata.icc).toBeDefined();
      expect(scaledMetadata.icc?.equals(inputMetadata.icc!)).toBe(true);
      expect(outputMetadata.icc?.equals(inputMetadata.icc!)).toBe(true);
      expect(outputMetadata.density).toBe(300);
      if (format === "png") {
        const expected = await sharp(fixturePath)
          .resize({ width: 400, kernel: sharp.kernel.lanczos3 })
          .keepIccProfile()
          .ensureAlpha()
          .raw()
          .toBuffer();
        const actual = await sharp(result.artifacts.candidateOutput)
          .extract({ left: 0, top: 300, width: 400, height: 200 })
          .keepIccProfile()
          .ensureAlpha()
          .raw()
          .toBuffer();
        expect(actual.equals(expected)).toBe(true);
      }
      expect(await sha256File(fixturePath)).toBe(result.source.sha256);
    },
  );

  it.each([
    ["photo.jpg", "source", "jpeg"],
    ["landscape-text-logo.png", "jpeg", "jpeg"],
    ["portrait.png", "source", "png"],
  ] as const)(
    "encodes %s with requested format %s",
    async (fileName, format, expectedFormat) => {
      const result = await renderFixture(fileName, 800, 400, format);
      const metadata = await sharp(result.artifacts.candidateOutput).metadata();
      expect(metadata).toMatchObject({
        format: expectedFormat,
        width: 800,
        height: 400,
        density: 300,
      });
      if (expectedFormat === "jpeg") {
        expect(metadata.chromaSubsampling).toBe("4:4:4");
        const bytes = await readFile(result.artifacts.candidateOutput);
        // At quality 100, every value in the 8-bit JPEG quantization tables is 1.
        let quantizationTables = 0;
        for (let position = 2; position < bytes.length - 4;) {
          const marker = bytes.readUInt16BE(position);
          if (marker === 0xffda || marker === 0xffd9) break;
          const length = bytes.readUInt16BE(position + 2);
          if (marker === 0xffdb) {
            for (
              let table = position + 4;
              table < position + 2 + length;
              table += 65
            ) {
              expect(bytes[table]! >> 4).toBe(0);
              expect(
                [...bytes.subarray(table + 1, table + 65)].every(
                  (value) => value === 1,
                ),
              ).toBe(true);
              quantizationTables += 1;
            }
          }
          position += length + 2;
        }
        expect(quantizationTables).toBeGreaterThan(0);
      }
      expect(await sha256File(result.inputPath)).toBe(result.source.sha256);
    },
  );

  it.each([
    ["landscape-text-logo.png", 401, 800, 401, 201, 0, 299, "width"],
    ["portrait.png", 800, 401, 201, 401, 299, 0, "height"],
    ["transparent.png", 1001, 1400, 1001, 751, 0, 324, "width"],
    ["landscape-text-logo.png", 600, 300, 600, 300, 0, 0, "width"],
  ] as const)(
    "uses one uniform resize for %s to %sx%s",
    async (
      fileName,
      width,
      height,
      scaledWidth,
      scaledHeight,
      left,
      top,
      axis,
    ) => {
      const result = await renderFixture(fileName, width, height);
      const expected = await sharp(result.inputPath)
        .autoOrient()
        .resize({
          [axis]: axis === "width" ? scaledWidth : scaledHeight,
          kernel: sharp.kernel.lanczos3,
        })
        .ensureAlpha()
        .raw()
        .toBuffer();
      const actual = await sharp(result.artifacts.candidateOutput)
        .extract({ left, top, width: scaledWidth, height: scaledHeight })
        .ensureAlpha()
        .raw()
        .toBuffer();
      expect(actual.equals(expected)).toBe(true);
      expect(
        await sharp(result.artifacts.candidateOutput).metadata(),
      ).toMatchObject({ width, height });
      expect(await sha256File(result.inputPath)).toBe(result.source.sha256);
    },
  );

  it.each(["png", "jpeg"] as const)(
    "writes non-default DPI and converts physical target units for %s",
    async (format) => {
      const result = await renderFixture("portrait.png", 400, 200, format, {
        width: 101.6,
        height: 50.8,
        unit: "mm",
        dpi: 100,
      });
      expect(
        await sharp(result.artifacts.candidateOutput).metadata(),
      ).toMatchObject({
        width: 400,
        height: 200,
        density: 100,
        format,
      });
    },
  );

  it("retains RGB behind zero alpha when no resize is needed", async () => {
    const fixturePath = join(
      tmpdir(),
      `image-adapt-alpha-${crypto.randomUUID()}.png`,
    );
    fixtureFiles.push(fixturePath);
    const pixels = Buffer.from([
      19, 83, 177, 0, 93, 211, 27, 1, 91, 51, 171, 128, 1, 2, 3, 255,
    ]);
    await sharp(pixels, { raw: { width: 2, height: 2, channels: 4 } })
      .png()
      .toFile(fixturePath);
    const result = await renderFixture(fixturePath, 2, 6);
    const actual = await sharp(result.artifacts.candidateOutput)
      .extract({ left: 0, top: 2, width: 2, height: 2 })
      .ensureAlpha()
      .raw()
      .toBuffer();
    expect(actual.equals(pixels)).toBe(true);
  });
});
