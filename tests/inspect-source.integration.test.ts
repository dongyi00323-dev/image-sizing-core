import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { inspectSource, sha256File } from "../src/index.js";

const generatedDirectory = resolve(
  process.cwd(),
  "tests",
  "fixtures",
  "synthetic",
  "generated",
);

function fixture(fileName: string): string {
  return resolve(generatedDirectory, fileName);
}

describe("inspectSource", () => {
  it("reports oriented dimensions without mutating source bytes", async () => {
    const inputPath = fixture("oriented-6.jpg");
    const before = await sha256File(inputPath);

    const metadata = await inspectSource(inputPath);

    const after = await sha256File(inputPath);
    expect(metadata.stored).toEqual({ width: 1200, height: 600 });
    expect(metadata.oriented).toEqual({ width: 600, height: 1200 });
    expect(metadata.orientation).toBe(6);
    expect(metadata.format).toBe("jpeg");
    expect(after).toBe(before);
  });

  it("reports PNG transparency and the manifest-backed digest", async () => {
    const manifest = JSON.parse(
      await readFile(fixture("manifest.json"), "utf8"),
    ) as {
      fixtures: Record<string, { sha256: string }>;
    };

    const metadata = await inspectSource(fixture("transparent.png"));

    expect(metadata.oriented).toEqual({ width: 800, height: 600 });
    expect(metadata.format).toBe("png");
    expect(metadata.hasAlpha).toBe(true);
    expect(metadata.sha256).toBe(manifest.fixtures["transparent.png"]?.sha256);
  });

  it("returns INPUT_NOT_FOUND for a missing path", async () => {
    await expect(inspectSource(fixture("missing.png"))).rejects.toMatchObject({
      name: "EngineError",
      code: "INPUT_NOT_FOUND",
    });
  });

  it("returns DECODE_FAILED for corrupt image bytes", async () => {
    await expect(inspectSource(fixture("corrupt.jpg"))).rejects.toMatchObject({
      name: "EngineError",
      code: "DECODE_FAILED",
    });
  });

  it("returns UNSUPPORTED_FORMAT for a decodable non-JPG/PNG image", async () => {
    await expect(
      inspectSource(fixture("unsupported.webp")),
    ).rejects.toMatchObject({
      name: "EngineError",
      code: "UNSUPPORTED_FORMAT",
    });
  });
});
